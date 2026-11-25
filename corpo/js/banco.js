'use strict';

// Banco: Supabase + cópia local, sincronização por diferença (corpo_medida e corpo_dia) e a cópia que os outros apps leem.
// Cada mudança grava a cópia local na hora e, 0,8 s depois, envia ao Supabase só as linhas que mudaram
// (diferença para "base", a última versão confirmada pelo servidor). Sem internet, fica pendente e envia ao reconectar.
// corpo_dia é enviado MESCLANDO: lê o dia como está na nuvem agora e aplica só o que este aparelho acrescentou ou tirou nas
// evacuações e nos xixis (e o sono, se mudou aqui) desde a base; o que outro aparelho lançou nunca some por causa deste.
// Também atualiza corpo.medidas.<conta> (guardarMedidas, de ../corpo/perfil.js): Treino e Alimentação veem na hora.

// Rede ruim (metrô): todo pedido ao Supabase tem limite de tempo (fetchComTeto, de ../base/nucleo.js, carregado antes).
const sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
  global: { fetch: fetchComTeto },
});

const K_LOCAL = (id) => 'corpo.db.' + id,
  K_BASE = (id) => 'corpo.base.' + id,
  K_AGUAS = (id) => 'corpo.aguas.' + id,
  K_VOO = (id) => 'corpo.voo.' + id,
  K_VOO_AQUI = (id) => 'corpo.vooAqui.' + id;

// aguas = { dia: ml } da Água (agua_dia, só leitura), para a bexiga
let aguas = {};
let db = null,
  usuario = null,
  base = null,
  enviando = false,
  tEnvio = null,
  erroSync = '';
// corpo_dia ainda não criada no banco (migration 01 não aplicada): o app segue só com as pesagens e esconde "Evacuou"
let semCorpoDia = false;

// Tabelas e a chave de cada linha (além de user_id): corpo_medida (pesagem e barriga) e corpo_dia (evacuações e xixis com horário e sono)
const TABELAS = { corpo_medida: 'data', corpo_dia: 'data' };

function linhas(d) {
  // db → { tabela: { data: linha } }
  return {
    // peso_em e sono_em (quando foram lançados, migration 03) só vão quando existem: linha antiga continua igual à da nuvem
    corpo_medida: Object.fromEntries(
      d.medidas.map((m) => [
        m.data,
        {
          data: m.data,
          hora: m.hora || '',
          peso: m.peso ?? null,
          cintura: m.cintura ?? null,
          ...(m.pesoEm && { peso_em: m.pesoEm }),
        },
      ])
    ),
    // evacuacoes e xixis copiadas: a base não pode mudar junto quando o +1 mexe na lista do dia
    corpo_dia: Object.fromEntries(
      d.dias.map((x) => [
        x.data,
        {
          data: x.data,
          evacuou: null,
          evacuacoes: [...x.evacuacoes],
          xixis: [...x.xixis],
          sono: x.sono ?? null,
          dormiu: x.dormiu ?? null,
          acordou: x.acordou ?? null,
          ...(x.sonoEm && { sono_em: x.sonoEm }),
        },
      ])
    ),
  };
}

// base das versões antigas (só pesagens, { data: linha }) → formato com as duas tabelas
const baseCompat = (b) =>
  !b ? null : b.corpo_medida ? b : { corpo_medida: b, corpo_dia: {} };

// Base guardada no aparelho passa pela mesma limpeza do db antes de comparar: depois de uma mudança de formato (ex.: xixis
// que entraram), a base antiga não pode parecer "diferente" do db e fazer a cópia velha do aparelho subir por cima da nuvem.
function baseNormal(b) {
  b = baseCompat(b);

  return b
    ? linhas(
        preparar({
          medidas: Object.values(b.corpo_medida || {}),
          dias: Object.values(b.corpo_dia || {}),
        })
      )
    : null;
}

function diferenca(a, b) {
  // o que enviar para sair de a e chegar em b; null = nada
  let n = 0;

  const up = {},
    del = {};

  for (const t in TABELAS) {
    up[t] = Object.entries(b[t])
      .filter(([k, l]) => JSON.stringify(a?.[t]?.[k]) !== JSON.stringify(l))
      .map(([, l]) => l);
    del[t] = Object.keys(a?.[t] || {}).filter((k) => !(k in b[t]));
    n += up[t].length + del[t].length;
  }

  return n ? { up, del } : null;
}

