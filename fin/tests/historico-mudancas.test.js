// Migration 27: histórico de mudanças em fin/fin_ciclo, escrito só por trigger e lido só
// pelo mantenedor. Conferência estática do SQL (a suíte não tem banco).
const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');

const sql = fs.readFileSync('migrations/27-historico-de-mudancas.sql', 'utf8');
const regras = fs.readFileSync('docs/REGRAS.md', 'utf8');
const DONO = '2f9bc201-9966-4f37-9963-2f4b9ddab849';

test('tabela de histórico com antes/depois, autor e momento', () => {
    assert.match(sql, /create table if not exists public\.fin_historico \(/);
    for (const coluna of ['em timestamptz not null default now\\(\\)', 'tabela text not null', 'linha_id integer', 'usuario uuid', 'antes jsonb', 'depois jsonb']) {
        assert.match(sql, new RegExp(coluna));
    }
    assert.match(sql, /check \(operacao in \('INSERT', 'UPDATE', 'DELETE'\)\)/);
});

test('trigger AFTER em fin e fin_ciclo, função SECURITY DEFINER com search_path vazio', () => {
    assert.match(sql, /create trigger fin_historico\s*\n\s*after insert or update or delete on public\.fin\s*\n\s*for each row execute function public\.registrar_historico\(\);/);
    assert.match(sql, /create trigger fin_ciclo_historico\s*\n\s*after insert or update or delete on public\.fin_ciclo\s*\n\s*for each row execute function public\.registrar_historico\(\);/);
    assert.match(sql, /security definer\s*\n\s*set search_path = ''/);
    assert.match(sql, /if tg_op = 'UPDATE' and linha_antes = linha_depois then return null; end if;/);
    assert.match(sql, /revoke execute on function public\.registrar_historico\(\) from public, anon, authenticated;/);
});

test('RLS: só o mantenedor lê; ninguém escreve pela API; anônimo sem acesso', () => {
    assert.match(sql, /alter table public\.fin_historico enable row level security;/);
    assert.match(sql, /revoke all on table public\.fin_historico from anon, authenticated;/);
    assert.match(sql, /grant select on table public\.fin_historico to authenticated;/);
    assert.match(sql, new RegExp(`for select to authenticated\\s*\\n\\s*using \\(\\(select auth\\.uid\\(\\)\\) = '${DONO}'::uuid\\);`));
    assert.doesNotMatch(sql, /for (insert|update|delete|all)\b/);
    assert.doesNotMatch(sql, /grant (insert|update|delete|all)/i);
});

test('não altera dados existentes e está documentada', () => {
    assert.doesNotMatch(sql, /^\s*(update|delete from|insert into public\.fin\b|alter table public\.fin\b|alter table public\.fin_ciclo\b)/im);
    assert.match(sql, /^begin;$/m);
    assert.match(sql, /^commit;$/m);
    assert.match(regras, /`migrations\/27-historico-de-mudancas\.sql` cria `public\.fin_historico`/);
});

test('migration 41: histórico também em fin_meta, com a função da 27 e no formato do DataGrip', () => {
    const sql41 = fs.readFileSync('migrations/41-historico-metas.sql', 'utf8');
    assert.match(sql41, /create trigger fin_meta_historico\s*\n\s*after insert or update or delete on public\.fin_meta\s*\n\s*for each row execute function public\.registrar_historico\(\);/);
    assert.match(sql41, /drop trigger if exists fin_meta_historico on public\.fin_meta;/);
    assert.match(sql41, /select 'public\.registrar_historico\(\)'::regprocedure;/);
    // Reaproveita a função: nenhum corpo plpgsql, nenhum bloco anônimo, nenhum ; em comentário.
    assert.doesNotMatch(sql41, /plpgsql|\$\$|create (or replace )?function/);
    assert.match(sql41, /^begin;$/m);
    assert.match(sql41, /^commit;$/m);
    for (const linha of sql41.split('\n').filter(l => l.trim().startsWith('--'))) assert.ok(!linha.includes(';'), linha);
    assert.doesNotMatch(sql41, /^\s*(update|delete from|insert into|alter table)/im);
    assert.match(regras, /`migrations\/41-historico-metas\.sql` liga o histórico também em `fin_meta`/);
});
