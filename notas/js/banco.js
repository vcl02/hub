'use strict';

// Banco: Supabase + cópia local e sincronização por diferença (notas_nota, 1 linha por nota).
// Cada mudança grava a cópia local na hora e, 0,8 s depois, envia ao Supabase só as notas que mudaram (diferença para "base",
// a última versão confirmada pelo servidor), cada uma INTEIRA (upsert da linha toda), e apaga as que saíram. Sem internet,
// fica pendente e envia ao reconectar.
// Sem mescla entre aparelhos (decisão do mantenedor, 24/11/2026): quem salva por último vale. O que é sobrescrito não se perde:
// o hub_historico (migration 02 da raiz) guarda antes e depois de cada gravação. Sem "voo": repetir o upsert da nota inteira
// deixa a nuvem igual (não duplica nada), então envio sem resposta só é repetido.
// Ordem da lista (coluna ordem, migration 02): a que o Victor define arrastando, fracionária (mover muda só a nota movida).
// Usa $, store e toast de js/util.js e fetchComTeto de ../base/nucleo.js (carregados antes).

// Rede ruim (metrô): todo pedido ao Supabase tem limite de tempo (fetchComTeto, de ../base/nucleo.js, carregado antes).
const sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
  global: { fetch: fetchComTeto },
});

const TABELA = 'notas_nota',
  COLUNAS = 'id,titulo,texto,ordem,criada_em,editada_em';

const K_LOCAL = (id) => 'notas.db.' + id,
  K_BASE = (id) => 'notas.base.' + id;

let db = null,
  usuario = null,
  base = null,
  enviando = false,
  tEnvio = null,
  erroSync = '';

// ===== Formato: db ↔ linhas da tabela =====
const EPOCA = '1970-01-01T00:00:00.000Z'; // data que falta ou não se lê (fixa: a limpeza tem de dar sempre o mesmo resultado)
const idOk = (id) => typeof id === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(id); // o mesmo check da tabela

const isoOk = (v) => {
  // timestamptz do servidor ("2026-11-24T12:00:00.123456+00:00") ou ISO do aparelho → ISO em UTC com milissegundos
  const t = typeof v === 'string' ? Date.parse(v) : NaN;

  return Number.isFinite(t) ? new Date(t).toISOString() : null;
};

