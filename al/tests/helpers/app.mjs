// Infra dos testes de ponta a ponta do al: servidor estático, Chromium (o Playwright do tr), Supabase falso e a IA falsa.
// Fora do hub o al fica na raiz do servidor: ../supabase.js (do hub), ../corpo/perfil.js e ../agua/bebidas.js chegam como /supabase.js,
// /corpo/perfil.js e /agua/bebidas.js.
import { before, after } from 'node:test';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const RAIZ = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const HUB = path.join(RAIZ, '..');
const { chromium } = createRequire(path.join(HUB, 'tr', 'package.json'))('playwright');
const TIPOS = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png' };
export const app = { url: null, navegador: null };
export const DONO = '32f70255-30a0-4e2b-ad76-31d7a1bf54f7';
let servidor;

export function prepararApp() {
  before(async () => {
    servidor = http.createServer((req, res) => {
      const u = decodeURIComponent(req.url.split('?')[0]);
      let p = ['/corpo/perfil.js', '/supabase.js', '/agua/bebidas.js'].includes(u) ? path.join(HUB, u) : path.join(RAIZ, u);
      if (p.endsWith(path.sep)) p += 'index.html';
      fs.readFile(p, (e, d) => {
        if (e) { res.writeHead(404); res.end(); return; }
        res.writeHead(200, { 'content-type': TIPOS[path.extname(p)] || 'application/octet-stream' }); res.end(d);
      });
    });
    await new Promise(r => servidor.listen(0, r));
    app.url = `http://localhost:${servidor.address().port}/`;
    app.navegador = await chromium.launch();
  });
  after(async () => { await app.navegador?.close(); servidor?.close(); });
}

// Supabase falso (auth + PostgREST em memória + a Edge Function al-estimar): nada sai para a rede.
// nuvem.ia(texto) responde pela IA: { status, corpo }. nuvem.chamadasIA conta as chamadas.
export const CHAVES = { al_item: ['id'], al_registro: ['id'], al_dia: ['data'], corpo_medida: ['data'], tr_treino: ['inicio'], agua_dia: ['data'], al_marmita: ['id'] };
export const novaNuvem = () => ({ online: true, chamadasIA: 0, ia: () => ({ status: 200, corpo: { itens: [] } }), tabelas: Object.fromEntries(Object.keys(CHAVES).map(t => [t, []])) });
const b64u = o => Buffer.from(JSON.stringify(o)).toString('base64url');
export async function fakeSupabase(ctx, nuvem, id = DONO) {
  const user = { id, aud: 'authenticated', role: 'authenticated', email: 'eu@teste.com', app_metadata: {}, user_metadata: {} };
  await ctx.route(/supabase\.co\//, async route => {
    const req = route.request(), u = new URL(req.url()), json = (corpo, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(corpo) });
    if (!nuvem.online) return route.abort('internetdisconnected');
    if (u.pathname === '/auth/v1/token') {
      const corpo = req.postDataJSON() || {};
      if (u.searchParams.get('grant_type') === 'password' && corpo.password !== 'senha123') return json({ code: 400, error_code: 'invalid_credentials', msg: 'Invalid login credentials' }, 400);
      const exp = Math.floor(Date.now() / 1000) + 3600;
      return json({ access_token: b64u({ alg: 'HS256' }) + '.' + b64u({ sub: user.id, exp, role: 'authenticated' }) + '.x', token_type: 'bearer', expires_in: 3600, expires_at: exp, refresh_token: 'r', user });
    }
    if (u.pathname === '/auth/v1/user') return json(user);
    if (u.pathname === '/auth/v1/logout') return route.fulfill({ status: 204 });
    if (u.pathname === '/functions/v1/al-estimar') {
      if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*' } });
      nuvem.chamadasIA++;
      const { status, corpo } = nuvem.ia(req.postDataJSON()?.texto);
      return route.fulfill({ status, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(corpo) });
    }
    const t = u.pathname.replace('/rest/v1/', ''), linhas = nuvem.tabelas[t];
    if (!linhas) return json({ message: 'tabela?' }, 404);
    const filtros = [...u.searchParams].filter(([, v]) => v.startsWith('eq.')).map(([k, v]) => [k, v.slice(3)]);
    const chave = l => CHAVES[t].map(k => l[k]).join('|');
    if (req.method() === 'GET') { const off = +(u.searchParams.get('offset') || 0), lim = +(u.searchParams.get('limit') || 1e9); return json(linhas.slice(off, off + lim)); }
    if (req.method() === 'POST') {
      for (const l of [].concat(req.postDataJSON())) { const i = linhas.findIndex(x => chave(x) === chave(l)); if (i >= 0) linhas[i] = l; else linhas.push(l); }
      // Metrô: gravou no banco, mas a resposta não volta (o sinal caiu no meio)
      if (nuvem.perderResposta > 0) { nuvem.perderResposta--; return route.abort('connectionreset'); }
      return route.fulfill({ status: 201 });
    }
    if (req.method() === 'DELETE') { nuvem.tabelas[t] = linhas.filter(l => !filtros.every(([k, v]) => String(l[k]) === v)); return route.fulfill({ status: 204 }); }
    return json({}, 405);
  });
}

// Peso de 100 kg e 1 h de treino na sexta 18/09/2026 (24 anos desde 14/09: basal 1998 kcal). Sexta não tem caminhada nem treino na rotina.
export const DIA = '2026-09-18';
export const comTreino = nuvem => {
  nuvem.tabelas.corpo_medida.push({ user_id: DONO, data: '2026-09-10', hora: '', peso: '100', cintura: null });
  nuvem.tabelas.tr_treino.push({ user_id: DONO, inicio: '2026-09-18T13:00:00+00:00', fim: '2026-09-18T14:00:00+00:00', fechado: true });
  return nuvem;
};

// Fontes do Google são bloqueadas para o teste não depender de internet. Relógio fixo no meio da tarde do DIA.
export async function abrirApp({ busca = '', nuvem = novaNuvem(), conta, relogio = new Date('2026-09-18T15:30:00-03:00') } = {}) {
  const ctx = await app.navegador.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, timezoneId: 'America/Sao_Paulo', serviceWorkers: 'block' });
  await ctx.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
  await fakeSupabase(ctx, nuvem, conta);
  const pg = await ctx.newPage(), erros = [];
  pg.on('pageerror', e => erros.push(e.message));
  await pg.clock.install({ time: relogio });
  await pg.goto(app.url + busca);   // busca: ?dia=… (aberto pela página inicial num dia anterior)
  await pg.fill('#l-usuario', 'eu@teste.com'); await pg.fill('#l-senha', 'senha123'); await pg.press('#l-senha', 'Enter');
  if (!conta) await pg.waitForSelector('#v-dia:not([hidden])');
  return { ctx, pg, erros, nuvem };
}
export const sincronizado = pg => pg.waitForFunction(() => !temPendente() && !enviando);
export const texto = async (pg, sel) => (await pg.textContent(sel)).replace(/\s+/g, ' ').trim();
