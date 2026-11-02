// Botão ± ao lado do Valor: inverter e gravar na hora (e só na memória na simulação) é testado no navegador em
// navegador-linhas.test.js; aqui, a regra documentada e que o sinal embutido no campo de Valor não volta.
const assert = require('./helpers/assert-tolerante');
const fs = require('node:fs');
const test = require('node:test');
const vm = require('node:vm');
const { regras: regrasCss } = require('./helpers/regras-css');
const { carregarTela } = require('./helpers/tela-sem-navegador');

const interacoes = fs.readFileSync('js/interactions.js', 'utf8');
const estilosPainel = fs.readFileSync('css/dashboard.css', 'utf8');
const regras = fs.readFileSync('docs/REGRAS.md', 'utf8');

test('regra documentada em REGRAS.md', () => {
  assert.match(
    regras,
    /botão \+\/− ao lado do Valor \(mesmo ícone do cadastro\) que inverte o sinal na hora/
  );
  assert.match(
    regras,
    /Indisponível para linhas sintéticas\/simuladas sem `id` real: nelas o botão aparece no mesmo lugar, só que desabilitado/
  );

  // O botão e o valor fixo (linha sem id real) dividem a mesma regra de estilo
  const comum = regrasCss(estilosPainel).filter(
    (r) =>
      r.seletores.includes('.valorLinha .togValor') &&
      r.seletores.includes('.valorLinha .valorFixo')
  );

  assert.equal(comum.length, 1);
  assert.ok(comum[0].declaracoes.length > 0);
});

// Edita o Valor de uma linha (clique, digita, Enter) com a função real e devolve o valor que ficou na linha
async function editarValor(valorDaLinha, digitado) {
  const tela = carregarTela({
    dados: {
      fin: [],
      fin_ciclo: [{ id: 1, inicio: '2026-09-15', fim: null }],
      fin_meta: [],
    },
  });

  await tela.bruto('carregarDados()');
  const linha = { id: 5, v: valorDaLinha, valor: valorDaLinha };
  const lista = tela.bruto('Estado.lancamentos');

  lista.length = 0;
  lista.push(linha);
  tela.bruto('Estado.simulando = true'); // só a conta do sinal interessa aqui
  tela.ctx.desenhar = () => {};

  tela.ctx.mostrarToast = () => {};

  const campo = {
    value: '',
    ouvintes: {},
    addEventListener: (tipo, fn) => (campo.ouvintes[tipo] = fn),
    focus() {},
    select() {},
  };

  const span = {
    classList: { contains: () => false, add() {} },
    dataset: { togValor: '5' },
    innerHTML: '',
    querySelector: () => campo,
  };

  let ouvinte;

  const inicio = interacoes.indexOf(
    "el('out').addEventListener('click', (e) => {\n  const span = e.target.closest('[data-tog-valor]');"
  );

  tela.ctx.document.getElementById('out').addEventListener = (tipo, fn) => {
    ouvinte = fn;
  };

  vm.runInContext(
    interacoes.slice(inicio, interacoes.indexOf('\n});\n', inicio) + 5),
    tela.ctx
  );
  ouvinte({ target: { closest: () => span }, stopImmediatePropagation() {} });
  campo.value = digitado;
  campo.ouvintes.keydown({ key: 'Enter', preventDefault() {} });
  await new Promise((ok) => setImmediate(ok));

  return { valor: linha.valor, html: span.innerHTML };
}

test('sinal embutido no campo de edição de Valor foi removido por não funcionar de verdade', async () => {
  // O clique no +/- de dentro da edição perdia o foco do input ANTES do próprio clique
  // terminar de registrar: blur disparava confirma() com o sinal antigo primeiro, então o
  // toggle nunca pegava de fato. O botão de sinal ao lado (fora do campo) resolve isso com
  // seu próprio PATCH; o campo de Valor volta a só editar a magnitude, mantendo o sinal.
  const negativa = await editarValor(-10, '5,00');
  const positiva = await editarValor(10, '5,00');
  const zerada = await editarValor(0, '5,00'); // sem valor ainda: assume saída (negativo)

  assert.equal(negativa.valor, -5);
  assert.equal(positiva.valor, 5);
  assert.equal(zerada.valor, -5);
  // O campo é só a caixa de dinheiro: nada de botão de sinal dentro dele
  assert.ok(!negativa.html.includes('<button'));
  assert.equal(negativa.html.split('<input').length - 1, 1);

  // E o estilo do campo embutido não existe mais
  const seletores = regrasCss(estilosPainel)
    .flatMap((r) => r.seletores)
    .filter((s) => s.includes('inpValorSinal'));

  assert.deepEqual(seletores, []);
  assert.match(
    regras,
    /uma versão antiga embutida nesse campo não funcionava de verdade/
  );
});
