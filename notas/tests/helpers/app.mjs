// Infra dos testes de ponta a ponta das Notas: servidor estático, Chromium (o Playwright da raiz) e Supabase falso.
// Fora do hub as Notas ficam na raiz do servidor: ../supabase.js e ../base/ (do hub) chegam como /supabase.js e /base/.
import { before, after } from 'node:test';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import {
  iniciarRelogio,
  pausarRelogio,
  andarSePendente,
} from '../../../tests/relogio.mjs';

const RAIZ = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const HUB = path.join(RAIZ, '..');
const { chromium } = createRequire(path.join(HUB, 'package.json'))('playwright');

const TIPOS = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'text/javascript',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.png': 'image/png',
};

export const app = { url: null, navegador: null };
export const DONO = '32f70255-30a0-4e2b-ad76-31d7a1bf54f7';
let servidor;

export function prepararApp() {
  before(async () => {
    servidor = http.createServer((req, res) => {
      const u = decodeURIComponent(req.url.split('?')[0]);
      let p =
        u === '/supabase.js' || u.startsWith('/base/')
          ? path.join(HUB, u)
          : path.join(RAIZ, u);

      if (p.endsWith(path.sep)) p += 'index.html';
      fs.readFile(p, (e, d) => {
        if (e) {
          res.writeHead(404);
          res.end();

          return;
        }

        res.writeHead(200, {
          'content-type': TIPOS[path.extname(p)] || 'application/octet-stream',
        });
        res.end(d);
      });
    });
    await new Promise((r) => servidor.listen(0, r));
    app.url = `http://localhost:${servidor.address().port}/`;
    app.navegador = await chromium.launch();
  });
  after(async () => {
    await app.navegador?.close();
    servidor?.close();
  });
}

// Supabase falso (auth + PostgREST em memória): nada sai para a rede.
export const novaNuvem = (notas = []) => ({
  online: true,
  tabelas: { notas_nota: notas },
});
const b64u = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');

