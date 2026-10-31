// No navegador (Chromium do Playwright de ../tr): o Fin servido dentro do hub (/hub/fin/), com login no hub e um Supabase
// falso em memória (auth do falso do tr; as tabelas fin, fin_ciclo e fin_meta aqui). Nada sai pra rede nem toca o banco real.
// Cobre o que os testes de funções não veem: a tela abre com os dados, lançar e apagar gravam uma vez e aparecem, a troca
// de ciclo vai para o endereço e nenhum arquivo falta nem dá erro na página.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { createRequire } = require('node:module');
const { test, before, after } = require('node:test');

const HUB = path.join(__dirname, '..', '..');
const { chromium } = createRequire(path.join(HUB, 'tr', 'package.json'))('playwright');
const TIPOS = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.png': 'image/png', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json', '.json': 'application/json' };
const HOJE = '2026-10-20';
let servidor, navegador, base, falso;

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

// As tabelas do Fin: GET devolve tudo (a paginação por id=gt. devolve o que vem depois), POST grava com id novo e devolve
// a linha, PATCH e DELETE por id=eq. Cada pedido de escrita fica em `escritas`.
function tabelasDoFin(dados) {
  const escritas = [];
  let proximo = 1000;
  const rota = async route => {
    const req = route.request(), u = new URL(req.url()), t = u.pathname.split('/').pop(), L = dados[t];
    const json = (corpo, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(corpo) });
    if (!L) return json({ message: 'tabela?' }, 404);
    const id = (u.searchParams.get('id') || '').replace(/^(eq|gt)\./, ''), depois = /^gt\./.test(u.searchParams.get('id') || '');
    if (req.method() === 'GET') return json(depois ? L.filter(l => String(l.id) > id) : id ? L.filter(l => String(l.id) === id) : L);
    escritas.push([req.method(), t]);
    if (req.method() === 'POST') { const novas = [].concat(req.postDataJSON()).map(l => ({ id: String(proximo++), ...l })); L.push(...novas); return json(novas, 201); }
    const i = L.findIndex(l => String(l.id) === id);
    if (req.method() === 'PATCH') { Object.assign(L[i], req.postDataJSON()); return json([L[i]]); }
    if (req.method() === 'DELETE') { const [fora] = L.splice(i, 1); return json(fora ? [fora] : []); }
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

async function abrirFin(busca = '', dados = dadosDeExemplo()) {
  const ctx = await navegador.newContext({ serviceWorkers: 'block', viewport: { width: 390, height: 844 } });
  await ctx.route(u => !u.href.startsWith(base), r => r.abort());
  await falso.fakeSupabase(ctx, falso.novaNuvem());
  const supabaseLocal = fs.readFileSync(path.join(HUB, 'supabase.js'));
  await ctx.route(/cdn\.jsdelivr\.net\/npm\/@supabase\/supabase-js@/, r => r.fulfill({ contentType: 'text/javascript', body: supabaseLocal }));
  const fin = tabelasDoFin(dados);
  await ctx.route(/\/rest\/v1\/(fin|fin_ciclo|fin_meta)(\?|$)/, fin.rota);   // registrada depois: vence o falso do tr
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

test('abre no ciclo de hoje com os lançamentos dele, sem erro nem arquivo faltando', async () => {
  const { ctx, pg, erros, faltando } = await abrirFin();
  const t = await textoDaTabela(pg);
  assert.match(t, /Salário/); assert.match(t, /Mercado/);
  assert.doesNotMatch(t, /Aluguel/);                                    // do ciclo anterior
  assert.equal(await pg.getAttribute('#voltarHub', 'href'), '../');
  assert.deepEqual([erros, faltando], [[], []]);
  await ctx.close();
});

test('ciclo anterior: vai para o endereço (?ciclo) e mostra os lançamentos dele; recarregar mantém', async () => {
  const { ctx, pg, erros } = await abrirFin();
  await pg.click('#cicloAnterior');
  await pg.waitForFunction(() => /Aluguel/.test(document.getElementById('out').textContent));
  assert.match(pg.url(), /[?&]ciclo=/);
  const endereco = pg.url();
  await pg.reload();
  await pg.waitForFunction(() => /Aluguel/.test(document.getElementById('out').textContent));
  assert.equal(pg.url(), endereco);
  assert.deepEqual(erros, []);
  await ctx.close();
});

test('lançar um gasto: grava uma vez só (mesmo com toque repetido) e aparece no ciclo', async () => {
  const { ctx, pg, erros, dados, escritas } = await abrirFin();
  await pg.click('#abreNovo');
  await pg.waitForSelector('#modalNovo', { state: 'visible' });
  await pg.$eval('#fCred', e => { if (e.checked) e.click(); });                               // no débito: entra neste ciclo (no crédito, na fatura)
  await pg.fill('#fNome', 'Café');
  await pg.fill('#fValor', '1200');                                     // o campo é em centavos: 1200 = R$ 12,00
  await pg.fill('#fCateg', 'Besteira');
  await Promise.all([pg.click('#salvaNovo'), pg.click('#salvaNovo', { timeout: 500 }).catch(() => {})]);   // o 2º toque não grava de novo
  await pg.waitForFunction(() => /Café/.test(document.getElementById('out').textContent));
  assert.deepEqual(escritas.filter(([m, t]) => m === 'POST' && t === 'fin').length, 1);
  const novo = dados.fin.find(l => l.nome === 'Café');
  assert.equal(novo.data, HOJE);
  assert.deepEqual([novo.valor, novo.cred, novo.categ], [-12, false, 'Besteira']);   // gasto: negativo
  assert.deepEqual(erros, []);
  await ctx.close();
});

test('apagar: tocar na linha seleciona; Excluir pede confirmação, grava um DELETE só e a linha some', async () => {
  const { ctx, pg, erros, dados, escritas } = await abrirFin();
  pg.on('dialog', d => d.accept());                                      // o "Excluir "Mercado"? Não dá pra desfazer."
  await pg.click('#out tr[data-sid="2"]');
  await pg.waitForSelector('#selbar', { state: 'visible' });
  await Promise.all([pg.click('#seldel'), pg.click('#seldel', { timeout: 500 }).catch(() => {})]);   // o 2º toque com o pedido no ar não repete
  await pg.waitForFunction(() => !/Mercado/.test(document.getElementById('out').textContent));
  assert.deepEqual(escritas.filter(([m]) => m === 'DELETE'), [['DELETE', 'fin']]);
  assert.equal(dados.fin.some(l => l.nome === 'Mercado'), false);
  assert.deepEqual(erros, []);
  await ctx.close();
});
