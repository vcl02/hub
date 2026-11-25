'use strict';

// Banco: Supabase + cópia local e sincronização por diferença (notas_nota, 1 linha por nota).
// Cada mudança grava a cópia local na hora e, 0,8 s depois, envia ao Supabase só as notas que mudaram (diferença para "base",
// a última versão confirmada pelo servidor), cada uma com as colunas que mudaram aqui, e apaga as que saíram. Sem internet,
// fica pendente e envia ao reconectar. Voltar à aba, a internet voltar e o minuto à vista trazem a nuvem (atualizar).
// Sem mescla de texto (decisão do mantenedor, 24/11/2026): a nota é gravada inteira. Mas nunca por cima de uma versão que este
// aparelho não viu (aba parada, 24/11/2026): a gravação é condicional à editada_em conhecida; se a nuvem mudou, o texto daqui
// vira uma nota nova "(conflito)" e a original fica com o da nuvem. O hub_historico (migration 02 da raiz) guarda antes e
// depois de cada gravação. Voo (notas.voo.<conta>): as versões mandadas sem resposta, para não virarem conflito com si mesmas.
// Ordem da lista (coluna ordem, migration 02): a que o Victor define arrastando, fracionária (mover muda só a nota movida).
// Usa $, store e toast de js/util.js e fetchComTeto de ../base/nucleo.js (carregados antes).

// Rede ruim (metrô): todo pedido ao Supabase tem limite de tempo (fetchComTeto, de ../base/nucleo.js, carregado antes).
const sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
  global: { fetch: fetchComTeto },
});

const TABELA = 'notas_nota',
  COLUNAS = 'id,titulo,texto,ordem,criada_em,editada_em';

const K_LOCAL = (id) => 'notas.db.' + id,
  K_BASE = (id) => 'notas.base.' + id,
  K_VOO = (id) => 'notas.voo.' + id;

// envios: quantos começaram (a busca descarta a resposta que um envio pode ter deixado velha); aoMudarDeFora: a tela (mostrar),
// chamada quando o db muda sem ser por ela (nuvem, conflito); conflitos ({ original, copia, titulo }) e mantidas ({ id, titulo }:
// apagadas aqui que voltaram porque mudaram em outro aparelho): a tela avisa e esvazia
let db = null,
  usuario = null,
  base = null,
  enviando = false,
  tEnvio = null,
  erroSync = '',
  envios = 0,
  buscando = false,
  aoMudarDeFora = null,
  conflitos = [],
  mantidas = [];

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

// Temp: uma nota de verdade (mesma tabela, mesmo envio e conflito), de id e título fixos, que a lista mostra num card logo
// abaixo do Favoritas, fora da ordem manual (não arrasta, não apaga). Os ids gerados têm 8 letras: "temp" nunca bate.
const ID_TEMP = 'temp',
  TITULO_TEMP = 'Temp';

// As notas da lista (a ordem manual): todas menos a Temp
const notasDaLista = () => (db?.notas || []).filter((n) => n.id !== ID_TEMP);

// Cria a Temp se ainda não existe (ao abrir ou ao mover para ela) e a devolve
function criarTemp() {
  if (!db) return null;

  if (notaPorId(ID_TEMP)) return notaPorId(ID_TEMP);
  const agora = new Date().toISOString();

  db = preparar({
    notas: [
      ...db.notas,
      {
        id: ID_TEMP,
        titulo: TITULO_TEMP,
        texto: '',
        ordem: ordemEntre(null, notasDaLista()[0]?.ordem ?? null),
        criadaEm: agora,
        editadaEm: agora,
      },
    ],
  });
  gravar();

  return notaPorId(ID_TEMP);
}

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
    ordem: ordemEntre(null, notasDaLista()[0]?.ordem ?? null),
    criadaEm: agora,
    editadaEm: agora,
  };

  db = preparar({ notas: [nota, ...db.notas] });
  gravar();

  return notaPorId(id);
}

