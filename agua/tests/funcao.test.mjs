// Edge Function agua-lembrete: horários do lembrete, "já bebeu", token do agendamento, teste só do Victor e VAPID válido.
// Roda o index.ts de verdade: o Node remove os tipos, `Deno`, o relógio e a rede são simulados; a criptografia é a real.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { stripTypeScriptTypes } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const fonte = readFileSync(path.join(RAIZ, 'supabase/functions/agua-lembrete/index.ts'), 'utf8');
const DONO = '32f70255-30a0-4e2b-ad76-31d7a1bf54f7';
const ENDPOINT = 'https://fcm.googleapis.com/fcm/send/abc';

// banco: { chave, inscricoes, aguas }; push: status que o servidor de push devolve
function carregar({ agora = '2026-10-19T11:01:00-03:00', aguas = [], inscricoes = [ENDPOINT], push = 201, usuario = DONO } = {}) {
  let handler = null;
  const banco = { chave: null, inscricoes: [...inscricoes] }, rede = [], fixo = new Date(agora).getTime();
  class Relogio extends Date { constructor(...a) { super(...(a.length ? a : [fixo])); } static now() { return fixo; } }
  const ok = (corpo, status = 200) => new Response(corpo == null ? null : JSON.stringify(corpo), { status });
  const contexto = {
    Deno: { env: { get: k => ({ SUPABASE_URL: 'https://exemplo.test', SUPABASE_SERVICE_ROLE_KEY: 'servico' })[k] }, serve: h => { handler = h; } },
    Response, Request, URL, Intl, Date: Relogio, TextEncoder, crypto, btoa, console,
    fetch: async (url, opcoes = {}) => {
      url = String(url); rede.push({ url, opcoes });
      if (url.endsWith('/auth/v1/user')) return usuario ? ok({ id: usuario }) : ok({}, 401);
      if (url.includes('/rest/v1/push_chave?select')) return ok(banco.chave ? [banco.chave] : []);
      if (url.includes('/rest/v1/push_chave?on_conflict')) { banco.chave ||= JSON.parse(opcoes.body); return ok(null, 201); }
      if (url.includes('/rest/v1/push_inscricao?select')) return ok(banco.inscricoes.map(endpoint => ({ endpoint })));
      if (url.includes('/rest/v1/push_inscricao?endpoint=eq.')) { const e = decodeURIComponent(url.split('endpoint=eq.')[1]); banco.inscricoes = banco.inscricoes.filter(x => x !== e); return ok(null, 204); }
      if (url.includes('/rest/v1/agua_dia?select')) return ok(aguas.length ? [{ aguas: aguas.map(hora => ({ hora, ml: 200 })) }] : []);
      if (url.startsWith('https://fcm.googleapis.com/')) return new Response(null, { status: push });
      return ok({}, 404);
    },
  };
  vm.createContext(contexto);
  vm.runInContext(stripTypeScriptTypes(fonte.replace(/^import "jsr:[^"]+";$/m, '')), contexto);
  return { handler, rede, banco };
}
const pedir = (handler, { metodo = 'POST', busca = '', headers = {}, corpo } = {}) =>
  handler(new Request(`https://exemplo.test/functions/v1/agua-lembrete${busca}`, { method: metodo, headers, body: corpo === undefined ? undefined : JSON.stringify(corpo) }));
const ler = async r => ({ status: r.status, corpo: await r.json() });
// Chamada do agendamento: gera as chaves (como o app faria) e manda com o token gravado
async function agendado(f) {
  await pedir(f.handler, { metodo: 'GET', busca: '?chave' });
  return ler(await pedir(f.handler, { headers: { 'x-agua-token': f.banco.chave.token } }));
}
const enviados = f => f.rede.filter(r => r.url === ENDPOINT);

test('nenhum segredo no código: chaves VAPID e token nascem na função e ficam só no banco', () => {
  assert.doesNotMatch(fonte, /service_role|sb_secret_|"d":|BEGIN PRIVATE/);
  assert.match(fonte, /Deno\.env\.get\("SUPABASE_SERVICE_ROLE_KEY"\)/);
  assert.match(fonte, /const SUPABASE_KEY = "sb_publishable_/);
});

test('mesma rotina do Corpo: presencial é o ROTINA.presencial de corpo/perfil.js', () => {
  const contexto = {};
  vm.createContext(contexto);
  vm.runInContext(readFileSync(path.join(RAIZ, '..', 'corpo', 'perfil.js'), 'utf8') + '\nglobalThis.R = ROTINA;', contexto);
  assert.deepEqual(JSON.parse(fonte.match(/const PRESENCIAL = (\[[^\]]*\])/)[1]), [...contexto.R.presencial]);
});

test('GET ?chave gera as chaves uma vez só e devolve só a pública (65 bytes, P-256)', async () => {
  const f = carregar();
  const a = await ler(await pedir(f.handler, { metodo: 'GET', busca: '?chave' }));
  const b = await ler(await pedir(f.handler, { metodo: 'GET', busca: '?chave' }));
  assert.equal(a.status, 200);
  assert.deepEqual(Object.keys(a.corpo), ['publica']);
  assert.equal(a.corpo.publica, b.corpo.publica);
  assert.equal(Buffer.from(a.corpo.publica, 'base64url').length, 65);
  assert.equal(f.rede.filter(r => r.url.includes('push_chave?on_conflict')).length, 1);
  assert.equal(f.rede.find(r => r.url.includes('/rest/v1/')).opcoes.headers.Authorization, 'Bearer servico');
});

test('agendamento: em casa de hora em hora, presencial e fim de semana de 2 em 2, só das 10 às 16', async () => {
  const casos = [
    ['2026-10-19T09:01:00-03:00', false],   // segunda (casa), antes das 10
    ['2026-10-19T10:01:00-03:00', true],
    ['2026-10-19T11:01:00-03:00', true],
    ['2026-10-19T16:01:00-03:00', true],
    ['2026-10-19T17:01:00-03:00', false],
    ['2026-10-21T11:01:00-03:00', false],   // quarta (presencial)
    ['2026-10-21T12:01:00-03:00', true],
    ['2026-10-22T15:01:00-03:00', false],   // quinta (presencial)
    ['2026-10-24T13:01:00-03:00', false],   // sábado
    ['2026-10-25T14:01:00-03:00', true],    // domingo
    ['2026-10-23T13:01:00-03:00', true],    // sexta (casa)
  ];
  for (const [agora, manda] of casos) {
    const f = carregar({ agora });
    const r = await agendado(f);
    assert.equal(r.corpo.enviado, manda, agora);
    assert.equal(enviados(f).length, manda ? 1 : 0, agora);
    if (!manda) assert.equal(r.corpo.motivo, 'fora do horário', agora);
  }
});

test('agendamento: não manda se já bebeu de 30 min antes do horário até agora', async () => {
  let f = carregar({ aguas: ['10:40'] });                  // 11:01: 10:40 conta
  assert.deepEqual((await agendado(f)).corpo, { enviado: false, motivo: 'já bebeu' });
  f = carregar({ aguas: ['10:20'] });                      // antes das 10:30: não conta
  assert.deepEqual((await agendado(f)).corpo, { enviado: true, inscricoes: 1, enviados: 1 });
});

test('agendamento: token errado ou vazio dá 401 sem mandar nada', async () => {
  const f = carregar();
  await pedir(f.handler, { metodo: 'GET', busca: '?chave' });
  for (const token of ['errado', '']) assert.equal((await pedir(f.handler, { headers: { 'x-agua-token': token } })).status, 401);
  assert.equal(enviados(f).length, 0);
});

test('push com VAPID válido (ES256, aud do servidor de push, sub do Victor) e sem conteúdo', async () => {
  const f = carregar();
  await agendado(f);
  const { opcoes } = enviados(f)[0];
  assert.equal(opcoes.method, 'POST');
  assert.equal(opcoes.headers['Content-Length'], '0');
  assert.equal(opcoes.headers.TTL, '3600');
  const [, jwt, k] = opcoes.headers.Authorization.match(/^vapid t=([^,]+), k=(.+)$/);
  assert.equal(k, f.banco.chave.publica);
  const [h, p, s] = jwt.split('.'), json = x => JSON.parse(Buffer.from(x, 'base64url'));
  assert.deepEqual(json(h), { typ: 'JWT', alg: 'ES256' });
  const carga = json(p);
  assert.equal(carga.aud, 'https://fcm.googleapis.com');
  assert.equal(carga.sub, 'mailto:victor.cabrera0209@gmail.com');
  assert.equal(carga.exp, Math.floor(new Date('2026-10-19T11:01:00-03:00').getTime() / 1000) + 12 * 3600);
  const publica = await crypto.subtle.importKey('raw', Buffer.from(k, 'base64url'), { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
  assert.ok(await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, publica, Buffer.from(s, 'base64url'), new TextEncoder().encode(`${h}.${p}`)));
});

test('inscrição que o servidor de push diz não existir mais (410) sai da tabela', async () => {
  const f = carregar({ push: 410 });
  assert.deepEqual((await agendado(f)).corpo, { enviado: true, inscricoes: 1, enviados: 0 });
  assert.deepEqual(f.banco.inscricoes, []);
});

test('teste pelo app: só a sessão do Victor e com { acao: "teste" }; manda mesmo fora do horário', async () => {
  const sessao = { authorization: 'Bearer tok', 'content-type': 'application/json' };
  let f = carregar({ agora: '2026-10-19T22:00:00-03:00' });
  assert.equal((await pedir(f.handler, { corpo: { acao: 'teste' } })).status, 401);
  assert.equal((await pedir(f.handler, { headers: sessao, corpo: { acao: 'outra' } })).status, 400);
  assert.deepEqual(await ler(await pedir(f.handler, { headers: sessao, corpo: { acao: 'teste' } })), { status: 200, corpo: { enviado: true, inscricoes: 1, enviados: 1 } });
  f = carregar({ usuario: 'outra-conta' });
  assert.equal((await pedir(f.handler, { headers: sessao, corpo: { acao: 'teste' } })).status, 403);
  f = carregar({ usuario: null });
  assert.equal((await pedir(f.handler, { headers: sessao, corpo: { acao: 'teste' } })).status, 401);
  assert.equal(enviados(f).length, 0);
});

test('CORS para o app no GitHub Pages; outros métodos recusados', async () => {
  const f = carregar();
  const r = await pedir(f.handler, { metodo: 'OPTIONS' });
  assert.equal(r.status, 204);
  assert.equal(r.headers.get('access-control-allow-origin'), '*');
  assert.equal((await pedir(f.handler, { metodo: 'GET' })).status, 405);
});
