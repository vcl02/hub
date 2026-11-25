'use strict';
// Núcleo de código comum de todos os módulos (passo 4 da base comum, docs/DIRETRIZES.md seção 8): o que cada app repetia igual
// fica aqui, uma vez, testado uma vez (tests/nucleo.test.mjs). Script clássico, sem módulos nem build, como corpo/perfil.js:
// a página carrega ../base/nucleo.js depois do supabase.js e antes dos próprios scripts, e o service worker de cada app o guarda.
// Fatia 1: o limite de tempo dos pedidos ao Supabase (fetchComTeto). Fatia 2: o toque repetido sem querer (repetido) e o toque
// duplo para confirmar (confirmar e o armado pela chave do item). O que vem depois está em docs/DECISOES.md da raiz.

// Rede ruim (metrô): sem teto, um pedido que perde o sinal no meio pode ficar pendente por minutos, e o que espera por ele
// (o envio, a busca) fica preso até ele cair. Todo pedido ao Supabase, inclusive a leitura da resposta, tem limite; estourou,
// vira falha de rede comum ("Failed to fetch") e o pendente vai na próxima tentativa. A função (IA) tem mais tempo.
const TETO_REDE_MS = 15000,
  TETO_FUNCAO_MS = 40000;

// O fetch com teto para um par de limites (em ms): `rede` para o banco e o Auth, `funcao` para /functions/v1/. Sem argumento,
// os limites de todos os apps (15 s e 40 s); um app com limite próprio (o Fin, 12 s, quando migrar) cria o seu.
function criarFetchComTeto({ rede = TETO_REDE_MS, funcao = TETO_FUNCAO_MS } = {}) {
  return async function fetchComTeto(url, op = {}) {
    const c = new AbortController(),
      ms = String(url).includes('/functions/v1/') ? funcao : rede,
      t = setTimeout(() => c.abort(), ms);

    if (op.signal?.aborted) c.abort();
    else op.signal?.addEventListener('abort', () => c.abort());

    try {
      const r = await fetch(url, { ...op, signal: c.signal });

      const corpo = [101, 103, 204, 205, 304].includes(r.status)
        ? null
        : await r.arrayBuffer();

      return new Response(corpo, {
        status: r.status,
        statusText: r.statusText,
        headers: r.headers,
      });
    } catch (e) {
      if (c.signal.aborted && !op.signal?.aborted)
        throw new TypeError(`Failed to fetch: sem resposta em ${ms / 1000} s`, {
          cause: e,
        });
      throw e;
    } finally {
      clearTimeout(t);
    }
  };
}

// O que os apps passam ao cliente do Supabase: supabase.createClient(..., { global: { fetch: fetchComTeto } })
const fetchComTeto = criarFetchComTeto();

// ===== Toque duplo para confirmar (tirar, apagar, jogar fora) =====
// O 1º toque arma o item (o botão fica vermelho por 3 s) e o 2º confirma. O armado fica guardado pela chave do item
// (data-armavel no botão), não no botão: a tela redesenhada no meio (a nuvem que chega, o relógio, o cronômetro do Treino)
// devolve o vermelho ao botão novo do mesmo item, e o 2º toque tira esse item, nunca o vizinho que ficou no lugar.
const ARMADO_MS = 3000;
let armados = {}; // chave do item → até quando (ms)

const estaArmado = (chave) => armados[chave] > Date.now();

function armar(chave) {
  armados[chave] = Date.now() + ARMADO_MS;
  setTimeout(pintarArmados, ARMADO_MS); // o prazo acabou: o vermelho sai
}

function desarmar(chave) {
  delete armados[chave];
}

// Cada botão com data-armavel fica vermelho só enquanto o item dele está armado; o prazo vencido sai da lista
function pintarArmados() {
  document
    .querySelectorAll('[data-armavel]')
    .forEach((b) => b.classList.toggle('armado', estaArmado(b.dataset.armavel)));

  for (const k of Object.keys(armados)) if (!estaArmado(k)) delete armados[k];
}

// true no 2º toque no mesmo item dentro do prazo; o 1º só arma. Botão sem data-armavel nunca arma nem confirma: sem a
// chave, todos dividiriam uma só ("undefined") e o 2º toque num botão confirmaria o 1º de outro (erro no console, sem quebrar).
function confirmar(btn) {
  const k = btn.dataset.armavel;

  if (!k) {
    console.error('confirmar: botão sem data-armavel', btn);

    return false;
  }

  if (estaArmado(k)) {
    desarmar(k);
    pintarArmados();

    return true;
  }

  armar(k);
  pintarArmados();

  return false;
}

