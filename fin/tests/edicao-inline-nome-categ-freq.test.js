// Regressão: Nome, Categoria e Frequência passam a ser editáveis clicando no próprio texto
// da célula, mesmo esquema de clique-pra-editar do Valor/Data/Pago (UPDATE imediato via
// atualizarLancamento). Clicar em outro ponto da linha continua só selecionando-a.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');

const tabelas = fs.readFileSync('js/tables.js', 'utf8');
const interacoes = fs.readFileSync('js/interactions.js', 'utf8');
const estilos = fs.readFileSync('css/dashboard.css', 'utf8');
const regras = fs.readFileSync('docs/REGRAS.md', 'utf8');

test('Nome, Categoria e Frequência só ficam clicáveis pra linha real', () => {
    assert.match(tabelas, /const celCateg = r => ehLinhaReal\(r\)\s*\n\s*\? `<span class="togCateg" data-tog-categ=/);
    assert.match(tabelas, /const celFreq = r => ehLinhaReal\(r\)\s*\n\s*\? `<span class="togFreq" data-tog-freq=/);
    assert.match(tabelas, /data-tog-nome="\$\{escapeHtml\(String\(r\.id\)\)\}"/);
});

test('celulasDaLinha usa celCateg/celFreq nas colunas categ/freq, celNome continua cobrindo Nome', () => {
    assert.match(tabelas, /chave == 'categ' \? celCateg\(r\)/);
    assert.match(tabelas, /chave == 'freq' \? celFreq\(r\)/);
    assert.match(tabelas, /chave == 'nome' \? celNome\(r\)/);
});

// Os seis editores (Nome, Categoria, Frequência, Prio, Obs, Canal) saem do mesmo
// registrarEditorInline: o teste roda o código real num DOM falso e confere o que grava.
const { editar } = require('./helpers/editor-inline');

test('Nome: grava aparado; vazio ou igual cancela sem gravar', async () => {
    let r = await editar('data-tog-nome', { nome: 'Mercado' }, '  Feira  ');
    assert.deepEqual(r.gravado, { nome: 'Feira' });
    assert.equal(r.lancamento.nome, 'Feira');
    assert.equal(r.controle, 'input');
    assert.ok(r.parouPropagacao);   // clique não vaza pra seleção da linha
    r = await editar('data-tog-nome', { nome: 'Mercado' }, '   ');
    assert.equal(r.gravado, null);
    assert.equal(r.lancamento.nome, 'Mercado');
});

test('Categoria: normaliza como o cadastro antes do UPDATE; vazio vira null', async () => {
    let r = await editar('data-tog-categ', { categ: 'Casa' }, ' casa ,  Mercado, Casa ');
    assert.deepEqual(r.gravado, { categ: 'casa, Mercado' });
    r = await editar('data-tog-categ', { categ: 'Casa' }, '');
    assert.deepEqual(r.gravado, { categ: null });
    assert.equal(r.lancamento.categ, null);
});

test('Frequência: select travado no vocabulário de RECORRENCIAS; grava ao escolher, vazio vira null', async () => {
    let r = await editar('data-tog-freq', { freq: 'Mensal' }, 'Anual', { evento: 'change' });
    assert.equal(r.controle, 'select');
    assert.match(r.html, /<select class=inpFreq>/);
    assert.match(r.html, /<option value="" >— Sem recorrência<\/option>/);
    assert.match(r.html, /<option value="Mensal" selected>Mensal<\/option>/);
    assert.deepEqual(r.gravado, { freq: 'Anual' });
    r = await editar('data-tog-freq', { freq: 'Mensal' }, '', { evento: 'change' });
    assert.deepEqual(r.gravado, { freq: null });
});

test('Esc cancela; simulação e linha simulada mudam só na memória', async () => {
    let r = await editar('data-tog-nome', { nome: 'Mercado' }, 'Feira', { evento: 'escape' });
    assert.equal(r.gravado, null);
    assert.equal(r.lancamento.nome, 'Mercado');
    r = await editar('data-tog-nome', { nome: 'Mercado' }, 'Feira', { simulando: true });
    assert.equal(r.gravado, null);
    assert.equal(r.lancamento.nome, 'Feira');
    r = await editar('data-tog-nome', { nome: 'Mercado', _sim: true }, 'Feira');
    assert.equal(r.gravado, null);
    assert.equal(r.lancamento.nome, 'Feira');
});

test('falha no banco avisa e não muda a linha', async () => {
    const r = await editar('data-tog-nome', { nome: 'Mercado' }, 'Feira', { falhar: true });
    assert.deepEqual(r.toasts, [['Falhou ao atualizar', 'RLS']]);
    assert.equal(r.lancamento.nome, 'Mercado');
});

test('estilos cobrem os três novos togs e inputs, reaproveitando o padrão visual existente', () => {
    assert.match(estilos, /\.togData, \.togNome, \.togCateg, \.togFreq, \.togPrio, \.togObs, \.togCanal \{/);
    assert.match(estilos, /\.inpValor, \.inpNome, \.inpCateg, \.inpFreq, \.inpPrio, \.inpObs, \.inpCanal \{/);
});

test('regra documentada em REGRAS.md', () => {
    assert.match(regras, /Nome, Categoria e Frequência também editam direto na tabela/);
    assert.match(regras, /Mensal, Semanal, Quinzenal, Semestral, Anual, ou vazio pra "sem recorrência"/);
});
