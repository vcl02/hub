// Infra dos testes de ponta a ponta: servidor estático, Chromium (Playwright), Supabase falso e atalhos de tela.
// Cada arquivo de teste chama prepararApp() uma vez; app.url / app.navegador ficam prontos no before().
import { before, after } from 'node:test';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const RAIZ = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const TIPOS = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png' };
export const app = { url: null, navegador: null, novaVersao: false };   // novaVersao: simula um deploy alterando um js
let servidor;

export function prepararApp() {
  before(async () => {
    servidor = http.createServer((req, res) => {
      // Fora do hub o tr fica na raiz do servidor: ../corpo/perfil.js (módulo do app Corpo) chega como /corpo/perfil.js e a
      // base comum (../base/) como /base/.
      const u = decodeURIComponent(req.url.split('?')[0]);
      let p = u === '/corpo/perfil.js' || u.startsWith('/base/') ? path.join(RAIZ, '..', u) : path.join(RAIZ, u);
      if (p.endsWith(path.sep)) p += 'index.html';
      fs.readFile(p, (e, d) => {
        if (e) { res.writeHead(404); res.end(); return; }
        if (app.novaVersao && p.endsWith('bootstrap.js')) d = Buffer.concat([d, Buffer.from('\n// deploy novo')]);
        res.writeHead(200, { 'content-type': TIPOS[path.extname(p)] || 'application/octet-stream' }); res.end(d);
      });
    });
    await new Promise(r => servidor.listen(0, r));
    app.url = `http://localhost:${servidor.address().port}/`;
    app.navegador = await chromium.launch();
  });
  after(async () => { await app.navegador?.close(); servidor?.close(); });
}

// Supabase falso (auth + PostgREST em memória): o teste não depende de internet nem do banco real.
export const CHAVES = { tr_exercicio: ['id'], tr_variacao: ['id'], tr_registro: ['variacao_id', 'data'], tr_treino: ['inicio'], corpo_medida: ['data'], corpo_dia: ['data'], agua_dia: ['data'], al_registro: ['id'], al_dia: ['data'] };   // do Corpo, da Água e do al (o hub abre e lê todos com este falso)
export const novaNuvem = () => ({ online: true, tabelas: Object.fromEntries(Object.keys(CHAVES).map(t => [t, []])) });
const b64u = o => Buffer.from(JSON.stringify(o)).toString('base64url');
export async function fakeSupabase(ctx, nuvem, id = '32f70255-30a0-4e2b-ad76-31d7a1bf54f7') {
  const user = { id, aud: 'authenticated', role: 'authenticated', email: 'eu@teste.com', app_metadata: {}, user_metadata: {} };
  await ctx.route(/supabase\.co\//, async route => {
    const req = route.request(), u = new URL(req.url()), json = (corpo, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(corpo) });
    if (!nuvem.online) return route.abort('internetdisconnected');
    if (nuvem.atraso) await new Promise(r => setTimeout(r, nuvem.atraso));   // simula rede lenta
    if (u.pathname === '/auth/v1/token') {
      const corpo = req.postDataJSON() || {};
      if (u.searchParams.get('grant_type') === 'password' && corpo.password !== 'senha123') return json({ code: 400, error_code: 'invalid_credentials', msg: 'Invalid login credentials' }, 400);
      const exp = Math.floor(Date.now() / 1000) + 3600;
      return json({ access_token: b64u({ alg: 'HS256' }) + '.' + b64u({ sub: user.id, exp, role: 'authenticated' }) + '.x', token_type: 'bearer', expires_in: 3600, expires_at: exp, refresh_token: 'r', user });
    }
    if (u.pathname === '/auth/v1/user') return json(user);
    if (u.pathname === '/auth/v1/logout') return route.fulfill({ status: 204 });
    const t = u.pathname.replace('/rest/v1/', ''), linhas = nuvem.tabelas[t];
    if (!linhas) return json({ message: 'tabela?' }, 404);
    const filtros = [...u.searchParams].filter(([, v]) => v.startsWith('eq.')).map(([k, v]) => [k, v.slice(3)]);
    const chave = l => CHAVES[t].map(k => l[k]).join('|');
    if (req.method() === 'GET') { const off = +(u.searchParams.get('offset') || 0), lim = +(u.searchParams.get('limit') || 1e9); return json(linhas.slice(off, off + lim)); }
    if (req.method() === 'POST') {
      for (const l of [].concat(req.postDataJSON())) { const i = linhas.findIndex(x => chave(x) === chave(l)); if (i >= 0) linhas[i] = l; else linhas.push(l); }
      return route.fulfill({ status: 201 });
    }
    if (req.method() === 'DELETE') { nuvem.tabelas[t] = linhas.filter(l => !filtros.every(([k, v]) => String(l[k]) === v)); return route.fulfill({ status: 204 }); }
    return json({}, 405);
  });
}
// Fontes do Google são bloqueadas para o teste não depender de internet
// agua: false (padrão) já marca a garrafinha do dia como pega, para a tela cheia não cobrir os toques dos testes
export async function abrirApp({ busca = '', relogio, nuvem = novaNuvem(), antes, agua = false } = {}) {
  const ctx = await app.navegador.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  await ctx.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
  await fakeSupabase(ctx, nuvem);
  const pg = await ctx.newPage(), erros = [];
  pg.on('pageerror', e => erros.push(e.message));
  if (relogio) await pg.clock.install({ time: relogio });
  await pg.goto(app.url + busca);   // busca: ?dia=… (aberto pela página inicial num dia anterior)
  if (antes) { await pg.evaluate(antes); await pg.reload(); }
  await pg.fill('#l-email', 'eu@teste.com'); await pg.fill('#l-senha', 'senha123'); await pg.press('#l-senha', 'Enter');
  await pg.waitForSelector(busca.includes('dia=') ? '#v-fim:not([hidden])' : '#v-inicio:not([hidden])');
  if (!agua) await pg.evaluate(() => store.set(K_AGUA, hoje()));
  return { ctx, pg, erros, nuvem };
}
export const sincronizado = pg => pg.waitForFunction(() => !temPendente() && !enviando);
export async function arrastar(ctx, pg, x1, x2, y = 600) {
  const cdp = await ctx.newCDPSession(pg);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: x1, y }] });
  for (let i = 1; i <= 10; i++) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x1 + (x2 - x1) * i / 10, y }] }); await pg.waitForTimeout(16); }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  // Espera o gesto acabar, sem tempo fixo: a tela do exercício sai deslizando, troca e volta (transform vazio e nenhuma
  // animação rodando); as outras telas trocam na hora
  await pg.waitForFunction(() => !document.getElementById('v-exercicio').style.transform && !document.getAnimations().some(a => a.playState === 'running'));
}
export const linhas = async pg => (await pg.locator('#t-plano li').allTextContents()).map(s => s.replace(/\s+/g, ' ').replace(/[−+✎✓]/g, '').trim());
