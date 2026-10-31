// Ajuda dos testes de navegador do Fin (tests/navegador*.test.js): o Fin servido dentro do hub (/hub/fin/), com login no hub
// e um Supabase falso em memória (auth do falso do tr; as tabelas fin, fin_ciclo e fin_meta aqui). Nada sai pra rede nem
// toca o banco real. Cada arquivo chama prepararNavegador() e abre o Fin com abrirFin().
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { createRequire } = require('node:module');
const { before, after } = require('node:test');

const HUB = path.join(__dirname, '..', '..', '..');
const { chromium } = createRequire(path.join(HUB, 'tr', 'package.json'))('playwright');
const TIPOS = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.png': 'image/png', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json', '.json': 'application/json' };
const HOJE = '2026-10-20';
let servidor, navegador, base, falso;

function prepararNavegador() {
    before(async () => {
        falso = await import(path.join(HUB, 'tr', 'tests', 'helpers', 'app.mjs'));
        servidor = http.createServer((req, res) => {
            let caminho = decodeURIComponent(new URL(req.url, 'http://x').pathname).replace(/^\/hub/, '');
            if (caminho.endsWith('/')) caminho += 'index.html';
            const arquivo = path.join(HUB, path.normalize(caminho));
            if (!arquivo.startsWith(HUB)) { res.writeHead(403).end(); return; }
            fs.readFile(arquivo, (e, d) => {
                if (e) { res.writeHead(404).end(); return; }
                // O fin carrega o supabase-js do CDN com integrity (SRI): aqui vai a cópia local, e o HTML sem o atributo
                if (caminho === '/fin/index.html') d = Buffer.from(String(d).replace(/\s+integrity="[^"]*"/g, ''));
                res.writeHead(200, { 'Content-Type': TIPOS[path.extname(arquivo)] || 'application/octet-stream' }).end(d);
            });
        });
        await new Promise(ok => servidor.listen(0, '127.0.0.1', ok));
        base = `http://127.0.0.1:${servidor.address().port}/hub/`;
        navegador = await chromium.launch();
    });
    after(async () => { await navegador?.close(); servidor?.close(); });
}

// As tabelas do Fin: GET devolve tudo (a paginação por id=gt. devolve o que vem depois), POST grava com id novo e devolve
// a linha (id numérico, como o bigint do banco), PATCH e DELETE por id=eq. ou id=in.(…). Cada pedido de escrita fica em `escritas`; com
// `atraso` (ms), a resposta das escritas demora, como numa rede lenta (o 2º toque cai com o pedido no ar).
const PADROES = { fin_meta: { status: 'aberta' } };   // o default da coluna no banco (migration 36)
function tabelasDoFin(dados, atraso = 0) {
    const escritas = [];
    let proximo = 1000, recorrencia = 0;
    const rota = async route => {
        const req = route.request(), u = new URL(req.url()), t = u.pathname.split('/').pop(), L = dados[t];
        const json = (corpo, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(corpo) });
        if (u.pathname.endsWith('/rpc/proxima_recorrencia')) return json(++recorrencia);   // a sequência das séries (migration 28)
        if (!L) return json({ message: 'tabela?' }, 404);
        const id = (u.searchParams.get('id') || '').replace(/^(eq|gt)\./, ''), depois = /^gt\./.test(u.searchParams.get('id') || '');
        if (req.method() === 'GET') return json(depois ? L.filter(l => String(l.id) > id) : id ? L.filter(l => String(l.id) === id) : L);
        escritas.push([req.method(), t]);
        if (atraso) await new Promise(ok => setTimeout(ok, atraso));
        if (req.method() === 'POST') { const novas = [].concat(req.postDataJSON()).map(l => ({ id: proximo++, ...PADROES[t], ...l })); L.push(...novas); return json(novas, 201); }
        // id=eq.X ou id=in.(X,Y,…): as linhas do filtro (várias de uma vez, como numa série)
        const filtro = u.searchParams.get('id') || '', ids = /^in\./.test(filtro) ? filtro.slice(4, -1).split(',') : [id];
        const alvo = L.filter(l => ids.includes(String(l.id)));
        if (req.method() === 'PATCH') { alvo.forEach(l => Object.assign(l, req.postDataJSON())); return json(alvo); }
        if (req.method() === 'DELETE') { dados[t] = L.filter(l => !alvo.includes(l)); return json(alvo); }
        return json({}, 405);
    };
    return { rota, escritas };
}

const dadosDeExemplo = () => ({
    fin_ciclo: [{ id: 1, inicio: '2026-09-15', fim: '2026-10-14' }, { id: 2, inicio: '2026-10-15', fim: null }],
    fin: [
        { id: '1', nome: 'Salário', data: '2026-10-15', valor: 9000, categ: 'Salário', cred: false, pago: true, fatura: null, freq: null },
        { id: '2', nome: 'Mercado', data: '2026-10-16', valor: -320.5, categ: 'Mercado', cred: false, pago: true, fatura: null, freq: null },
        { id: '3', nome: 'Aluguel', data: '2026-09-20', valor: -2000, categ: 'Moradia', cred: false, pago: true, fatura: null, freq: null }
    ],
    fin_meta: []
});

// celular: viewport de 390 × 844 com toque (gestos); sem ele, a mesma largura sem toque
async function abrirFin(busca = '', dados = dadosDeExemplo(), atraso = 0, { celular = false } = {}) {
    const ctx = await navegador.newContext({ serviceWorkers: 'block', viewport: { width: 390, height: 844 }, ...(celular && { isMobile: true, hasTouch: true }) });
    await ctx.route(u => !u.href.startsWith(base), r => r.abort());
    await falso.fakeSupabase(ctx, falso.novaNuvem());
    const supabaseLocal = fs.readFileSync(path.join(HUB, 'supabase.js'));
    await ctx.route(/cdn\.jsdelivr\.net\/npm\/@supabase\/supabase-js@/, r => r.fulfill({ contentType: 'text/javascript', body: supabaseLocal }));
    const fin = tabelasDoFin(dados, atraso);
    await ctx.route(/\/rest\/v1\/(fin|fin_ciclo|fin_meta|rpc\/proxima_recorrencia)(\?|$)/, fin.rota);   // registrada depois: vence o falso do tr
    const pg = await ctx.newPage(), erros = [], faltando = [];
    pg.on('pageerror', e => erros.push(e.message));
    pg.on('response', r => { if (r.url().startsWith(base) && r.status() >= 400) faltando.push(`${r.status()} ${r.url()}`); });
    await pg.clock.install({ time: new Date(`${HOJE}T12:00:00-03:00`) });
    await pg.goto(base);
    await pg.fill('#l-usuario', 'eu@teste.com'); await pg.fill('#l-senha', 'senha123'); await pg.press('#l-senha', 'Enter');
    await pg.waitForSelector('#v-apps:not([hidden])');
    await pg.goto(base + 'fin/' + busca);
    await pg.waitForFunction(() => getComputedStyle(document.getElementById('app')).display === 'block');
    await pg.waitForFunction(() => document.getElementById('out').textContent.trim().length > 0);
    return { ctx, pg, erros, faltando, dados, escritas: fin.escritas };
}
const textoDaTabela = pg => pg.$eval('#out', el => el.textContent.replace(/\s+/g, ' '));

module.exports = { HOJE, prepararNavegador, abrirFin, dadosDeExemplo, textoDaTabela };
