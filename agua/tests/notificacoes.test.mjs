// Notificações de verdade: ativar inscreve o aparelho (push simulado no navegador), testar chama a função, e o service
// worker mostra a notificação e abre a Água ao tocar (sw.js num contexto falso).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { prepararApp, abrirApp, novaNuvem, texto, DONO } from './helpers/app.mjs';

prepararApp();
const RAIZ = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

// Push simulado: permissão (a resposta vem de window.__resposta), service worker pronto e inscrição em memória
function pushFalso({ resposta = 'granted', semPush = false } = {}) {
  let permissao = 'default', sub = null;
  window.__inscreveu = null;
  if (semPush) { delete window.PushManager; return; }
  window.PushManager ||= function () {};
  Object.defineProperty(Notification, 'permission', { get: () => permissao });
  Notification.requestPermission = async () => (permissao = resposta);
  const pushManager = {
    getSubscription: async () => sub,
    subscribe: async o => { window.__inscreveu = { userVisibleOnly: o.userVisibleOnly, chave: [...o.applicationServerKey] }; return (sub = { endpoint: 'https://push.exemplo.test/abc' }); },
  };
  Object.defineProperty(navigator.serviceWorker, 'ready', { get: () => Promise.resolve({ pushManager }) });
}
const visiveis = pg => pg.$$eval('#n-linha > *', L => L.filter(x => !x.hidden).map(x => x.id));

test('ativar: pede permissão, inscreve com a chave da função e grava o aparelho; testar chama a função', async () => {
  const nuvem = novaNuvem();
  const { ctx, pg, erros } = await abrirApp({ nuvem, iniciar: [pushFalso, {}] });
  assert.deepEqual(await visiveis(pg), ['n-ativar']);
  await pg.click('#n-ativar');
  await pg.waitForSelector('#n-ligadas:not([hidden])');
  assert.equal(await texto(pg, '#toast'), 'Notificações ligadas');
  assert.deepEqual(await visiveis(pg), ['n-ligadas']);
  const inscreveu = await pg.evaluate(() => window.__inscreveu);
  assert.equal(inscreveu.userVisibleOnly, true);
  assert.deepEqual(inscreveu.chave, [4, ...Array.from({ length: 64 }, (_, i) => i + 1)]);   // a chave pública decodificada
  assert.deepEqual(nuvem.tabelas.push_inscricao, [{ user_id: DONO, endpoint: 'https://push.exemplo.test/abc', app: 'agua' }]);
  assert.deepEqual(nuvem.funcao.map(x => [x.metodo, x.busca]), [['GET', '?chave']]);
  await pg.click('#n-testar');
  await pg.waitForFunction(() => document.getElementById('toast').textContent.startsWith('Enviada'));
  assert.equal(await texto(pg, '#toast'), 'Enviada: chega em instantes.');
  const teste = nuvem.funcao.at(-1);
  assert.deepEqual([teste.metodo, teste.corpo], ['POST', { acao: 'teste' }]);
  assert.match(teste.auth, /^Bearer .+\..+\..+/);                       // vai com a sessão do Victor
  assert.deepEqual(erros, []);
  await ctx.close();
});

test('permissão negada: avisa e mostra que está bloqueado; sem push no navegador a linha some', async () => {
  const a = await abrirApp({ iniciar: [pushFalso, { resposta: 'denied' }] });
  await a.pg.click('#n-ativar');
  await a.pg.waitForSelector('#n-negado:not([hidden])');
  assert.equal(await texto(a.pg, '#toast'), 'Notificações bloqueadas no celular.');
  assert.deepEqual(await visiveis(a.pg), ['n-negado']);
  assert.equal(a.nuvem.tabelas.push_inscricao.length, 0);
  await a.ctx.close();
  const b = await abrirApp({ iniciar: [pushFalso, { semPush: true }] });   // ex.: iPhone fora da tela inicial
  assert.equal(await b.pg.isVisible('#n-linha'), false);
  assert.deepEqual(b.erros, []);
  await b.ctx.close();
});

test('service worker: push mostra "Hora de beber água"; tocar foca a Água aberta ou abre uma', async () => {
  const ouvintes = {}, mostradas = [], abertas = [], focadas = [];
  let janelas = [];
  const contexto = {
    URL, Promise, console,
    caches: {}, fetch: () => Promise.reject(new Error('rede')),
    self: {
      location: 'https://vcl02.github.io/hub/agua/sw.js',
      addEventListener: (tipo, f) => { ouvintes[tipo] = f; },
      registration: { showNotification: async (titulo, o) => { mostradas.push({ titulo, ...o }); } },
      clients: { matchAll: async () => janelas, openWindow: async u => { abertas.push(u); } },
    },
  };
  vm.createContext(contexto);
  vm.runInContext(readFileSync(path.join(RAIZ, 'sw.js'), 'utf8'), contexto);
  const disparar = async (tipo, extra = {}) => { let p; ouvintes[tipo]({ waitUntil: x => { p = x; }, ...extra }); await p; };
  await disparar('push');
  assert.equal(mostradas.length, 1);
  assert.equal(mostradas[0].titulo, 'Hora de beber água');
  assert.equal(mostradas[0].tag, 'agua-lembrete');
  const notificacao = { close: () => {} };
  await disparar('notificationclick', { notification: notificacao });
  assert.deepEqual(abertas, ['./']);
  janelas = [{ url: 'https://vcl02.github.io/hub/fin/', focus: () => focadas.push('fin') }, { url: 'https://vcl02.github.io/hub/agua/', focus: () => focadas.push('agua') }];
  await disparar('notificationclick', { notification: notificacao });
  assert.deepEqual(focadas, ['agua']);
  assert.deepEqual(abertas, ['./']);
});
