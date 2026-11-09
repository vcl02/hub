// Regressão dos achados da revisão: consolidação nunca reescreve Aporte/Resgate pago e só
// grava um por vez; garantia Nubank e Livre Hoje só com o que já foi pago; recarga após
// gravar espera a simulação; teto Besteira por item inteiro; ciclo aberto sem 31/12/9999;
// saldo diário recortado com base e guardado próprios.
const assert = require('./helpers/assert-tolerante');
const fs = require('node:fs');
const test = require('node:test');
const vm = require('node:vm');
const { carregarTela } = require('./helpers/tela-sem-navegador');

const interacoes = fs.readFileSync('js/interactions.js', 'utf8');
const formulario = fs.readFileSync('js/form.js', 'utf8');
const inicializacao = fs.readFileSync('js/bootstrap.js', 'utf8');
const regras = fs.readFileSync('docs/REGRAS.md', 'utf8');

// Extrai movimentoAporteOuResgateDoCiclo do arquivo real e roda com os globais mínimos.
function movimentoDoCiclo(lancamentos) {
  const inicio = interacoes.indexOf('function movimentoAporteOuResgateDoCiclo(');
  const fim = interacoes.indexOf('\n}\n', inicio) + 3;

  const contexto = {
    Estado: { lancamentos, ciclos: [{ ini: '2026-10-08', fat: '2026-11-08' }] },
    ehLinhaReal: (r) => +r.id > 0 && !r._sim,
    semAcento: (v) =>
      String(v ?? '')
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .toLowerCase(),
    dataISO: (v) => String(v || '').slice(0, 10),
    timestamp: (v) => Date.parse(String(v || '').slice(0, 10)) || 0,
    dataDeFechamentoDoCiclo: (ciclo) => ciclo.fat,
  };

  vm.createContext(contexto);
  vm.runInContext(
    `${interacoes.slice(inicio, fim)}\nglobalThis.f = movimentoAporteOuResgateDoCiclo;`,
    contexto
  );

  return contexto.f(0);
}

const aporte = (id, data, pago) => ({
  id,
  data,
  pago,
  nome: 'Aporte',
  categ: 'Investimento',
  inv: true,
  cred: false,
  periodoIdx: 0,
  v: -100,
});

test('consolidação nunca escolhe Aporte/Resgate já pago; com só pago no ciclo, materializa um novo', () => {
  assert.equal(movimentoDoCiclo([aporte(1, '2026-10-10', true)]), null);
  assert.equal(
    movimentoDoCiclo([aporte(1, '2026-10-10', true), aporte(2, '2026-10-20', false)]).id,
    2
  );
});

test('entre os abertos, prefere o da data de fechamento (o que o app cria), senão o mais antigo', () => {
  assert.equal(
    movimentoDoCiclo([aporte(1, '2026-10-10', false), aporte(2, '2026-11-08', false)]).id,
    2
  );
  assert.equal(
    movimentoDoCiclo([aporte(3, '2026-10-20', false), aporte(1, '2026-10-10', false)]).id,
    1
  );
});

// O clique do botão Materializar/Consolidar (js/form.js), com a tela e a gravação falsas. A varredura do
// Consolidar tudo (mesma trava) está em consolidar-tudo.test.js.
function cliqueDoAjuste({ gravando = false, falha = null } = {}) {
  const inicio = formulario.indexOf("el('seldup').onclick = async () => {");
  const fim = formulario.indexOf('\n};\n', inicio) + 4;
  const botao = { disabled: false, textContent: 'Materializar' };
  const eventos = [];
  const toasts = [];

  const ctx = {
    Estado: {
      gravandoAjuste: gravando,
      simulando: false,
      selecionados: new Map([['sug:0', true]]),
    },
    el: () => botao,
    linhaDaChaveSelecao: () => ({ _sug: 100, categ: 'Investimento', v: -100 }),
    indiceDoAjuste: () => 0,
    movimentoAporteOuResgateDoCiclo: () => null,
    materializaOuConsolidaAjuste: async (...args) => {
      eventos.push(['grava', ctx.Estado.gravandoAjuste, args]);

      if (falha) throw Error(falha);
    },
    desenhar: () => eventos.push('desenhar'),
    mostrarToast: (...args) => toasts.push(args),
  };

  vm.runInNewContext(formulario.slice(inicio, fim), ctx);

  return { ctx, botao, eventos, toasts, clicar: () => botao.onclick() };
}

test('um Materializar/Consolidar por vez: o clique avisa e não grava enquanto outro grava', async () => {
  const ocupado = cliqueDoAjuste({ gravando: true });

  await ocupado.clicar();
  assert.deepEqual(ocupado.eventos, []);
  assert.deepEqual(ocupado.toasts, [['Aguarde', 'Há uma consolidação em andamento.']]);
  assert.equal(ocupado.ctx.Estado.gravandoAjuste, true); // quem está gravando continua dono da trava
  assert.equal(ocupado.botao.disabled, false);
});

