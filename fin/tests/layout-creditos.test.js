// Contrato visual-financeiro: a tabela Crédito é prévia; o saldo continua no ciclo próprio.
// O desenho do ciclo (vCiclo) roda de verdade, sem navegador, e o teste confere o HTML que sai.
const assert = require('./helpers/assert-tolerante');
const fs = require('node:fs');
const test = require('node:test');
const vm = require('node:vm');
const { carregarTela } = require('./helpers/tela-sem-navegador');

const script = fs.readFileSync('js/finance.js', 'utf8');
const interacoes = fs.readFileSync('js/interactions.js', 'utf8');
const estilos = fs.readFileSync('css/dashboard.css', 'utf8');
const estilosMobile = fs.readFileSync('css/mobile.css', 'utf8');
const regras = fs.readFileSync('docs/REGRAS.md', 'utf8');
const decisoes = fs.readFileSync('docs/DECISOES.md', 'utf8');
const inicio = script.indexOf('function creditosExibidosNoCiclo(');
const fim = script.length;

if (inicio < 0 || fim < 0)
  throw Error('Não encontrou a regra de layout do Crédito no módulo financeiro.');

const contexto = {};

vm.createContext(contexto);
vm.runInContext(script.slice(inicio, fim), contexto);

const exibir = (linhas, ciclo) =>
  Array.from(contexto.creditosExibidosNoCiclo(linhas, ciclo));

// Hoje = 20/10/2026, que cai no ciclo de índice 1 (15/10 a 14/11); o 2 é o futuro e o 0, o passado.
// Tetos de Besteira e Isabella zerados: sem linha "prevista" no Crédito, Hoje e Futuro podem ficar iguais.
const lanc = (id, nome, data, valor, extra = {}) => ({
  id,
  nome,
  data,
  valor,
  categ: 'Casa',
  cred: false,
  pago: true,
  fatura: null,
  freq: null,
  ...extra,
});

const zero = { limite_besteira: 0, limite_isabella: 0 };

const dadosDe = (...lancamentos) => ({
  fin_ciclo: [
    { id: 1, inicio: '2026-09-15', fim: '2026-10-14', ...zero },
    { id: 2, inicio: '2026-10-15', fim: '2026-11-14', ...zero },
    { id: 3, inicio: '2026-11-15', fim: null, ...zero },
  ],
  fin: [lanc(1, 'Salário', '2026-10-15', 9000, { categ: 'Salário' }), ...lancamentos],
  fin_meta: [],
});

// O HTML do ciclo i, o texto sem tags e os blocos que o desenho mandou recolher.
async function desenhar(dados, i, idxHoje = 1) {
  const tela = carregarTela({ dados });

  await tela.bruto('carregarDados()');
  tela.bruto(`Estado.idxHoje = ${idxHoje}`);
  const recolhidos = [];

  tela.ctx.recolherBloco = (id) => recolhidos.push(id);
  tela.ctx.document.getElementById('ciclo').value = String(i);
  const html = tela.bruto('vCiclo()');

  return {
    tela,
    html,
    recolhidos,
    texto: html
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim(),
  };
}

const compra = (valor, extra = {}) =>
  lanc(5, 'Fone', '2026-10-16', valor, { cred: true, fatura: '2026-12-12', ...extra });

const aporte = lanc(8, 'Aporte', '2026-10-16', -500, { categ: 'Investimento' });

test('mostra no ciclo atual somente os créditos que pertencem ao ciclo seguinte', () => {
  const linhas = [
    { id: 1, cred: true, periodoIdx: 4 },
    { id: 2, cred: true, periodoIdx: 5 },
    { id: 3, cred: false, periodoIdx: 5 },
  ];

  assert.deepEqual(
    exibir(linhas, 4).map((r) => r.id),
    [2]
  );
});

test('não desloca créditos quando não existe uma competência seguinte', () => {
  assert.deepEqual(exibir([{ id: 1, cred: true, periodoIdx: 4 }], 4), []);
});

test('o título do Crédito mostra o saldo após antecipações da mesma fatura', () => {
  assert.equal(
    contexto.totalCreditoExibidoAposAntecipacoes([{ v: -2922.26 }], 500),
    -2422.26
  );
});