// Envio sem resposta (o sinal caiu no meio, ex.: metrô): pode ter chegado à nuvem ou não. Antes de mandar corpo_dia, o aparelho
// guarda como cada dia vai ficar lá ("em voo"); no envio seguinte, o dia que está na nuvem exatamente assim chegou, e a base
// dele passa a ser isso. Sem isso a mescla somaria de novo o que já tinha subido (o mesmo xixi duas vezes).
const lerVoo = () => {
  try {
    return JSON.parse(store.get(K_VOO(usuario.id)) || 'null') || {};
  } catch {
    return {};
  }
};

// O dia daqui no momento do envio em voo: se ele chegou, só o que mudou aqui depois dele entra na mescla. Usar o próprio voo como
// base tiraria da nuvem o que o outro aparelho lançou no mesmo dia antes daquele envio (aba parada + metrô, 24/11/2026).
// Voo sem este registro (versão anterior do app): como antes, a base é o voo.
const lerVooAqui = () => {
  try {
    return JSON.parse(store.get(K_VOO_AQUI(usuario.id)) || 'null') || {};
  } catch {
    return {};
  }
};

const temPendente = () => {
  if (!db || !usuario) return false;
  const d = diferenca(base, linhas(db));

  return (
    (!!d &&
      (!semCorpoDia ||
        Object.keys(TABELAS).some(
          (t) => t !== 'corpo_dia' && (d.up[t].length || d.del[t].length)
        ))) ||
    (!semCorpoDia && Object.keys(lerVoo()).length > 0)
  );
};

// Lista mesclada (multiconjunto): a da nuvem, mais o que entrou aqui desde a base, menos o que saiu daqui
function mesclar(nuvem, base, local) {
  const conta = (L) => L.reduce((m, x) => m.set(x, (m.get(x) || 0) + 1), new Map());

  const b = conta(base),
    l = conta(local),
    R = [...nuvem];

  for (const [c, n] of l) for (let i = b.get(c) || 0; i < n; i++) R.push(c);

  for (const [c, n] of b)
    for (let i = l.get(c) || 0; i < n; i++) {
      const j = R.indexOf(c);

      if (j >= 0) R.splice(j, 1);
    }

  return R;
}

// Linha de corpo_dia (formato de linhas) do dia d depois da mescla: nuvem N, base B e aparelho L (qualquer um pode faltar)
function diaMesclado(d, N, B, L) {
  // Sono (horários e horas) vai junto: mudou aqui, vale o daqui; senão, o da nuvem
  const v = (x, k) => x?.[k] || [],
    mudouSono = ['sono', 'dormiu', 'acordou'].some(
      (k) => (L?.[k] ?? null) !== (B?.[k] ?? null)
    ),
    S = mudouSono ? L : N;

  const dia = preparar({
    dias: [
      {
        data: d,
        evacuacoes: mesclar(v(N, 'evacuacoes'), v(B, 'evacuacoes'), v(L, 'evacuacoes')),
        xixis: mesclar(v(N, 'xixis'), v(B, 'xixis'), v(L, 'xixis')),
        sono: S?.sono ?? null,
        dormiu: S?.dormiu,
        acordou: S?.acordou,
        sono_em: S?.sono_em,
      },
    ],
  }).dias[0];

  return dia ? linhas({ medidas: [], dias: [dia] }).corpo_dia[d] : null;
}

