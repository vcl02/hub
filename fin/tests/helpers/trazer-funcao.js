// Ajuda dos testes de função do Fin: traz, de um arquivo publicado (js/form.js, js/interactions.js...), funções de nível
// de script para dentro do contexto de `carregarTela`, para rodar a função de verdade sem montar a página inteira.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const FIN = path.join(__dirname, '..', '..');

function trazer(ctx, arquivo, nomes) {
  const fonte = fs.readFileSync(path.join(FIN, arquivo), 'utf8');

  for (const nome of nomes) {
    const ini = Math.max(
      fonte.indexOf(`\nasync function ${nome}(`),
      fonte.indexOf(`\nfunction ${nome}(`)
    );

    if (ini < 0) throw Error(`${nome} não está em ${arquivo}`);
    const fim = fonte.indexOf('\n}\n', ini) + 3;

    vm.runInContext(fonte.slice(ini, fim), ctx, { filename: arquivo });
  }
}

module.exports = { trazer };