// Troca o texto inteiro da nota (o editor e a conversa mandam o texto final); texto igual não grava nada.
// vista (opcional): a editadaEm da nota quando a tela pegou o texto que está sendo editado. Se a nota mudou por baixo (a nuvem
// trouxe outra versão enquanto se digitava, aba parada), o texto da tela não sobrescreve a versão que ela não viu: vira uma
// nota nova "(conflito)" logo abaixo (conflitoNaTela). Devolve false (nada gravado), true ou o id da nota de conflito.
function salvarNota(id, texto, vista) {
  const n = notaPorId(id),
    t = String(texto).replace(/\r\n?/g, '\n');

  if (!n || n.texto === t) return false;

  if (vista !== undefined && vista !== n.editadaEm) return conflitoNaTela(n, n.titulo, t);
  n.texto = t;
  n.editadaEm = new Date().toISOString();
  db = preparar(db);
  gravar();

  return true;
}

// O mesmo para o título (vista: como em salvarNota; a nota de conflito leva o título da tela e o texto atual)
function salvarTituloNota(id, titulo, vista) {
  const n = notaPorId(id),
    t = String(titulo ?? '').trim();

  if (!n || n.titulo === t) return false;

  if (vista !== undefined && vista !== n.editadaEm) return conflitoNaTela(n, t, n.texto);
  n.titulo = t;
  n.editadaEm = new Date().toISOString();
  db = preparar(db);
  gravar();

  return true;
}

// O que a tela digitou sobre uma versão que não é mais a da nota vira uma nota nova logo abaixo; a nota fica como está
function conflitoNaTela(n, titulo, texto) {
  const r = copiaDeConflito(db, n.id, titulo, texto);

  db = r.db;
  conflitos.push({ original: n.id, copia: r.copia.id, titulo: n.titulo });
  gravar();

  return r.copia.id;
}

// Leva a nota para a posição final `posicao` (0-based) da lista (sem a Temp, que fica fora da ordem manual). Só ela muda
// (ordem entre as vizinhas, uma linha no envio); sem folga entre as vizinhas, renumera todas 1, 2, 3… (várias linhas sobem,
// raro). Não muda editadaEm. Mesma posição (ou nota que não existe, a Temp, posição que não é número) não grava nada.
// Posição fora da lista vai para o topo ou para o fim.
function moverNota(id, posicao) {
  const lista = notasDaLista(),
    temp = (db?.notas || []).filter((n) => n.id === ID_TEMP),
    i = lista.findIndex((n) => n.id === id),
    p = Math.min(Math.max(Math.trunc(posicao), 0), lista.length - 1);

  if (i < 0 || !Number.isFinite(p) || p === i) return false;

  const outras = lista.filter((n) => n.id !== id),
    o = ordemEntre(outras[p - 1]?.ordem ?? null, outras[p]?.ordem ?? null),
    movida =
      o === null ? null : preparar({ notas: [...outras, { ...lista[i], ordem: o }] });

  // sem folga (ou o empate da ordenação não a pôs no lugar): renumera a lista inteira já na ordem nova
  if (movida && movida.notas[p].id === id)
    db = preparar({ notas: [...movida.notas, ...temp] });
  else {
    outras.splice(p, 0, lista[i]);
    db = preparar({
      notas: [...outras.map((n, k) => ({ ...n, ordem: k + 1 })), ...temp],
    });
  }

  gravar();

  return true;
}

// Move os parágrafos `indices` da nota origemId para o fim da destinoId (moverBlocos, js/markdown.js): sem cópia, o texto
// byte a byte; as duas notas mudam numa gravação só (o envio sobe as duas, cada uma com a gravação condicional de sempre).
// textoVisto (opcional): o texto da origem de onde a tela tirou os índices; se a nota mudou por baixo, cada parágrafo é achado
// pelo texto (indicesNoTexto) e o que sumiu fica de fora. Mesma nota, nota que não existe ou nada a mover: não grava (0).
// Devolve quantos parágrafos foram.
function moverParagrafos(origemId, indices, destinoId, textoVisto) {
  const o = notaPorId(origemId),
    d = notaPorId(destinoId);

  if (!o || !d || origemId === destinoId) return 0;

  const I =
      textoVisto === undefined ? indices : indicesNoTexto(o.texto, textoVisto, indices),
    r = moverBlocos(o.texto, I, d.texto);

  if (!r.movidos) return 0;
  const agora = new Date().toISOString();

  d.texto = r.destino;
  d.editadaEm = agora;
  o.texto = r.origem;
  o.editadaEm = agora;
  db = preparar(db);
  gravar();

  return r.movidos;
}