// Chave de item sem id (copo de água, trecho de caminhada, horário de evacuação ou xixi): o conteúdo e, entre iguais, a vez
// dele (#1, #2…); nunca a posição na lista, que muda quando a nuvem traz um item antes
function chavesDosItens(L, texto) {
  const vez = {};

  return L.map((x) => {
    const t = texto(x);

    vez[t] = (vez[t] || 0) + 1;

    return `${t}#${vez[t]}`;
  });
}

// Tela redesenhada (innerHTML novo, de qualquer desenho): os botões novos dos itens armados voltam vermelhos. Na página
// inicial, que não arma nada, a lista fica vazia e o observador não percorre a tela.
new MutationObserver(() => {
  if (Object.keys(armados).length) pintarArmados();
}).observe(document.documentElement, { childList: true, subtree: true });

// ===== Toque repetido sem querer =====
// O dedo que bate duas vezes, o clique duplo: a mesma ação (k) de novo em menos de 0,5 s é ignorada (true = ignore). Só nos
// botões que acrescentam à lista do dia (+ml, +1, Andei +); o Fin trava o botão enquanto o pedido está no ar.
const REPETIDO_MS = 500;
let ultimaAcao = { k: '', em: 0 };

function repetido(k) {
  const agora = Date.now(),
    r = ultimaAcao.k === k && agora - ultimaAcao.em < REPETIDO_MS;

  ultimaAcao = { k, em: agora };

  return r;
}

// ===== Linha mesclada com a nuvem (aba parada) =====
// Aparelho com a cópia velha (aba esquecida horas ou dias) que muda uma linha não pode gravar a linha inteira por cima do que
// outro aparelho gravou nela nesse meio tempo. Antes de gravar, o app lê a linha na nuvem e grava esta mescla, coluna por coluna,
// com a base (a versão que este aparelho conhecia): coluna que só mudou aqui vale a daqui; que só mudou na nuvem (ou não mudou
// aqui), a da nuvem; que mudou nos dois, lista (série, ingrediente) vira a da nuvem mais o que entrou aqui menos o que saiu daqui
// (mesclarLista), e valor simples fica o daqui (a ação mais recente, a pessoa digitou agora). Vazio (null, '', ausente) aqui numa
// linha que este aparelho não conhecia não conta como mudança: não apaga o que a nuvem tem.
// Valores comparados pelo conteúdo (mesmoValor), com as chaves dos objetos em qualquer ordem (o jsonb devolve em outra ordem).
// Número contra texto numérico vale o número (numeric do Postgres chega como texto, "12.50", e o aparelho tem 12.5); dois textos
// comparam como texto ("007" e "7" são diferentes: a edição de um para o outro não some). Data e hora (timestamptz) vale pelo
// instante: "…T10:00:00+00:00" da nuvem e "…T10:00:00.000Z" do aparelho são o mesmo.
const INSTANTE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/,
  NUMERICO = /^-?\d+(\.\d+)?$/;

const valorVazio = (v) => v === undefined || v === null || v === '',
  ehInstante = (v) => INSTANTE.test(v) && !Number.isNaN(Date.parse(v));

function mesmoValor(a, b) {
  if (valorVazio(a) || valorVazio(b)) return valorVazio(a) && valorVazio(b);

  // só quando um lado é número e o outro texto numérico; nunca dois textos
  if (typeof a === 'number' && typeof b === 'string')
    return NUMERICO.test(b) && a === Number(b);

  if (typeof a === 'string' && typeof b === 'number')
    return NUMERICO.test(a) && Number(a) === b;

  if (typeof a === 'string' && typeof b === 'string')
    return a === b || (ehInstante(a) && ehInstante(b) && Date.parse(a) === Date.parse(b));

  if (Array.isArray(a) || Array.isArray(b))
    return (
      Array.isArray(a) &&
      Array.isArray(b) &&
      a.length === b.length &&
      a.every((x, i) => mesmoValor(x, b[i]))
    );

  if (typeof a === 'object' && typeof b === 'object')
    return [...new Set([...Object.keys(a), ...Object.keys(b)])].every((k) =>
      mesmoValor(a[k], b[k])
    );

  return a === b;
}

