// Edge Function al-estimar: chave só no secret, só a conta do Victor, limite do dia e resposta limpa da IA.
// Roda o index.ts de verdade: o Node remove os tipos, o `Deno` e o SDK da Anthropic são simulados; nada sai para a rede.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { stripTypeScriptTypes } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const fonte = readFileSync(path.join(RAIZ, 'supabase/functions/al-estimar/index.ts'), 'utf8');
const DONO = '32f70255-30a0-4e2b-ad76-31d7a1bf54f7';
const HOJE = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());

// SDK falso: messages.create devolve o que o teste mandar (ou lança o erro); as classes de erro seguem os nomes do SDK.
const SDK = `
class APIError extends Error { constructor(status, m) { super(m); this.status = status; } }
class RateLimitError extends APIError {}
class AuthenticationError extends APIError {}
class Anthropic {
  constructor(opcoes) { Anthropic.opcoes = opcoes; this.messages = { create: async p => { Anthropic.pedidos.push(p); return Anthropic.resposta(p); } }; }
}
Anthropic.APIError = APIError; Anthropic.RateLimitError = RateLimitError; Anthropic.AuthenticationError = AuthenticationError;
Anthropic.pedidos = [];`;

function carregar({ env = { ANTHROPIC_API_KEY: 'chave-teste' }, usuario = DONO, chamadas = 0, resposta } = {}) {
  let handler = null;
  const rede = [];
  const contexto = {
    Deno: { env: { get: k => ({ SUPABASE_URL: 'https://exemplo.test', ...env })[k] }, serve: h => { handler = h; } },
    Response, Request, URL, Intl, Date, Math, Number, String, JSON, Array, Promise, Error, SyntaxError, console,
    fetch: async (url, opcoes = {}) => {
      rede.push({ url: String(url), opcoes });
      if (String(url).endsWith('/auth/v1/user')) return usuario ? new Response(JSON.stringify({ id: usuario })) : new Response('{}', { status: 401 });
      if (String(url).includes('/rest/v1/al_uso?select')) return new Response(JSON.stringify(chamadas ? [{ chamadas }] : []));
      if (String(url).includes('/rest/v1/al_uso?on_conflict')) return new Response(null, { status: 201 });
      return new Response('?', { status: 404 });
    },
  };
  vm.createContext(contexto);
  const js = stripTypeScriptTypes(fonte.replace(/^import "jsr:[^"]+";$/m, '').replace(/^import Anthropic from "npm:@anthropic-ai\/sdk@[\d.]+";$/m, SDK));
  vm.runInContext(js + '\nglobalThis.Anthropic = Anthropic;', contexto);
  contexto.Anthropic.resposta = resposta || (() => ({ stop_reason: 'end_turn', content: [{ type: 'thinking', thinking: '' }, { type: 'text', text: JSON.stringify({ itens: [] }) }] }));
  return { handler, rede, sdk: contexto.Anthropic };
}
const pedido = (corpo = { texto: '2 ovos' }, token = 'tok') => new Request('https://exemplo.test/functions/v1/al-estimar', {
  method: 'POST', headers: token ? { authorization: `Bearer ${token}`, 'content-type': 'application/json' } : {}, body: JSON.stringify(corpo),
});
const ler = async r => ({ status: r.status, corpo: await r.json() });
const daqui = x => JSON.parse(JSON.stringify(x));   // objeto criado dentro do vm → deste contexto, para o deepEqual

test('nenhuma chave no código: a da Anthropic vem só do secret ANTHROPIC_API_KEY', () => {
  assert.doesNotMatch(fonte, /sk-ant-|service_role|sb_secret_/);
  assert.match(fonte, /Deno\.env\.get\("ANTHROPIC_API_KEY"\)/);
  assert.match(fonte, /const SUPABASE_KEY = "sb_publishable_/);
  assert.match(fonte, /import Anthropic from "npm:@anthropic-ai\/sdk@\d+\.\d+\.\d+";/, 'versão exata do SDK');
});

test('sem o secret recusa tudo (503) sem chamar ninguém', async () => {
  const { handler, rede } = carregar({ env: {} });
  assert.equal((await handler(pedido())).status, 503);
  assert.deepEqual(rede, []);
});

test('só a conta do Victor: sem sessão 401, outra conta 403, e a IA nem é chamada', async () => {
  let f = carregar();
  assert.equal((await f.handler(pedido(undefined, ''))).status, 401);
  f = carregar({ usuario: null });
  assert.equal((await f.handler(pedido())).status, 401);
  f = carregar({ usuario: 'outra-conta' });
  assert.equal((await f.handler(pedido())).status, 403);
  assert.equal(f.sdk.pedidos.length, 0);
  const auth = f.rede.find(r => r.url.endsWith('/auth/v1/user'));
  assert.equal(auth.opcoes.headers.Authorization, 'Bearer tok');
});

test('texto vazio ou longo demais dá 400', async () => {
  const { handler } = carregar();
  assert.equal((await handler(pedido({ texto: '  ' }))).status, 400);
  assert.equal((await handler(pedido({ texto: 'x'.repeat(501) }))).status, 400);
});

test('limite do dia: na 40ª chamada já feita devolve 429 sem chamar a IA; antes disso conta +1', async () => {
  let f = carregar({ chamadas: 40 });
  assert.equal((await f.handler(pedido())).status, 429);
  assert.equal(f.sdk.pedidos.length, 0);
  f = carregar({ chamadas: 3 });
  assert.equal((await f.handler(pedido())).status, 200);
  const gravou = f.rede.find(r => r.url.includes('on_conflict=user_id,data'));
  assert.deepEqual(JSON.parse(gravou.opcoes.body), { user_id: DONO, data: HOJE, chamadas: 4 });
  assert.equal(gravou.opcoes.headers.Authorization, 'Bearer tok');   // grava com a sessão do Victor (RLS), não com chave de serviço
});

test('pede ao Haiku com saída em JSON e devolve os itens limpos e arredondados', async () => {
  const bruto = { itens: [
    { nome: '  Ovo   mexido ', porcao: '2 unidades (~100 g)', kcal: 180.4, prot: 12.46, carb: 1.23, gord: 14 },
    { nome: '', porcao: 'x', kcal: 1, prot: 1, carb: 1, gord: 1 },
    { nome: 'Feijoada', porcao: 'prato', kcal: 99999, prot: -3, carb: 'abc', gord: 30 },
  ] };
  const { handler, sdk } = carregar({ resposta: () => ({ stop_reason: 'end_turn', content: [{ type: 'thinking', thinking: '' }, { type: 'text', text: JSON.stringify(bruto) }] }) });
  const r = await ler(await handler(pedido({ texto: '2 ovos mexidos e feijoada' })));
  assert.equal(r.status, 200);
  assert.deepEqual(r.corpo.itens, [
    { nome: 'Ovo mexido', porcao: '2 unidades (~100 g)', kcal: 180, prot: 12.5, carb: 1.2, gord: 14 },
    { nome: 'Feijoada', porcao: 'prato', kcal: 5000, prot: 0, carb: 0, gord: 30 },
  ]);
  const p = sdk.pedidos[0];
  assert.equal(sdk.opcoes.apiKey, 'chave-teste');
  assert.equal(p.model, 'claude-haiku-5-5');
  assert.equal(p.output_config.effort, 'low');
  assert.equal(p.output_config.format.type, 'json_schema');
  assert.deepEqual(daqui(p.output_config.format.schema.properties.itens.items.required), ['nome', 'porcao', 'kcal', 'prot', 'carb', 'gord']);
  assert.deepEqual(daqui(p.messages), [{ role: 'user', content: '2 ovos mexidos e feijoada' }]);
  assert.equal(p.temperature, undefined);   // o Haiku 5.5 recusa parâmetros de amostragem
});

test('erros da IA viram respostas que o app entende', async () => {
  const casos = [
    [() => ({ stop_reason: 'refusal', content: [] }), 422],
    [() => ({ stop_reason: 'max_tokens', content: [] }), 502],
    [() => ({ stop_reason: 'end_turn', content: [{ type: 'text', text: 'não é json' }] }), 502],
    [function () { throw new this.RateLimitError(429, 'ocupado'); }, 503],
    [function () { throw new this.AuthenticationError(401, 'chave'); }, 503],
    [function () { throw new this.APIError(500, 'falhou'); }, 502],
  ];
  for (const [resposta, status] of casos) {
    const f = carregar();
    f.sdk.resposta = resposta.bind(f.sdk);
    assert.equal((await f.handler(pedido())).status, status, String(resposta));
  }
});

test('CORS: o navegador pode chamar a função do GitHub Pages', async () => {
  const { handler } = carregar();
  const r = await handler(new Request('https://exemplo.test/functions/v1/al-estimar', { method: 'OPTIONS' }));
  assert.equal(r.status, 204);
  assert.equal(r.headers.get('access-control-allow-origin'), '*');
  assert.match(r.headers.get('access-control-allow-headers'), /authorization/);
  assert.equal((await handler(new Request('https://exemplo.test/functions/v1/al-estimar'))).status, 405);
});