function apagarNota(id) {
  if (!notaPorId(id)) return false;
  db = { notas: db.notas.filter((n) => n.id !== id) };
  gravar();

  return true;
}

// ===== Sincronização =====
// Aba parada (24/11/2026): um aparelho com a cópia velha nunca grava por cima de uma versão que ele não viu. A versão de cada
// nota é a editada_em; a "conhecida" é a da base (e as que este aparelho mesmo mandou e ficaram sem resposta, o voo). Antes de
// gravar, lê a nota na nuvem e decide (decidirEnvio, decidirApagar); a gravação é condicional à versão lida (update ... where
// editada_em = a lida), e 0 linhas afetadas = a nuvem mudou no meio: fica pendente e a próxima rodada decide de novo.
// Conflito (a nuvem tem um texto que este aparelho não viu e aqui também mudou): a original fica com o da nuvem e o texto daqui
// vira uma nota nova "<título> (conflito)", logo abaixo. Apagar uma nota que mudou na nuvem não apaga: ela volta com o da nuvem.
const CONFLITO = ' (conflito)',
  VOO_MAX = 20;

// Coluna da tabela → campo do db (o update leva só as colunas que este aparelho mudou; as outras ficam com a nuvem)
const CAMPOS = {
  titulo: 'titulo',
  texto: 'texto',
  ordem: 'ordem',
  criada_em: 'criadaEm',
  editada_em: 'editadaEm',
};

// Conteúdo = tudo menos a ordem: mudar só a posição não sobrescreve texto de ninguém e não precisa de versão
const conteudoMudou = (l, b) =>
  !b || ['titulo', 'texto', 'criada_em', 'editada_em'].some((c) => l[c] !== b[c]);

// As colunas em que a linha l difere da base b (sem base, todas menos o id)
const camposMudados = (l, b) =>
  Object.fromEntries(
    Object.keys(CAMPOS)
      .filter((c) => !b || l[c] !== b[c])
      .map((c) => [c, l[c]])
  );

// O que fazer com a nota l (linha daqui) que mudou desde a base b, com a nuvem como está agora (n, linha limpa; undefined =
// não existe) e as versões que este aparelho mandou sem resposta (voo):
//   aceitarApagada: apagada na nuvem e aqui só mudou a posição (nada a perder: aceita);
//   inserir: nota nova, ou apagada na nuvem com texto mudado aqui (o texto daqui não se perde);
//   atualizar: a nuvem está numa versão conhecida (ou só a posição mudou aqui, ou o conteúdo já é o mesmo); versao = a
//     editada_em que a nuvem tem de ter para o update valer (null: sem condição, só a ordem);
//   conflito: a nuvem tem um conteúdo que este aparelho não viu, e aqui o conteúdo também mudou.
function decidirEnvio(l, b, n, voo = []) {
  const campos = camposMudados(l, b);

  if (!n)
    return b && !conteudoMudou(l, b) ? { acao: 'aceitarApagada' } : { acao: 'inserir' };

  if (!conteudoMudou(l, b)) return { acao: 'atualizar', campos, versao: null };

  const conhecida =
    n.editada_em === b?.editada_em ||
    voo.includes(n.editada_em) ||
    (n.titulo === l.titulo && n.texto === l.texto);

  return conhecida
    ? { acao: 'atualizar', campos, versao: n.editada_em }
    : { acao: 'conflito' };
}

// Apagar a nota que a base conhecia (b), com a nuvem n: pronto (já não existe), apagar (versão conhecida; condicional a ela) ou
// manter (mudou na nuvem depois da base: não apaga, volta com o texto da nuvem).
function decidirApagar(b, n, voo = []) {
  if (!n) return { acao: 'pronto' };

  return n.editada_em === b?.editada_em || voo.includes(n.editada_em)
    ? { acao: 'apagar', versao: n.editada_em }
    : { acao: 'manter' };
}

