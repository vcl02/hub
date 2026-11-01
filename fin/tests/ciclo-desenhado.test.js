// O ciclo desenhado inteiro, sem navegador: a carga real (carregarDados, com um banco falso) e o desenho real (vCiclo) rodam
// e o teste confere o que sai na tela. Pega a ligação entre as contas e a tela (antes, regex procurando quem chama quem).
const assert = require('node:assert/strict');
const test = require('node:test');
const { carregarTela } = require('./helpers/tela-sem-navegador');

const l = (id, nome, data, valor, extra = {}) => ({ id, nome, data, valor, categ: 'Casa', cred: false, pago: true, fatura: null, freq: null, ...extra });
const base = (...lancamentos) => ({
    fin_ciclo: [{ id: 1, inicio: '2026-09-15', fim: '2026-10-14' }, { id: 2, inicio: '2026-10-15', fim: null }],
    fin: [l(1, 'Salário', '2026-10-15', 9000, { categ: 'Salário' }), ...lancamentos], fin_meta: []
});
const desenhar = (dados, ciclo = 1) => carregarTela({ dados }).desenharCiclo(ciclo);

test('débito atrasado (de um ciclo que já fechou, em aberto) aparece no ciclo de hoje, com o aviso Atrasado na faixa Hoje', async () => {
    const { texto } = await desenhar(base(l(3, 'Luz', '2026-10-10', -150, { pago: false })));
    assert.match(texto, /Luz/);
    assert.match(texto, /Atrasado −?\s*R\$\s150,00/);
    const pago = await desenhar(base(l(3, 'Luz', '2026-10-10', -150)));             // pago: fica no ciclo dele
    assert.doesNotMatch(pago.texto, /Atrasado|Luz/);
});

test('ciclo aberto (sem fim no banco) nunca mostra 31/12/9999: o período vai até a véspera do 1º dia do ciclo seguinte previsto', async () => {
    const { html, texto } = await desenhar(base());
    assert.doesNotMatch(html, /9999/);
    assert.match(texto, /15\/10\/2026 a 14\/11\/2026/);
});

const dadosComparacao = () => base(
    l(2, 'Aluguel', '2026-09-20', -2000, { categ: 'Moradia', freq: 'Mensal' }), l(3, 'Aluguel', '2026-10-20', -2100, { categ: 'Moradia', freq: 'Mensal' }),
    l(4, 'Antecipação', '2026-10-18', -100, { categ: 'Antecipação fatura', fatura: '2026-11-12' }));

test('comparar dois ciclos: por categoria, sem a antecipação de fatura (transferência) e sem linha de abatimento inventada', async () => {
    const { texto } = await carregarTela({ dados: dadosComparacao() }).desenharComparacao(0, 1);
    assert.match(texto, /Moradia -R\$\s2\.000,00 -R\$\s2\.100,00 -R\$\s4\.100,00/);
    assert.doesNotMatch(texto, /Antecipação|Abatimento de fatura/);
    assert.match(texto, /Acabou em Setembro Começou em Outubro Único em Outubro/);
});

test('comparar: a linha Total soma cada ciclo e o total geral, com as mesmas colunas das outras linhas', async () => {
    const { html, texto } = await carregarTela({ dados: dadosComparacao() }).desenharComparacao(0, 1);
    assert.match(texto, /Total -R\$\s2\.000,00 R\$\s2\.100,00 R\$\s100,00$/);       // setembro, outubro (9.000 − 2.100 − 4.800 aportado), soma
    const celulas = tr => (tr.match(/<td/g) || []).length;
    const linhas = html.split('<tr').slice(1);
    const total = linhas.find(tr => />Total</.test(tr)), moradia = linhas.find(tr => /Moradia/.test(tr));
    assert.equal(celulas(total), celulas(moradia));
});

test('carga sem fin_ciclo no formato de ciclos: para com a instrução da migration que falta', async () => {
    const semTabela = carregarTela({ dados: { fin: [], fin_meta: [] } });
    await assert.rejects(semTabela.bruto('carregarDados()'), /Tabela de ciclos indisponível .*Aplique migrations\/25-tabela-fin-ciclo\.sql e 26/);
    const formatoAntigo = carregarTela({ dados: { fin: [], fin_ciclo: [{ id: 1, ancora_id: 5 }], fin_meta: [] } });
    await assert.rejects(formatoAntigo.bruto('carregarDados()'), /fin_ciclo ainda sem início\/fim\. Aplique migrations\/26/);
    const t = carregarTela({ dados: base() });
    await t.bruto('carregarDados()');
    assert.deepEqual(t.rodar('[...Estado.limitesPorCiclo.keys()]'), [1, 2]);   // as escolhas de cada ciclo (tetos, Aprovado) pela linha dele
});

