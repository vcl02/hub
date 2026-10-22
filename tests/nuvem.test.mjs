// Login e sincronização com o Supabase (falso): outro aparelho, offline, migração da versão antiga, conta única.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { prepararApp, app, abrirApp, novaNuvem, fakeSupabase, sincronizado } from './helpers/app.mjs';

prepararApp();

test('salva na nuvem e abre em outro aparelho', async () => {
  const a = await abrirApp();
  await a.pg.tap('.slot >> nth=0'); await a.pg.fill('#e-carga', '40'); await a.pg.dispatchEvent('#e-carga', 'input');
  await a.pg.click('#t-feita'); await a.pg.click('#t-feita');
  await sincronizado(a.pg);
  assert.equal(a.nuvem.tabelas.tr_exercicio.length, 6);
  assert.deepEqual(a.nuvem.tabelas.tr_registro.map(r => r.series), [[{ kg: 40, reps: 12 }]]);
  const b = await abrirApp({ nuvem: a.nuvem });                                              // outro aparelho, mesma conta
  assert.match(await b.pg.textContent('.slot >> nth=0'), /40kg.*12/);
  assert.deepEqual([...a.erros, ...b.erros], []); await a.ctx.close(); await b.ctx.close();
});

test('sem internet guarda no aparelho e envia ao reconectar', async () => {
  const { ctx, pg, nuvem, erros } = await abrirApp();
  await sincronizado(pg);
  nuvem.online = false;
  await pg.click('#i-corpo'); await pg.fill('#c-peso', '91'); await pg.click('#c-form button[type=submit]');
  await pg.waitForFunction(() => erroSync);
  await pg.goBack();
  assert.match(await pg.textContent('#i-sync'), /Sem internet/);
  await pg.reload(); await pg.waitForSelector('#v-inicio:not([hidden])');                     // abre offline com a cópia local
  await pg.click('#i-corpo'); assert.match(await pg.textContent('#c-historico'), /91 kg/); await pg.goBack();
  nuvem.online = true;
  await pg.evaluate(() => dispatchEvent(new Event('online')));
  await sincronizado(pg);
  assert.equal(nuvem.tabelas.tr_medida[0].peso, 91);
  assert.equal(await pg.isVisible('#i-sync'), false);
  assert.deepEqual(erros, []); await ctx.close();
});

test('senha errada não entra', async () => {
  const ctx = await app.navegador.newContext();
  await fakeSupabase(ctx, novaNuvem());
  const pg = await ctx.newPage(); await pg.goto(app.url);
  await pg.fill('#l-email', 'eu@teste.com'); await pg.fill('#l-senha', 'errada'); await pg.press('#l-senha', 'Enter');
  await pg.waitForFunction(() => $('l-erro').textContent);
  assert.match(await pg.textContent('#l-erro'), /inválidos/);
  assert.equal(await pg.isVisible('#v-inicio'), false);
  await ctx.close();
});

test('junta à conta o banco criptografado da versão antiga', async () => {
  // Monta o cofre antigo como a versão anterior gravava (AES-GCM, chave salva por "manter desbloqueado")
  const antes = async () => {
    const k = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']), iv = crypto.getRandomValues(new Uint8Array(12));
    const b64 = a => btoa(String.fromCharCode(...new Uint8Array(a)));
    const velho = { exercicios: [{ id: 'e1', grupo: 'Peito', regiao: 'Superior', variacoes: [{ id: 'v1', nome: 'Supino máquina' }] }],
      registros: [{ variacao: 'v1', data: '2026-10-21', series: [{ kg: 30, reps: 12 }] }], treinos: [{ inicio: 1, fim: 2 }], medidas: [] };
    const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, k, new TextEncoder().encode(JSON.stringify(velho)));
    localStorage.setItem('carga.vault.v1', JSON.stringify({ it: 1, salt: b64(new Uint8Array(16)), iv: b64(iv), ct: b64(ct) }));
    localStorage.setItem('carga.key.v1', b64(await crypto.subtle.exportKey('raw', k)));
  };
  const { ctx, pg, nuvem, erros } = await abrirApp({ antes });
  await pg.waitForFunction(() => db.registros.length === 1);
  await sincronizado(pg);
  assert.deepEqual(nuvem.tabelas.tr_registro.map(r => r.variacao_id), ['v1']);
  assert.equal(await pg.evaluate(() => localStorage.getItem('carga.vault.v1')), null);
  assert.deepEqual(erros, []); await ctx.close();
});

