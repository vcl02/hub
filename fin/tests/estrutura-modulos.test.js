// Contrato de arquitetura: scripts clássicos dependem da ordem declarada no HTML, e cada arquivo guarda a sua parte.
const assert = require('./helpers/assert-tolerante');
const fs = require('node:fs');
const test = require('node:test');
const { carregarTela } = require('./helpers/tela-sem-navegador');
const { trazer } = require('./helpers/trazer-funcao');
const { etiquetas } = require('./helpers/html');

const html = fs.readFileSync('index.html', 'utf8');

test('carrega estado, Supabase e interface na ordem necessária', () => {
  // Os <script src> da página, na ordem em que ela os declara (a ordem em que os scripts clássicos rodam)
  const scripts = etiquetas(html)
    .filter((e) => e.tag === 'script' && e.attrs.src)
    .map((e) => e.attrs.src);

  const ordem = [
    'app-state',
    'domain',
    'shared',
    'supabase-api',
    'finance',
    'data-ui',
    'tables',
    'cycle-views',
    'interactions',
    'charts',
    'form',
    'bootstrap',
  ].map((nome) => scripts.indexOf(`./js/${nome}.js`));

  assert.ok(ordem.every((posicao) => posicao >= 0));
  assert.deepEqual(
    ordem,
    ordem.toSorted((a, b) => a - b)
  );
  assert.ok(!scripts.includes('./js/export.js'));
});

// Cada camada declara o que é dela: os scripts reais rodam juntos (carregarTela) e o teste pergunta o tipo de cada nome.
test('separa estado e acesso ao banco da camada de interface', async () => {
  const dados = { fin: [], fin_ciclo: [], fin_meta: [] };
  const t = carregarTela({ dados });
  const tipo = (nome) => t.bruto(`typeof ${nome}`);

  // estado e domínio
  assert.equal(tipo('Estado'), 'object');
  assert.equal(t.rodar('TABELA_FIN'), 'fin');
  assert.equal(tipo('validarLancamentosCarregados'), 'function');
  // compartilhado
  assert.equal(tipo('dataDaOcorrencia'), 'function');
  assert.equal(tipo('el'), 'function');
  // acesso ao banco: o cliente e a carga; a tabela antiga (`lancamentos`) não existe mais, então a carga
  // só funciona pedindo fin, fin_ciclo e fin_meta (qualquer outra tabela responderia 404 no banco falso)
  assert.equal(tipo('sb'), 'object');
  assert.equal(tipo('carregarDados'), 'function');
  await t.bruto('carregarDados()');
  // regras financeiras e telas
  assert.equal(tipo('saldoDoCiclo'), 'function');
  assert.equal(tipo('creditosExibidosNoCiclo'), 'function');
  assert.equal(tipo('load'), 'function');
  assert.equal(tipo('renderTabela'), 'function');
  assert.equal(tipo('vCiclo'), 'function');
  assert.equal(tipo('desenhaGraficoPizza'), 'function');

  // interação, cadastro e partida só rodam com a página inteira: aqui se confere que cada um declara a sua função
  for (const [arquivo, nome] of [
    ['js/interactions.js', 'desenhar'],
    ['js/form.js', 'submeteNovoLancamento'],
    ['js/bootstrap.js', 'boot'],
  ]) {
    trazer(t.ctx, arquivo, [nome]);
    assert.equal(tipo(nome), 'function', `${arquivo} declara ${nome}`);
  }
});
