// Regressão de segurança: só o mantenedor grava em fin; outras contas logadas só leem.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');

const migracao = fs.readFileSync('migrations/20-rls-somente-dono-escreve.sql', 'utf8');
const regras = fs.readFileSync('docs/REGRAS.md', 'utf8');
const UID_DONO = '2f9bc201-9966-4f37-9963-2f4b9ddab849';

// Separa cada "create policy ... ;" para validar papel, comando e condição juntos.
const policies = [...migracao.matchAll(/create policy (\w+) on public\.fin([\s\S]*?);/g)]
    .map(([, nome, corpo]) => ({ nome, corpo: corpo.replace(/\s+/g, ' ') }));
const policy = comando => policies.filter(p => new RegExp(`for ${comando} `).test(p.corpo));

test('remove as policies antigas, inclusive o UPDATE aberto ao papel public', () => {
    ['leitura logada', 'usuarios autenticados podem inserir',
        'usuarios podem atualizar seus lancamentos', 'usuarios autenticados podem excluir lancamentos']
        .forEach(nome => assert.match(migracao, new RegExp(`drop policy if exists "${nome}" on public\\.fin;`)));
});

test('anônimo perde todo privilégio na tabela e nas sequências', () => {
    assert.match(migracao, /revoke all on table public\.fin from anon;/);
    assert.match(migracao, /revoke all on all sequences in schema public from anon;/);
    assert.equal(policies.some(p => /\bto (anon|public)\b/.test(p.corpo)), false);
});

test('leitura vale para qualquer conta logada', () => {
    const [leitura, ...extras] = policy('select');
    assert.equal(extras.length, 0);
    assert.match(leitura.corpo, /to authenticated using \(true\)/);
});

test('inserir, atualizar e excluir exigem o uid do mantenedor', () => {
    const condicao = `(select auth.uid()) = '${UID_DONO}'::uuid`;
    ['insert', 'update', 'delete'].forEach(comando => {
        const encontradas = policy(comando);
        assert.equal(encontradas.length, 1, `uma policy de ${comando}`);
        const { corpo } = encontradas[0];
        assert.match(corpo, /to authenticated/);
        if (comando !== 'insert') assert.ok(corpo.includes(`using (${condicao})`), `${comando} filtra linhas pelo dono`);
        if (comando !== 'delete') assert.ok(corpo.includes(`with check (${condicao})`), `${comando} valida a linha gravada`);
    });
});

test('fecha as funções expostas e remove sobras do modelo antigo', () => {
    assert.match(migracao, /revoke execute on function public\.rls_auto_enable\(\) from public, anon, authenticated;/);
    assert.match(migracao, /drop function if exists public\.fn_diferenca_ciclos\(text, text\);/);
    assert.match(migracao, /drop extension if exists btree_gist;/);
    assert.match(migracao, /^begin;$/m);
    assert.match(migracao, /^commit;$/m);
});

test('regra documentada em REGRAS.md', () => {
    assert.match(regras, /migrations\/20-rls-somente-dono-escreve\.sql/);
    assert.match(regras, /somente o mantenedor grava/);
});
