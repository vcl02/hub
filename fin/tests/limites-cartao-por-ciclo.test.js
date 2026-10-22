// Regressão: Aprovado de cada cartão e quanto do guardado vira garantia do Nubank são
// definidos por ciclo, na linha do ciclo em fin_ciclo (migrations 25/26), e herdam do ciclo
// anterior até outro ciclo definir outro. A garantia usada nunca passa do guardado real.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');
const vm = require('node:vm');

const ler = arquivo => fs.readFileSync(arquivo, 'utf8');
const regras = ler('docs/REGRAS.md');
const migration = ler('migrations/24-aprovado-garantia-por-ciclo.sql');

function carrega(linhasCiclo) {
    const estado = {
        idxHoje: 0, faturas: [],
        ciclos: linhasCiclo.map((a, i) => ({ id: `c:${a.id}`, cicloId: a.id, ini: `2026-1${i}-05`, fat: `2026-1${i}-28` })),
        lancamentos: linhasCiclo,
        // Cada item de `linhasCiclo` faz o papel de uma linha de fin_ciclo.
        limitesPorCiclo: new Map(linhasCiclo.map(a => [a.id, { ...a }])),
    };
    const contexto = { Estado: estado, SALDO_DESDE: '2026-01-01', MESES: [], document: { getElementById: () => ({}) }, setTimeout, clearTimeout };
    vm.createContext(contexto);
    ['js/domain.js', 'js/shared.js', 'js/finance.js'].forEach(arquivo => vm.runInContext(ler(arquivo), contexto));
    vm.runInContext('globalThis.r = { aprovadoDoCiclo, garantiaDoCiclo, limiteCartaoTotal, limiteCartaoLivre };', contexto);
    return contexto.r;
}

test('Aprovado herda do ciclo anterior; sem nenhum definido usa o padrão do cartão', () => {
    const r = carrega([
        { id: 1, nome: 'Ciclo' },
        { id: 2, nome: 'Ciclo', limite_aprovado_nubank: 5000, limite_aprovado_mp: '1500' },
        { id: 3, nome: 'Ciclo' },
        { id: 4, nome: 'Ciclo', limite_aprovado_nubank: 6000 },
    ]);
    assert.equal(r.aprovadoDoCiclo(0, 'nubank'), 3350);
    assert.equal(r.aprovadoDoCiclo(0, 'mp'), 1100);
    assert.equal(r.aprovadoDoCiclo(1, 'nubank'), 5000);
    assert.equal(r.aprovadoDoCiclo(2, 'nubank'), 5000);   // herdado
    assert.equal(r.aprovadoDoCiclo(2, 'mp'), 1500);       // herdado
    assert.equal(r.aprovadoDoCiclo(3, 'nubank'), 6000);
    assert.equal(r.aprovadoDoCiclo(3, 'mp'), 1500);
});

test('garantia escolhida herda e nunca passa do guardado; sem escolha é todo o guardado', () => {
    const r = carrega([
        { id: 1, nome: 'Ciclo' },
        { id: 2, nome: 'Ciclo', limite_garantia_nubank: 2000 },
        { id: 3, nome: 'Ciclo' },
        { id: 4, nome: 'Ciclo', limite_garantia_nubank: 0 },
    ]);
    assert.deepEqual({ ...r.garantiaDoCiclo(0, 5000) }, { escolhida: null, disponivel: 5000, efetiva: 5000 });
    assert.equal(r.garantiaDoCiclo(1, 5000).efetiva, 2000);
    assert.equal(r.garantiaDoCiclo(1, 1500).efetiva, 1500);   // não garante mais que o guardado
    assert.equal(r.garantiaDoCiclo(2, 5000).efetiva, 2000);   // herdada
    assert.equal(r.garantiaDoCiclo(3, 5000).efetiva, 0);      // zero é escolha válida
    assert.equal(r.garantiaDoCiclo(0, -300).efetiva, 0);      // guardado negativo não reduz
});

test('teto usa o Aprovado do ciclo; Mercado Pago nunca soma garantia', () => {
    const r = carrega([{ id: 1, nome: 'Ciclo' }]);
    assert.equal(r.limiteCartaoTotal(2000, 'nubank', 5000), 7000);
    assert.equal(r.limiteCartaoTotal(2000, 'mp', 1500), 1500);
    assert.equal(r.limiteCartaoTotal(2000), 3350 + 2000);     // padrão sem Aprovado do ciclo
    assert.equal(r.limiteCartaoLivre([], {}, 0, -Infinity, 'mp', 900), 900);
});

test('migration 24 só adiciona colunas nulas e não negativas na própria fin', () => {
    ['limite_aprovado_nubank', 'limite_aprovado_mp', 'limite_garantia_nubank'].forEach(coluna => {
        assert.match(migration, new RegExp(`add column if not exists ${coluna} numeric\\(12, 2\\);`));
        assert.match(migration, new RegExp(`check \\(${coluna} is null or ${coluna} >= 0\\)`));
    });
    assert.doesNotMatch(migration, /^\s*(create table|create policy|grant)\b/im);
});

test('regra documentada em REGRAS.md', () => {
    assert.match(regras, /O Aprovado de cada cartão e a Garantia do Nubank são definidos por ciclo/);
    assert.match(regras, /a garantia usada é o valor escolhido, nunca acima do guardado real/);
    assert.match(regras, /`migrations\/24-aprovado-garantia-por-ciclo\.sql`/);
});