// A forma única de um valor de chave de linha (id, data, instante): o mesmo valor, venha da nuvem ou do aparelho, dá o mesmo
// texto. Só para chave (chaveDaLinha); comparar valores é com mesmoValor. Texto fica texto ("7" e "007" são chaves diferentes).
function canonico(v) {
  if (valorVazio(v)) return 'null';

  if (typeof v === 'string' && ehInstante(v))
    return JSON.stringify(new Date(Date.parse(v)).toISOString());

  if (Array.isArray(v)) return '[' + v.map(canonico).join(',') + ']';

  if (v && typeof v === 'object')
    return (
      '{' +
      Object.keys(v)
        .sort()
        .filter((k) => v[k] !== undefined)
        .map((k) => JSON.stringify(k) + ':' + canonico(v[k]))
        .join(',') +
      '}'
    );

  return JSON.stringify(v);
}

// A lista da nuvem, menos o que saiu daqui desde a base, mais o que entrou aqui (multiconjunto: cada item pareia com um só igual
// a ele, pelo conteúdo; repetidos contam)
function mesclarLista(nuvem, base, local) {
  const R = [...nuvem],
    sobraDaBase = [...base],
    entrou = [];

  for (const x of local) {
    const j = sobraDaBase.findIndex((y) => mesmoValor(x, y));

    if (j >= 0) sobraDaBase.splice(j, 1);
    else entrou.push(x);
  }

  for (const x of sobraDaBase) {
    const j = R.findIndex((y) => mesmoValor(x, y));

    if (j >= 0) R.splice(j, 1);
  }

  return [...R, ...entrou];
}

// A linha a gravar: nuvem (a linha como está lá agora; null = não existe), base (a que este aparelho conhecia; null = nenhuma) e
// local (a daqui). Sem a linha na nuvem, a daqui (apagada lá e mudada aqui: o que se escreveu não se perde). Só as colunas da
// linha daqui (as outras da nuvem, como user_id, não entram: a linha volta para a base e o db do app como as dele).
// contadores: colunas que contam (porções que restam, usos): mudou nos dois, soma as duas mudanças (a da nuvem + o que mudou
// aqui desde a base), senão um aparelho apagaria a conta do outro; nunca abaixo de 0.
function mesclarLinha(nuvem, base, local, contadores = []) {
  if (!nuvem) return { ...local };
  const R = {};

  for (const c of Object.keys(local)) {
    const b = base?.[c],
      aqui = !mesmoValor(local[c], b),
      la = !mesmoValor(nuvem[c], b);

    if (!(c in nuvem)) R[c] = local[c];
    else if (!aqui) R[c] = nuvem[c];
    else if (!la) R[c] = local[c];
    else if (
      contadores.includes(c) &&
      [local[c], nuvem[c], b].every((x) => !valorVazio(x) && Number.isFinite(+x))
    )
      R[c] = Math.max(0, +nuvem[c] + (+local[c] - +b));
    else if (mesmoValor(local[c], nuvem[c])) R[c] = local[c];
    else if (Array.isArray(local[c]) && Array.isArray(nuvem[c]))
      R[c] = mesclarLista(nuvem[c], Array.isArray(b) ? b : [], local[c]);
    else R[c] = local[c];
  }

  return R;
}

// A linha da nuvem mudou desde a base (só as colunas que o aparelho conhece; user_id e afins não contam)? Sem base, mudou.
const mudouNaNuvem = (nuvem, base) =>
  !base || Object.keys(base).some((c) => !mesmoValor(nuvem?.[c], base[c]));

// A chave de uma linha (as colunas da chave da tabela), igual venha da nuvem ou do aparelho
const chaveDaLinha = (chaves, l) => chaves.map((c) => canonico(l[c])).join('|');

// Envio sem resposta (metrô): a mescla pode ter chegado. Antes de gravar, as linhas mescladas ficam guardadas no aparelho
// (vooChave, com o prefixo do app), com a linha daqui daquele momento e a marca do envio; na tentativa seguinte, a linha que
// chegou (a nuvem está exatamente como a mescla, ou tem a marca do envio) tem como base a linha daqui daquele envio: só o que
// mudou aqui depois entra (senão a lista mesclada somaria de novo o que já subiu, ou tiraria o que o outro aparelho pôs).
function lerVooLinhas(chave) {
  try {
    const v = JSON.parse(localStorage.getItem(chave));

    return v && typeof v === 'object' ? v : {};
  } catch {
    return {};
  }
}

