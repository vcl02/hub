// O HTML que os scripts montam com `var(--x)` escrito à mão (SVG dos gráficos do Corpo e do Treino, o chip ligado do teto e
// os filtros por clique do Fin) é conferido pela SAÍDA das funções rodando, não pelo texto do código: todo `var(--x)` gerado
// tem de estar na base (`base/tokens.css`, `base/componentes.css`) ou no CSS do próprio módulo. Um teste de guarda confere que
// nenhum outro script passou a escrever `var(--` sem entrar aqui.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { carregar } from './funcoes.mjs';
import { usosDeVar, definidasEm } from './leitores.mjs';

const RAIZ = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const ler = (arquivo) => readFileSync(path.join(RAIZ, arquivo), 'utf8');
const exigir = createRequire(import.meta.url);

// Tokens aceitos por um módulo: a base inteira mais o CSS do próprio módulo
function aceitasDe(app) {
  const css = app
    ? readdirSync(path.join(RAIZ, app, 'css')).map((n) => `${app}/css/${n}`)
    : ['hub.css'];

  return new Set(
    ['base/tokens.css', 'base/componentes.css', ...css].flatMap((f) =>
      definidasEm(ler(f))
    )
  );
}

// Elemento falso que aceita tudo o que o desenho do gráfico faz com ele (querySelector, atributos, eventos)
function elementoFalso(extra = {}) {
  const alvo = {
    hidden: false,
    innerHTML: '',
    previousElementSibling: null,
    ...extra,
  };

  return new Proxy(alvo, {
    get: (o, nome) =>
      nome in o
        ? o[nome]
        : nome === 'getBoundingClientRect'
          ? () => ({ left: 0, width: 320 })
          : () => elementoFalso(),
    set: (o, nome, valor) => {
      o[nome] = valor;

      return true;
    },
  });
}

function confere(html, app, onde) {
  const usos = usosDeVar(html);
  const aceitas = aceitasDe(app);

  assert.ok(
    usos.length > 0,
    `${onde}: nenhum var(--x) na saída (o teste deixou de provar algo)`
  );
  assert.deepEqual(
    [...new Set(usos)].filter((v) => !aceitas.has(v)),
    [],
    `${onde}: var(--x) que não está na base nem no ${app}`
  );
}

const PONTOS = [
  { data: '2026-10-01', valor: 80 },
  { data: '2026-10-08', valor: 79.5 },
  { data: '2026-10-15', valor: 79 },
];

const NOMES_DO_GRAFICO = ['pad', 'esc', 'iso', 'deIso', 'fmt', 'dataCurta', 'grafico'];

for (const app of ['corpo', 'tr']) {
  test(`${app}: o gráfico de linha desenhado só usa tokens da base ou do ${app}`, () => {
    const f = carregar(path.join(RAIZ, app, 'js', 'util.js'), NOMES_DO_GRAFICO, {
      Math,
      Date,
      Number,
      String,
      Array,
      Set,
      Object,
      document: {},
      window: {},
    });

    const caixa = elementoFalso();

    f.grafico(caixa, PONTOS, 'kg', 'Peso');
    assert.ok(caixa.innerHTML.startsWith('<svg'), 'o gráfico não foi desenhado');
    confere(caixa.innerHTML, app, `${app}/js/util.js grafico`);
  });
}

// ---------- Fin: o chip do teto ligado e os filtros por clique ----------

const { carregarTela } = exigir('../fin/tests/helpers/tela-sem-navegador.js');

const lancamento = (id, nome, valor, extra = {}) => ({
  id: String(id),
  nome,
  data: '2026-10-17',
  valor,
  categ: 'Compras',
  cred: false,
  pago: true,
  fatura: null,
  freq: null,
  ...extra,
});

test('fin: o chip do teto ligado (cycle-views.js) e cada filtro por clique (tables.js) só usam tokens da base ou do Fin', async () => {
  const tela = carregarTela({
    dados: {
      fin_ciclo: [
        { id: 1, inicio: '2026-09-15', fim: '2026-10-14' },
        { id: 2, inicio: '2026-10-15', fim: null },
      ],
      fin: [
        lancamento(1, 'Salário', 9000, { categ: 'Salário' }),
        lancamento(2, 'Café', -50, { categ: 'Besteira' }),
      ],
      fin_meta: [],
    },
  });

  tela.bruto('Estado.filtroTeto = "besteira"');
  const { html } = await tela.desenharCiclo(1);

  assert.ok(
    html.includes('data-filtro-teto="besteira"'),
    'o chip do teto não foi desenhado'
  );
  assert.ok(
    html.includes('class="chip compacto ativo"'),
    'o chip do teto não está ligado'
  );
  confere(html, 'fin', 'fin/js/cycle-views.js chip do teto ligado');

  // Cada estado de cada filtro por clique, ligado (com a cor do estado) ou não
  const estados = tela.rodar('ESTADOS_FILTRO_CLIQUE');
  const chips = [];

  for (const [chave, lista] of Object.entries(estados))
    for (const [valor] of lista)
      chips.push(
        tela.rodar(
          `botaoFiltroEstado('t', ${JSON.stringify(chave)}, ${JSON.stringify(valor)})`
        )
      );

  assert.ok(chips.length >= 8, `filtros por clique lidos: ${chips.length}`);
  confere(chips.join('\n'), 'fin', 'fin/js/tables.js filtros por clique');
});

// ---------- Guarda ----------

test('guarda: só estes scripts escrevem var(--x) à mão; um novo precisa entrar neste arquivo', () => {
  const comVar = ['hub.js']
    .concat(
      ['agua', 'corpo', 'al', 'tr', 'fin'].flatMap((app) =>
        readdirSync(path.join(RAIZ, app, 'js')).map((n) => `${app}/js/${n}`)
      )
    )
    .filter((f) => usosDeVar(ler(f)).length > 0);

  assert.deepEqual(comVar, [
    'corpo/js/util.js',
    'tr/js/util.js',
    'fin/js/cycle-views.js',
    'fin/js/tables.js',
  ]);
});
