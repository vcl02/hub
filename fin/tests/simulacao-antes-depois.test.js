// Simulação mostra "antes → depois": retrato dos dados reais ao ligar, o mesmo cálculo com
// ele (sem estragar o estado do desenho) e a data em que a Reserva completa a meta.
const assert = require('./helpers/assert-tolerante');
const fs = require('node:fs');
const test = require('node:test');
const vm = require('node:vm');
const { carregarTela } = require('./helpers/tela-sem-navegador');
const { trazer } = require('./helpers/trazer-funcao');

const interacoes = fs.readFileSync('js/interactions.js', 'utf8');
const formulario = fs.readFileSync('js/form.js', 'utf8');
const graficos = fs.readFileSync('js/charts.js', 'utf8');

fs.readFileSync('js/supabase-api.js', 'utf8');
const regras = fs.readFileSync('docs/REGRAS.md', 'utf8');

const trecho = (fonte, assinatura) => {
  const inicio = fonte.indexOf(assinatura);

  return fonte.slice(inicio, fonte.indexOf('\n}\n', inicio) + 3);
};

test('retrato ao ligar copia linha a linha (a simulação edita os objetos no lugar)', () => {
  const linha = { id: 1, v: -10 };

  const ctx = {
    Estado: {
      lancamentos: [linha],
      metas: [{ id: 1, valor: 500 }],
      limitesPorCiclo: new Map([[5, { teto_besteira: 100 }]]),
    },
  };

  vm.runInNewContext(
    `${trecho(formulario, 'function guardarRetratoAntesDaSimulacao() {')}\nguardarRetratoAntesDaSimulacao();`,
    ctx
  );
  const retrato = ctx.Estado.retratoAntesDaSimulacao;

  linha.v = -999;
  ctx.Estado.limitesPorCiclo.get(5).teto_besteira = 0;
  assert.equal(retrato.lancamentos[0].v, -10);
  assert.equal(retrato.limitesPorCiclo.get(5).teto_besteira, 100);
  ctx.Estado.metas[0].valor = 1;
  assert.equal(retrato.metas[0].valor, 500); // metas editadas na simulação também
  // Liga → retrato; desliga (recarga ok) → descarta: conferido com o botão rodando, no teste do botão abaixo.
});

test('cálculo com os dados reais devolve o resultado e restaura o estado do desenho', () => {
  const simulados = [{ id: 1 }, { id: -1, _sim: true }];
  const reais = [{ id: 1 }];
  let limpezas = 0;

  const Estado = {
    lancamentos: simulados,
    limitesPorCiclo: 'simulado',
    cartoesDoCiclo: 'simulado',
    fechados: { db: false },
    cicloQuitadoRecolhido: null,
    valorFaturaPorCiclo: { a: 1 },
    linhasVisiveis: { db: [] },
    retratoAntesDaSimulacao: { lancamentos: reais, limitesPorCiclo: 'real' },
  };

  const ctx = {
    Estado,
    limparCachesFinanceiros: () => {
      limpezas++;
    },
  };

  vm.runInNewContext(
    `${trecho(interacoes, 'function comDadosAntesDaSimulacao(fn) {')}
        globalThis.r = comDadosAntesDaSimulacao(() => {
            const visto = [Estado.lancamentos.length, Estado.limitesPorCiclo];
            Estado.cartoesDoCiclo = 'real'; Estado.fechados.db = true; Estado.cicloQuitadoRecolhido = '3:db';
            Estado.valorFaturaPorCiclo.a = 2; Estado.linhasVisiveis.db = ['x'];
            return visto;
        });`,
    ctx
  );
  // Objetos criados dentro do vm têm outro protótipo: compara pelo conteúdo.
  const json = (v) => JSON.parse(JSON.stringify(v));

  assert.deepEqual(json(ctx.r), [1, 'real']);
  assert.equal(Estado.lancamentos, simulados);
  assert.equal(Estado.limitesPorCiclo, 'simulado');
  assert.equal(Estado.cartoesDoCiclo, 'simulado');
  assert.deepEqual(json(Estado.fechados), { db: false });
  assert.equal(Estado.cicloQuitadoRecolhido, null);
  assert.deepEqual(json(Estado.valorFaturaPorCiclo), { a: 1 });
  assert.deepEqual(json(Estado.linhasVisiveis), { db: [] });
  assert.equal(limpezas, 2); // antes (pra calcular com os reais) e depois (pro desenho seguir simulado)
});