function gravarVooLinhas(chave, v) {
  try {
    localStorage.setItem(chave, JSON.stringify(v));
  } catch {
    // aparelho sem espaço: sem o voo, o pior caso é a lista repetir o que já subiu (como antes do voo)
  }
}

// O app limpa o voo só depois de guardar a base do envio inteiro: um passo seguinte que falhe (outra tabela, a rede) deixa o voo,
// e a tentativa seguinte reconhece o que já subiu (sem isso, um contador somaria de novo a mudança daqui).
const limparVooLinhas = (chave) => gravarVooLinhas(chave, {});

// Marca do envio (tabela com contador): a coluna `marca` (jsonb, lista) guarda as últimas MARCAS_MAX marcas de envio que
// gravaram a linha. Contador mexido nos dois aparelhos com o envio sem resposta: a nuvem diferente do voo não diz se o envio
// chegou (chegou e outro aparelho somou depois, ou não chegou e o outro somou mais, dão a mesma linha; prova em
// al/docs/DECISOES.md). A marca diz: o outro aparelho grava a lista da nuvem mais a dele, e a nossa fica lá se chegou.
// Coluna que ainda não existe na nuvem (migration não aplicada): grava sem marca (como antes) até a página recarregar.
const MARCAS_MAX = 20,
  tabelasSemMarca = new Set();

const novaMarcaDeEnvio = () =>
  Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

// Leitura das linhas mexidas: filtra por todas as colunas da chave (in em cada uma, com os valores do grupo; o resultado é um
// superconjunto, casado depois pela chave inteira) e pagina de 1000 em 1000 (o PostgREST corta em 1000 linhas). Sem isso, a
// linha mexida que ficou fora do resultado subiria inteira por cima do outro aparelho, e a apagada não seria apagada.
const PAGINA_NUVEM = 1000,
  GRUPO_NUVEM = 100;

async function lerLinhas(sb, tabela, chaves, mexidas) {
  const nuvem = new Map();

  for (let i = 0; i < mexidas.length; i += GRUPO_NUVEM) {
    const grupo = mexidas.slice(i, i + GRUPO_NUVEM);

    for (let de = 0; ; de += PAGINA_NUVEM) {
      let q = sb.from(tabela).select('*');

      for (const c of chaves) q = q.in(c, [...new Set(grupo.map((l) => l[c]))]);

      for (const c of chaves) q = q.order(c);
      const { data, error } = await q.range(de, de + PAGINA_NUVEM - 1);

      if (error) throw error;

      for (const n of data || []) nuvem.set(chaveDaLinha(chaves, n), n);

      if (!data || data.length < PAGINA_NUVEM) break;
    }
  }

  return nuvem;
}

// A coluna da marca ainda não existe na nuvem: "Could not find the 'envios' column of 'al_item' in the schema cache"
const semColunaDeMarca = (error, coluna) =>
  String(error?.message || '').includes(`'${coluna}'`);