test('sair da conta volta para o login', async () => {
  const { ctx, pg } = await abrirApp();
  await sincronizado(pg);
  await pg.click('[data-ir="editar"]');
  assert.match(await pg.textContent('#a-info'), /eu@teste\.com.*Tudo salvo na nuvem/);
  await pg.goBack(); await pg.click('#sair');
  await pg.waitForSelector('#v-bloqueio:not([hidden])');
  assert.equal(await pg.evaluate(() => localStorage.getItem('tr.db.2f9bc201-9966-4f37-9963-2f4b9ddab849')), null);
  await ctx.close();
});

test('outra conta do Supabase não entra', async () => {
  const ctx = await app.navegador.newContext();
  await fakeSupabase(ctx, novaNuvem(), 'outra-conta');
  const pg = await ctx.newPage(); await pg.goto(app.url);
  await pg.fill('#l-email', 'eu@teste.com'); await pg.fill('#l-senha', 'senha123'); await pg.press('#l-senha', 'Enter');
  await pg.waitForFunction(() => $('l-erro').textContent);
  assert.match(await pg.textContent('#l-erro'), /não tem acesso/);
  assert.equal(await pg.isVisible('#v-inicio'), false);
  await ctx.close();
});

test('login aceita o usuário no lugar do e-mail; usuário desconhecido nem chega ao Supabase', async () => {
  const ctx = await app.navegador.newContext(), nuvem = novaNuvem(), emails = [];
  await fakeSupabase(ctx, nuvem);
  ctx.on('request', r => { if (r.url().includes('/auth/v1/token')) emails.push(r.postDataJSON()?.email); });
  const pg = await ctx.newPage(); await pg.goto(app.url);
  await pg.fill('#l-email', 'fulano'); await pg.fill('#l-senha', 'x'); await pg.press('#l-senha', 'Enter');
  assert.match(await pg.textContent('#l-erro'), /Usuário ou senha inválidos/);
  await pg.fill('#l-email', 'Victor'); await pg.fill('#l-senha', 'senha123'); await pg.press('#l-senha', 'Enter');
  await pg.waitForSelector('#v-inicio:not([hidden])');
  assert.deepEqual(emails, ['victor.cabrera0209@gmail.com']);
  await ctx.close();
});

test('sair com dados sem enviar pede um 2º toque', async () => {
  const { ctx, pg, nuvem } = await abrirApp();
  await sincronizado(pg);
  nuvem.online = false;
  await pg.click('#i-corpo'); await pg.fill('#c-peso', '91'); await pg.click('#c-form button[type=submit]'); await pg.goBack();
  await pg.click('#sair');
  assert.match(await pg.textContent('#toast-msg'), /dados sem enviar/);
  assert.equal(await pg.isVisible('#v-inicio'), true);
  await pg.click('#sair');
  await pg.waitForSelector('#v-bloqueio:not([hidden])');
  assert.notEqual(await pg.evaluate(() => localStorage.getItem('tr.db.2f9bc201-9966-4f37-9963-2f4b9ddab849')), null);   // fica para enviar depois
  await ctx.close();
});

test('login: campos brancos sobre o fundo cinza, com o nome dentro', async () => {
  const ctx = await app.navegador.newContext();
  await fakeSupabase(ctx, novaNuvem());
  const pg = await ctx.newPage(); await pg.goto(app.url); await pg.waitForSelector('#v-bloqueio:not([hidden])');
  assert.equal(await pg.evaluate(() => getComputedStyle($('l-email')).backgroundColor), 'rgb(255, 255, 255)');
  assert.equal(await pg.getAttribute('#l-email', 'placeholder'), 'Usuário');
  assert.equal(await pg.getAttribute('#l-senha', 'placeholder'), 'Senha');
  await ctx.close();
});
