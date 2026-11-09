// O leitor de HTML dos testes (helpers/html.js) com entradas sintéticas para cada caso e o index.html de verdade.
const assert = require('./helpers/assert-tolerante');
const fs = require('node:fs');
const test = require('node:test');

const {
  aninhamento,
  balanceamento,
  etiquetas,
  elementoPorId,
  textoDaEtiqueta,
  textosDasEtiquetas,
} = require('./helpers/html');

test('textosDasEtiquetas devolve o texto visível de cada elemento, sem etiquetas internas, comentários, script e style', () => {
  assert.deepEqual(textosDasEtiquetas('<button>Salvar</button>', 'button'), ['Salvar']);
  assert.deepEqual(
    textosDasEtiquetas('<button><svg><path d="M0"/></svg>  Sair\n</button>', 'button'),
    ['Sair']
  );
  assert.deepEqual(
    textosDasEtiquetas('<a href="x">um</a><p>fora</p><a>dois <b>três</b></a>', 'a'),
    ['um', 'dois três']
  );
  assert.deepEqual(
    textosDasEtiquetas('<label>Tom &amp; Jerry&nbsp;&lt;3</label>', 'label'),
    ['Tom & Jerry <3']
  );
  assert.deepEqual(
    textosDasEtiquetas(
      '<button>A<!-- Sair --><script>var s = "Sair"</script><style>.x{}</style>B</button>',
      'button'
    ),
    ['AB']
  );
  assert.deepEqual(textosDasEtiquetas('<div><div>a</div>b</div>', 'div'), ['ab', 'a']);
  assert.deepEqual(textosDasEtiquetas('<p>x</p>', 'button'), []);
});

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

test('aninhamento confere a ordem de fechamento com pilha, sem contar as etiquetas void e as que se fecham sozinhas', () => {
  const certo =
    '<div><span></span><br><img src="a"><input><meta><link><hr><svg><path d="M0" /></svg></div>' +
    '<script>"</span></div>"</script><style>a>b{}</style><!-- </p> --><ul><li></li></ul>';

  assert.deepEqual(aninhamento(certo), []);
  // Mesma contagem de <div> e <span>, mas fechadas trocadas: balanceamento não vê, aninhamento sim
  const trocado = '<div><span></div></span>';

  assert.equal(balanceamento(trocado, 'div').pendentes, 0);
  assert.equal(balanceamento(trocado, 'span').pendentes, 0);
  assert.deepEqual(aninhamento(trocado), [
    '</div> fecha com <span> aberto',
    '<div> sem fecho',
  ]);
  // <p> tem fecho opcional: o fim do pai o fecha. <span> não: fica mal aninhado
  assert.deepEqual(aninhamento('<div><p></div>'), []);
  assert.deepEqual(aninhamento('<div><b></div>'), [
    '</div> fecha com <b> aberto',
    '<div> sem fecho',
    '<b> sem fecho',
  ]);
  assert.deepEqual(aninhamento('<div>'), ['<div> sem fecho']);
  assert.deepEqual(aninhamento('</div>'), ['</div> sem abertura']);
});

test('aninhamento: a barra só fecha void e filhos de svg; <div/> abre', () => {
  // Em HTML a barra de "<div/>" é ignorada: o elemento fica aberto
  assert.deepEqual(aninhamento('<div/><p>a</p>'), ['<div> sem fecho']);
  assert.deepEqual(aninhamento('<div/></div>'), []);
  assert.deepEqual(aninhamento('<svg><path d="M0"/><circle r="1" /><rect/></svg>'), []);
  // valor sem aspas que termina em barra não é auto-fecho: <a> segue aberta até o seu fecho
  assert.deepEqual(aninhamento('<a href=/x/>t</a>'), []);
  assert.deepEqual(aninhamento('<a href=/x/>t'), ['<a> sem fecho']);
  assert.deepEqual(aninhamento('<svg><path d=/x/></svg>'), [
    '</svg> fecha com <path> aberto',
    '<svg> sem fecho',
    '<path> sem fecho',
  ]);
});

test('aninhamento: etiquetas de fecho opcional do HTML5 sem "</x>", e o resto continua exigindo fecho', () => {
  assert.deepEqual(aninhamento('<ul><li>a<li>b</ul>'), []);
  assert.deepEqual(aninhamento('<div><p>a<p>b</div>'), []);
  assert.deepEqual(aninhamento('<p>a<div>b</div>'), []);
  assert.deepEqual(aninhamento('<select><option>a<option>b</select>'), []);
  assert.deepEqual(
    aninhamento('<select><optgroup><option>a<optgroup><option>b</select>'),
    []
  );
  assert.deepEqual(aninhamento('<dl><dt>a<dd>b<dt>c<dd>d</dl>'), []);
  assert.deepEqual(aninhamento('<table><tr><td>a<td>b<tr><td>c<th>d</table>'), []);
  assert.deepEqual(
    aninhamento('<table><thead><tr><th>a<tbody><tr><td>b<tfoot><tr><td>c</table>'),
    []
  );
  // opcional dentro de bloco aberto sem fecho continua violação do bloco
  assert.deepEqual(aninhamento('<div><ul><li>a</div>'), [
    '</div> fecha com <li> aberto',
    '<div> sem fecho',
    '<ul> sem fecho',
  ]);
  assert.deepEqual(aninhamento('<div><span></div></span>'), [
    '</div> fecha com <span> aberto',
    '<div> sem fecho',
  ]);
  assert.deepEqual(aninhamento('<div>'), ['<div> sem fecho']);
  assert.deepEqual(aninhamento('</li>'), ['</li> sem abertura']);
});

test('o index.html está bem aninhado', () => {
  assert.deepEqual(aninhamento(fs.readFileSync('index.html', 'utf8')), []);
});

test('o index.html da página inicial e dos outros apps também está bem aninhado', () => {
  for (const pagina of [
    'index.html',
    'tr/index.html',
    'al/index.html',
    'corpo/index.html',
    'agua/index.html',
  ])
    assert.deepEqual(aninhamento(fs.readFileSync(`../${pagina}`, 'utf8')), [], pagina);
});
