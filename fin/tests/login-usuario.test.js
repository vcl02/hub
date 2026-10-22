// Login por usuário: o app traduz victor para o e-mail da conta antes do Supabase.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');
const vm = require('node:vm');

const estado = fs.readFileSync('js/app-state.js', 'utf8');
const bootstrap = fs.readFileSync('js/bootstrap.js', 'utf8');
const pagina = fs.readFileSync('index.html', 'utf8');
const regras = fs.readFileSync('docs/REGRAS.md', 'utf8');

function carregar() {
    const inicio = estado.indexOf("const EMAIL_POR_USUARIO =");
    const fim = estado.indexOf('};', estado.indexOf('const emailDoLogin')) + 2;
    const ctx = { Estado: {} };
    vm.runInNewContext(`${estado.slice(inicio, fim)}\nthis.emailDoLogin = emailDoLogin;`, ctx);
    return ctx.emailDoLogin;
}

test('usuário vira o e-mail da conta; com @ vai direto; desconhecido não vira nada', () => {
    const emailDoLogin = carregar();
    assert.equal(emailDoLogin('victor'), 'victor.cabrera0209@gmail.com');
    assert.equal(emailDoLogin('  Victor '), 'victor.cabrera0209@gmail.com');
    assert.equal(emailDoLogin('isabella'), null);   // a conta dela saiu
    assert.equal(emailDoLogin('outra@exemplo.test'), 'outra@exemplo.test');
    assert.equal(emailDoLogin('fulano'), null);
    assert.equal(emailDoLogin(''), null);
});

test('login usa a tradução, campo aceita texto livre e erro não revela usuários', () => {
    assert.match(bootstrap, /const email = emailDoLogin\(el\('email'\)\.value\);/);
    assert.match(bootstrap, /\? await sb\.auth\.signInWithPassword\(\{ email, password: el\('senha'\)\.value \}\)\s*\n\s*: \{ data: null, error: true \};/);
    assert.match(bootstrap, /el\('lerr'\)\.textContent = 'Usuário ou senha inválidos\.';/);
    assert.match(pagina, /<input id=email type=text autocomplete=username autocapitalize=none spellcheck=false>/);
    assert.match(regras, /O campo de login aceita \*\*usuário\*\* ou e-mail/);
});
