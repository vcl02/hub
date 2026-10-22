// Edge Function captura-nubank: autenticação pelo secret FIN_TOKEN (nunca no código, que fica
// num repositório público) e o mesmo cálculo de linhas de antes. Roda o index.ts de verdade:
// o Node remove os tipos e o `Deno` é simulado (env e serve); nada sai para a rede.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');
const vm = require('node:vm');
const { stripTypeScriptTypes } = require('node:module');

const fonte = fs.readFileSync('supabase/functions/captura-nubank/index.ts', 'utf8');
const TOKEN = 'a'.repeat(40);

function carregaFuncao(env = { FIN_TOKEN: TOKEN }) {
    let handler = null;
    const chamadas = [];
    const contexto = {
        Deno: {
            env: { get: chave => ({ SUPABASE_URL: 'https://exemplo.test', SUPABASE_SERVICE_ROLE_KEY: 'chave-teste', ...env })[chave] },
            serve: h => { handler = h; },
        },
        crypto: globalThis.crypto, TextEncoder, Response, Request, URL, Intl, Date, Math, Number, String, JSON, Array, Set, Promise, Uint8Array,
        fetch: async (url, opcoes) => {
            chamadas.push({ url, opcoes });
            return new Response(JSON.stringify(['Besteira', 'Lazer, Isabella']), { status: 200 });
        },
    };
    vm.createContext(contexto);
    const js = stripTypeScriptTypes(fonte.replace(/^import "jsr:[^"]+";$/m, ''));
    vm.runInContext(js, contexto);
    return { handler, chamadas };
}

const pedido = (token, { metodo = 'GET', caminho = '?acao=categorias', corpo } = {}) => new Request(
    `https://exemplo.test/functions/v1/captura-nubank${caminho}`,
    { method: metodo, headers: token == null ? {} : { 'x-fin-token': token }, body: corpo == null ? undefined : JSON.stringify(corpo) },
);

test('nenhum token nem hash de token no código', () => {
    assert.doesNotMatch(fonte, /\b[0-9a-f]{32,}\b/i);
    assert.doesNotMatch(fonte, /TOKEN_SHA256/);
    assert.match(fonte, /Deno\.env\.get\("FIN_TOKEN"\)/);
});

test('sem o secret FIN_TOKEN (ou curto demais), recusa tudo, mesmo com token vazio', async () => {
    for (const env of [{}, { FIN_TOKEN: '' }, { FIN_TOKEN: 'curto' }]) {
        const { handler, chamadas } = carregaFuncao(env);
        for (const token of [null, '', 'curto']) {
            const r = await handler(pedido(token));
            assert.equal(r.status, 503);
        }
        assert.equal(chamadas.length, 0);
    }
});

test('token ausente ou errado: 401 e nada chega ao banco', async () => {
    const { handler, chamadas } = carregaFuncao();
    for (const token of [null, '', 'b'.repeat(40), TOKEN.slice(0, -1), TOKEN + 'x']) {
        assert.equal((await handler(pedido(token))).status, 401);
    }
    assert.equal(chamadas.length, 0);
});

test('token certo: categorias com a vírgula interna como " + "', async () => {
    const { handler } = carregaFuncao();
    const r = await handler(pedido(TOKEN));
    assert.equal(r.status, 200);
    assert.equal(await r.text(), 'Besteira,Lazer + Isabella,A classificar');
});

test('dry_run devolve as linhas sem gravar (parcelas, centavos na 1ª, fatura pelo dia 5)', async () => {
    const { handler, chamadas } = carregaFuncao();
    const ts = Math.floor(Date.now() / 1000);
    const r = await handler(pedido(TOKEN, {
        metodo: 'POST', caminho: '',
        corpo: { tipo: 'despesa_credito', valor: '100,01', parcelas: 3, estab: 'LOJA', nome: 'Loja', categ: 'Lazer + Isabella', ts, dry_run: true },
    }));
    const corpo = await r.json();
    assert.equal(r.status, 200);
    assert.equal(corpo.dry_run, true);
    assert.deepEqual(corpo.linhas.map(l => l.valor), [-33.35, -33.33, -33.33]);
    assert.deepEqual(corpo.linhas.map(l => l.nome), ['Loja (1/3)', 'Loja (2/3)', 'Loja (3/3)']);
    assert.ok(corpo.linhas.every(l => l.categ === 'Lazer, Isabella' && l.cred === true && l.pago === true && /-12$/.test(l.fatura)));
    assert.equal(chamadas.length, 0);
});
