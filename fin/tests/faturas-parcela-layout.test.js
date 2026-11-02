// Fatura por parcela: medido na tela em navegador-celular.test.js (1 fatura e "+N" no campo, as outras no modal, "—"
// desativado no débito) e a série gravada em navegador-linhas.test.js; aqui, o que a tela não monta fácil (parcela 2..N sem
// fatura abre o modal dela), o scroll do formulário e a regra documentada.
const assert = require('./helpers/assert-tolerante');
const fs = require('node:fs');
const test = require('node:test');
const { declaracoes } = require('./helpers/regras-css');
const { montarCadastro } = require('./helpers/cadastro');

const estilos = fs.readFileSync('css/forms.css', 'utf8');
const regras = fs.readFileSync('docs/REGRAS.md', 'utf8');

// O Salvar de verdade (submeteNovoLancamento) com 3 parcelas no crédito: `faturas` é o que os seletores devolvem.
async function salvarCredito3x(faturas) {
  const c = montarCadastro({ campos: { fCred: true, fParcelas: '3' }, faturas });

  await c.salvar();

  return c;
}

test('salvar com fatura faltando numa parcela 2..N abre o modal das parcelas', async () => {
  const c = await salvarCredito3x(['2026-11-12', '2026-12-12', '']); // falta a da 3ª parcela

  assert.equal(c.chamadas.modalDasFaturas, 1);
  assert.equal(c.chamadas.rolagens, 0);
  assert.equal(c.chamadas.gravados.length, 0); // nada foi salvo
  assert.equal(
    c.el('erroNovo').textContent,
    'Escolha uma fatura para cada parcela de crédito.'
  );
});

test('fatura faltando na 1ª parcela rola até o campo em vez de abrir o modal; completas, salva', async () => {
  const primeira = await salvarCredito3x(['', '2026-12-12', '2027-01-12']);

  assert.equal(primeira.chamadas.modalDasFaturas, 0);
  assert.equal(primeira.chamadas.rolagens, 1);
  assert.equal(primeira.chamadas.gravados.length, 0);

  const completas = await salvarCredito3x(['2026-11-12', '2026-12-12', '2027-01-12']);

  assert.equal(completas.chamadas.modalDasFaturas, 0);
  assert.deepEqual(completas.chamadas.gravados[0].faturaIds, [
    '2026-11-12',
    '2026-12-12',
    '2027-01-12',
  ]);
});

test('o formulário inteiro (#formNovo) continua com seu próprio scroll e teto de altura', () => {
  const regrasDoFormulario = declaracoes(estilos, '#formNovo');

  assert.ok(regrasDoFormulario.includes('overflow-y: auto'));
  assert.ok(regrasDoFormulario.includes('max-height: 88vh'));
});

test('regra documentada em REGRAS.md', () => {
  assert.match(
    regras,
    /O campo \*\*Fatura\*\* fica sempre visível, logo abaixo de Frequência\/Vezes\/Dividir, numa única linha: o seletor da 1ª parcela e um botão "\+N" \(`#fFaturasMais`, N = demais parcelas\) que abre `#modalFaturasParcelas`/
  );
  assert.match(
    regras,
    /No Débito comum \(fora antecipação\), Fatura vira um seletor desativado "—", que nunca conta como fatura escolhida/
  );
  assert.match(
    regras,
    /Salvar com a fatura de alguma parcela 2\.\.N em branco mostra o erro e abre esse modal direto/
  );
});
