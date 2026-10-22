// Regressão: as escolhas por ciclo (tetos Besteira/Isabella, Aprovado, Garantia) moram em
// public.fin_ciclo, uma linha por ciclo. A migration 25 criou a tabela (ainda ligada ao
// "Faturamento PJ") copiando o que estava nas colunas de fin (23/24); o acesso segue a
// migration 20. Depois da 26 (ver ciclo-inicio-fim.test.js) o app grava por id da linha.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');
const vm = require('node:vm');

const ler = arquivo => fs.readFileSync(arquivo, 'utf8');
const migracao = ler('migrations/25-tabela-fin-ciclo.sql');
const api = ler('js/supabase-api.js');
const regras = ler('docs/REGRAS.md');
const UID_DONO = '2f9bc201-9966-4f37-9963-2f4b9ddab849';
const COLUNAS = ['limite_besteira', 'limite_isabella', 'limite_aprovado_nubank', 'limite_aprovado_mp', 'limite_garantia_nubank'];

test('fin_ciclo: uma linha por ciclo, ligada à âncora e apagada junto com ela', () => {
    assert.match(migracao, /create table if not exists public\.fin_ciclo \(\s*\n\s*ancora_id integer primary key references public\.fin\(id\) on delete cascade,/);
    COLUNAS.forEach(coluna => assert.match(migracao,
        new RegExp(`${coluna} numeric\\(12, 2\\) check \\(${coluna} is null or ${coluna} >= 0\\)`)));
});

test('migração de dados: copia só "Faturamento PJ" e aborta se houver valor em outra linha', () => {
    assert.match(migracao, /if existentes = 0 then[\s\S]*?return;/);
    assert.match(migracao, /if existentes <> 5 then\s*\n\s*raise exception/);
    assert.match(migracao, /where trim\(coalesce\(nome, ''\)\) <> 'Faturamento PJ'[\s\S]*?raise exception '% linha\(s\) fora de "Faturamento PJ"/);
    assert.match(migracao, /insert into public\.fin_ciclo[\s\S]*?where trim\(coalesce\(nome, ''\)\) = 'Faturamento PJ'[\s\S]*?on conflict \(ancora_id\) do nothing/);
    // A cópia vem antes da remoção das colunas, tudo na mesma transação.
    assert.ok(migracao.indexOf('insert into public.fin_ciclo') < migracao.indexOf('drop column if exists limite_besteira'));
    COLUNAS.forEach(coluna => assert.match(migracao, new RegExp(`alter table public\\.fin drop column if exists ${coluna};`)));
    assert.match(migracao, /^begin;$/m);
    assert.match(migracao, /^commit;$/m);
});

test('acesso igual ao de fin: anônimo nada, leitura logada, escrita só do mantenedor', () => {
    assert.match(migracao, /alter table public\.fin_ciclo enable row level security;/);
    assert.match(migracao, /revoke all on table public\.fin_ciclo from anon;/);
    const policies = [...migracao.matchAll(/create policy (\w+) on public\.fin_ciclo([\s\S]*?);/g)]
        .map(([, nome, corpo]) => ({ nome, corpo: corpo.replace(/\s+/g, ' ') }));
    const de = comando => policies.filter(p => p.corpo.includes(`for ${comando} `));
    assert.match(de('select')[0].corpo, /to authenticated using \(true\)/);
    const condicao = `(select auth.uid()) = '${UID_DONO}'::uuid`;
    ['insert', 'update', 'delete'].forEach(comando => {
        assert.equal(de(comando).length, 1);
        assert.match(de(comando)[0].corpo, /to authenticated/);
    });
    assert.ok(de('update')[0].corpo.includes(`using (${condicao}) with check (${condicao})`));
    assert.equal(policies.some(p => /\bto (anon|public)\b/.test(p.corpo)), false);
});

function carregaApi(fetch) {
    const inicio = api.indexOf('const LIMITE_REQUISICAO_MS');
    const fim = api.indexOf('async function carregarDados()');
    const chamadas = [];
    const contexto = {
        API: 'https://fin.supabase.test', KEY: 'chave', TABELA_FIN: 'fin', TABELA_FIN_CICLO: 'fin_ciclo', TAMANHO_LOTE_SUPABASE: 2,
        encodeURIComponent, setTimeout, clearTimeout, AbortController, normalizaCategorias: c => c,
        fetch: (url, opcoes) => { chamadas.push({ url, opcoes }); return fetch(url, opcoes); },
        sb: { auth: { getSession: async () => ({ data: { session: { access_token: 't' } } }), refreshSession: async () => {} } },
    };
    vm.createContext(contexto);
    vm.runInContext(`${api.slice(inicio, fim)}\nglobalThis.api = { salvarLimiteDoCiclo, buscar };`, contexto);
    return { api: contexto.api, chamadas };
}
const resposta = corpo => ({ ok: true, status: 200, text: async () => JSON.stringify(corpo) });

test('grava a escolha na própria linha do ciclo (PATCH por id), mudando só a coluna enviada', async () => {
    const { api: a, chamadas } = carregaApi(() => resposta([{ id: 7, limite_garantia_nubank: 500 }]));
    const linha = await a.salvarLimiteDoCiclo(7, 'limite_garantia_nubank', 500);
    assert.equal(linha.limite_garantia_nubank, 500);
    assert.equal(chamadas[0].url, 'https://fin.supabase.test/rest/v1/fin_ciclo?id=eq.7');
    assert.equal(chamadas[0].opcoes.method, 'PATCH');
    assert.deepEqual(JSON.parse(chamadas[0].opcoes.body), { limite_garantia_nubank: 500 });
});

test('linha não devolvida (RLS) é erro, não sucesso silencioso', async () => {
    const { api: a } = carregaApi(() => resposta([]));
    await assert.rejects(a.salvarLimiteDoCiclo(7, 'limite_besteira', 300), /limite não gravado/);
});

test('fin_ciclo pagina por id, como fin', async () => {
    const { api: a, chamadas } = carregaApi(url => resposta(url.includes('id=gt.') ? [{ id: 9 }] : [{ id: 3 }, { id: 5 }]));
    const linhas = await a.buscar('fin_ciclo');
    assert.equal(linhas.length, 3);
    assert.match(chamadas[0].url, /order=id\.asc&limit=2$/);
    assert.match(chamadas[1].url, /&id=gt\.5$/);
});

test('sem fin_ciclo no formato de ciclos, a carga para com a instrução das migrations', () => {
    assert.match(api, /throw Error\(`Tabela de ciclos indisponível \(\$\{err\.message\}\)\. Aplique migrations\/25-tabela-fin-ciclo\.sql e 26-ciclo-com-inicio-e-fim\.sql\.`\);/);
    assert.match(api, /if \(linhasCiclo\.length && !\('inicio' in linhasCiclo\[0\]\)\) \{/);
    assert.match(api, /Estado\.limitesPorCiclo = new Map\(linhasCiclo\.map\(linha => \[linha\.id, linha\]\)\);/);
});

test('regra documentada em REGRAS.md', () => {
    assert.match(regras, /`migrations\/25-tabela-fin-ciclo\.sql` cria `public\.fin_ciclo`/);
    assert.match(regras, /na própria linha do ciclo em `fin_ciclo`/);
});