// O botão da simulação (el('toggleSimulacao').onclick, js/form.js) rodando de verdade, com a recarga e o desenho simulados.
async function clicarNaSimulacao({ simulando, cargaOk = true }) {
  const tela = carregarTela();
  const eventos = [];

  tela.bruto('Estado.lancamentos = [{ id: 1, v: -10 }]');
  tela.bruto(`Estado.simulando = ${simulando}`);

  if (simulando) tela.bruto('Estado.retratoAntesDaSimulacao = { lancamentos: [] }');
  Object.assign(tela.ctx, {
    load: async (opcoes) => {
      eventos.push(['load', opcoes.silencioso]);

      return cargaOk;
    },
    mostrarToast: (titulo) => eventos.push(['toast', titulo]),
    atualizaBotaoSimulacao: () => eventos.push('botao'),
    desenhar: () => eventos.push('desenhar'),
  });

  const inicio = formulario.indexOf("el('toggleSimulacao').onclick = async () => {");

  vm.runInContext(
    formulario.slice(inicio, formulario.indexOf('\n};\n', inicio) + 4),
    tela.ctx
  );
  await tela.ctx.document.getElementById('toggleSimulacao').onclick();

  return {
    eventos: JSON.parse(JSON.stringify(eventos)),
    simulando: tela.rodar('Estado.simulando'),
    retrato: tela.rodar('Estado.retratoAntesDaSimulacao'),
    botaoLivre: tela.ctx.document.getElementById('toggleSimulacao').disabled === false,
  };
}

test('liga a simulação guardando o retrato; desliga (recarga ok) descartando-o; recarga que falha mantém a simulação', async () => {
  // Liga → retrato dos dados reais antes de simular
  const ligou = await clicarNaSimulacao({ simulando: false });

  assert.equal(ligou.simulando, true);
  assert.deepEqual(ligou.retrato.lancamentos, [{ id: 1, v: -10 }]);
  assert.deepEqual(ligou.eventos, ['botao', 'desenhar']);

  // Desliga: recarrega do banco, e só depois sai da simulação e descarta o retrato
  const desligou = await clicarNaSimulacao({ simulando: true });

  assert.equal(desligou.simulando, false);
  assert.equal(desligou.retrato, null);
  assert.deepEqual(desligou.eventos, [['load', true], 'botao', 'desenhar']);
  assert.equal(desligou.botaoLivre, true);

  // Sem conexão: a simulação continua, com o retrato, e o botão volta a poder ser clicado
  const falhou = await clicarNaSimulacao({ simulando: true, cargaOk: false });

  assert.equal(falhou.simulando, true);
  assert.deepEqual(falhou.retrato, { lancamentos: [] });
  assert.deepEqual(falhou.eventos, [
    ['load', true],
    ['toast', 'A simulação continua'],
  ]);
  assert.equal(falhou.botaoLivre, true);
});

