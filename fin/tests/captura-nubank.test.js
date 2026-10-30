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

test('débito Nubank: Débito pago, sem fatura e sempre 1 parcela (mesmo com atalho parcelado)', async () => {
    const atalhos = [{ chave: 'emv cmt', nome: 'Metrô', categ: 'Transporte', parcelas: 3 }];
    const { handler, chamadas } = carregaFuncao(undefined, bancoFalso({ atalhos }));
    const corpo = await (await handler(pedido(TOKEN, { metodo: 'POST', caminho: '', corpo: compra({ tipo: 'despesa_debito', valor: '5.90', estab: 'EMV CMT*156596385', auto: true }) }))).json();
    assert.equal(corpo.lancado, true);
    assert.equal(corpo.forma, 'débito');
    const linhas = JSON.parse(chamadas.find(c => c.url.endsWith('/rest/v1/fin')).opcoes.body);
    assert.equal(linhas.length, 1);
    assert.deepEqual((({ valor, nome, categ, cred, pago, fatura }) => ({ valor, nome, categ, cred, pago, fatura }))(linhas[0]),
        { valor: -5.9, nome: 'Metrô', categ: 'Transporte', cred: false, pago: true, fatura: null });
    // Parcelas mandadas pelo Tasker também não valem no débito.
    const { handler: h2, chamadas: c2 } = carregaFuncao(undefined, bancoFalso());
    await h2(pedido(TOKEN, { metodo: 'POST', caminho: '', corpo: compra({ tipo: 'despesa_debito', parcelas: '3', nome: 'X' }) }));
    assert.equal(JSON.parse(c2.find(c => c.url.endsWith('/rest/v1/fin')).opcoes.body).length, 1);
});

test('crédito Mercado Pago: fatura vence dia 13 e fecha dia 6; sem cartão (ou outro) é Nubank, fecha dia 5 e vence dia 12', async () => {
    const fatura = async (data, cartao) => {
        const { handler, chamadas } = carregaFuncao(undefined, bancoFalso());
        const ts = Math.floor(new Date(`${data}T12:00:00-03:00`).getTime() / 1000);
        const corpo = await (await handler(pedido(TOKEN, { metodo: 'POST', caminho: '', corpo: compra({ ts, cartao, nome: 'X', categ: 'Y' }) }))).json();
        return { corpo, linha: JSON.parse(chamadas.find(c => c.url.endsWith('/rest/v1/fin')).opcoes.body)[0] };
    };
    // Mês passado: sempre no passado e a menos de 60 dias (a função troca data fora disso por agora).
    const hoje = new Date();
    const mes = (a, m) => `${a + Math.floor((m - 1) / 12)}-${String(((m - 1) % 12 + 12) % 12 + 1).padStart(2, '0')}`;
    const [a, m] = [hoje.getFullYear(), hoje.getMonth()];   // getMonth() = número do mês passado (1-12), 0 em janeiro
    const passado = m === 0 ? mes(a - 1, 12) : mes(a, m), atual = mes(a, m + 1);
    let { corpo, linha } = await fatura(`${passado}-05`, 'mp');
    assert.equal(linha.fatura, `${passado}-13`);
    assert.equal(linha.cred, true);
    assert.equal(corpo.forma, 'Mercado Pago');
    ({ linha } = await fatura(`${passado}-06`, 'mp'));
    assert.equal(linha.fatura, `${atual}-13`);
    ({ linha } = await fatura(`${passado}-05`, undefined));
    assert.equal(linha.fatura, `${atual}-12`);
    ({ corpo, linha } = await fatura(`${passado}-04`, 'outro'));
    assert.equal(linha.fatura, `${passado}-12`);
    assert.equal(corpo.forma, 'Nubank');
});