test('colunas que dependem do banco: Pra sempre só com a coluna no banco (migration 31), depois de Comprometido; Obs e Canal sempre', async () => {
    const colunas = async dados => { const t = carregarTela({ dados }); await t.bruto('carregarDados()'); return { cols: t.rodar("colunasAtivas('debito').map(c => c[0])"), cab: t.rodar("cabecalhoTabela('debito')") }; };
    const sem = await colunas(base());
    assert.deepEqual([sem.cols.includes('pra_sempre'), sem.cols.includes('obs'), sem.cols.includes('canal')], [false, true, true]);
    const com = await colunas(base(l(2, 'Internet', '2026-10-16', -100, { pra_sempre: true })));
    assert.equal(com.cols[com.cols.indexOf('comprometido') + 1], 'pra_sempre');
    assert.match(com.cab, /title="Isso se repete sem data pra acabar\?"/);
});

test('filtro do teto (tocar no nome Besteira): a tabela mostra só o que conta no teto, junto com a busca', async () => {
    const t = carregarTela({ dados: base(l(2, 'Café', '2026-10-16', -12, { categ: 'Besteira' }), l(3, 'Luz', '2026-10-17', -150)) });
    await t.bruto('carregarDados()');
    const nomes = filtro => t.rodar(`(Estado.filtroTeto = ${JSON.stringify(filtro)}, renderTabela(Estado.lancamentos, 'db', true).match(/data-tog-nome="\\d+">[^<]+/g).map(x => x.split('>')[1]))`);
    assert.deepEqual(nomes(null).sort(), ['Café', 'Luz', 'Salário']);
    assert.deepEqual(nomes('besteira'), ['Café']);
});

test('rede instável: 12 s por tentativa e 3 tentativas nas operações que podem repetir', () => {
    const t = carregarTela();
    assert.deepEqual(t.rodar('[LIMITE_REQUISICAO_MS, TENTATIVAS_IDEMPOTENTES]'), [12000, 3]);
});

test('saldo por dia: o débito atrasado sai hoje (não na data antiga); a recorrência duplicada no ciclo ignora o atrasado', async () => {
    const ciclos = [{ id: 1, inicio: '2026-09-15', fim: '2026-10-14' }, { id: 2, inicio: '2026-10-15', fim: '2026-11-14' }, { id: 3, inicio: '2026-11-15', fim: null }];
    const salario = l(1, 'Salário', '2026-10-15', 9000, { categ: 'Salário' });
    const abrir = async fin => { const t = carregarTela({ dados: { fin_ciclo: ciclos, fin: [salario, ...fin], fin_meta: [] } }); await t.bruto('carregarDados()'); t.ctx.document.getElementById('ciclo').value = '1'; return t; };
    let t = await abrir([l(2, 'Luz', '2026-09-25', -150, { pago: false, freq: 'Mensal' }), l(3, 'Luz', '2026-10-25', -150, { pago: false, freq: 'Mensal' })]);
    assert.deepEqual(t.rodar('saldoPorDia()'), { '2026-10-15': 9000, '2026-10-20': 8850, '2026-10-25': 8700, '2026-11-14': 0 });   // hoje é 20/10
    assert.doesNotMatch(t.bruto('vCiclo()'), /corrigeDupData/);                 // o atrasado de setembro não conta como duplicata
    t = await abrir([l(2, 'Luz', '2026-10-16', -150, { freq: 'Mensal' }), l(3, 'Luz', '2026-11-10', -150, { freq: 'Mensal' })]);
    assert.match(t.bruto('vCiclo()'), /data-corrige-dup="3"/);                  // duas no mesmo ciclo: a mais recente ganha o ↷
});

