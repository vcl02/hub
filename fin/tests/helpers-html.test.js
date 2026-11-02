// O leitor de HTML dos testes (helpers/html.js) com entradas sintéticas para cada caso e o index.html de verdade.
const assert = require('./helpers/assert-tolerante');
const fs = require('node:fs');
const test = require('node:test');

const {
  balanceamento,
  etiquetas,
  elementoPorId,
  textoDaEtiqueta,
} = require('./helpers/html');

test('corpo de <script> e <style> é código: não gera etiquetas nem engole marcação', () => {
  const html = `<p id="a"></p>
    <script>if (a<b&&c>d) { x = "<div id='fantasma'>"; y = 'it's'; }</script>
    <style>a > b { content: "<i>" }</style>
    <p id="b"></p>`;

  assert.deepEqual(
    etiquetas(html).map((e) => e.tag),
    ['p', 'script', 'style', 'p']
  );
  assert.ok(elementoPorId(html, 'b'));
  assert.equal(elementoPorId(html, 'fantasma'), undefined);
  // Script sem fecho: o resto é código, sem erro
  assert.deepEqual(
    etiquetas('<script>if (a<b) {').map((e) => e.tag),
    ['script']
  );
});

test('comentário fica de fora e "<" solto não é etiqueta', () => {
  const html = '<!-- <b id="x"> --><i>1 < 2 e 3 <4</i>';

  assert.deepEqual(
    etiquetas(html).map((e) => e.tag),
    ['i']
  );
});

test('atributo repetido vale o primeiro, como no HTML', () => {
  assert.deepEqual(etiquetas('<a id="um" id="dois" href=x href=y hidden hidden="z">'), [
    { tag: 'a', attrs: { id: 'um', href: 'x', hidden: '' } },
  ]);
});

test('entidades básicas são decodificadas nos valores', () => {
  const [e] = etiquetas(
    '<a title="&quot;oi&quot; &amp; &lt;tchau&gt; &#39;x&#39;&nbsp;y" alt=\'a&amp;b\'>'
  );

  assert.equal(e.attrs.title, '"oi" & <tchau> \'x\' y');
  assert.equal(e.attrs.alt, 'a&b');
});

test('atributos com e sem aspas, e ">" dentro das aspas', () => {
  assert.deepEqual(
    etiquetas('<input value="a>b" data-x=\'c > d\' type=text disabled />'),
    [
      {
        tag: 'input',
        attrs: { value: 'a>b', 'data-x': 'c > d', type: 'text', disabled: '' },
      },
    ]
  );
});

test('textoDaEtiqueta casa a etiqueta inteira e falha sem o fecho', () => {
  assert.equal(textoDaEtiqueta('<head><title>Olá</title></head>', 'title'), 'Olá');
  // <titlex> não é <title>, e o prefixo </titlex> não fecha o <title>
  assert.equal(textoDaEtiqueta('<titlex>não</titlex>', 'title'), undefined);
  assert.equal(
    textoDaEtiqueta('<title>certo</titlex></title>', 'title'),
    'certo</titlex>'
  );
  assert.equal(textoDaEtiqueta('<TITLE>caixa</TITLE>', 'title'), 'caixa');
  assert.equal(textoDaEtiqueta('<p>sem título</p>', 'title'), undefined);
  assert.throws(() => textoDaEtiqueta('<title>aberto', 'title'), /sem o fecho/);
  assert.throws(() => textoDaEtiqueta('<title>x</titlex>', 'title'), /sem o fecho/);
});

test('elementoPorId: obrigatório lança, o comum devolve undefined', () => {
  const html = '<div id="a"></div>';

  assert.equal(elementoPorId(html, 'a').tag, 'div');
  assert.equal(elementoPorId(html, 'b'), undefined);
  assert.throws(() => elementoPorId(html, 'b', { obrigatorio: true }), /#b/);
  assert.equal(elementoPorId(html, 'a', { obrigatorio: true }).tag, 'div');
});

test('index.html real: o mesmo número de etiquetas de uma contagem simples e ids sem repetição', () => {
  const html = fs.readFileSync('index.html', 'utf8');

  // Contagem independente: cada "<" seguido de letra, fora dos comentários (não há script inline com "<")
  const semComentarios = html.split('<!--').reduce((resto, parte, n) => {
    if (n === 0) return parte;
    const fim = parte.indexOf('-->');

    return resto + (fim < 0 ? '' : parte.slice(fim + 3));
  }, '');

  let esperado = 0;

  for (let i = 0; i < semComentarios.length - 1; i++)
    if (semComentarios[i] === '<' && /[A-Za-z]/.test(semComentarios[i + 1])) esperado++;

  const lista = etiquetas(html);

  assert.ok(esperado > 200, 'a página tem muitas etiquetas');
  assert.equal(lista.length, esperado);
  assert.equal(textoDaEtiqueta(html, 'title'), '.');

  const ids = lista.map((e) => e.attrs.id).filter(Boolean);

  assert.ok(ids.length > 50);
  assert.deepEqual(
    ids.filter((id, n) => ids.indexOf(id) !== n),
    []
  );
});

test('balanceamento conta aberturas, fechamentos soltos e pendentes de uma etiqueta', () => {
  const certo =
    '<div><div class="a"></div></DIV><p></p><script>"</div>"</script><!-- </div> -->';

  assert.deepEqual(balanceamento(certo, 'div'), {
    abertas: 2,
    fechadas: 2,
    soltos: 0,
    pendentes: 0,
  });
  assert.deepEqual(balanceamento('<div><div></div>', 'div'), {
    abertas: 2,
    fechadas: 1,
    soltos: 0,
    pendentes: 1,
  });
  assert.deepEqual(balanceamento('</div><div></div>', 'div'), {
    abertas: 1,
    fechadas: 2,
    soltos: 1,
    pendentes: 0,
  });
  assert.deepEqual(balanceamento('<divisor></divisor><p></p>', 'div'), {
    abertas: 0,
    fechadas: 0,
    soltos: 0,
    pendentes: 0,
  });
  // etiquetas() continua sem expor fechamentos
  assert.deepEqual(
    etiquetas('<p></p>').map((e) => e.tag),
    ['p']
  );
});

test('o index.html tem as divs balanceadas', () => {
  const r = balanceamento(fs.readFileSync('index.html', 'utf8'), 'div');

  assert.ok(r.abertas > 20);
  assert.equal(r.soltos + r.pendentes, 0);
});
