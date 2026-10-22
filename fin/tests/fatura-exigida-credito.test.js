// Regressão: restaura em fin.fatura a validação que a migration 06 fazia em fatura_id e
// que caiu junto quando essa coluna foi removida (migration 10), sem nunca ser recriada.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');

const migracao = fs.readFileSync('migrations/21-restaurar-fatura-exigida-credito.sql', 'utf8');
const regras = fs.readFileSync('docs/REGRAS.md', 'utf8');

test('crédito sem fatura viola a constraint; crédito com fatura passa', () => {
    assert.match(migracao, /add constraint fin_credito_exige_fatura/);
    assert.match(migracao, /\(cred and fatura is not null\)/);
});

test('débito comum não pode preencher fatura, mas antecipação de fatura pode', () => {
    assert.match(migracao, /not cred and \(fatura is null or \(categ ilike '%antecipa%' and categ ilike '%fatura%'\)\)/);
});

test('a constraint nova roda em fin.fatura, não na fatura_id removida há tempos (só o comentário histórico cita o nome antigo)', () => {
    assert.match(migracao, /alter table public\.fin\s*\n\s*add constraint/);
    const corpoDaConstraint = migracao.slice(migracao.indexOf('add constraint'));
    assert.doesNotMatch(corpoDaConstraint, /fatura_id/);
});

test('regra documentada em REGRAS.md', () => {
    assert.match(regras, /migrations\/21-restaurar-fatura-exigida-credito\.sql/);
    assert.match(regras, /recria em `fin\.fatura` a constraint perdida da migration 06/);
});
