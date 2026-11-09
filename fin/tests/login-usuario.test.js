// Login por usuário: o app traduz victor para o e-mail da conta antes do Supabase.
const assert = require('./helpers/assert-tolerante');
const fs = require('node:fs');
const test = require('node:test');
const vm = require('node:vm');
const { elementoPorId } = require('./helpers/html');

const estado = fs.readFileSync('js/app-state.js', 'utf8');
const bootstrap = fs.readFileSync('js/bootstrap.js', 'utf8');
const pagina = fs.readFileSync('index.html', 'utf8');
const regras = fs.readFileSync('docs/REGRAS.md', 'utf8');

function carregar() {
  const inicio = estado.indexOf('const EMAIL_POR_USUARIO =');
  const fim = estado.indexOf('};', estado.indexOf('const emailDoLogin')) + 2;
  const ctx = { Estado: {} };

  vm.runInNewContext(
    `${estado.slice(inicio, fim)}\nthis.emailDoLogin = emailDoLogin;`,
    ctx
  );

  return ctx.emailDoLogin;
}

test('usuário vira o e-mail da conta; com @ vai direto; desconhecido não vira nada', () => {
  const emailDoLogin = carregar();

  assert.equal(emailDoLogin('victor'), 'victor.cabrera0209@gmail.com');
  assert.equal(emailDoLogin('  Victor '), 'victor.cabrera0209@gmail.com');
  assert.equal(emailDoLogin('isabella'), null); // a conta dela saiu
  assert.equal(emailDoLogin('outra@exemplo.test'), 'outra@exemplo.test');
  assert.equal(emailDoLogin('fulano'), null);
  assert.equal(emailDoLogin(''), null);
});

// Roda a entrar() real de js/bootstrap.js com o login do Supabase simulado; devolve o que foi pedido e o que a tela mostrou.
async function entrarCom(usuario, resposta) {
  const campos = {
    lerr: { textContent: 'antigo' },
    email: { value: usuario },
    senha: { value: 'segredo' },
  };

  const eventos = [];
  const ctx = { Estado: {}, eventos };

  Object.assign(ctx, {
    el: (id) => campos[id],
    sb: {
      auth: {
        signInWithPassword: async (dados) => {
          eventos.push(['signIn', dados]);

          return resposta;
        },
      },
    },
    mostraTela: (logado) => eventos.push(['mostraTela', logado]),
    load: () => eventos.push(['load']),
  });

  const inicio = bootstrap.indexOf('async function entrar() {');

  vm.runInNewContext(
    `${estado.slice(estado.indexOf('const EMAIL_POR_USUARIO ='), estado.indexOf('};', estado.indexOf('const emailDoLogin')) + 2)}\n${bootstrap.slice(inicio, bootstrap.indexOf('\n}\n', inicio) + 3)}\nthis.entrar = entrar;`,
    ctx
  );
  await ctx.entrar();

  return { eventos: JSON.parse(JSON.stringify(eventos)), erro: campos.lerr.textContent };
}

test('login usa a tradução e o erro não revela usuários', async () => {
  // usuário conhecido entra com o e-mail da conta
  assert.deepEqual(await entrarCom('victor', { data: {}, error: null }), {
    eventos: [
      ['signIn', { email: 'victor.cabrera0209@gmail.com', password: 'segredo' }],
      ['mostraTela', 1],
      ['load'],
    ],
    erro: '',
  });

  // desconhecido: nem chega no Supabase e recebe a mesma mensagem da senha errada
  assert.deepEqual(await entrarCom('fulano', { data: {}, error: null }), {
    eventos: [],
    erro: 'Usuário ou senha inválidos.',
  });

  // senha errada (o servidor respondeu): mesma mensagem
  const errada = await entrarCom('victor', { data: null, error: { status: 400 } });

  assert.equal(errada.erro, 'Usuário ou senha inválidos.');
  assert.deepEqual(
    errada.eventos.map((e) => e[0]),
    ['signIn']
  );

  // sem resposta do servidor (status 0): é a rede, não a senha, e a tela não entra
  const semRede = await entrarCom('victor', { data: null, error: { status: 0 } });

  assert.equal(semRede.erro, 'Sem conexão. Tente de novo.');
  assert.deepEqual(
    semRede.eventos.map((e) => e[0]),
    ['signIn']
  );
});

test('o campo de login aceita texto livre (usuário ou e-mail)', () => {
  assert.deepEqual(elementoPorId(pagina, 'email'), {
    tag: 'input',
    attrs: {
      id: 'email',
      type: 'text',
      autocomplete: 'username',
      autocapitalize: 'none',
      spellcheck: 'false',
    },
  });
  assert.match(
    regras,
    /Sem resposta do servidor \(sem internet\), a mensagem é `Sem conexão\. Tente de novo\.`/
  );
  assert.match(regras, /O campo de login aceita \*\*usuário\*\* ou e-mail/);
});
