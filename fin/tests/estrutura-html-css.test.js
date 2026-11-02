// Contrato estrutural: impede tags de bloco e chaves CSS desbalanceadas antes do commit.
const assert = require('./helpers/assert-tolerante');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { balanceamento } = require('./helpers/html');

const pagina = fs.readFileSync('index.html', 'utf8');
const estilos = fs.readdirSync('css').filter((arquivo) => arquivo.endsWith('.css'));

function semComentariosEStrings(css) {
  let limpo = '';
  let aspas = '';

  for (let i = 0; i < css.length; i++) {
    const atual = css[i];
    const proximo = css[i + 1];

    if (!aspas && atual == '/' && proximo == '*') {
      i = css.indexOf('*/', i + 2);

      if (i < 0) throw Error('Comentário CSS sem fechamento.');
      i++;
    } else if (!aspas && (atual == '"' || atual == "'")) {
      aspas = atual;
    } else if (aspas && atual == aspas && css[i - 1] != '\\') {
      aspas = '';
    } else if (!aspas) {
      limpo += atual;
    }
  }

  if (aspas) throw Error('String CSS sem fechamento.');

  return limpo;
}

test('as divs do HTML fecham na ordem em que foram abertas', () => {
  const { soltos, pendentes } = balanceamento(pagina, 'div');

  assert.equal(soltos, 0, `Há ${soltos} </div> sem abertura.`);
  assert.equal(pendentes, 0, `Há ${pendentes} <div> sem fechamento.`);
});

test('todos os stylesheets têm chaves CSS balanceadas', () => {
  for (const arquivo of estilos) {
    const css = semComentariosEStrings(
      fs.readFileSync(path.join('css', arquivo), 'utf8')
    );

    let abertas = 0;

    for (const caractere of css) {
      if (caractere == '{') abertas++;

      if (caractere == '}') abertas--;
      assert.ok(abertas >= 0, `${arquivo}: chave de fechamento sem abertura.`);
    }

    assert.equal(abertas, 0, `${arquivo}: chave CSS sem fechamento.`);
  }
});
