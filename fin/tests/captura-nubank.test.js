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

function carregaFuncao(env = { FIN_TOKEN: TOKEN }, responde = null) {
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
            if (responde) return responde(url, opcoes);
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

// Atalhos (fin_atalho, migration 42): auto lança só com atalho; lembrar grava o atalho depois.
function bancoFalso({ atalhos = [], falhaLembrar = false } = {}) {
    return (url, opcoes) => {
        if (url.includes('/rest/v1/fin_atalho?select=')) return new Response(JSON.stringify(atalhos), { status: 200 });
        if (url.includes('/rest/v1/fin_atalho?on_conflict=chave')) return new Response(falhaLembrar ? 'erro' : '', { status: falhaLembrar ? 500 : 201 });
        if (url.endsWith('/rest/v1/fin')) return new Response(JSON.stringify(JSON.parse(opcoes.body).map((_, i) => ({ id: 100 + i }))), { status: 201 });
        return new Response('inesperado', { status: 500 });
    };
}
const compra = extra => ({ tipo: 'despesa_credito', valor: '12.5', parcelas: '1', estab: 'NAQUELE  CAFÉ COMERCIO', ts: Math.floor(Date.now() / 1000), ...extra });

test('auto sem atalho: lancado false e nada gravado em fin', async () => {
    const { handler, chamadas } = carregaFuncao(undefined, bancoFalso());
    const r = await handler(pedido(TOKEN, { metodo: 'POST', caminho: '', corpo: compra({ auto: true }) }));
    assert.deepEqual(await r.json(), { ok: true, lancado: false });
    assert.equal(chamadas.length, 1);
    assert.match(chamadas[0].url, /fin_atalho\?select=chave,nome,categ,parcelas$/);
    // Atalho de outro lugar não serve.
    const { handler: h2 } = carregaFuncao(undefined, bancoFalso({ atalhos: [{ chave: 'padaria do ze', nome: 'Pão', categ: 'Alimentação', parcelas: 1 }] }));
    assert.equal((await (await h2(pedido(TOKEN, { metodo: 'POST', caminho: '', corpo: compra({ auto: true }) }))).json()).lancado, false);
});

test('auto: o atalho vale se o trecho está em qualquer parte do nome, sem ligar pra acento, maiúscula, espaço ou pontuação', async () => {
    const cafe = { chave: 'naquele cafe', nome: 'Café', categ: 'Besteira', parcelas: 1 };
    for (const estab of ['NAQUELE  CAFÉ COMERCIO', 'SUMUP *NAQUELE CAFE', 'PAG*NaqueleCafe LTDA', 'naquele-café', 'Naquele Café']) {
        const { handler } = carregaFuncao(undefined, bancoFalso({ atalhos: [cafe] }));
        const corpo = await (await handler(pedido(TOKEN, { metodo: 'POST', caminho: '', corpo: compra({ auto: true, estab }) }))).json();
        assert.equal(corpo.lancado, true, estab);
        assert.equal(corpo.nome, 'Café', estab);
    }
    // Chave gravada no formato antigo (com acento ou pontuação) também acha.
    const { handler: h2 } = carregaFuncao(undefined, bancoFalso({ atalhos: [{ ...cafe, chave: 'NAQUELE CAFÉ' }] }));
    assert.equal((await (await h2(pedido(TOKEN, { metodo: 'POST', caminho: '', corpo: compra({ auto: true, estab: 'SUMUP*NAQUELE CAFE' }) }))).json()).lancado, true);
    // Dois atalhos servem: ganha o mais longo (o mais específico).
    const atalhos = [cafe, { chave: 'naquele cafe comercio', nome: 'Café da loja', categ: 'Alimentação', parcelas: 1 }];
    const { handler: h3 } = carregaFuncao(undefined, bancoFalso({ atalhos }));
    assert.equal((await (await h3(pedido(TOKEN, { metodo: 'POST', caminho: '', corpo: compra({ auto: true }) }))).json()).nome, 'Café da loja');
    const { handler: h4 } = carregaFuncao(undefined, bancoFalso({ atalhos }));
    assert.equal((await (await h4(pedido(TOKEN, { metodo: 'POST', caminho: '', corpo: compra({ auto: true, estab: 'NAQUELE CAFE SHOPPING' }) }))).json()).nome, 'Café');
});

test('auto com atalho: lança com nome, categoria e parcelas do atalho', async () => {
    const { handler, chamadas } = carregaFuncao(undefined, bancoFalso({ atalhos: [{ chave: 'naquele cafe comercio', nome: 'Café', categ: 'Besteira', parcelas: 1 }] }));
    const r = await handler(pedido(TOKEN, { metodo: 'POST', caminho: '', corpo: compra({ auto: true }) }));
    const corpo = await r.json();
    assert.equal(corpo.lancado, true);
    assert.equal(corpo.nome, 'Café');
    assert.equal(corpo.categ, 'Besteira');
    const linhas = JSON.parse(chamadas[1].opcoes.body);
    assert.deepEqual(linhas.map(l => [l.nome, l.categ, l.valor]), [['Café', 'Besteira', -12.5]]);
    // Parcelas da notificação (NuPay "em 3x") valem sobre as do atalho.
    const { handler: h2, chamadas: c2 } = carregaFuncao(undefined, bancoFalso({ atalhos: [{ chave: 'naquele cafe comercio', nome: 'Café', categ: 'Besteira', parcelas: 1 }] }));
    await h2(pedido(TOKEN, { metodo: 'POST', caminho: '', corpo: compra({ auto: true, parcelas: '3', valor: '30' }) }));
    assert.equal(JSON.parse(c2[1].opcoes.body).length, 3);
});

test('lembrar: depois de lançar grava o atalho (upsert pela chave); falha vira aviso, não erro', async () => {
    const { handler, chamadas } = carregaFuncao(undefined, bancoFalso());
    const r = await handler(pedido(TOKEN, { metodo: 'POST', caminho: '', corpo: compra({ nome: 'Café', categ: 'Besteira', lembrar: true }) }));
    const corpo = await r.json();
    assert.equal(corpo.lembrado, true);
    const upsert = chamadas.find(c => c.url.includes('on_conflict=chave'));
    assert.match(upsert.opcoes.headers.Prefer, /resolution=merge-duplicates/);
    assert.deepEqual((({ chave, nome, categ, parcelas }) => ({ chave, nome, categ, parcelas }))(JSON.parse(upsert.opcoes.body)),
        { chave: 'naquele cafe comercio', nome: 'Café', categ: 'Besteira', parcelas: 1 });
    const { handler: h2 } = carregaFuncao(undefined, bancoFalso({ falhaLembrar: true }));
    const r2 = await h2(pedido(TOKEN, { metodo: 'POST', caminho: '', corpo: compra({ nome: 'Café', categ: 'Besteira', lembrar: true }) }));
    assert.equal(r2.status, 200);
    assert.match((await r2.json()).aviso, /atalho nao gravado/);
    // Sem lembrar, nenhum atalho é gravado.
    const { handler: h3, chamadas: c3 } = carregaFuncao(undefined, bancoFalso());
    await h3(pedido(TOKEN, { metodo: 'POST', caminho: '', corpo: compra({ nome: 'Café', categ: 'Besteira' }) }));
    assert.ok(!c3.some(c => c.url.includes('fin_atalho')));
});

test('lembrar com trecho: grava só a parte escolhida; trecho curto ou fora do nome vira o nome inteiro, com aviso', async () => {
    const lembra = async trecho => {
        const { handler, chamadas } = carregaFuncao(undefined, bancoFalso());
        const corpo = await (await handler(pedido(TOKEN, { metodo: 'POST', caminho: '', corpo: compra({ nome: 'Café', categ: 'Besteira', lembrar: true, trecho }) }))).json();
        const upsert = JSON.parse(chamadas.find(c => c.url.includes('on_conflict=chave')).opcoes.body);
        return { corpo, upsert };
    };
    let { corpo, upsert } = await lembra('Naquele Café');
    assert.equal(upsert.chave, 'naquele cafe');
    assert.equal(upsert.estab, 'NAQUELE  CAFÉ COMERCIO');
    assert.equal(corpo.atalho, 'naquele cafe');
    assert.equal(corpo.aviso, undefined);
    ({ corpo, upsert } = await lembra(''));
    assert.equal(upsert.chave, 'naquele cafe comercio');
    assert.equal(corpo.aviso, undefined);
    ({ corpo, upsert } = await lembra('%trecho'));   // variável do Tasker não preenchida
    assert.equal(upsert.chave, 'naquele cafe comercio');
    ({ corpo, upsert } = await lembra('caf'));
    assert.equal(upsert.chave, 'naquele cafe comercio');
    assert.match(corpo.aviso, /curto demais/);
    ({ corpo, upsert } = await lembra('padaria'));
    assert.equal(upsert.chave, 'naquele cafe comercio');
    assert.match(corpo.aviso, /fora do nome/);
    assert.equal(corpo.lembrado, true);
});
