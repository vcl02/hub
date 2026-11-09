// Ajuda dos testes de função do Treino (sem navegador): tira dos js/ publicados as funções pedidas (tests/funcoes.mjs da raiz) e
// monta um contexto com o relógio fixo e o estado (db, T, medidas) que o app guarda em variáveis de script. O estado é um objeto
// que o teste muda no lugar (Object.assign), porque as funções o leem pelo nome.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { carregar, carregarArquivos } from '../../../tests/funcoes.mjs';

const TR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

export const arquivo = (nome) => path.join(TR, nome);

// Date com "agora" fixo (new Date() e Date.now()); com argumentos, é o Date de sempre
export function relogioFalso(agora) {
  const ms = new Date(agora).getTime();

  return class extends Date {
    constructor(...a) {
      if (a.length) super(...a);
      else super(ms);
    }

    static now() {
      return ms;
    }
  };
}

export const dbVazio = () => ({ exercicios: [], registros: [], treinos: [] });
export const sessaoVazia = (dia) => ({
  dia,
  series: {},
  feitas: {},
  ajuste: {},
  aquecimento: {},
  fim: 0,
});

// Resultados criados dentro do contexto isolado (objetos, listas, Set, Map) têm outro Object/Array: o deepStrictEqual os acharia
// diferentes dos literais do teste. `adotar` refaz esses valores no realm do teste, sem mudar o conteúdo.
function adotar(x) {
  const tipo = Object.prototype.toString.call(x);

  if (Array.isArray(x)) return Array.from(x, adotar);

  if (tipo === '[object Set]') return new Set(Array.from(x, adotar));

  if (tipo === '[object Map]') return new Map(Array.from(x, ([k, v]) => [k, adotar(v)]));

  if (tipo === '[object Object]')
    return Object.fromEntries(Object.entries(x).map(([k, v]) => [k, adotar(v)]));

  return x;
}

const perfil = carregarArquivos(
  [arquivo('../corpo/perfil.js')],
  ['ROTINA', 'pesoNoDia', 'kcalTreino', 'kcalEsteira', 'tmb']
);

// Todas as funções do Treino que os testes usam, na ordem em que os arquivos dependem uns dos outros. `extras` entra no contexto
// (pilha, location, fetch, toast...). Devolve as funções e o estado (db, T, medidas).
export function carregarTr(agora = '2026-10-21T19:00:00', extras = {}) {
  const estado = {
    db: dbVazio(),
    T: sessaoVazia(agora.slice(0, 10)),
    medidas: [],
    diaVisto: null,
  };

  const ctx = {
    Date: relogioFalso(agora),
    URL,
    URLSearchParams,
    ...perfil,
    ...estado,
    gravar() {},
    pintarTempo() {},
    ...extras,
  };

  const js = (nome) => arquivo(`js/${nome}.js`);

  const de = (nome, nomes) => {
    const saida = carregar(js(nome), nomes, ctx);

    for (const [k, v] of Object.entries(saida))
      ctx[k] = typeof v === 'function' ? (...a) => adotar(v(...a)) : adotar(v);
  };

  de('util', [
    'pad',
    'iso',
    'deIso',
    'hoje',
    'num',
    'fmt',
    'virgula',
    'intEntre',
    'novoId',
    'esc',
    'dataOk',
    'dataCurta',
    'quando',
    'diasDesde',
    'hhmm',
    'minutos',
    'comHora',
    'duracao',
  ]);
  de('config', [
    'UNIDADES',
    'REGIOES',
    'MODOS',
    'MODO_PADRAO',
    'PADRAO',
    'PLANOS',
    'LB',
    'GUIA',
    'DONO',
    'SUPABASE_KEY',
    'EMAIL_POR_USUARIO',
    'passoPadrao',
    'semPeso',
    'emailDoLogin',
    'DIAS_FIXOS',
    'DIAS_EXTRA',
  ]);
  de('piramide', [
    'unidadeTxt',
    'pesoTxt',
    'emKg',
    'arred',
    'outraUnidade',
    'fatorUnidade',
    'naOutra',
    'daOutra',
    'umAUm',
    'converterHistorico',
    'alvoReps',
    'alvoKg',
    'plano',
    'topo',
    'medidaSemPeso',
    'serieTxt',
    'registroTxt',
    'repsTxt',
    'kgsTxt',
    'completo',
    'falhas',
    'maisMeses',
    'etapaDoPlano',
    'aplicarPlanos',
  ]);
  de('cardio', ['CARDIO', 'CARDIO_PADRAO', 'kcalCardio', 'cardioTxt', 'ajustePadrao']);
  de('pontos', [
    'PONTOS',
    'PTS_NIVEL',
    'semanaDe',
    'somaDias',
    'mapas',
    'diasTreinados',
    'ordemCronologica',
    'recordesAte',
    'estatisticas',
    'CONQUISTAS',
    'ganhosDoDia',
    'kcal',
    'resumoDia',
  ]);
  de('inicio', ['ultimo', 'registroHoje', 'registroDe']);
  de('treino', [
    'INATIVO',
    'ultimoTreino',
    'emAndamento',
    'treinoHoje',
    'travadoHoje',
    'marcarAtividade',
    'diaVizinho',
  ]);
  de('series', [
    'relogio',
    'seriesFeitas',
    'temAquecimento',
    'seriesDeTrabalho',
    'descansoAquecimento',
  ]);
  de('banco', [
    'TABELAS',
    'ORDEM',
    'linhas',
    'deLinhas',
    'diferenca',
    'repsDe',
    'variacaoAtiva',
    'preparar',
    'bancoNovo',
  ]);
  de('login', ['juntar']);

  return { ...ctx, ...estado, estado };
}

// Reinicia o estado do contexto no lugar (as funções carregadas guardam a referência)
export function usar(f, { db, T, medidas } = {}) {
  Object.assign(f.db, dbVazio(), db);
  f.T.dia = f.hoje();
  Object.assign(f.T, sessaoVazia(f.hoje()), T);
  f.medidas.length = 0;
  f.medidas.push(...(medidas || []));
}

// Objetos criados dentro do contexto isolado têm outro Object/Array: o deepStrictEqual os acha diferentes dos literais do
// teste. `puro` os devolve como dados simples (JSON), só para comparar.
export const puro = (x) => JSON.parse(JSON.stringify(x ?? null));