// Envia as linhas de uma tabela sem gravar por cima do que outro aparelho gravou depois da base (aba parada): lê na nuvem as
// linhas mexidas (lerLinhas), grava a mescla de cada uma (mesclarLinha) e só apaga a que a nuvem ainda tem como a base (a que
// mudou lá fica). up: [{ local, base }] (base null = nova aqui); del: [linha da base]; contadores: como em mesclarLinha;
// vooChave: a chave do voo no aparelho (acima); marca: a coluna das marcas de envio (tabela com contador, acima); vazia(linha):
// a linha mesclada que não pode existir (marmita com 0 restando: os dois aparelhos comeram as últimas) é apagada, não gravada.
// Na tabela com contador e vazia, apagar aqui é zerar os contadores (comeu as últimas, jogou fora): a linha que mudou na nuvem
// passa pela mescla com o contador 0, e a vazia decide (o outro comeu uma: apaga; o outro preparou mais: ficam só as novas),
// em vez de voltar inteira com as porções que este aparelho já comeu.
// Devolve as linhas como a nuvem ficou, pela chave (chaveDaLinha): a gravada, a mantida (não apagada) ou null (apagada ou já
// não existia).
async function enviarMesclado(
  sb,
  {
    tabela,
    chaves,
    up = [],
    del = [],
    usuarioId,
    contadores = [],
    vooChave = null,
    marca = null,
    vazia = null,
  }
) {
  const finais = new Map(),
    k = (l) => chaveDaLinha(chaves, l),
    nuvem = await lerLinhas(sb, tabela, chaves, [...up.map((x) => x.local), ...del]),
    comMarca = marca && !tabelasSemMarca.has(tabela) ? marca : null,
    envio = novaMarcaDeEnvio();

  const voo = vooChave ? lerVooLinhas(vooChave) : {},
    emVoo = voo[tabela] || {};

  const chegou = (n, v) =>
    !!v &&
    (v.final === null
      ? !n
      : !!n &&
        (!mudouNaNuvem(n, v.final) ||
          (!!marca &&
            !!v.envio &&
            Array.isArray(n[marca]) &&
            n[marca].includes(v.envio))));

  const zerar = vazia && contadores.length,
    mudouLa = (b) => nuvem.has(k(b)) && mudouNaNuvem(nuvem.get(k(b)), b),
    subir = [
      ...up,
      ...(zerar
        ? del.filter(mudouLa).map((b) => ({
            local: { ...b, ...Object.fromEntries(contadores.map((c) => [c, 0])) },
            base: b,
          }))
        : []),
    ],
    apagarDaBase = zerar ? del.filter((b) => !mudouLa(b)) : del;

  const grava = [],
    apaga = [];

  for (const { local, base } of subir) {
    const n = nuvem.get(k(local)) ?? null,
      v = emVoo[k(local)],
      foi = chegou(n, v),
      // a base deste envio: chegou, a linha daqui daquele envio; não chegou, a base que aquele envio usou (que pode ser a linha
      // daqui de um envio anterior que chegou), se a base do app ainda é a mesma de então; sem voo, a base do app
      b = foi
        ? v.local
        : v && mesmoValor(v.baseApp ?? null, base)
          ? (v.base ?? null)
          : base;

    // apagada como este aparelho mandou (marmita que acabou) e nada mudou aqui depois: fica apagada
    if (foi && v.final === null && !mudouNaNuvem(local, v.local)) {
      finais.set(k(local), null);
      continue;
    }

    // chegou: a nuvem já tem o que este aparelho mudou até aquele envio; só o que mudou aqui depois dele entra
    const l = mesclarLinha(n, b, local, contadores);

    if (n && vazia?.(l)) apaga.push({ l, local, b, base });
    else grava.push({ l, local, n, b, base });
  }

  if (vooChave && (grava.length || apaga.length)) {
    voo[tabela] = {
      ...emVoo,
      ...Object.fromEntries([
        ...grava.map(({ l, local, b, base }) => [
          k(l),
          { final: l, local, envio, base: b, baseApp: base },
        ]),
        ...apaga.map(({ l, local, b, base }) => [
          k(l),
          { final: null, local, envio, base: b, baseApp: base },
        ]),
      ]),
    };
    gravarVooLinhas(vooChave, voo);
  }

  if (grava.length) {
    const corpo = (m) =>
      grava.map(({ l, n }) => ({
        user_id: usuarioId,
        ...l,
        ...(m && {
          [m]: [...(Array.isArray(n?.[m]) ? n[m] : []), envio].slice(-MARCAS_MAX),
        }),
      }));

    const gravar = (m) =>
      sb.from(tabela).upsert(corpo(m), { onConflict: ['user_id', ...chaves].join(',') });

    let { error } = await gravar(comMarca);

    if (error && comMarca && semColunaDeMarca(error, comMarca)) {
      tabelasSemMarca.add(tabela);
      ({ error } = await gravar(null));
    }

    if (error) throw error;
  }

  for (const { l } of grava) finais.set(k(l), l);

  const apagar = async (l) => {
    let q = sb.from(tabela).delete();

    for (const c of chaves) q = q.eq(c, l[c]);
    const { error } = await q;

    if (error) throw error;
  };

  for (const { l } of apaga) {
    await apagar(l);
    finais.set(k(l), null);
  }

  for (const b of apagarDaBase) {
    const n = nuvem.get(k(b));

    if (n && mudouNaNuvem(n, b)) {
      // mudou em outro aparelho depois da base: não apaga (as colunas que o aparelho conhece voltam para ele)
      finais.set(k(b), Object.fromEntries(Object.keys(b).map((c) => [c, n[c] ?? null])));
      continue;
    }

    if (n) await apagar(b);

    finais.set(k(b), null);
  }

  return finais;
}