test('o único título de Crédito exibe o limite livre de cada cartão, com a garantia só no Nubank', async () => {
  const sem = await desenhar(dadosDe(compra(-150)), 1);

  assert.equal(sem.tela.rodar('LIMITE_CARTAO'), 3350);
  assert.equal(sem.tela.rodar('LIMITE_CARTAO_MP'), 1100);
  // Um título só, com o limite livre do Nubank (3.350 − 150) e o campo editável do Aprovado.
  assert.match(
    sem.texto,
    /Crédito .*Hoje Fatura R\$ 150,00 Usado R\$ 150,00 Livre R\$ 3\.200,00 de R\$/
  );
  assert.match(
    sem.html,
    /<input class=limiteCartaoEditavel data-limite-cartao="nubank" data-ciclo="1" style="width:9ch" value="3\.350,00" placeholder="0,00"/
  );
  assert.doesNotMatch(sem.html, /data-garantia-cartao|Garantido/); // sem aporte pago, sem garantia

  // Com um aporte pago, o guardado vira garantia: o campo dela aparece no próprio título, a largura
  // segue o valor ("500,00" + 1 = 7ch), e o limite do Nubank sobe pela garantia (3.350 + 500).
  const com = await desenhar(dadosDe(aporte, compra(-150)), 1);

  assert.match(
    com.html,
    /<input class=limiteCartaoEditavel data-garantia-cartao data-ciclo="1" style="width:7ch" value="500,00" placeholder="todo"/
  );
  assert.match(
    com.texto,
    /Livre R\$ 3\.700,00 de R\$ 3\.850,00 R\$ Aprovado \+ R\$ Garantido/
  );

  // Acima do limite: o aviso do título acende (só no ciclo que ainda não fechou).
  const acima = await desenhar(dadosDe(compra(-4000)), 1);

  assert.match(acima.texto, /Livre -R\$ 650,00 de R\$/);
  assert.match(
    acima.html,
    /<span class="alertaTitulo alertaLimite" role=img title="Acima do limite" aria-label="Gasto acima do limite">/
  );
  assert.match(
    sem.html,
    /<span class="alertaTitulo alertaLimite vazio" aria-hidden=true>/
  );

  const passado = await desenhar(
    dadosDe(lanc(6, 'Fone', '2026-09-16', -4000, { cred: true, fatura: '2026-11-12' })),
    0
  );

  assert.match(passado.html, /<span class="alertaTitulo alertaLimite vazio"/);
});

test('o CSS do título de Crédito define o campo editável e o aviso', () => {
  // CSS é texto: só a existência dos seletores que o HTML desenhado acima usa.
  for (const classe of [
    'limiteCartao',
    'limiteCartaoEditavel',
    'limiteCartaoRotulo',
    'alertaTitulo',
    'resumoTitulo',
    'resumoLinha',
  ])
    assert.ok(estilos.includes(`.${classe}`), classe);
});

