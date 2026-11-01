// Volta ao hub e login: o cabeçalho (ícone do hub e o nome, sem Sair) é conferido no navegador (navegador.test.js); aqui, a regra
// escrita e a ida ao login do hub sem sessão.
const assert = require('./helpers/assert-tolerante');
const fs = require('node:fs');
const test = require('node:test');

fs.readFileSync('index.html', 'utf8');
const regras = fs.readFileSync('docs/REGRAS.md', 'utf8');

test('REGRAS.md: o cabeçalho da base no alto, com o ícone do hub e o nome Fin', () => {
  assert.match(
    regras,
    /No alto da página fica o cabeçalho da base comum, igual ao dos outros módulos: o ícone do hub \(\*\*Hub\*\*, a marca do hub em traço\) e o nome \*\*Fin\*\*/
  );
});

test('sem sessão dentro do hub, vai pro login do hub levando o ?ciclo; fora do hub, login próprio', () => {
  const vm = require('node:vm');
  const boot = fs.readFileSync('js/bootstrap.js', 'utf8');
  const inicio = boot.indexOf('function irParaLoginDoHub() {');
  const codigo = boot.slice(inicio, boot.indexOf('\n}\n', inicio) + 3);

  const roda = (pathname, search = '', hash = '') => {
    const ctx = {
      window: {
        location: {
          pathname,
          search,
          hash,
          replace(u) {
            ctx.destino = u;
          },
        },
      },
    };

    vm.runInNewContext(`${codigo}\nthis.foi = irParaLoginDoHub();`, ctx);

    return ctx;
  };

  const noHub = roda('/hub/fin/', '?ciclo=2026-10');

  assert.equal(noHub.foi, true);
  assert.equal(noHub.destino, '../?volta=fin%2F%3Fciclo%3D2026-10');
  assert.equal(roda('/hub/fin/index.html').foi, true);
  const fora = roda('/');

  assert.equal(fora.foi, false);
  assert.equal(fora.destino, undefined);
  assert.match(boot, /\} else if \(!irParaLoginDoHub\(\)\) \{\s*\n\s*mostraTela\(0\);/);
  assert.match(regras, /sem sessão, o fin vai direto para `\.\.\/\?volta=fin\/…`/);
});