// Uma nota nova "<título> (conflito)" com o texto dado, id novo, logo abaixo da nota `id` do db d (sem folga até a seguinte,
// renumera a lista com a cópia logo depois). Devolve { db, copia }.
function copiaDeConflito(d, id, titulo, texto, agora = new Date().toISOString()) {
  const original = d.notas.find((x) => x.id === id),
    outras = d.notas.filter((x) => x.id !== id),
    depois = outras.find((x) => pelaOrdem(original, x) < 0);

  let idNovo;

  do idNovo = Math.random().toString(36).slice(2, 10);
  while (d.notas.some((x) => x.id === idNovo));

  const copia = {
    id: idNovo,
    titulo: (titulo + CONFLITO).trim(),
    texto,
    ordem: ordemEntre(original.ordem, depois?.ordem ?? null),
    criadaEm: agora,
    editadaEm: agora,
  };

  let notas = [...outras, original, copia];

  if (copia.ordem === null) {
    const lista = preparar({ notas: [...outras, original] }).notas,
      k = lista.findIndex((x) => x.id === id);

    lista.splice(k + 1, 0, copia);
    notas = lista.map((x, i) => ({ ...x, ordem: i + 1 }));
  }

  const novo = preparar({ notas });

  return { db: novo, copia: novo.notas.find((x) => x.id === idNovo) };
}

// db com o conflito do envio resolvido: a nota `id` passa a ser a da nuvem (linha n) e a versão daqui (a nota do db) vira a
// nota de conflito logo abaixo (copiaDeConflito). Devolve { db, copia }.
function resolverConflito(d, id, n, agora = new Date().toISOString()) {
  const local = d.notas.find((x) => x.id === id),
    comNuvem = preparar({
      notas: [...d.notas.filter((x) => x.id !== id), ...deLinhas([n]).notas],
    });

  return copiaDeConflito(comNuvem, id, local.titulo, local.texto, agora);
}

// A nuvem (linhas R) aplicada no db d com a base b, nota por nota: nota sem pendência aqui (a mesma da base, ou ausente nos
// dois) fica como a nuvem (mudada, nova ou apagada em outro aparelho); nota com pendência (mudada, nova ou apagada aqui) fica
// como está, para o envio decidir. Devolve { db, base, mudou } (mudou = o db mudou).
function aplicarNuvem(d, b, R) {
  const nuvem = linhas(deLinhas(R)),
    local = linhas(d),
    novaBase = { ...(b || {}) },
    fica = [];

  for (const id of new Set([...Object.keys(local), ...Object.keys(nuvem)])) {
    const pendente = JSON.stringify(local[id]) !== JSON.stringify(b?.[id]);

    if (pendente) {
      if (local[id]) fica.push(local[id]);
      continue;
    }

    if (nuvem[id]) {
      fica.push(nuvem[id]);
      novaBase[id] = nuvem[id];
    } else delete novaBase[id];
  }

  // a base que a nuvem e o aparelho não têm mais (apagada nos dois) sai
  for (const id of Object.keys(novaBase))
    if (!local[id] && !nuvem[id]) delete novaBase[id];

  const novo = deLinhas(fica);

  return {
    db: novo,
    base: novaBase,
    mudou: JSON.stringify(linhas(novo)) !== JSON.stringify(local),
  };
}

// Voo: as versões (editada_em) que este aparelho mandou e ainda não teve resposta, por nota. Se a resposta se perdeu, a nuvem
// tem uma delas, e ela é deste aparelho: não é conflito.
function lerVoo(u) {
  try {
    const v = JSON.parse(store.get(K_VOO(u.id)));

    return v && typeof v === 'object' && !Array.isArray(v) ? v : {};
  } catch {
    return {};
  }
}

function marcarVoo(u, id, versao) {
  const v = lerVoo(u);

  v[id] = [...(Array.isArray(v[id]) ? v[id] : []), versao].slice(-VOO_MAX);
  store.set(K_VOO(u.id), JSON.stringify(v));
}

function limparVoo(u, id) {
  const v = lerVoo(u);

  if (!(id in v)) return;
  delete v[id];
  store.set(K_VOO(u.id), JSON.stringify(v));
}

// O intervalo de 1 ms da versão: a nuvem guarda microssegundos e o aparelho, milissegundos (isoOk)
const comVersao = (q, versao) =>
  q
    .gte('editada_em', versao)
    .lt('editada_em', new Date(Date.parse(versao) + 1).toISOString());

