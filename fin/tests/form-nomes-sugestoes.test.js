// Contrato de sugestões do Nome: lista distinta, categoria recente e texto livre no formulário.
const assert = require('./helpers/assert-tolerante');
const fs = require('node:fs');
const test = require('node:test');
const vm = require('node:vm');
const { elementoPorId } = require('./helpers/html');

const html = fs.readFileSync('index.html', 'utf8');
const fonte = fs.readFileSync('js/form.js', 'utf8');
const inicio = fonte.indexOf('function sugestoesDeNome(');
const fim = fonte.indexOf('\nfunction popularNomesNoForm()', inicio);

if (inicio < 0 || fim < 0) throw Error('Não encontrou a regra de sugestões de nome.');

const contexto = {
  semAcento: (valor) =>
    String(valor ?? '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase(),
  valorValido: (valor) => typeof valor === 'string' && valor.trim().length > 0,
  dataISO: (valor) => (valor ? String(valor).slice(0, 10) : ''),
};

vm.createContext(contexto);
vm.runInContext(
  `${fonte.slice(inicio, fim)}; globalThis.sugestoesDeNome = sugestoesDeNome;`,
  contexto
);

test('o Nome é um campo de texto livre, obrigatório, com a lista de sugestões ao lado', () => {
  const campo = elementoPorId(html, 'fNome');

  assert.equal(campo.tag, 'input');
  assert.equal(campo.attrs.type, 'text'); // livre: não é um <select> nem uma lista fechada
  assert.equal(campo.attrs.required, ''); // atributo sem valor
  assert.equal(campo.attrs['aria-controls'], 'nomesExistentes');

  const lista = elementoPorId(html, 'nomesExistentes');

  assert.equal(lista.tag, 'div');
  assert.equal(lista.attrs.role, 'listbox');
  assert.equal(lista.attrs.class, 'lista suspensa'); // a lista suspensa da base, sem peça própria do Fin
});

// A lista de sugestões de verdade (renderizarSugestoesDeNome, de js/form.js) com a tela falsa: digitar filtra, tocar aplica.
function montarLista(lancamentos) {
  const inicioLista = fonte.indexOf('let sugestoesDeNomeAtuais');
  const fimLista = fonte.indexOf('\nfunction popularNomesNoForm()', inicioLista);
  const chamadas = [];

  const campos = {
    fNome: {
      value: '',
      attrs: {},
      setAttribute(nome, valor) {
        this.attrs[nome] = valor;
      },
      focus() {
        chamadas.push('foco');
      },
    },
    fCateg: { value: '' },
    nomesExistentes: {
      hidden: true,
      itens: [],
      replaceChildren(...itens) {
        this.itens = itens;
      },
    },
  };

  const elementoFalso = (tag) => ({
    tag,
    textContent: '',
    attrs: {},
    filhos: [],
    setAttribute(nome, valor) {
      this.attrs[nome] = valor;
    },
    append(...filhos) {
      this.filhos = filhos;
    },
  });

  const ctx = {
    ...contexto,
    el: (id) => campos[id],
    document: { createElement: elementoFalso },
    atualizarFaturasDoFormulario: () => chamadas.push('faturas'),
  };

  vm.createContext(ctx);
  vm.runInContext(
    `${fonte.slice(inicioLista, fimLista)}\nsugestoesDeNomeAtuais = sugestoesDeNome(${JSON.stringify(lancamentos)});`,
    ctx
  );

  return {
    campos,
    chamadas,
    digitar: (termo) => ctx.renderizarSugestoesDeNome(termo),
    nomes: () => campos.nomesExistentes.itens.map((o) => o.filhos[0].textContent),
  };
}

test('nome aceita texto livre e oferece combo próprio filtrado, sem acento nem caixa', () => {
  const lista = montarLista([
    { nome: 'Mercado Livre', categ: 'Compras', data: '2026-02-01' },
    { nome: 'Mercadão', categ: 'Mercado', data: '2026-03-01' },
    { nome: 'Aluguel', categ: 'Casa', data: '2026-01-01' },
  ]);

  lista.digitar('');
  assert.deepEqual(lista.nomes(), []); // sem digitar, a lista fica escondida
  assert.equal(lista.campos.nomesExistentes.hidden, true);

  lista.digitar('MERCA');
  assert.deepEqual(lista.nomes(), ['Mercadão', 'Mercado Livre']);
  assert.equal(lista.campos.nomesExistentes.hidden, false);
  assert.equal(lista.campos.fNome.attrs['aria-expanded'], 'true');

  lista.digitar('LIVRE'); // acha também no meio do nome
  assert.deepEqual(lista.nomes(), ['Mercado Livre']);

  lista.digitar('xyz'); // nome novo: nada a sugerir, o campo continua livre
  assert.deepEqual(lista.nomes(), []);
  assert.equal(lista.campos.fNome.attrs['aria-expanded'], 'false');
});

test('escolher uma sugestão preenche nome e categoria, refaz as faturas e fecha a lista', () => {
  const lista = montarLista([
    { nome: 'Mercado Livre', categ: 'Compras', data: '2026-02-01' },
  ]);

  lista.digitar('merc');
  const [opcao] = lista.campos.nomesExistentes.itens;

  assert.equal(opcao.filhos[1].textContent, 'Compras'); // a categoria aparece ao lado do nome
  opcao.onclick();
  assert.equal(lista.campos.fNome.value, 'Mercado Livre');
  assert.equal(lista.campos.fCateg.value, 'Compras');
  assert.deepEqual(lista.chamadas, ['faturas', 'foco']);
  assert.equal(lista.campos.nomesExistentes.hidden, true);
  assert.equal(lista.campos.fNome.attrs['aria-expanded'], 'false');
});

test('lista nomes distintos e conserva a categoria da ocorrência mais recente', () => {
  const sugestoes = contexto.sugestoesDeNome([
    { nome: 'Mercado', categ: 'Casa', data: '2026-01-10' },
    { nome: 'mercádo ', categ: 'Alimentação', data: '2026-02-10' },
    { nome: 'Aluguel', categ: 'Casa', data: '2026-01-01' },
    { nome: '', categ: 'Ignorar', data: '2026-03-01' },
  ]);

  assert.deepEqual(
    Array.from(sugestoes, (item) => ({ ...item })),
    [
      { nome: 'Aluguel', categ: 'Casa', data: '2026-01-01' },
      { nome: 'mercádo', categ: 'Alimentação', data: '2026-02-10' },
    ]
  );
});