test('o valor real aparece antes do simulado só no que mudou, sem HTML do texto', () => {
  const tela = carregarTela();

  trazer(tela.ctx, 'js/interactions.js', ['marcarAntesDaSimulacao']);

  const negrito = (texto) => {
    const b = { textContent: texto, inseridos: [] };

    b.insertAdjacentHTML = (onde, html) => b.inseridos.push([onde, html]);

    return b;
  };

  const faixa = [negrito('83,2%'), negrito('R$ 10,00'), negrito('igual')];
  const indicador = [negrito('Dez/26')];
  const extra = negrito('sem antes'); // posição além do que havia antes: fica como está

  tela.ctx.valoresEmNegrito = () => ({
    faixas: new Map([['db:hoje', [...faixa, extra]]]),
    indicadores: new Map([['indicadorReserva', indicador]]),
  });
  tela.bruto('marcarAntesDaSimulacao')({
    faixas: new Map([['db:hoje', ['71,6%', 'R$ <10>', 'igual']]]),
    indicadores: new Map([['indicadorReserva', ['Mar/27']]]),
  });

  assert.deepEqual(faixa[0].inseridos, [
    ['beforebegin', '<span class=valorAntes title="Sem a simulação">71,6% →</span> '],
  ]);
  assert.deepEqual(faixa[1].inseridos, [
    [
      'beforebegin',
      '<span class=valorAntes title="Sem a simulação">R$ &lt;10&gt; →</span> ',
    ],
  ]);
  assert.deepEqual(faixa[2].inseridos, []); // igual: nada
  assert.deepEqual(extra.inseridos, []);
  assert.deepEqual(indicador[0].inseridos, [
    ['beforebegin', '<span class=valorAntes title="Sem a simulação">Mar/27 →</span> '],
  ]);
});

test('desenho: calcula o antes primeiro, marca depois de encaixar os indicadores e antes de alinhar', async () => {
  const tela = carregarTela({
    dados: {
      fin: [],
      fin_ciclo: [{ id: 1, inicio: '2026-09-15', fim: null }],
      fin_meta: [],
    },
  });

  await tela.bruto('carregarDados()');
  trazer(tela.ctx, 'js/interactions.js', ['desenhar']);

  const el = (id) => tela.ctx.document.getElementById(id);
  const ordem = [];

  tela.ctx.ordem = ordem;
  tela.bruto('(Estado.simulando = true, Estado.retratoAntesDaSimulacao = {})');
  tela.ctx.comDadosAntesDaSimulacao = (calcula) => {
    ordem.push('antes:começa');
    const r = calcula();

    ordem.push('antes:termina');

    return r;
  };

  tela.ctx.textosDosValores = () => 'textos-do-antes';
  tela.ctx.marcarAntesDaSimulacao = (antes) => ordem.push(`marca:${antes}`);
  tela.bruto(`(() => {
    sincronizarCicloNaUrl = () => {};
    popularAlvosVisualizacao = () => {};
    atualizarIndicadoresFinanceiros = () => ordem.push('indicadores');
    vCiclo = () => 'CICLO';
    vComp = () => 'MATRIZ';
    encaixarIndicadoresNoDebito = () => ordem.push('encaixa');
    alinharResumosDosTitulos = () => ordem.push('alinha');
    atualizarCartoes = () => {};
    atualizarMetas = () => {};
    atualizarBotaoSomenteDif = () => {};
  })()`);

  el('compDe').value = '1';
  el('compAte').value = '1';
  tela.bruto('desenhar')();

  assert.deepEqual(Array.from(ordem), [
    'antes:começa', // os números com os dados reais, antes de qualquer coisa ser sobrescrita
    'indicadores',
    'antes:termina',
    'indicadores', // os indicadores de verdade sobrescrevem os textos do antes
    'encaixa',
    'marca:textos-do-antes', // marca "antes →" só depois de encaixar os indicadores no Débito
    'alinha', // e o alinhamento mede já com o "antes →" na tela
  ]);

  // Fora da simulação, nada de antes nem de marca
  ordem.length = 0;
  tela.bruto('(Estado.simulando = false, Estado.retratoAntesDaSimulacao = null)');
  tela.bruto('desenhar')();
  assert.deepEqual(Array.from(ordem), ['indicadores', 'encaixa', 'alinha']);
});

