// Ajuda dos testes de banco sem navegador: um Supabase falso (só o que os banco.js usam: select, insert, upsert, update e
// delete com eq, in, gte, lt, order e range) e o banco.js de um app rodando inteiro em node:vm com os scripts que ele precisa
// antes (perfil, config, util, núcleo), com o estado dele (db, base, usuario…) exposto por getters. Assim o teste mexe na
// função publicada, sem copiar código e sem abrir o app.
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const clonar = (x) => JSON.parse(JSON.stringify(x));

const FALHA = { message: 'Failed to fetch' },
  MAX_LINHAS = 1000;

// nuvem: { tabelas: { nome: [linhas com user_id] }, offline, semResposta, semRespostaApagar, recusar, semColuna,
// pedidos: [[tipo, tabela, corpo, filtros]] }
export function supabaseFalso(nuvem) {
  nuvem.pedidos ??= [];

  const valor = (v) =>
    typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(v) ? Date.parse(v) : v;

  const from = (tabela) => {
    const consulta = (tipo, corpo, opcoes) => {
      const filtros = [];
      let faixa = null;

      const passa = (l) =>
        filtros.every(([op, c, v]) =>
          op === 'eq'
            ? valor(l[c]) === valor(v)
            : op === 'in'
              ? v.map(valor).includes(valor(l[c]))
              : op === 'gte'
                ? valor(l[c]) >= valor(v)
                : valor(l[c]) < valor(v)
        );

      const rodar = () => {
        nuvem.pedidos.push([tipo, tabela, clonar(corpo ?? null), clonar(filtros)]);

        if (nuvem.offline) return { data: null, error: FALHA };
        const T = (nuvem.tabelas[tabela] ??= []);

        // o PostgREST devolve no máximo 1000 linhas por pedido (max-rows), com range ou sem
        if (tipo === 'select') {
          const R = T.filter(passa),
            [de, ate] = faixa ?? [0, Infinity];

          return {
            data: clonar(R.slice(de, Math.min(ate, de + MAX_LINHAS - 1) + 1)),
            error: null,
          };
        }

        // semColuna: { tabela: coluna } — a coluna ainda não existe (migration não aplicada): gravar com ela é recusado
        const falta = nuvem.semColuna?.[tabela];

        if (
          falta &&
          (tipo === 'upsert' || tipo === 'insert' || tipo === 'update') &&
          [].concat(corpo).some((l) => falta in l)
        )
          return {
            data: null,
            error: {
              code: 'PGRST204',
              message: `Could not find the '${falta}' column of '${tabela}' in the schema cache`,
            },
          };

        // recusar: { tabela: mensagem } — o servidor recusa a gravação nessa tabela (as outras gravam)
        if (tipo !== 'select' && nuvem.recusar?.[tabela])
          return { data: null, error: { message: nuvem.recusar[tabela] } };

        if (tipo === 'upsert' || tipo === 'insert') {
          const chave = (opcoes?.onConflict || 'user_id,id').split(',');

          for (const l of [].concat(corpo)) {
            const i = T.findIndex((x) => chave.every((k) => valor(x[k]) === valor(l[k])));

            if (i >= 0 && tipo === 'insert')
              return { data: null, error: { code: '23505', message: 'duplicate key' } };

            if (i >= 0) T[i] = clonar(l);
            else T.push(clonar(l));
          }

          // semResposta: a gravação chega, mas a resposta se perde (metrô)
          return { data: null, error: nuvem.semResposta ? FALHA : null };
        }

        const feitas = T.filter(passa);

        if (tipo === 'update') for (const l of feitas) Object.assign(l, clonar(corpo));
        else nuvem.tabelas[tabela] = T.filter((l) => !passa(l));

        // semRespostaApagar: o apagar chega, mas a resposta se perde (metrô)
        return tipo === 'delete' && nuvem.semRespostaApagar
          ? { data: null, error: FALHA }
          : { data: feitas.map((l) => ({ ...l })), error: null };
      };

      const q = {
        eq: (c, v) => (filtros.push(['eq', c, v]), q),
        in: (c, v) => (filtros.push(['in', c, [...v]]), q),
        gte: (c, v) => (filtros.push(['gte', c, v]), q),
        lt: (c, v) => (filtros.push(['lt', c, v]), q),
        order: () => q,
        range: (de, ate) => ((faixa = [de, ate]), q),
        select: () => q,
        then: (ok, erro) => Promise.resolve().then(rodar).then(ok, erro),
      };

      return q;
    };

    return {
      select: () => consulta('select'),
      insert: (l) => consulta('insert', l),
      upsert: (L, opcoes) => consulta('upsert', L, opcoes),
      update: (campos) => consulta('update', campos),
      delete: () => consulta('delete'),
    };
  };

  return { from, auth: {} };
}

// Os scripts (caminhos), na ordem da página, rodando juntos num contexto com página, localStorage e relógio falsos; `estado`:
// os `let` do arquivo que o teste lê e troca (db, base, usuario…), por getters e setters; `nomes`: as funções que o teste chama.
export function rodarBanco(arquivos, { nuvem, nomes = [], estado = [], extra = {} }) {
  const guardado = new Map();

  const contexto = {
    supabase: { createClient: () => supabaseFalso(nuvem) },
    localStorage: {
      getItem: (k) => guardado.get(k) ?? null,
      setItem: (k, v) => guardado.set(k, String(v)),
      removeItem: (k) => guardado.delete(k),
    },
    document: {
      // a linha de sincronização e afins: um elemento que aceita o que o banco pinta
      getElementById: () => ({
        hidden: false,
        textContent: '',
        value: '',
        dataset: {},
        style: {},
        classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
        addEventListener() {},
        appendChild() {},
        querySelector: () => null,
        querySelectorAll: () => [],
        setAttribute() {},
      }),
      querySelector: () => null,
      querySelectorAll: () => [],
      addEventListener: () => {},
      documentElement: {},
      visibilityState: 'visible',
      body: { classList: { add() {}, remove() {}, toggle() {} } },
    },
    MutationObserver: class {
      observe() {}
    },
    navigator: { onLine: true },
    location: { search: '', pathname: '/', hash: '' },
    history: { replaceState() {}, pushState() {} },
    addEventListener: () => {},
    setInterval: () => 0,
    setTimeout: () => 0,
    clearTimeout: () => {},
    AbortController,
    console,
    ...extra,
  };

  const saida = {};

  const src =
    arquivos
      .map((a) => readFileSync(a, 'utf8').replace(/^'use strict';/, ''))
      .join('\n;\n') +
    `\n;Object.assign(__saida, { ${nomes.join(', ')} });\n__saida.E = {${estado
      .map((n) => `get ${n}() { return ${n}; }, set ${n}(v) { ${n} = v; }`)
      .join(', ')}};`;

  vm.runInNewContext(src, { ...contexto, __saida: saida });
  saida.guardado = guardado;

  return saida;
}