// ---------- Contas previstas (Pix enviado, boleto, Pix recebido) ----------
// Banco falso que aplica os filtros que a função manda (id, cred, pago, sinal do valor, datas).
const diaSP = deslocamento => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date(Date.now() + deslocamento * 86400_000));
const CICLOS = [
    { inicio: diaSP(-40), fim: diaSP(-11) },
    { inicio: diaSP(-10), fim: diaSP(10) },
    { inicio: diaSP(11), fim: diaSP(40) },
    { inicio: diaSP(41), fim: null },
];
function bancoContas({ contas = [], vinculos = [], atalhos = [] } = {}) {
    const linhas = contas.map(l => ({ cred: false, pago: false, ...l }));
    const patches = [], vinculosGravados = [], inseridas = [];
    const resp = (corpo, status = 200) => new Response(JSON.stringify(corpo), { status });
    const filtra = q => linhas.filter(l => {
        for (const [campo, valor] of q) {
            const [op, alvo] = [valor.slice(0, valor.indexOf('.')), valor.slice(valor.indexOf('.') + 1)];
            if (!['id', 'cred', 'pago', 'valor', 'data'].includes(campo)) continue;
            const v = l[campo], a = campo === 'data' ? alvo : JSON.parse(alvo);
            if (op === 'eq' && v !== a) return false;
            if (op === 'gt' && !(v > a)) return false;
            if (op === 'lt' && !(v < a)) return false;
            if (op === 'gte' && !(v >= a)) return false;
            if (op === 'lte' && !(v <= a)) return false;
        }
        return true;
    });
    const responde = (url, opcoes = {}) => {
        const u = new URL(url), metodo = opcoes.method || 'GET';
        if (u.pathname === '/rest/v1/fin_ciclo') return resp(CICLOS);
        if (u.pathname === '/rest/v1/fin_vinculo' && metodo === 'GET') return resp(vinculos);
        if (u.pathname === '/rest/v1/fin_vinculo') { vinculosGravados.push({ url, corpo: JSON.parse(opcoes.body) }); return new Response('', { status: 201 }); }
        if (u.pathname === '/rest/v1/fin_atalho') return resp(atalhos);
        if (u.pathname === '/rest/v1/fin' && metodo === 'GET') return resp(filtra([...u.searchParams]).map(l => ({ ...l, valor: l.valor.toFixed(2) })));
        if (u.pathname === '/rest/v1/fin' && metodo === 'PATCH') {
            const achadas = filtra([...u.searchParams]);
            for (const l of achadas) { Object.assign(l, JSON.parse(opcoes.body)); patches.push({ id: l.id, ...JSON.parse(opcoes.body) }); }
            return resp(achadas);
        }
        if (u.pathname === '/rest/v1/fin' && metodo === 'POST') { const novas = JSON.parse(opcoes.body); inseridas.push(...novas); return resp(novas.map((_, i) => ({ id: 900 + i })), 201); }
        return new Response('inesperado', { status: 500 });
    };
    return { responde, patches, vinculosGravados, inseridas };
}
async function pedeConta(banco, corpo) {
    const { handler } = carregaFuncao(undefined, banco.responde);
    const r = await handler(pedido(TOKEN, { metodo: 'POST', caminho: '', corpo: { tipo: 'conta_saida', ts: Math.floor(Date.now() / 1000), ...corpo } }));
    return { status: r.status, corpo: await r.json() };
}
const AGUA = { id: 7, data: diaSP(3), valor: -250, nome: 'Água', categ: 'Casa' };
const TRYBE = { id: 9, data: diaSP(2), valor: -250, nome: 'Trybe', categ: 'Dívida' };
const IPHONE = { id: 11, data: diaSP(4), valor: -368.33, nome: 'Iphone (3/12)', categ: 'Isabella' };
const SENAC = { id: 12, data: diaSP(6), valor: -105.73, nome: 'Senac', categ: 'Isabella' };