export async function fakeSupabase(ctx, nuvem, id = DONO) {
  const user = {
    id,
    aud: 'authenticated',
    role: 'authenticated',
    email: 'eu@teste.com',
    app_metadata: {},
    user_metadata: {},
  };

  await ctx.route(/supabase\.co\//, async (route) => {
    const req = route.request(),
      u = new URL(req.url()),
      json = (corpo, status = 200) =>
        route.fulfill({
          status,
          contentType: 'application/json',
          body: JSON.stringify(corpo),
        });

    if (!nuvem.online) return route.abort('internetdisconnected');

    if (u.pathname === '/auth/v1/token') {
      const corpo = req.postDataJSON() || {};

      if (
        u.searchParams.get('grant_type') === 'password' &&
        corpo.password !== 'senha123'
      )
        return json(
          {
            code: 400,
            error_code: 'invalid_credentials',
            msg: 'Invalid login credentials',
          },
          400
        );
      const exp = Math.floor(Date.now() / 1000) + 3600;

      return json({
        access_token:
          b64u({ alg: 'HS256' }) +
          '.' +
          b64u({ sub: user.id, exp, role: 'authenticated' }) +
          '.x',
        token_type: 'bearer',
        expires_in: 3600,
        expires_at: exp,
        refresh_token: 'r',
        user,
      });
    }

    if (u.pathname === '/auth/v1/user') return json(user);

    if (u.pathname === '/auth/v1/logout') return route.fulfill({ status: 204 });

    const t = u.pathname.replace('/rest/v1/', ''),
      linhas = nuvem.tabelas[t];

    if (!linhas) return json({ message: 'tabela?' }, 404);

    // eq.x, in.(a,b), gte.x e lt.x: os filtros que o banco usa (datas comparadas pelo instante, como o timestamptz)
    const valor = (v) =>
      typeof v === 'string' && !Number.isNaN(Date.parse(v)) ? Date.parse(v) : String(v);

    const filtros = [...u.searchParams]
      .filter(([, v]) => /^(eq|in|gte|lt)\./.test(v))
      .map(([k, v]) => {
        const op = v.slice(0, v.indexOf('.')),
          x = v.slice(op.length + 1);

        return [
          k,
          op,
          op === 'in'
            ? x
                .slice(1, -1)
                .split(',')
                .map((y) => y.replace(/^"|"$/g, ''))
            : x,
        ];
      });

    const passa = (l) =>
      filtros.every(([k, op, x]) =>
        op === 'eq'
          ? String(l[k]) === x
          : op === 'in'
            ? x.includes(String(l[k]))
            : op === 'gte'
              ? valor(l[k]) >= valor(x)
              : valor(l[k]) < valor(x)
      );

    // com ?select= (o .select('id') depois da gravação), a resposta leva as linhas afetadas
    const afetadas = (L) =>
      u.searchParams.has('select')
        ? json(
            L.map((l) => ({ id: l.id })),
            req.method() === 'POST' ? 201 : 200
          )
        : route.fulfill({ status: req.method() === 'POST' ? 201 : 204 });

    if (req.method() === 'GET') {
      const off = +(u.searchParams.get('offset') || 0),
        lim = +(u.searchParams.get('limit') || 1e9);

      return json(linhas.filter(passa).slice(off, off + lim));
    }

    if (req.method() === 'POST') {
      const L = [].concat(req.postDataJSON()),
        upsert = /merge-duplicates/.test(req.headers()['prefer'] || '');

      for (const l of L) {
        const i = linhas.findIndex((x) => x.id === l.id);

        if (i >= 0 && !upsert)
          return json({ code: '23505', message: 'duplicate key value' }, 409);

        if (i >= 0) linhas[i] = l;
        else linhas.push(l);
      }

      return afetadas(L);
    }

    if (req.method() === 'PATCH') {
      const L = linhas.filter(passa);

      for (const l of L) Object.assign(l, req.postDataJSON());

      return afetadas(L);
    }

    if (req.method() === 'DELETE') {
      const L = linhas.filter(passa);

      nuvem.tabelas[t] = linhas.filter((l) => !passa(l));

      return afetadas(L);
    }

    return json({}, 405);
  });
}

// Celular (390 × 844, toque) por padrão; pc: true abre como computador (1280 × 800, mouse), onde a nota vai para o editor.
// Fontes do Google são bloqueadas para o teste não depender de internet. Relógio falso pausado em 24/11/2026 10:00 depois de
// entrar (../../../tests/relogio.mjs): segurar (0,5 s), toque repetido (0,5 s), gravar do editor e envio (0,8 s) só andam com o
// runFor do teste.
export const RELOGIO = new Date('2026-11-24T10:00:00-03:00');

export async function abrirApp({ busca = '', nuvem = novaNuvem(), pc = false } = {}) {
  const ctx = await app.navegador.newContext({
    viewport: pc ? { width: 1280, height: 800 } : { width: 390, height: 844 },
    hasTouch: !pc,
    isMobile: !pc,
    timezoneId: 'America/Sao_Paulo',
    serviceWorkers: 'block',
    permissions: ['clipboard-read', 'clipboard-write'],
  });

  await ctx.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
  await fakeSupabase(ctx, nuvem);

  const pg = await ctx.newPage(),
    erros = [];

  pg.on('pageerror', (e) => erros.push(e.message));
  await iniciarRelogio(pg, RELOGIO);
  await pg.goto(app.url + busca);
  await pg.fill('#l-usuario', 'eu@teste.com');
  await pg.fill('#l-senha', 'senha123');
  await pg.press('#l-senha', 'Enter');
  await pg.waitForFunction(() => typeof carregado !== 'undefined' && carregado);
  await pausarRelogio(pg, RELOGIO);

  return { ctx, pg, erros, nuvem };
}

// Tudo enviado à nuvem: com o relógio pausado, o envio (0,8 s depois da última mudança) só sai andando o relógio
export async function sincronizado(pg) {
  await andarSePendente(pg, () => temPendente());
  await pg.waitForFunction(() => !temPendente() && !enviando, null, { timeout: 5000 });
}
