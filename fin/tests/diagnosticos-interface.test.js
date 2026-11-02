// Contrato de diagnóstico: métricas resumidas no Console e problemas visíveis em modal. O comportamento na tela (botão aceso,
// inconsistências e avisos separados, carga lenta, falha de carga) está em telas-por-funcao.test.js; aqui, o estilo do
// modal (lido como regras de CSS) e a política de caixas nativas (só as 4 confirmações das REGRAS).
const assert = require('./helpers/assert-tolerante');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const { Linter } = require('eslint');
const { declaracoes } = require('./helpers/regras-css');
const { elementoPorId } = require('./helpers/html');

const base = fs.readFileSync('css/base.css', 'utf8');
const componentes = fs.readFileSync('../base/componentes.css', 'utf8');
const html = fs.readFileSync('index.html', 'utf8');
const estilos = fs.readFileSync('css/forms.css', 'utf8');
const formulario = fs.readFileSync('js/form.js', 'utf8');

test('modal de diagnóstico: larguras e lista que quebra palavras longas (o comportamento na tela está em telas-por-funcao.test.js)', () => {
  const larguraLarga = '@media (min-width: 700px)';

  assert.ok(declaracoes(estilos, 'dialog#modalDiagnostico').length > 0);

  // nas telas largas, o diagnóstico e o resumo do Consolidar tudo ganham a mesma largura
  for (const modal of ['dialog#modalDiagnostico', 'dialog#modalConsolidarTudo'])
    assert.ok(
      declaracoes(estilos, modal, larguraLarga).includes(
        'width: min(44rem, calc(100vw - 4rem))'
      ),
      modal
    );

  // as listas são a lista de texto da base (que quebra palavras longas): inconsistências em vermelho, o resto em cinza
  assert.ok(
    declaracoes(componentes, '.lista.texto li').includes('overflow-wrap: anywhere')
  );
  assert.deepEqual(
    ['listaInconsistencias', 'listaAvisos', 'listaConsolidarTudo'].map(
      (id) => elementoPorId(html, id, { obrigatorio: true }).attrs.class
    ),
    ['lista texto erro', 'lista texto muted', 'lista texto muted']
  );
  // o botão acende quando há inconsistência
  assert.ok(declaracoes(base, '#btDiagnostico.temInconsistencia::after').length > 0);
});

// A análise do ESLint (no-alert) lê o código como árvore, sem texto solto: acha cada alert/confirm/prompt de verdade.
function caixasNativas() {
  const linter = new Linter();

  return fs
    .readdirSync('js')
    .filter((arquivo) => arquivo.endsWith('.js'))
    .flatMap((arquivo) =>
      linter
        .verify(
          fs.readFileSync(path.join('js', arquivo), 'utf8'),
          [
            {
              files: ['**/*.js'],
              languageOptions: { sourceType: 'script', ecmaVersion: 'latest' },
              rules: { 'no-alert': 'error' },
            },
          ],
          arquivo
        )
        .map((m) => `${arquivo}: ${m.message}`)
    );
}

test('só 4 caixas nativas (confirm) existem e nenhum alert: exclusão, pago fora do ciclo, recorrência duplicada e meta', () => {
  // As quatro únicas caixas nativas permitidas (ver REGRAS.md): excluir lançamento, marcar
  // como pago um Débito com data fora do ciclo atual (ver pago-ajusta-data.test.js),
  // corrigir a data de uma recorrência duplicada no ciclo (ver recorrencia-duplicada.test.js)
  // e excluir uma meta (ver metas.test.js).
  const caixas = caixasNativas();

  assert.ok(
    caixas.every((c) => c.endsWith('Unexpected confirm.')),
    caixas.join('\n')
  );
  assert.deepEqual(
    caixas.map((c) => c.split(':')[0]),
    ['form.js', 'interactions.js', 'interactions.js', 'interactions.js']
  );
});

// Excluir lançamento: o botão pergunta antes (confirm) e, recusado, não apaga nada.
function excluir({ resposta, simulando = false, falhar = false }) {
  const iniFuncao = formulario.indexOf("el('seldel').onclick = async () => {");
  const fimFuncao = formulario.indexOf('\n};\n', iniFuncao) + 4;
  const perguntas = [];
  const excluidos = [];
  const toasts = [];
  const botao = { disabled: false, textContent: 'Excluir' };

  const ctx = {
    Estado: {
      simulando,
      selecionados: new Map([['1', true]]),
      lancamentos: [{ id: 1, nome: 'Mercado', v: -320.5 }],
    },
    el: () => botao,
    brl: (v) => `R$ ${v}`,
    confirm: (pergunta) => {
      perguntas.push(pergunta);

      return resposta;
    },
    excluirLancamento: async (id) => {
      if (falhar) throw Error('RLS');
      excluidos.push(id);
    },
    desenhar() {},
    mostrarToast: (titulo, texto) => toasts.push([titulo, texto]),
  };

  const iniSimulada = formulario.indexOf('const exclusaoEhSimulada');
  const simulada = formulario.slice(iniSimulada, formulario.indexOf('\n', iniSimulada));

  vm.runInNewContext(`${simulada}\n${formulario.slice(iniFuncao, fimFuncao)}`, ctx);

  return { botao, ctx, perguntas, excluidos, toasts };
}

test('Excluir pergunta antes: recusado não apaga; aceito apaga só o que está no banco', async () => {
  const recusado = excluir({ resposta: false });

  await recusado.botao.onclick();
  assert.equal(recusado.perguntas.length, 1);
  assert.match(
    recusado.perguntas[0],
    /Excluir "Mercado" \(R\$ -320.5\)\?\n\nNão dá pra desfazer\./
  );
  assert.deepEqual(recusado.excluidos, []);
  assert.equal(recusado.ctx.Estado.lancamentos.length, 1);

  const aceito = excluir({ resposta: true });

  await aceito.botao.onclick();
  assert.deepEqual(aceito.excluidos, [1]);
  assert.equal(aceito.ctx.Estado.lancamentos.length, 0);

  // na simulação, a linha só some da memória e a pergunta diz isso
  const simulado = excluir({ resposta: true, simulando: true });

  await simulado.botao.onclick();
  assert.match(simulado.perguntas[0], /Ocultar "Mercado" só nesta simulação\?/);
  assert.deepEqual(simulado.excluidos, []);
  assert.equal(simulado.ctx.Estado.lancamentos.length, 0);
});

test('erro operacional de exclusão vira toast, não caixa nativa', async () => {
  const falhou = excluir({ resposta: true, falhar: true });

  await falhou.botao.onclick();
  assert.deepEqual(falhou.toasts, [['Falhou ao excluir', 'RLS']]);
  assert.equal(falhou.botao.disabled, false); // o botão volta a funcionar
});