test('conta prevista: vínculo com uma conta paga sozinha (pago, data do pagamento, valor pago); até 30% diferente avisa o previsto', async () => {
    const vinculos = [{ chave: 'sabesp', nome: 'Água', categ: 'Casa' }];
    let banco = bancoContas({ contas: [AGUA, TRYBE], vinculos });
    let r = await pedeConta(banco, { valor: '250.00', estab: 'SABESP SAO PAULO', auto: true });
    assert.deepEqual([r.corpo.pago, r.corpo.texto], [true, 'Água: pago R$ 250,00']);
    assert.deepEqual(banco.patches, [{ id: 7, pago: true, data: diaSP(0), valor: -250 }]);
    banco = bancoContas({ contas: [AGUA, TRYBE], vinculos });
    r = await pedeConta(banco, { valor: '237.18', estab: 'Sabesp', auto: true });
    assert.equal(r.corpo.texto, 'Água: pago R$ 237,18 (previsto R$ 250,00)');
    assert.equal(banco.patches[0].valor, -237.18);
    // Mais de 30% diferente: pergunta (Pix pra mesma pessoa por outro motivo).
    banco = bancoContas({ contas: [AGUA], vinculos });
    r = await pedeConta(banco, { valor: '100.00', estab: 'SABESP', auto: true });
    assert.deepEqual(r.corpo, { ok: true, pago: false, lancado: false });
    assert.equal(banco.patches.length, 0);
});

test('conta prevista: sem vínculo nunca paga só pelo valor (Trybe e Água, ambas R$ 250,00)', async () => {
    const banco = bancoContas({ contas: [AGUA, TRYBE] });
    const r = await pedeConta(banco, { valor: '250.00', estab: 'TRYBE', auto: true });
    assert.deepEqual(r.corpo, { ok: true, pago: false, lancado: false });
    assert.equal(banco.patches.length, 0);
});

test('conta prevista: mesma pessoa com várias contas paga a única de valor igual; sem valor igual pergunta', async () => {
    const vinculos = [{ chave: 'maria silva', nome: 'Iphone', categ: 'Isabella' }, { chave: 'maria silva', nome: 'Senac', categ: 'Isabella' }];
    let banco = bancoContas({ contas: [IPHONE, SENAC, AGUA], vinculos });
    let r = await pedeConta(banco, { valor: '368.33', estab: 'MARIA SILVA', auto: true });
    assert.deepEqual([r.corpo.pago, r.corpo.id, r.corpo.texto], [true, 11, 'Iphone (3/12): pago R$ 368,33']);
    banco = bancoContas({ contas: [IPHONE, SENAC], vinculos });
    r = await pedeConta(banco, { valor: '105.73', estab: 'Maria Silva', auto: true });
    assert.equal(r.corpo.id, 12);
    banco = bancoContas({ contas: [IPHONE, SENAC], vinculos });
    r = await pedeConta(banco, { valor: '200.00', estab: 'MARIA SILVA', auto: true });
    assert.equal(r.corpo.pago, false);
    assert.equal(banco.patches.length, 0);
});

test('conta prevista: a mesma conta atrasada e no ciclo de hoje paga a mais antiga; próximo ciclo nunca sozinha; investimento atrasado fora', async () => {
    const vinculos = [{ chave: 'sabesp', nome: 'Água', categ: 'Casa' }];
    let banco = bancoContas({ contas: [AGUA, { ...AGUA, id: 6, data: diaSP(-25) }], vinculos });
    let r = await pedeConta(banco, { valor: '250.00', estab: 'SABESP', auto: true });
    assert.equal(r.corpo.id, 6);
    banco = bancoContas({ contas: [{ ...AGUA, data: diaSP(15) }], vinculos });
    r = await pedeConta(banco, { valor: '250.00', estab: 'SABESP', auto: true });
    assert.equal(r.corpo.pago, false);
    // Na lista, com as marcas de atrasado e próximo ciclo; Aporte atrasado não aparece, o de hoje sim.
    banco = bancoContas({ contas: [{ ...AGUA, data: diaSP(15) }, { ...TRYBE, data: diaSP(-25) },
        { id: 20, data: diaSP(-25), valor: -500, nome: 'Aporte', categ: 'Investimento' }, { id: 21, data: diaSP(1), valor: -500, nome: 'Aporte', categ: 'Investimento' }], vinculos });
    r = await pedeConta(banco, { valor: '250.00', estab: 'SABESP', acao: 'opcoes' });
    const dm = d => `${d.slice(8, 10)}/${d.slice(5, 7)}`;
    assert.deepEqual(r.corpo.opcoes, [
        { id: 7, rotulo: `Água R$ 250‚00 · ${dm(diaSP(15))} · próx. ciclo` },
        { id: 9, rotulo: `Trybe R$ 250‚00 · ${dm(diaSP(-25))} · atrasado` },
        { id: 21, rotulo: `Aporte R$ 500‚00 · ${dm(diaSP(1))}` },
    ]);
});