async function enviar() {
  clearTimeout(tEnvio);

  if (enviando || !usuario || !db) return;

  const agora = linhas(db),
    mud = diferenca(base, agora),
    voo = semCorpoDia ? {} : lerVoo(),
    vooAqui = semCorpoDia ? {} : lerVooAqui();

  if (!mud && !Object.keys(voo).length) {
    erroSync = '';
    pintarSync();

    return;
  }

  enviando = true;

  try {
    // corpo_dia: dia a dia (os que mudaram aqui e os de um envio sem resposta), mesclado com o que está na nuvem agora
    const diasMudados = semCorpoDia
      ? []
      : [
          ...new Set([
            ...(mud
              ? [...mud.up.corpo_dia.map((l) => l.data), ...mud.del.corpo_dia]
              : []),
            ...Object.keys(voo),
          ]),
        ];

    const finais = {};

    if (diasMudados.length) {
      const { data: N, error } = await sb
        .from('corpo_dia')
        .select('*')
        .in('data', diasMudados);

      if (error) throw error;

      const nuvem = linhas({
        medidas: [],
        dias: preparar({ dias: N || [] }).dias,
      }).corpo_dia;

      const chegou = (d) =>
        d in voo && JSON.stringify(nuvem[d] ?? null) === JSON.stringify(voo[d] ?? null);

      for (const d of diasMudados)
        finais[d] = diaMesclado(
          d,
          nuvem[d],
          chegou(d) ? (d in vooAqui ? vooAqui[d] : voo[d]) : base?.corpo_dia?.[d],
          agora.corpo_dia[d]
        );
      store.set(K_VOO(usuario.id), JSON.stringify(finais));
      store.set(
        K_VOO_AQUI(usuario.id),
        JSON.stringify(
          Object.fromEntries(diasMudados.map((d) => [d, agora.corpo_dia[d] ?? null]))
        )
      );

      const sobe = diasMudados.filter((d) => finais[d]),
        sai = diasMudados.filter((d) => !finais[d] && nuvem[d]);

      if (sobe.length) {
        const { error: e } = await sb.from('corpo_dia').upsert(
          sobe.map((d) => ({ user_id: usuario.id, ...finais[d] })),
          { onConflict: 'user_id,data' }
        );

        if (e) throw e;
      }

      for (const d of sai) {
        const { error: e } = await sb.from('corpo_dia').delete().eq('data', d);

        if (e) throw e;
      }
    }

    // corpo_medida: aba parada (24/11/2026). A pesagem do dia não sobe inteira por cima do que outro aparelho gravou nela
    // depois da base: grava a mescla coluna por coluna com a linha da nuvem, e apagar só apaga se a nuvem ainda é a que este
    // aparelho conhecia (senão, a da nuvem volta para cá). enviarMesclado e mesclarLinha: ../base/nucleo.js.
    const medidasFinais = {};

    if (mud && (mud.up.corpo_medida.length || mud.del.corpo_medida.length)) {
      const finais = await enviarMesclado(sb, {
        tabela: 'corpo_medida',
        chaves: ['data'],
        up: mud.up.corpo_medida.map((l) => ({
          local: l,
          base: base?.corpo_medida?.[l.data] ?? null,
        })),
        del: mud.del.corpo_medida.map((k) => base.corpo_medida[k]),
        usuarioId: usuario.id,
        vooChave: 'corpo.vooLinhas.' + usuario.id,
      });

      for (const k of [
        ...mud.up.corpo_medida.map((l) => l.data),
        ...mud.del.corpo_medida,
      ])
        medidasFinais[k] = finais.get(chaveDaLinha(['data'], { data: k })) ?? null;
    }

    base = semCorpoDia ? { ...agora, corpo_dia: base?.corpo_dia || {} } : agora;

    if (Object.keys(medidasFinais).length) {
      // O aparelho e a base ficam com o que a nuvem tem agora (a mescla), menos o que mudou aqui durante o envio
      const atual = linhas(db).corpo_medida;

      for (const [k, f] of Object.entries(medidasFinais))
        if (JSON.stringify(atual[k]) === JSON.stringify(agora.corpo_medida[k]))
          db.medidas = [...db.medidas.filter((m) => m.data !== k), ...(f ? [f] : [])];

      db = preparar(db);

      const limpas = linhas({
        medidas: preparar({ medidas: Object.values(medidasFinais).filter(Boolean) })
          .medidas,
        dias: [],
      }).corpo_medida;

      base = { ...base, corpo_medida: { ...base.corpo_medida } };

      for (const k in medidasFinais)
        if (limpas[k]) base.corpo_medida[k] = limpas[k];
        else delete base.corpo_medida[k];
      store.set(K_LOCAL(usuario.id), JSON.stringify(db));
      guardarMedidas(usuario.id, db.medidas);

      if (typeof desenhar === 'function' && !$('v-corpo').hidden) desenhar();
    }

    if (diasMudados.length) {
      // O aparelho fica com o resultado da mescla (mais o que mudou aqui enquanto enviava); a base, com o que a nuvem tem agora
      const atual = linhas(db).corpo_dia;

      base = { ...base, corpo_dia: { ...base.corpo_dia } };

      for (const d of diasMudados) {
        if (finais[d]) base.corpo_dia[d] = finais[d];
        else delete base.corpo_dia[d];
        const aqui = diaMesclado(d, finais[d], agora.corpo_dia[d], atual[d]);

        db.dias = db.dias.filter((x) => x.data !== d);

        if (aqui)
          db.dias.push({
            data: d,
            evacuacoes: aqui.evacuacoes,
            xixis: aqui.xixis,
            sono: aqui.sono,
            dormiu: aqui.dormiu,
            acordou: aqui.acordou,
            sonoEm: aqui.sono_em,
          });
      }

      db = preparar(db);
      store.set(K_LOCAL(usuario.id), JSON.stringify(db));

      if (typeof desenhar === 'function' && !$('v-corpo').hidden) desenhar();
    }

    store.set(K_BASE(usuario.id), JSON.stringify(base));
    limparVooLinhas('corpo.vooLinhas.' + usuario.id);
    store.set(K_VOO(usuario.id), '{}');
    store.set(K_VOO_AQUI(usuario.id), '{}');
    erroSync = '';
  } catch (e) {
    erroSync = e.message || String(e);
  } finally {
    enviando = false;
  }

  pintarSync();

  if (!erroSync && temPendente()) enviar(); // mudou algo enquanto enviava
}

