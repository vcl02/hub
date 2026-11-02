// Consolidação automática de 15 em 15 min e data de fechamento provisória do ciclo aberto.
const assert = require('./helpers/assert-tolerante');
const fs = require('node:fs');
const test = require('node:test');
const vm = require('node:vm');

const inicializacao = fs.readFileSync('js/bootstrap.js', 'utf8');
const compartilhado = fs.readFileSync('js/shared.js', 'utf8');
const regras = fs.readFileSync('docs/REGRAS.md', 'utf8');

// Roda o setInterval real do bootstrap com relógio e chamadas falsas.
function relogio({ livre = true } = {}) {
  const inicio = inicializacao.indexOf('const INTERVALO_CONSOLIDACAO_AUTOMATICA_MS');
  const fim = inicializacao.indexOf('}, 30 * 1000);', inicio) + '}, 30 * 1000);'.length;

  const ctx = {
    agora: 0,
    chamadas: [],
    tick: null,
    Estado: { ultimaCarga: 1, ultimaConsolidacao: 0 },
    INTERVALO_RECARGA_AUTOMATICA_MS: 5 * 60 * 1000,
    telaLivreParaRecarregar: () => livre,
    el: (id) => ({ id }),
    setInterval: (f) => {
      ctx.tick = f;
    },
  };

  ctx.Date = { now: () => ctx.agora };
  ctx.consolidarTudo = (botao, _depois, opcoes) => {
    ctx.chamadas.push(['consolidar', botao.id, opcoes.silencioso]);
    ctx.Estado.ultimaConsolidacao = ctx.agora;
  };

  ctx.recarregarDados = () => {
    ctx.chamadas.push(['recarregar']);
    ctx.Estado.ultimaCarga = ctx.agora;
  };

  vm.runInNewContext(inicializacao.slice(inicio, fim), ctx);
  ctx.ir = (minutos) => {
    ctx.agora = minutos * 60 * 1000 + 1;
    ctx.tick();
  };

  return ctx;
}

test('consolida sozinho a cada 15 min, em silêncio; no meio, só recarrega a cada 5', () => {
  const c = relogio();

  c.ir(0); // 1ª verificação: começa a contar os 15 min agora
  c.ir(5); // 5 min: só recarga
  c.ir(10);
  c.ir(15); // 15 min: consolida (e não recarrega à parte)
  assert.deepEqual(c.chamadas, [
    ['recarregar'],
    ['recarregar'],
    ['consolidar', 'recarregar', true],
  ]);
});

test('nunca com a tela ocupada', () => {
  const ocupada = relogio({ livre: false });

  ocupada.ir(0);
  ocupada.ir(16);
  assert.deepEqual(ocupada.chamadas, []);
});

test('ciclo aberto usa fechamento provisório, nunca 31/12/9999', () => {
  const inicio = compartilhado.indexOf('function somaMeses(iso, n) {');

  const fim =
    compartilhado.indexOf(
      '\n}\n',
      compartilhado.indexOf('function dataDeFechamentoDoCiclo(ciclo) {')
    ) + 3;

  const ctx = { dataISO: (s) => String(s || '').slice(0, 10) };

  vm.runInNewContext(
    `${compartilhado.slice(inicio, fim)}\nthis.f = dataDeFechamentoDoCiclo;`,
    ctx
  );
  assert.equal(ctx.f({ ini: '2026-10-05', fat: '9999-12-31' }), '2026-11-04');
  assert.equal(ctx.f({ ini: '2027-01-31', fat: '9999-12-31' }), '2027-02-27');
  assert.equal(ctx.f({ ini: '2026-10-05', fat: '2026-11-04' }), '2026-11-04');
  assert.match(regras, /nunca a data técnica 31\/12\/9999/);
  assert.match(regras, /\*\*Consolidação automática:\*\* a cada 15 minutos/);
});

// O Aporte/Resgate gravado no ciclo aberto leva o fechamento provisório, nunca 9999-12-31: materializaOuConsolidaAjuste real.
test('o Aporte criado no ciclo aberto, real ou simulado, leva a data de fechamento provisória', async () => {
  const fonteForm = fs.readFileSync('js/form.js', 'utf8');
  const iniDatas = compartilhado.indexOf('function somaMeses(iso, n) {');

  const fimDatas =
    compartilhado.indexOf(
      '\n}\n',
      compartilhado.indexOf('function dataDeFechamentoDoCiclo(ciclo) {')
    ) + 3;

  const iniFuncao = fonteForm.indexOf('async function materializaOuConsolidaAjuste(');
  const fimFuncao = fonteForm.indexOf('\n}\n', iniFuncao) + 3;

  async function materializar(simulando) {
    const gravados = [];

    const ctx = {
      Estado: {
        simulando,
        ciclos: [{ ini: '2026-10-05', fat: '9999-12-31' }],
        lancamentos: [],
      },
      dataISO: (s) => String(s || '').slice(0, 10),
      movimentoAporteOuResgateDoCiclo: () => null, // ainda não há Aporte no ciclo
      ehCategoriaInvestimento: () => true,
      periodoDoLancamento: () => 0,
      simulaLancamentoParcelado: (campos) => gravados.push(campos.data),
      inserirLancamento: async (campos) => {
        gravados.push(campos.data);

        return { ...campos, id: 9 };
      },
    };

    vm.runInNewContext(
      `${compartilhado.slice(iniDatas, fimDatas)}\n${fonteForm.slice(iniFuncao, fimFuncao)}\nthis.f = materializaOuConsolidaAjuste;`,
      ctx
    );
    await ctx.f(0, true, 'Investimento', -500);

    return gravados;
  }

  assert.deepEqual(await materializar(false), ['2026-11-04']);
  assert.deepEqual(await materializar(true), ['2026-11-04']);
});