test('conta prevista: lista com no máximo 6, vinculadas primeiro, depois valor e data mais perto; rótulo sem vírgula', async () => {
    const contas = Array.from({ length: 8 }, (_, i) => ({ id: 30 + i, data: diaSP(i - 3), valor: -(100 + i * 10), nome: `Conta ${i}`, categ: 'Casa' }));
    contas.push({ id: 50, data: diaSP(5), valor: -1060.33, nome: 'Entrada Econ', categ: 'Apartamento' });
    const banco = bancoContas({ contas, vinculos: [{ chave: 'econ', nome: 'Entrada Econ', categ: 'Apartamento' }] });
    const r = await pedeConta(banco, { valor: '120.00', estab: 'ECON CONSTRUTORA', acao: 'opcoes' });
    assert.equal(r.corpo.opcoes.length, 6);
    // 31 e 33 empatam no valor (R$ 10 de diferença): ganha 33, de hoje, sobre 31, de 2 dias atrás; idem 34 sobre 30.
    assert.deepEqual(r.corpo.opcoes.map(o => o.id), [50, 32, 33, 31, 34, 30]);
    assert.match(r.corpo.opcoes[0].rotulo, /^Entrada Econ R\$ 1\.060‚33 · /);
    for (const o of r.corpo.opcoes) assert.doesNotMatch(o.rotulo, /,/);
});

test('conta prevista: escolha no Tasker paga a conta e, com Sempre assim, grava o vínculo (trecho, nome sem parcela)', async () => {
    let banco = bancoContas({ contas: [IPHONE, SENAC] });
    let r = await pedeConta(banco, { valor: '368.33', estab: 'MARIA SILVA SANTOS', id: '11', lembrar: true, trecho: 'Maria Silva' });
    assert.deepEqual([r.status, r.corpo.pago, r.corpo.lembrado, r.corpo.vinculo], [200, true, true, 'maria silva']);
    assert.deepEqual(banco.patches, [{ id: 11, pago: true, data: diaSP(0), valor: -368.33 }]);
    assert.match(banco.vinculosGravados[0].url, /fin_vinculo\?on_conflict=chave,nome,categ$/);
    assert.deepEqual((({ chave, nome, categ }) => ({ chave, nome, categ }))(banco.vinculosGravados[0].corpo), { chave: 'maria silva', nome: 'Iphone', categ: 'Isabella' });
    // Sem Sempre assim, nenhum vínculo; conta que já foi paga (ou de crédito, ou do sinal errado) dá 409.
    banco = bancoContas({ contas: [SENAC] });
    r = await pedeConta(banco, { valor: '105.73', estab: 'MARIA', id: 12 });
    assert.equal(r.corpo.pago, true);
    assert.equal(banco.vinculosGravados.length, 0);
    for (const conta of [{ ...SENAC, pago: true }, { ...SENAC, cred: true }, { ...SENAC, valor: 105.73 }]) {
        banco = bancoContas({ contas: [conta] });
        r = await pedeConta(banco, { valor: '105.73', estab: 'MARIA', id: '12' });
        assert.equal(r.status, 409);
        assert.equal(banco.patches.length, 0);
    }
    // Boleto sem nome: paga, mas o vínculo não tem de quem ser (aviso, não erro).
    banco = bancoContas({ contas: [TRYBE] });
    r = await pedeConta(banco, { valor: '250.00', estab: '', id: '9', lembrar: true });
    assert.deepEqual([r.status, r.corpo.pago, r.corpo.lembrado], [200, true, undefined]);
    assert.match(r.corpo.aviso, /vinculo nao gravado/);
});