test('a tabela do banco é a "fin": a carga lê /rest/v1/fin (nunca o nome antigo, lancamentos)', async () => {
    const t = carregarTela({ dados: base() });
    const lidas = [];
    const fetchReal = t.ctx.fetch;
    t.ctx.fetch = (url, ...r) => { lidas.push(new URL(url).pathname); return fetchReal(url, ...r); };
    await t.bruto('carregarDados()');
    assert.equal(t.rodar('TABELA_FIN'), 'fin');
    assert.ok(lidas.includes('/rest/v1/fin') && !lidas.some(p => /lancamentos/.test(p)), JSON.stringify(lidas));
});

test('constantes de regra: a série vai até 31/12/2032', () => {
    assert.equal(carregarTela().rodar('DATA_LIMITE_RECORRENCIA'), '2032-12-31');
});

test('o desenho do ciclo: cada tabela num bloco com título; guarda os dados dos cartões para os botões e o modal', async () => {
    const t = carregarTela({ dados: base(l(5, 'Fone', '2026-10-18', -150, { cred: true, fatura: '2026-11-13' })) });
    const { html } = await t.desenharCiclo(1);
    assert.match(html, /<div class=blk data-bloco=db><h3>/);
    assert.deepEqual(t.rodar('Object.keys(Estado.cartoesDoCiclo.cartoes).sort()'), ['mp', 'nubank']);
});

test('na tabela, a compra do Mercado Pago marca a linha inteira (classe mp); a do Nubank não', async () => {
    const t = carregarTela({ dados: base(l(5, 'Fone', '2026-09-18', -150, { cred: true, fatura: '2026-10-13' }), l(6, 'Livro', '2026-09-18', -80, { cred: true, fatura: '2026-10-12' })) });
    await t.bruto('carregarDados()');
    const html = t.rodar("renderTabela(Estado.lancamentos.filter(r => r.cred), 'cr', true)");
    assert.match(html, /<tr class="mp [^"]*"[^>]*data-sid="5"/);
    assert.doesNotMatch(html, /<tr class="mp [^"]*"[^>]*data-sid="6"/);
});

test('teto de Besteira e Isabella editável no título de cada ciclo, inclusive os passados (o campo diz de qual ciclo é)', async () => {
    for (const i of [0, 1]) {
        const { html } = await carregarTela({ dados: base() }).desenharCiclo(i);
        for (const c of ['besteira', 'isabella']) assert.match(html, new RegExp(`<input class=limiteCartaoEditavel data-limite-categoria="${c}" data-ciclo="${i}"[^>]*title="Editar limite de \\w+ deste ciclo`), `${c} no ciclo ${i}`);
    }
});

test('a linha da fatura no Débito é uma conta mensal, em aberto e comprometida; a de um ciclo que fechou vem como Atrasado', async () => {
    const { texto } = await desenhar(base(l(5, 'Livro', '2026-09-18', -80, { cred: true, fatura: '2026-10-12' })));
    assert.match(texto, /Fatura Nubank Atrasado − R\$\s80,00 Fatura Mensal Aberto — Comprometido/);
});

test('o gráfico de gastos deixa Contabilidade de fora por padrão', () => {
    assert.equal(carregarTela().rodar('CATEGORIA_EXCLUIDA_GRAFICO_PADRAO'), 'Contabilidade');
});

test('Livre Hoje do Nubank: só antecipação paga libera limite; garantia só com investimento pago', async () => {
    const fone = l(5, 'Fone', '2026-10-16', -1000, { cred: true, fatura: '2026-11-12' });
    const livre = async (...extra) => { const t = carregarTela({ dados: base(fone, ...extra) }); await t.bruto('carregarDados()'); return t.rodar("limiteLivreHojeDoCartao(Estado.lancamentos, 1, 'nubank')"); };
    const sem = await livre();
    const antecipacao = pago => l(9, 'Antecipação', '2026-10-17', -400, { categ: 'Antecipação fatura', fatura: '2026-11-12', pago });
    assert.equal(await livre(antecipacao(true)), sem + 400);
    assert.equal(await livre(antecipacao(false)), sem);                          // em aberto: ainda não pagou o cartão
    const aporte = pago => l(8, 'Aporte', '2026-10-16', -500, { categ: 'Investimento', pago });
    assert.equal(await livre(aporte(true)), sem + 500);                          // garantia do Nubank: o investido pago
    assert.equal(await livre(aporte(false)), sem);
});