// As notas `ids` como estão na nuvem agora: { id: linha limpa }
async function linhasDaNuvem(u, ids) {
  const R = [];

  for (let i = 0; i < ids.length; i += 100) {
    const { data, error } = await sb
      .from(TABELA)
      .select(COLUNAS)
      .eq('user_id', u.id)
      .in('id', ids.slice(i, i + 100));

    if (error) throw error;
    R.push(...data);
  }

  return linhas(deLinhas(R));
}

const guardarBase = (u, id, linha) => {
  base = { ...(base || {}) };

  if (linha) base[id] = linha;
  else delete base[id];
  store.set(K_BASE(u.id), JSON.stringify(base));
};

const guardarDb = (u) => store.set(K_LOCAL(u.id), JSON.stringify(db));

// Envia o que mudou desde a base, nota por nota, sem gravar por cima de versão não vista (ver acima). Depois de cada nota a base
// dela passa a ser como a nuvem ficou; o que mudou aqui durante o envio continua pendente e sobe na rodada seguinte (até 3
// seguidas; o resto no próximo gatilho). Conflito, nota mantida e nota aceita como apagada mudam o db: a tela é redesenhada
// (aoMudarDeFora) e os conflitos ficam em `conflitos` ({ original, copia, titulo }) para a tela avisar.
async function enviar(rodada = 0) {
  clearTimeout(tEnvio);

  if (enviando || !usuario || !db) return;

  const u = usuario,
    agora = linhas(db),
    conhecida = base,
    mud = diferenca(conhecida, agora);

  if (!mud) {
    erroSync = '';
    pintarSync();

    return;
  }

  enviando = true;
  envios++;
  let mudouDb = false;

  try {
    const nuvem = await linhasDaNuvem(u, [...mud.up.map((l) => l.id), ...mud.del]),
      voo = lerVoo(u);

    for (const l of mud.up) {
      if (usuario !== u) return;

      const b = conhecida?.[l.id],
        n = nuvem[l.id],
        d = decidirEnvio(l, b, n, voo[l.id]);

      if (d.acao === 'aceitarApagada') {
        // aqui só a posição mudou e a nota foi apagada em outro aparelho: sai daqui também
        if (JSON.stringify(linhas(db)[l.id]) === JSON.stringify(l)) {
          db = { notas: db.notas.filter((x) => x.id !== l.id) };
          mudouDb = true;
        }

        guardarBase(u, l.id, null);
        limparVoo(u, l.id);
      } else if (d.acao === 'inserir') {
        marcarVoo(u, l.id, l.editada_em);

        const { data, error } = await sb
          .from(TABELA)
          .insert({ user_id: u.id, ...l })
          .select('id');

        // já existe (outro aparelho, ou este sem resposta): a próxima rodada lê e decide
        if (error && error.code !== '23505') throw error;

        if (!error && data?.length) {
          guardarBase(u, l.id, l);
          limparVoo(u, l.id);
        }
      } else if (d.acao === 'atualizar') {
        if (d.versao !== null) marcarVoo(u, l.id, l.editada_em);
        let q = sb.from(TABELA).update(d.campos).eq('user_id', u.id).eq('id', l.id);

        if (d.versao !== null) q = comVersao(q, d.versao);
        const { data, error } = await q.select('id');

        if (error) throw error;

        if (!data?.length) continue; // a nuvem mudou (ou apagou) no meio: a próxima rodada decide

        const ficou = { ...n, ...d.campos };

        // o que este aparelho não mudou (a posição dada por outro aparelho) entra aqui, se não mudou durante o envio
        const nota = notaPorId(l.id);

        if (nota)
          for (const c of Object.keys(CAMPOS))
            if (!(c in d.campos) && nota[CAMPOS[c]] === l[c] && l[c] !== ficou[c]) {
              nota[CAMPOS[c]] = ficou[c];
              mudouDb = true;
            }

        guardarBase(u, l.id, ficou);
        limparVoo(u, l.id);
      } else if (notaPorId(l.id)) {
        // conflito: nada se perde (a nuvem fica na original, o daqui numa nota nova, que sobe na rodada seguinte)
        const r = resolverConflito(db, l.id, n);

        db = r.db;
        mudouDb = true;
        conflitos.push({ original: l.id, copia: r.copia.id, titulo: n.titulo });
        guardarBase(u, l.id, n);
        limparVoo(u, l.id);
      }
    }

    for (const id of mud.del) {
      if (usuario !== u) return;

      const n = nuvem[id],
        d = decidirApagar(conhecida?.[id], n, voo[id]);

      if (d.acao === 'pronto') {
        guardarBase(u, id, null);
        limparVoo(u, id);
      } else if (d.acao === 'apagar') {
        const { data, error } = await comVersao(
          sb.from(TABELA).delete().eq('user_id', u.id).eq('id', id),
          d.versao
        ).select('id');

        if (error) throw error;

        if (data?.length) {
          guardarBase(u, id, null);
          limparVoo(u, id);
        }
      } else if (!notaPorId(id)) {
        // mudou em outro aparelho depois que este a conheceu: não apaga, volta com o texto da nuvem
        db = preparar({ notas: [...db.notas, ...deLinhas([n]).notas] });
        mudouDb = true;
        mantidas.push({ id, titulo: n.titulo });
        guardarBase(u, id, n);
        limparVoo(u, id);
      }
    }

    erroSync = '';
  } catch (e) {
    erroSync = e.message || String(e);
  } finally {
    enviando = false;

    if (mudouDb && usuario === u) {
      db = preparar(db);
      guardarDb(u);
    }
  }

  if (usuario !== u) return;

  if (mudouDb) aoMudarDeFora?.();
  pintarSync();

  if (!erroSync && rodada < 3 && temPendente()) return enviar(rodada + 1); // mudou algo enquanto enviava, ou a nuvem mudou no meio
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

// Ao entrar (sessão válida da conta DONO): abre a cópia local na hora (mostrar), envia o pendente e só então traz a nuvem, nota
// por nota (aplicarNuvem): a nota com pendente que não subiu (sem internet) continua a daqui; as outras ficam como a nuvem.
// Sem a cópia e sem a nuvem (ou a tabela ainda não criada), abre vazio e envia depois. mostrar() é chamado de novo no fim e
// a cada mudança vinda de fora depois disso (aoMudarDeFora).
async function carregar(u, mostrar) {
  usuario = u;
  aoMudarDeFora = mostrar;
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
    const r = aplicarNuvem(db || preparar({}), local ? base : null, R);

    db = r.db;
    base = r.base;
    store.set(K_BASE(u.id), JSON.stringify(base));
    guardarDb(u);
  } catch (e) {
    if (usuario !== u) return;
    erroSync = e.message || String(e);

    if (!db) db = preparar({});
  }

  mostrar();
  pintarSync();
}