function gravar() {
  if (!usuario || !db) return;

  if (!store.set(K_LOCAL(usuario.id), JSON.stringify(db)))
    toast('Não consegui gravar no aparelho.', true);
  guardarMedidas(usuario.id, db.medidas);
  clearTimeout(tEnvio);
  tEnvio = setTimeout(enviar, 800);
  pintarSync();
}

function pintarSync() {
  const p = temPendente(),
    off = !navigator.onLine || /fetch|network/i.test(erroSync);

  const txt = !p
    ? ''
    : erroSync && !off
      ? 'Erro ao enviar para a nuvem: ' + erroSync
      : off
        ? 'Sem internet: salvo no aparelho, envia quando conectar.'
        : '';

  $('sync').hidden = !txt;
  $('sync').textContent = txt;
  $('sync').classList.toggle('erro', !!erroSync && !off);
}

addEventListener('online', () => enviar());
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && temPendente()) enviar();
});
setInterval(() => {
  if (temPendente()) enviar();
}, 60000);

// Valida e completa o db (cópia local ou linhas do servidor), com a mesma limpeza que os outros apps usam
const preparar = (d) => ({
  medidas: ordenarMedidas(d?.medidas || []),
  // Dia: evacuações (horários "HH:MM", "" = sem horário, em ordem), xixis ("HH:MM", em ordem), sono: a hora em que dormiu e a
  // em que acordou ("HH:MM", a noite que terminou neste dia) e as horas (sono, calculado dos dois), e quando o sono foi lançado
  // (sonoEm). Sono só em horas (antes da migration 05): dormiu às 23:00 e acordou 23:00 + as horas. Formato da migration 01
  // (evacuou sim ou não): sim vira 1 evacuação sem horário. Dia sem nada não fica guardado.
  dias: (d?.dias || [])
    .filter((x) => x && dataOk(x.data))
    .map((x) => {
      const ev = Array.isArray(x.evacuacoes)
        ? x.evacuacoes.map((h) => (horaOk(h) ? h : '')).slice(0, 20)
        : x.evacuou === true
          ? ['']
          : [];

      const xixis = (Array.isArray(x.xixis) ? x.xixis : [])
        .filter(horaOk)
        .sort()
        .slice(0, 50);

      let dormiu = horaOk(x.dormiu) ? x.dormiu : null,
        acordou = horaOk(x.acordou) ? x.acordou : null;
      const antigo = num(x.sono);

      if (!dormiu && !acordou && antigo >= 0 && antigo <= 24) {
        dormiu = SONO_ANTIGO_DORMIU;
        acordou = maisMinutos(SONO_ANTIGO_DORMIU, Math.round(antigo * 60));
      }

      const sono = horasDeSono(dormiu, acordou),
        sonoEm = x.sonoEm || x.sono_em;

      return {
        data: x.data,
        evacuacoes: ev.sort(),
        xixis,
        ...(dormiu && { dormiu }),
        ...(acordou && { acordou }),
        ...(sono != null && { sono }),
        ...(sono != null &&
          sonoEm &&
          !isNaN(Date.parse(sonoEm)) && { sonoEm: new Date(sonoEm).toISOString() }),
      };
    })
    .filter((x) => x.evacuacoes.length || x.xixis.length || x.dormiu || x.acordou)
    .sort((a, b) => a.data.localeCompare(b.data)),
});

// Baixa uma tabela inteira (de 1000 em 1000)
async function todas(tabela, colunas) {
  const R = [];

  for (let i = 0; ; i += 1000) {
    const { data, error } = await sb
      .from(tabela)
      .select(colunas)
      .range(i, i + 999);

    if (error) throw error;
    R.push(...data);

    if (data.length < 1000) return R;
  }
}