test('títulos distinguem o retrato pago até hoje da previsão futura', async () => {
  // Ciclo atual: Hoje e Futuro, cada um com Saldo e Guardado.
  const atual = await desenhar(dadosDe(compra(-150, { pago: false })), 1);

  assert.match(
    atual.texto,
    /Débito .*Hoje Saldo R\$ 9\.000,00 Guardado R\$ 0,00 .*Futuro Saldo/
  );
  assert.match(
    atual.texto,
    /Crédito .*Hoje Fatura R\$ 0,00 Usado R\$ 0,00 .*Futuro Fatura R\$ 150,00 Usado R\$ 150,00/
  );
  assert.doesNotMatch(atual.texto, /Pago \+ aberto/);
  assert.match(atual.html, /class=resumoDados/);

  // Ciclo futuro: sem o retrato de hoje, só a previsão.
  const futuro = await desenhar(
    dadosDe(lanc(2, 'Luz', '2026-11-25', -100, { pago: false })),
    2
  );

  assert.doesNotMatch(futuro.texto, /Hoje/);
  assert.match(futuro.texto, /Débito .*Futuro Saldo/);

  // Saldo negativo após usar o guardado acende o aviso do Débito.
  const negativo = await desenhar(dadosDe(lanc(7, 'Carro', '2026-10-17', -20000)), 1);

  assert.match(
    negativo.html,
    /<span class="alertaTitulo alertaSaldo" role=img title="Saldo negativo" aria-label="Saldo negativo após usar o guardado">/
  );
  assert.match(atual.html, /<span class="alertaTitulo alertaSaldo vazio"/);

  // Grade do resumo (rótulo + dados) e, no celular, a faixa usa a largura toda. CSS é texto.
  assert.match(estilos, /grid-template-columns:\s*3\.65rem\s+minmax\(0,\s*1fr\)/);
  assert.match(
    estilosMobile,
    /\.resumoTitulo\s*\{\s*flex-basis:\s*100%;\s*margin-left:\s*0;/
  );
});

test('o título do Crédito do ciclo atual mantém Hoje mesmo quando a fatura vence depois', async () => {
  // A compra vence em dezembro (ciclo 2), mas a prévia do ciclo atual continua com Hoje.
  const { texto } = await desenhar(dadosDe(compra(-150)), 1);

  assert.match(texto, /Crédito .*Hoje Fatura R\$ 150,00/);
});

test('ciclo anterior ao atual troca o rótulo Hoje por Passado e mostra o fechamento daquele ciclo', async () => {
  // Setembro: entra 1.000 e sai 300 (guardado 700 no fechamento); hoje o saldo é outro.
  const dados = dadosDe(
    lanc(2, 'Salário', '2026-09-15', 1000, { categ: 'Salário' }),
    lanc(3, 'Luz', '2026-09-20', -300)
  );

  const passado = await desenhar(dados, 0);

  assert.match(passado.texto, /Débito .*Passado Saldo R\$ 0,00 Guardado R\$ 700,00/);
  assert.doesNotMatch(passado.texto, /Hoje|Futuro/);

  const atual = await desenhar(dados, 1);

  assert.match(atual.texto, /Débito .*Hoje Saldo R\$ 9\.700,00/);
  assert.doesNotMatch(atual.texto, /Passado/);

  // O título do Crédito de um ciclo passado mostra o total bruto da fatura, sem Hoje/Futuro.
  const credito = await desenhar(
    dadosDe(lanc(6, 'Fone', '2026-09-16', -4000, { cred: true, fatura: '2026-11-12' })),
    0
  );

  assert.match(credito.texto, /Crédito .*R\$ 4\.000,00 1 registro/);
  assert.doesNotMatch(credito.texto, /Crédito .*Hoje/);
  assert.match(
    regras,
    /não repete o retrato de agora.*mostra Saldo e Guardado acumulados até o fechamento daquele ciclo específico/
  );
});

test('navegar com ‹ › nunca recolhe Débito e Crédito; ao chegar no ciclo atual ou além, eles voltam a abrir', () => {
  const inicioNav = interacoes.indexOf('function navegaCiclo(');
  const trecho = interacoes.slice(inicioNav, interacoes.indexOf('\n}\n', inicioNav) + 3);

  const montar = (compDe) => {
    const elementos = {
      compDe: {
        value: compDe,
        options: ['', '-1', '0', '1', '2', '3'].map((value) => ({ value })),
      },
      compAte: { value: compDe },
    };

    const ctx = {
      Estado: { idxHoje: 2 },
      aberturas: 0,
      desenhos: 0,
      el: (id) => elementos[id],
      abrirBlocosFinanceiros: () => ctx.aberturas++,
      desenhar: () => ctx.desenhos++,
    };

    vm.runInNewContext(`${trecho}\nthis.navegaCiclo = navegaCiclo;`, ctx);

    return { ctx, elementos };
  };

  const ir = (de, direcao) => {
    const { ctx, elementos } = montar(de);

    ctx.navegaCiclo(direcao);

    return [elementos.compDe.value, ctx.aberturas, ctx.desenhos];
  };

  assert.deepEqual(ir('0', 1), ['1', 0, 1]); // ainda no histórico: não abre nada
  assert.deepEqual(ir('1', 1), ['2', 1, 1]); // chegou no ciclo atual: abre
  assert.deepEqual(ir('2', 1), ['3', 1, 1]); // além do atual: abre
  assert.deepEqual(ir('2', -1), ['1', 0, 1]); // voltando ao histórico: não mexe
  assert.match(regras, /Ciclos anteriores ao atual sempre ficam abertos e detalhados/);
  assert.match(
    regras,
    /navegar para o histórico, com Anterior ou selecionando o ciclo diretamente, nunca recolhe Débito nem Crédito/
  );
});

test('igualdade de valores não recolhe o crédito com lançamento real ainda aberto', async () => {
  // Hoje = Futuro e nada pendente: o Crédito recolhe e o Futuro some.
  const igual = await desenhar(dadosDe(compra(-150)), 1);

  assert.deepEqual(igual.recolhidos, ['cr']);
  assert.doesNotMatch(igual.texto, /Crédito .*Futuro/);

  // Compra ainda aberta: Hoje e Futuro diferem e nada é recolhido.
  const aberta = await desenhar(dadosDe(compra(-150, { pago: false })), 1);

  assert.deepEqual(aberta.recolhidos, []);
  assert.match(aberta.texto, /Crédito .*Futuro Fatura R\$ 150,00/);

  // Um débito aberto que compensa outro (+100 e −100) não muda o Crédito, que segue igual e recolhido.
  const compensa = await desenhar(
    dadosDe(
      lanc(2, 'Luz', '2026-10-25', -100, { pago: false }),
      lanc(3, 'Extra', '2026-10-26', 100, { pago: false, categ: 'Salário' })
    ),
    1
  );

  assert.deepEqual(compensa.recolhidos, ['cr']);
  assert.match(compensa.texto, /Débito .*Hoje .*Futuro/); // o Débito aberto segue com as duas faixas

  // Só o ciclo atual recolhe: o passado e o futuro não.
  assert.deepEqual((await desenhar(dadosDe(compra(-150)), 0)).recolhidos, []);
  assert.deepEqual((await desenhar(dadosDe(compra(-150)), 2)).recolhidos, []);
  assert.match(
    regras,
    /A igualdade de valores sozinha nunca basta: um lançamento aberto pode compensar outro e zerar a diferença por coincidência/
  );
  assert.match(
    regras,
    /cada bloco é avaliado separadamente[\s\S]*Hoje e Futuro forem iguais/
  );
});

test('documenta o cartão pelo dia do vencimento como regra provisória, com saída por migration', () => {
  // Decisão do mantenedor: dois cartões sem coluna nova. A identidade explícita continua
  // sendo o caminho quando os vencimentos coincidirem ou entrar um terceiro cartão.
  assert.match(
    regras,
    /Identificar o cartão pelo dia do vencimento é uma regra provisória/
  );
  assert.match(regras, /identificação explícita de cartão/);
  assert.match(decisoes, /identidade explícita de cartão em crédito e antecipação/);
  assert.match(decisoes, /Nome e categoria continuam sem identificar cartão/);
});