// Buscar ao voltar (aba parada horas ou dias, internet de volta, a cada minuto com a página à vista): envia o pendente e traz a
// nuvem para as notas sem pendência (aplicarNuvem), redesenhando a tela (aoMudarDeFora) se algo mudou. Envio que começou
// durante a busca deixa esta busca de lado (a resposta pode ser de antes dele); a próxima traz.
async function atualizar() {
  if (buscando || !usuario || !db) return;

  const u = usuario;

  buscando = true;

  try {
    if (temPendente()) await enviar();

    if (enviando || usuario !== u) return;

    const n = envios,
      R = await baixar();

    if (usuario !== u || enviando || envios !== n) return;
    const r = aplicarNuvem(db, base, R);

    base = r.base;
    store.set(K_BASE(u.id), JSON.stringify(base));

    if (r.mudou) {
      db = r.db;
      guardarDb(u);
      aoMudarDeFora?.();
    }
  } catch (e) {
    if (usuario === u) erroSync = e.message || String(e);
  } finally {
    buscando = false;
  }

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

// Voltar à aba, a internet voltar e, à vista, a cada minuto: envia e traz a nuvem; escondida, só envia o pendente
addEventListener('online', () => atualizar());
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') atualizar();
});
setInterval(() => {
  if (document.visibilityState === 'visible') atualizar();
  else if (temPendente()) enviar();
}, 60000);