test('o clique que grava segura a trava e a libera no fim, com sucesso ou falha', async () => {
  const ok = cliqueDoAjuste();

  await ok.clicar();
  assert.deepEqual(JSON.parse(JSON.stringify(ok.eventos)), [
    ['grava', true, [0, true, 'Investimento', 100]],
    'desenhar',
  ]);
  assert.equal(ok.ctx.Estado.gravandoAjuste, false);
  assert.equal(ok.botao.disabled, false);

  const falhou = cliqueDoAjuste({ falha: 'sem rede' });

  await falhou.clicar();
  assert.deepEqual(falhou.toasts, [['Falhou ao materializar o ajuste', 'sem rede']]);
  assert.equal(falhou.ctx.Estado.gravandoAjuste, false);
  assert.equal(falhou.botao.disabled, false);
});

test('o estado nasce sem ninguém gravando Aporte/Resgate', () => {
  assert.equal(carregarTela().rodar('Estado.gravandoAjuste'), false);
});

test('recarga após gravar espera a simulação acabar (a carga apagaria os simulados)', () => {
  const inicio = inicializacao.indexOf('const telaSemEdicaoEmCurso = () =>');
  const fim = inicializacao.indexOf(';\n', inicio) + 2;

  const telaLivre = (Estado) =>
    vm.runInNewContext(`${inicializacao.slice(inicio, fim)}\ntelaSemEdicaoEmCurso()`, {
      Estado,
      el: (id) => (id === 'app' ? { style: { display: 'block' } } : { disabled: false }),
      document: { querySelector: () => null, activeElement: null },
    });

  assert.equal(telaLivre({ simulando: false, cargasEmAndamento: 0 }), true);
  assert.equal(telaLivre({ simulando: true, cargasEmAndamento: 0 }), false);
});

const L = (id, nome, valor, data, categ) => ({
  id: String(id),
  nome,
  data,
  valor,
  categ,
  cred: false,
  pago: true,
  fatura: null,
  freq: null,
});

// Três ciclos: o 1º e o 2º fechados, o 3º aberto (sem fim). Sobra de 1.000 no 1º, gasto de 300 no 2º, sobra de 500 no 3º.
const cenario = () =>
  carregarTela({
    dados: {
      fin_ciclo: [
        { id: 1, inicio: '2026-08-15', fim: '2026-09-14' },
        { id: 2, inicio: '2026-09-15', fim: '2026-10-14' },
        { id: 3, inicio: '2026-10-15', fim: null },
      ],
      fin: [
        L(1, 'Salário', 1000, '2026-08-20', 'Salário'),
        L(2, 'Mercado', -300, '2026-09-20', 'Mercado'),
        L(3, 'Extra', 500, '2026-10-16', 'Salário'),
      ],
      fin_meta: [],
    },
  });

test('ciclo aberto nunca usa 31/12/9999 em datas exibidas ou calculadas', async () => {
  const t = cenario();

  await t.bruto('carregarDados()');

  const [aberto] = t.rodar('dadosEvolucao(2, 2)');

  // O Aporte sugerido do ciclo aberto entra no gráfico na data provisória de fechamento (um mês depois do início)
  assert.deepEqual(
    aberto.linhasDe.Aportado.map((a) => [a.nome, a.v, a.data]),
    [['Aporte sugerido', -500, '2026-11-14']]
  );
});

test('saldo diário recortado calcula o guardado com os ajustes do próprio recorte', async () => {
  const t = cenario();

  await t.bruto('carregarDados()');

  const ajustes = (filtro) =>
    t.rodar(`(() => {
      const { base, abat } = baseEAbatFiltrados();
      const ajuste = ajusteDoCicloParaSaldoDiario(base.filter(${filtro}), abat);

      return [0, 1, 2].map((i) => { const a = ajuste(i); return a && [a.tipo, a.v]; });
    })()`);

  // Conta inteira: aporta 1.000 no 1º ciclo, resgata 300 do guardado no 2º, aporta 500 no 3º
  assert.deepEqual(ajustes('() => true'), [
    ['aporte', -1000],
    ['resgate', 300],
    ['aporte', -500],
  ]);
  // Recorte sem os salários: nada sobra nem foi guardado, então o gasto do 2º ciclo não tem de onde resgatar.
  // Com o guardado da conta inteira (o erro de antes) o recorte resgataria 300 de um Aporte que ele nem tem.
  assert.deepEqual(ajustes("(r) => r.categ !== 'Salário'"), [null, null, null]);
});

test('REGRAS.md documenta cada correção', () => {
  assert.match(
    regras,
    /Aporte\/Resgate já \*\*pago\*\* é dinheiro que de fato se moveu e nunca é reescrito/
  );
  assert.match(regras, /Só um Materializar\/Consolidar grava por vez/);
  assert.match(
    regras,
    /antecipação \*\*já paga\*\* alocada à mesma fatura libera somente o que ela abate/
  );
  assert.match(
    regras,
    /Aportes e resgates reais de `Investimento` \*\*já pagos\*\* até o ciclo definem essa garantia/
  );
  assert.match(regras, /`Besteira` também é comparada como \*\*item inteiro\*\*/);
  assert.match(
    regras,
    /uma gravação real que termina depois de ligar a simulação espera/
  );
  assert.match(regras, /As linhas reais vão num único `UPDATE` \(tudo ou nada/);
  assert.match(
    regras,
    /um termo que não tira nenhuma linha deixa o saldo cinza igual ao sem filtro/
  );
});
