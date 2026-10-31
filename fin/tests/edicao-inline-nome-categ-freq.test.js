// Nome, Categoria e Frequência editáveis na própria célula: os editores rodam o código real num DOM falso (helpers/editor-inline)
// e o caminho na tela (tocar, Enter, linha sintética sem edição) é testado no navegador em navegador-linhas.test.js.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');

const regras = fs.readFileSync('docs/REGRAS.md', 'utf8');
// Os seis editores (Nome, Categoria, Frequência, Prio, Obs, Canal) saem do mesmo registrarEditorInline: o teste roda o
// código real num DOM falso e confere o que grava.
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

test('regra documentada em REGRAS.md', () => {
    assert.match(regras, /Nome, Categoria e Frequência também editam direto na tabela/);
    assert.match(regras, /Mensal, Semanal, Quinzenal, Semestral, Anual, ou vazio pra "sem recorrência"/);
});
