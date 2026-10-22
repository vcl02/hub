// Migration 39: leitura de fin, fin_ciclo e fin_meta só do mantenedor (a conta da Isabella saiu).
const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');

const migracao = fs.readFileSync('migrations/39-leitura-somente-dono.sql', 'utf8');
const regras = fs.readFileSync('docs/REGRAS.md', 'utf8');
const agentes = fs.readFileSync('AGENTS.md', 'utf8');
const UID_DONO = '2f9bc201-9966-4f37-9963-2f4b9ddab849';

test('troca a leitura aberta pela do dono nas três tabelas, sem tocar na escrita', () => {
    for (const tabela of ['fin', 'fin_ciclo', 'fin_meta']) {
        assert.match(migracao, new RegExp(`drop policy if exists ${tabela}_leitura_autenticada on public\\.${tabela};`));
        assert.match(migracao, new RegExp(`create policy ${tabela}_leitura_somente_dono on public\\.${tabela}\\n  for select to authenticated\\n  using \\(\\(select auth\\.uid\\(\\)\\) = '${UID_DONO}'::uuid\\);`));
    }
    assert.doesNotMatch(migracao, /using \(true\)|\bto (anon|public)\b|for (insert|update|delete|all)\b/);
});

test('formato do DataGrip: transação, pré-requisitos que falham sozinhos, idempotente', () => {
    assert.match(migracao, /^begin;$/m);
    assert.match(migracao, /^commit;$/m);
    assert.doesNotMatch(migracao, /do \$\$/);
    for (const linha of migracao.split('\n').filter(l => l.trim().startsWith('--'))) assert.ok(!linha.includes(';'), linha);
    assert.match(migracao, /select 'public\.fin'::regclass, 'public\.fin_ciclo'::regclass, 'public\.fin_meta'::regclass;/);
    for (const tabela of ['fin', 'fin_ciclo', 'fin_meta']) assert.match(migracao, new RegExp(`drop policy if exists ${tabela}_leitura_somente_dono on public\\.${tabela};`));
});

test('regra documentada', () => {
    assert.match(regras, /`migrations\/39-leitura-somente-dono\.sql` restringe a leitura de `fin`, `fin_ciclo` e `fin_meta` ao mantenedor/);
    assert.match(agentes, /O RLS de `fin`, `fin_ciclo` e `fin_meta` permite leitura e escrita somente ao mantenedor/);
});