test('conta prevista: Pix recebido paga só entradas (valor positivo) e o próximo ciclo só pela lista (Faturamento PJ)', async () => {
    const pj = { id: 40, data: diaSP(12), valor: 9600, nome: 'Faturamento PJ', categ: 'Évora' };
    const cintia = { id: 41, data: diaSP(2), valor: 199.9, nome: 'Cintia', categ: 'Cintia' };
    const vinculos = [{ chave: 'evora', nome: 'Faturamento PJ', categ: 'Évora' }, { chave: 'cintia', nome: 'Cintia', categ: 'Cintia' }];
    let banco = bancoContas({ contas: [pj, cintia, AGUA], vinculos });
    let r = await pedeConta(banco, { tipo: 'conta_entrada', valor: '199.90', estab: 'CINTIA', auto: true });
    assert.deepEqual([r.corpo.pago, r.corpo.texto], [true, 'Cintia: recebido R$ 199,90']);
    assert.deepEqual(banco.patches, [{ id: 41, pago: true, data: diaSP(0), valor: 199.9 }]);
    banco = bancoContas({ contas: [pj, cintia, AGUA], vinculos });
    r = await pedeConta(banco, { tipo: 'conta_entrada', valor: '9600.00', estab: 'EVORA LTDA', auto: true });
    assert.equal(r.corpo.pago, false);
    r = await pedeConta(banco, { tipo: 'conta_entrada', valor: '9600.00', estab: 'EVORA LTDA', acao: 'opcoes' });
    assert.deepEqual(r.corpo.opcoes.map(o => o.id), [40, 41]);
});

test('conta prevista: sem conta vinculada, quem tem atalho vira lançamento novo pago fora do cartão (saída ou entrada)', async () => {
    const atalhos = [{ chave: 'joao', nome: 'Futebol', categ: 'Lazer', parcelas: 1 }];
    let banco = bancoContas({ contas: [AGUA], atalhos });
    let r = await pedeConta(banco, { valor: '20.00', estab: 'João', auto: true });
    assert.deepEqual([r.corpo.lancado, r.corpo.nome, r.corpo.forma], [true, 'Futebol', 'débito']);
    assert.deepEqual((({ valor, nome, categ, cred, pago, fatura }) => ({ valor, nome, categ, cred, pago, fatura }))(banco.inseridas[0]),
        { valor: -20, nome: 'Futebol', categ: 'Lazer', cred: false, pago: true, fatura: null });
    banco = bancoContas({ atalhos });
    r = await pedeConta(banco, { tipo: 'conta_entrada', valor: '20.00', estab: 'JOAO', auto: true });
    assert.equal(banco.inseridas[0].valor, 20);
    assert.equal(r.corpo.forma, 'entrada');
    // Com conta vinculada (mesmo que ambígua), o atalho não lança nada: pergunta.
    banco = bancoContas({ contas: [{ ...AGUA, nome: 'Racha' }], atalhos, vinculos: [{ chave: 'joao', nome: 'Racha', categ: 'Casa' }] });
    r = await pedeConta(banco, { valor: '400.00', estab: 'JOAO', auto: true });
    assert.deepEqual(r.corpo, { ok: true, pago: false, lancado: false });
    assert.equal(banco.inseridas.length, 0);
});

test('Novo lançamento de Pix recebido (receita_debito): entrada paga, fora do cartão, valor positivo', async () => {
    const { handler, chamadas } = carregaFuncao(undefined, bancoFalso());
    const corpo = await (await handler(pedido(TOKEN, { metodo: 'POST', caminho: '', corpo: compra({ tipo: 'receita_debito', valor: '50', estab: 'Ana', nome: 'Rifa', categ: 'Presente', parcelas: '3' }) }))).json();
    assert.equal(corpo.forma, 'entrada');
    const linhas = JSON.parse(chamadas.find(c => c.url.endsWith('/rest/v1/fin')).opcoes.body);
    assert.deepEqual(linhas.map(l => [l.valor, l.cred, l.pago, l.fatura]), [[50, false, true, null]]);
});

test('SALDO_DESDE da função é o mesmo do app', () => {
    const app = fs.readFileSync('js/app-state.js', 'utf8').match(/const SALDO_DESDE = '([\d-]+)'/)[1];
    assert.equal(fonte.match(/const SALDO_DESDE = "([\d-]+)"/)[1], app);
});
