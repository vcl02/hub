// Depois de salvar no cadastro, fechar o modal roda o Consolidar tudo em silêncio (quando a tela fica livre).
const assert = require('./helpers/assert-tolerante');
const fs = require('node:fs');
const test = require('node:test');
const vm = require('node:vm');
const { montarCadastro } = require('./helpers/cadastro');

const form = fs.readFileSync('js/form.js', 'utf8');
const regras = fs.readFileSync('docs/REGRAS.md', 'utf8');

// Roda o trecho real (flag + espera + listener de close) com DOM e relógio falsos.
function cenario({ simulando = false, ocupadoPor = 0 } = {}) {
  const inicio = form.indexOf('let consolidarAoFecharCadastro');

  const fim =
    form.indexOf('});', form.indexOf("modalNovo.addEventListener('close'", inicio)) + 3;

  const ctx = {
    chamadas: [],
    timers: [],
    ouvintes: {},
    ocupado: ocupadoPor,
    Estado: { simulando, gravandoAjuste: false },
    document: { querySelector: () => (ctx.ocupado-- > 0 ? {} : null) },
    el: (id) => ({ id, disabled: false }),
    setTimeout: (f) => ctx.timers.push(f),
    consolidarTudo: (bt, depois, op) => ctx.chamadas.push([bt.id, op]),
    modalNovo: {
      addEventListener: (ev, f) => {
        ctx.ouvintes[ev] = f;
      },
    },
  };

  vm.runInNewContext(
    form.slice(inicio, fim) +
      '\nthis.marcar = () => { consolidarAoFecharCadastro = true; };',
    ctx
  );

  return ctx;
}

test('fechar o cadastro depois de salvar consolida em silêncio; sem salvar, não', () => {
  const c = cenario();

  c.ouvintes.close();
  assert.equal(c.chamadas.length, 0); // fechou sem salvar
  c.marcar();
  c.ouvintes.close();
  assert.equal(
    JSON.stringify(c.chamadas),
    JSON.stringify([['recarregar', { silencioso: true }]])
  ); // objetos de outro contexto (vm)
  c.ouvintes.close();
  assert.equal(c.chamadas.length, 1); // uma vez por salvamento
});

test('espera a tela ficar livre e nunca roda na simulação', () => {
  const c = cenario({ ocupadoPor: 2 });

  c.marcar();
  c.ouvintes.close();
  assert.equal(c.chamadas.length, 0);

  while (c.timers.length) c.timers.shift()();
  assert.equal(c.chamadas.length, 1);
  const s = cenario({ simulando: true });

  s.marcar();
  s.ouvintes.close();
  assert.equal(s.chamadas.length, 0);
});

// O Salvar de verdade (submeteNovoLancamento) junto com o fechar do modal: só o salvamento real liga a consolidação.
test('o salvamento real liga a consolidação ao fechar; simulado ou recusado, não', async () => {
  const real = montarCadastro();

  await real.salvar();
  assert.equal(real.chamadas.gravados.length, 1);
  assert.equal(real.chamadas.consolidacoes.length, 0); // o modal não fecha ao salvar
  real.fecharModal();
  assert.equal(
    JSON.stringify(real.chamadas.consolidacoes),
    JSON.stringify([['recarregar', { silencioso: true }]])
  );

  const simulado = montarCadastro({ simulando: true });

  await simulado.salvar();
  assert.equal(simulado.chamadas.simulados.length, 1);
  simulado.fecharModal();
  assert.equal(simulado.chamadas.consolidacoes.length, 0);

  const semNome = montarCadastro({ campos: { fNome: '' } }); // validação recusou: nada foi salvo

  await semNome.salvar();
  assert.equal(semNome.chamadas.gravados.length, 0);
  semNome.fecharModal();
  assert.equal(semNome.chamadas.consolidacoes.length, 0);
});

test('a regra está documentada', () => {
  assert.match(regras, /\*\*Consolidar depois do cadastro:\*\*/);
});