function migrarNotaAntiga(texto) {
  const linhas = String(texto ?? '')
      .replace(/\r\n?/g, '\n')
      .split('\n'),
    i = linhas.findIndex((l) => l.trim());

  if (i < 0) return { titulo: '', texto: linhas.join('\n') };

  const titulo = linhas[i].replace(/^[\s#]+/, '').trim();

  linhas.splice(i, 1);

  while (linhas.length && !linhas[0].trim()) linhas.shift();

  return { titulo, texto: linhas.join('\n') };
}

const ordemOk = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

// Lista: ordem crescente (a que o mantenedor definiu arrastando); empate, a editada mais recentemente primeiro e depois o id
const pelaEdicao = (a, b) =>
  b.editadaEm.localeCompare(a.editadaEm) || a.id.localeCompare(b.id);

const pelaOrdem = (a, b) => a.ordem - b.ordem || pelaEdicao(a, b);

// Ordem para uma nota entre as vizinhas da nova posição (null = não há vizinha daquele lado): a média; no topo, a primeira − 1;
// no fim, a última + 1; lista vazia, 0. Sem folga entre as duas (diferença < 1e-6, ou empate), null: quem chama renumera.
const FOLGA_MINIMA = 1e-6;

function ordemEntre(anterior, seguinte) {
  const a = ordemOk(anterior),
    b = ordemOk(seguinte);

  if (a === null && b === null) return 0;

  if (a === null) return b - 1;

  if (b === null) return a + 1;

  if (!(b - a >= FOLGA_MINIMA)) return null;
  const m = (a + b) / 2;

  return m > a && m < b ? m : null;
}

// Valida e completa o db (cópia local ou linhas do servidor): id válido, texto string com quebras \n, datas ISO, ordem número
// finito; id repetido fica com a edição mais recente. Nota vazia continua (acabou de ser criada); quem decide apagá-la é a tela.
// Ordem que falta ou não é número (formato antigo, antes da migration 02): depois de todas as que têm, pela edição (a mais
// recente primeiro, empate pelo id), a maior (ou 0) + 1, + 2… (sem nenhuma, 1, 2, 3…, o mesmo que a migration 02 grava).
// Depende só do conjunto de notas, não da ordem em que chegam: a mesma entrada dá sempre o mesmo resultado.
function preparar(d) {
  const porId = new Map();

  for (const n of Array.isArray(d?.notas) ? d.notas : []) {
    if (!n || !idOk(n.id)) continue;
    const editadaEm = isoOk(n.editadaEm) || isoOk(n.criadaEm) || EPOCA;

    const texto = typeof n.texto === 'string' ? n.texto.replace(/\r\n?/g, '\n') : '',
      separada =
        typeof n.titulo === 'string'
          ? { titulo: n.titulo.trim(), texto }
          : migrarNotaAntiga(texto);

    const nota = {
      id: n.id,
      titulo: separada.titulo,
      texto: separada.texto,
      ordem: ordemOk(n.ordem),
      criadaEm: isoOk(n.criadaEm) || editadaEm,
      editadaEm,
    };

    const antes = porId.get(n.id);

    if (!antes || antes.editadaEm < nota.editadaEm) porId.set(n.id, nota);
  }

  const notas = [...porId.values()],
    semOrdem = notas.filter((n) => n.ordem === null).sort(pelaEdicao);

  let ultima = notas.reduce((m, n) => (n.ordem === null ? m : Math.max(m, n.ordem)), 0);

  for (const n of semOrdem) n.ordem = ++ultima;

  return { notas: notas.sort(pelaOrdem) };
}

// db → { id: linha da tabela } (sem user_id: entra no envio)
const linhas = (d) =>
  Object.fromEntries(
    d.notas.map((n) => [
      n.id,
      {
        id: n.id,
        titulo: n.titulo,
        texto: n.texto,
        ordem: n.ordem,
        criada_em: n.criadaEm,
        editada_em: n.editadaEm,
      },
    ])
  );

// linhas da tabela (baixar) → db, com a mesma limpeza
const deLinhas = (R) =>
  preparar({
    notas: (R || []).map((l) => ({
      id: l?.id,
      titulo: l?.titulo,
      texto: l?.texto,
      ordem: l?.ordem,
      criadaEm: l?.criada_em,
      editadaEm: l?.editada_em,
    })),
  });

// Base guardada no aparelho passa pela mesma limpeza do db antes de comparar: mudança só de formato nunca vira "pendente".
const baseNormal = (b) =>
  b && typeof b === 'object' ? linhas(deLinhas(Object.values(b))) : null;

function diferenca(a, b) {
  // o que enviar para sair de a e chegar em b; null = nada
  const up = Object.entries(b)
    .filter(([k, l]) => JSON.stringify(a?.[k]) !== JSON.stringify(l))
    .map(([, l]) => l);

  const del = Object.keys(a || {}).filter((k) => !(k in b));

  return up.length || del.length ? { up, del } : null;
}

const temPendente = () => !!(db && usuario && diferenca(base, linhas(db)));

// ===== Notas (o que a tela chama; cada uma grava e agenda o envio) =====
const notaPorId = (id) => db?.notas.find((n) => n.id === id) || null;

function criarNota(titulo = '', texto = '') {
  let id;

  do id = Math.random().toString(36).slice(2, 10);
  while (notaPorId(id));
  const agora = new Date().toISOString();

  // nota nova entra no topo: a menor ordem − 1 (lista vazia, 0)
  const nota = {
    id,
    titulo: String(titulo).trim(),
    texto: String(texto),
    ordem: ordemEntre(null, db.notas[0]?.ordem ?? null),
    criadaEm: agora,
    editadaEm: agora,
  };

  db = preparar({ notas: [nota, ...db.notas] });
  gravar();

  return notaPorId(id);
}

// Troca o texto inteiro da nota (o editor e a conversa mandam o texto final); texto igual não grava nada
function salvarNota(id, texto) {
  const n = notaPorId(id),
    t = String(texto).replace(/\r\n?/g, '\n');

  if (!n || n.texto === t) return false;
  n.texto = t;
  n.editadaEm = new Date().toISOString();
  db = preparar(db);
  gravar();

  return true;
}

function salvarTituloNota(id, titulo) {
  const n = notaPorId(id),
    t = String(titulo ?? '').trim();

  if (!n || n.titulo === t) return false;
  n.titulo = t;
  n.editadaEm = new Date().toISOString();
  db = preparar(db);
  gravar();

  return true;
}

// Leva a nota para a posição final `posicao` (0-based) da lista. Só ela muda (ordem entre as vizinhas, uma linha no envio);
// sem folga entre as vizinhas, renumera todas 1, 2, 3… (várias linhas sobem, raro). Não muda editadaEm. Mesma posição (ou
// nota que não existe, posição que não é número) não grava nada. Posição fora da lista vai para o topo ou para o fim.
function moverNota(id, posicao) {
  const lista = db?.notas || [],
    i = lista.findIndex((n) => n.id === id),
    p = Math.min(Math.max(Math.trunc(posicao), 0), lista.length - 1);

  if (i < 0 || !Number.isFinite(p) || p === i) return false;

  const outras = lista.filter((n) => n.id !== id),
    o = ordemEntre(outras[p - 1]?.ordem ?? null, outras[p]?.ordem ?? null),
    movida =
      o === null ? null : preparar({ notas: [...outras, { ...lista[i], ordem: o }] });

  // sem folga (ou o empate da ordenação não a pôs no lugar): renumera a lista inteira já na ordem nova
  if (movida && movida.notas[p].id === id) db = movida;
  else {
    outras.splice(p, 0, lista[i]);
    db = preparar({ notas: outras.map((n, k) => ({ ...n, ordem: k + 1 })) });
  }

  gravar();

  return true;
}

function apagarNota(id) {
  if (!notaPorId(id)) return false;
  db = { notas: db.notas.filter((n) => n.id !== id) };
  gravar();

  return true;
}

// ===== Sincronização =====
async function enviar() {
  clearTimeout(tEnvio);

  if (enviando || !usuario || !db) return;

  const u = usuario,
    agora = linhas(db),
    mud = diferenca(base, agora);

  if (!mud) {
    erroSync = '';
    pintarSync();

    return;
  }

  enviando = true;

  try {
    if (mud.up.length) {
      const { error } = await sb.from(TABELA).upsert(
        mud.up.map((l) => ({ user_id: u.id, ...l })),
        { onConflict: 'user_id,id' }
      );

      if (error) throw error;
    }

    for (let i = 0; i < mud.del.length; i += 100) {
      const { error } = await sb
        .from(TABELA)
        .delete()
        .eq('user_id', u.id)
        .in('id', mud.del.slice(i, i + 100));

      if (error) throw error;
    }

    // A base passa a ser o que foi enviado (o que mudou aqui enquanto enviava continua pendente)
    if (usuario === u) {
      base = agora;
      store.set(K_BASE(u.id), JSON.stringify(base));
    }

    erroSync = '';
  } catch (e) {
    erroSync = e.message || String(e);
  } finally {
    enviando = false;
  }

  pintarSync();

  if (!erroSync && temPendente()) enviar(); // mudou algo enquanto enviava
}

async function baixar() {
  const R = [];

  for (let i = 0; ; i += 1000) {
    const { data, error } = await sb
      .from(TABELA)
      .select(COLUNAS)
      .order('id')
      .range(i, i + 999);

    if (error) throw error;
    R.push(...data);

    if (data.length < 1000) return R;
  }
}

// Ao entrar (sessão válida da conta DONO): abre a cópia local na hora (mostrar), envia o pendente e só então traz a nuvem.
// Pendente que não subiu (sem internet) continua valendo: a nuvem só entra quando não há nada a enviar. Sem a cópia e sem a
// nuvem (ou a tabela ainda não criada), abre vazio e envia depois. mostrar() é chamado de novo no fim (dados da nuvem).
async function carregar(u, mostrar) {
  usuario = u;
  let local;

  try {
    local = JSON.parse(store.get(K_LOCAL(u.id)));
    base = baseNormal(JSON.parse(store.get(K_BASE(u.id))));
  } catch {
    local = null;
  }

  if (local) {
    db = preparar(local);
    mostrar();
  }

  if (local && temPendente()) await enviar();

  try {
    const R = await baixar();

    if (usuario !== u) return;

    if (!local || !temPendente()) {
      db = deLinhas(R);
      base = linhas(db);
      store.set(K_BASE(u.id), JSON.stringify(base));
      store.set(K_LOCAL(u.id), JSON.stringify(db));
    }
  } catch (e) {
    if (usuario !== u) return;
    erroSync = e.message || String(e);

    if (!local) db = preparar({});
  }

  mostrar();
  pintarSync();
}

function gravar() {
  if (!usuario || !db) return;

  if (!store.set(K_LOCAL(usuario.id), JSON.stringify(db)))
    toast('Não consegui gravar no aparelho.', true);
  clearTimeout(tEnvio);
  tEnvio = setTimeout(enviar, 800);
  pintarSync();
}

// Linha #sync (como na Água): só aparece com algo pendente, dizendo se é falta de internet ou erro do servidor
function pintarSync() {
  const el = $('sync');

  if (!el) return;

  const p = temPendente(),
    off = !navigator.onLine || /fetch|network/i.test(erroSync);

  const txt = !p
    ? ''
    : erroSync && !off
      ? 'Erro ao enviar para a nuvem: ' + erroSync
      : off
        ? 'Sem internet: salvo no aparelho, envia quando conectar.'
        : '';

  el.hidden = !txt;
  el.textContent = txt;
  el.classList.toggle('erro', !!erroSync && !off);
}

addEventListener('online', () => enviar());
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && temPendente()) enviar();
});
setInterval(() => {
  if (temPendente()) enviar();
}, 60000);