test('Reserva: primeiro ciclo seguinte em que o guardado projetado alcança a meta', () => {
  // [guardado projetado, meta calculada naquele ciclo]: só a meta do ciclo de partida vale.
  const projecao = {
    3: [100, 1000],
    4: [400, 0],
    5: [990, 5000],
    6: [1000, 1100],
    7: [2000, 1000],
  };

  const roda = (idx, tabela = projecao) => {
    const ctx = {
      TOLERANCIA_FINANCEIRA: 0.005,
      Estado: { ciclos: Array(8).fill({}) },
      dadosMetaReservaEmergenciaCiclo: (i) => ({
        guardado: tabela[i][0],
        meta: tabela[i][1],
      }),
      guardadoAte: (i) => tabela[i][0],
    };

    vm.runInNewContext(
      `${trecho(graficos, 'function cicloEmQueReservaCompleta(idxPeriodo) {')}\nglobalThis.r = cicloEmQueReservaCompleta(${idx});`,
      ctx
    );

    return ctx.r;
  };

  assert.equal(roda(3), 6); // alvo 1000 (o de hoje): 990 no 5 não chega; 1000 no 6 chega
  assert.equal(roda(7), null); // já completa: sem data
  assert.equal(roda(3, { ...projecao, 3: [1000, 1000] }), null); // completa hoje: não procura nos seguintes (o ciclo 7 teria 2000)
  assert.equal(
    roda(3, { 3: [0, 1000], 4: [0, 1000], 5: [0, 1000], 6: [0, 1000], 7: [0, 1000] }),
    null
  ); // não fecha
  assert.equal(roda(3, { 3: [0, 0] }), null); // sem meta
});

test('indicador da Reserva mostra a data em que a meta completa, ou "depois de" o último ciclo', async () => {
  const ciclos = Array.from({ length: 14 }, (_, i) => ({
    id: i + 1,
    inicio: new Date(Date.UTC(2026, 8 + i, 15)).toISOString().slice(0, 10),
    fim: i === 13 ? null : new Date(Date.UTC(2026, 9 + i, 14)).toISOString().slice(0, 10),
  }));

  const l = (id, nome, valor, extra = {}) => ({
    id,
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

  const indicador = async (maisEntradas) => {
    const tela = carregarTela({
      dados: {
        fin_ciclo: ciclos,
        fin_meta: [],
        fin: [
          l(1, 'Salário', 9000, { data: '2026-10-15', categ: 'Salário' }),
          ...maisEntradas,
          l(2, 'Obra', -1000, { reserva: true, data: '2026-10-16' }),
          l(3, 'Obra', -1000, { reserva: true, data: '2026-11-16' }),
          l(4, 'Poupança', -300, { categ: 'Investimento', data: '2026-10-18' }),
        ],
      },
    });

    await tela.bruto('carregarDados()');
    tela.bruto('Estado.idxHoje = 1');
    tela.bruto('atualizarIndicadoresFinanceiros(Estado.idxHoje)');

    return tela.ctx.document.getElementById('indicadorReserva').innerHTML;
  };

  // Outro salário em dezembro fecha a meta de 9 meses nesse ciclo
  assert.equal(
    await indicador([
      l(5, 'Salário', 9000, { data: '2026-12-15', categ: 'Salário', pago: false }),
    ]),
    'Reserva <b class="pct am">88,9%</b> <span class=limiteRotulo>da meta</span> <span class=limiteRotulo>·</span> <b>Dez/26</b>'
  );
  // Sem mais entradas, o guardado nunca chega: "depois de" o último ciclo carregado
  assert.equal(
    await indicador([]),
    'Reserva <b class="pct am">88,9%</b> <span class=limiteRotulo>da meta</span> <span class=limiteRotulo>· depois de</span> <b>Out/27</b>'
  );
});

test('REGRAS.md documenta antes → depois, data da Reserva e parcelas no Comprometido', () => {
  assert.match(
    regras,
    /\*\*Antes → depois:\*\* ao ligar a simulação, o app guarda um retrato dos dados reais/
  );
  assert.match(regras, /`Comprometido 71,6% → 83,2% do mês`/);
  assert.match(
    regras,
    /Com a meta incompleta, depois do percentual vem o ciclo em que ela completa no ritmo projetado/
  );
  assert.match(regras, /alcança a meta de hoje, fixa/);
  assert.match(
    regras,
    /Parcela de compra parcelada no Crédito \(lote do cadastro com `recorrencia_id`, sem Frequência\) entra mesmo sem a marca/
  );
});
