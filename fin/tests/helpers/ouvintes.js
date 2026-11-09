// Ajuda dos testes de função do Fin: roda UM ouvinte de evento de js/*.js (o `el('x').addEventListener('click', …)` de nível de
// script) sem abrir a página. O teste diz uma frase que só existe dentro do ouvinte (`marcador`); o trecho inteiro (do
// `addEventListener` que o abre até o `});` que o fecha) roda num contexto com o `el` falso, que guarda as funções
// registradas por evento. `dependencias` pode ser uma função que recebe o registrador (para o teste montar o próprio `el`).
// Devolve o contexto (com as dependências do teste) e o ouvinte do `evento` pedido, pronto para ser chamado com um evento falso.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const FIN = path.join(__dirname, '..', '..');

function ouvinteDe(arquivo, marcador, dependencias = {}, { evento = 'click' } = {}) {
  const fonte = fs.readFileSync(path.join(FIN, arquivo), 'utf8');
  const dentro = fonte.indexOf(marcador);

  if (dentro < 0) throw Error(`${marcador} não está em ${arquivo}`);
  const inicio = fonte.lastIndexOf('addEventListener(', dentro);
  const abre = fonte.lastIndexOf('\n', inicio) + 1;
  const fim = fonte.indexOf('\n});\n', dentro) + 5;
  const ouvintes = {};

  const registra = (tipo, f) => {
    ouvintes[tipo] = f;
  };

  const ctx = {
    el: () => ({ addEventListener: registra }),
    addEventListener: registra, // o global (window) do navegador
    document: { addEventListener: registra },
    ...(typeof dependencias === 'function' ? dependencias(registra) : dependencias),
  };

  vm.createContext(ctx);
  vm.runInContext(fonte.slice(abre, fim), ctx, { filename: arquivo });

  if (!ouvintes[evento])
    throw Error(`Nenhum ouvinte de ${evento} registrado a partir de ${marcador}`);

  return { ctx, ouvinte: ouvintes[evento] };
}

module.exports = { ouvinteDe };
