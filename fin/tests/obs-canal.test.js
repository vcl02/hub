// Regressão: colunas Obs (texto livre) e Canal (de onde a conta é paga/consultada), com
// edição inline igual às demais colunas livres. Canal ganha um ícone de abrir link quando o
// valor é uma URL http(s), sem entrar em edição nem selecionar a linha ao clicar nele.
const assert = require('./helpers/assert-tolerante');
const fs = require('node:fs');
const test = require('node:test');
const vm = require('node:vm');
const { declaracoes } = require('./helpers/regras-css');

const tabelas = fs.readFileSync('js/tables.js', 'utf8');
const interacoes = fs.readFileSync('js/interactions.js', 'utf8');
const estilos = fs.readFileSync('css/dashboard.css', 'utf8');
const regras = fs.readFileSync('docs/REGRAS.md', 'utf8');
const migracao = fs.readFileSync('migrations/19-obs-canal-lancamentos.sql', 'utf8');

// Extrai celCanal (e sua dependência ehUrlHttp) do arquivo real e roda isolada, com
// ehLinhaReal/escapeHtml/textoOuTraco simulados.
function carregaCelCanal({ linhaReal = true } = {}) {
  const inicio = tabelas.indexOf('const ehUrlHttp = (texto) =>');
  const fim = tabelas.indexOf('\n};', tabelas.indexOf('const celCanal = (r) =>')) + 3;

  if (inicio < 0 || fim < 3) throw Error('Não encontrou celCanal em tables.js.');

  const contexto = {
    ehLinhaReal: () => linhaReal,
    escapeHtml: (v) => String(v),
    textoOuTraco: (v) => (v == null || v === '' ? '—' : v),
  };

  vm.createContext(contexto);
  vm.runInContext(
    `${tabelas.slice(inicio, fim)}\nglobalThis.celCanal = celCanal;`,
    contexto
  );

  return contexto.celCanal;
}

test('Canal com URL http(s) mostra os ícones de copiar e de link; texto comum (chave Pix) mostra só o de copiar; vazio não mostra nenhum', () => {
  const celCanal = carregaCelCanal();
  const comLink = celCanal({ id: 9, canal: 'https://www.enel.com.br/minha-conta' });

  assert.match(comLink, /class=copiarCanal/);
  assert.match(comLink, /class=linkCanal/);
  assert.match(comLink, /href="https:\/\/www\.enel\.com\.br\/minha-conta"/);

  const semLink = celCanal({ id: 9, canal: 'chave-pix@banco.com' });

  assert.match(semLink, /class=copiarCanal/);
  assert.doesNotMatch(semLink, /class=linkCanal/);

  const vazio = celCanal({ id: 9, canal: null });

  assert.doesNotMatch(vazio, /class=copiarCanal/);
  assert.doesNotMatch(vazio, /class=linkCanal/);
});

test('linha não-real também trunca o texto do Canal (celCanalTexto), só sem o clique de edição — mas copiar/abrir continuam disponíveis', () => {
  const celCanal = carregaCelCanal({ linhaReal: false });
  const html = celCanal({ id: 9, canal: 'https://www.enel.com.br/minha-conta' });

  assert.match(html, /class=celCanalTexto/);
  assert.doesNotMatch(html, /data-tog-canal/);
  assert.match(html, /class=copiarCanal/); // copiar continua disponível (não altera dado)
  assert.match(html, /class=linkCanal/); // o ícone de link continua aparecendo
});

test('estilos: Canal tem largura fixa com reticências; os ícones de copiar/link ficam em evidência, sem serem cortados', () => {
  const caixa = declaracoes(estilos, '.togCanal');

  assert.ok(caixa.includes('max-width: 9rem'));
  assert.ok(caixa.includes('overflow: hidden'));
  assert.ok(caixa.includes('text-overflow: ellipsis'));
  assert.ok(caixa.includes('white-space: nowrap'));
  assert.deepEqual(
    declaracoes(estilos, '.celCanalTexto').filter((d) => caixa.includes(d)),
    [
      'display: inline-block',
      'max-width: 9rem',
      'overflow: hidden',
      'text-overflow: ellipsis',
      'white-space: nowrap',
      'vertical-align: middle',
    ]
  ); // a linha não-real usa a mesma caixa

  for (const seletor of ['.linkCanal', '.copiarCanal']) {
    const icone = declaracoes(estilos, seletor);

    assert.ok(icone.includes('flex: none'), seletor); // não é espremido pelo texto truncado
    assert.ok(icone.includes('border-radius: 50%'), seletor);
    // o <button> de copiar não herda a mãozinha do <a> por padrão: o cursor tem que ser explícito
    assert.ok(icone.includes('cursor: pointer'), seletor);
  }
});

test('clique em Obs abre input de texto livre; clique em Canal idem, com placeholder de URL', async () => {
  const { editar } = require('./helpers/editor-inline');
  let r = await editar('data-tog-obs', { obs: null }, '  ligar antes  ');

  assert.match(r.html, /<input type=text class=inpObs value="">/);
  assert.deepEqual(r.gravado, { obs: 'ligar antes' });
  r = await editar('data-tog-obs', { obs: 'x' }, '');
  assert.deepEqual(r.gravado, { obs: null });

  r = await editar('data-tog-canal', { canal: 'https://a.test' }, 'https://b.test');
  assert.match(
    r.html,
    /<input type=text class=inpCanal value="https:\/\/a\.test" placeholder="Ex\.: https:\/\/\.\.\.">/
  );
  assert.deepEqual(r.gravado, { canal: 'https://b.test' });
  r = await editar('data-tog-canal', { canal: 'https://a.test' }, '');
  assert.deepEqual(r.gravado, { canal: null });
});

// Roda o ouvinte de clique real (js/interactions.js) que copia o Canal, com a área de transferência e o toast simulados.
function carregaCopiarCanal({ copiaFalha = false } = {}) {
  const inicio = interacoes.indexOf(
    "const botao = e.target.closest('[data-copiar-canal]')"
  );

  if (inicio < 0)
    throw Error('Não encontrou o clique de copiar Canal em interactions.js.');
  const fim = interacoes.indexOf('\n});', inicio) + 4;
  const registro = { copiados: [], toasts: [], parou: 0 };
  let ouvinte = null;

  const contexto = {
    el: () => ({ addEventListener: (_tipo, f) => (ouvinte = f) }),
    Estado: {
      lancamentos: [
        { id: 9, canal: 'chave-pix@banco.com' },
        { id: 10, canal: null },
      ],
    },
    navigator: {
      clipboard: {
        writeText: (texto) => {
          registro.copiados.push(texto);

          return copiaFalha ? Promise.reject(Error('negado')) : Promise.resolve();
        },
      },
    },
    mostrarToast: (titulo, texto) => registro.toasts.push([titulo, texto]),
  };

  vm.createContext(contexto);
  vm.runInContext(
    `el('out').addEventListener('click', (e) => {\n${interacoes.slice(inicio, fim)}`,
    contexto
  );

  // Clique dentro do ícone de copiar da linha `id` (ou fora de qualquer ícone: id = null)
  const clicar = async (id) => {
    const alvo = {
      closest: (seletor) =>
        id != null && seletor == '[data-copiar-canal]'
          ? { dataset: { copiarCanal: String(id) } }
          : null,
    };

    ouvinte({ target: alvo, stopImmediatePropagation: () => registro.parou++ });
    await new Promise((ok) => setTimeout(ok, 0));
  };

  return { clicar, registro };
}

test('clique no ícone de copiar do Canal usa a área de transferência, avisa e nunca entra em edição', async () => {
  const t = carregaCopiarCanal();

  await t.clicar(9);
  assert.deepEqual(t.registro.copiados, ['chave-pix@banco.com']);
  assert.deepEqual(t.registro.toasts, [['Copiado', 'chave-pix@banco.com']]);
  assert.equal(t.registro.parou, 1); // não chega ao clique de edição nem seleciona a linha

  await t.clicar(10); // linha sem Canal: nada a copiar
  await t.clicar(null); // clique fora do ícone: o ouvinte não faz nada
  assert.equal(t.registro.copiados.length, 1);
  assert.equal(t.registro.parou, 2);
});

test('área de transferência negada: avisa que falhou ao copiar', async () => {
  const t = carregaCopiarCanal({ copiaFalha: true });

  await t.clicar(9);
  assert.deepEqual(t.registro.toasts, [
    ['Falhou ao copiar', 'Tente selecionar e copiar manualmente.'],
  ]);
});

test('migration já aplicada pelo mantenedor, documentada no repo', () => {
  assert.match(migracao, /^-- /);
  assert.match(migracao, /add column obs varchar\(255\);/);
  assert.match(migracao, /add column canal varchar\(255\);/);
});

test('regra documentada em REGRAS.md', () => {
  assert.match(regras, /`fin\.obs` \(observação livre\) e `fin\.canal`/);
  assert.match(regras, /A coluna Canal tem largura fixa: texto que não couber vira "…"/);
  assert.match(
    regras,
    /Sempre que Canal tiver algum valor, a célula ganha um ícone redondo de copiar o texto pra área de transferência/
  );
  assert.match(regras, /serve pra chave Pix, que não é um link pra abrir/);
  assert.match(
    regras,
    /Quando o valor também é uma URL `http\(s\)`, aparece um segundo ícone redondo de abrir link numa aba nova/
  );
  assert.match(
    regras,
    /Os dois ícones ficam sempre em evidência, nunca cortados pelo texto truncado/
  );
  assert.match(
    regras,
    /funcionam em qualquer tela, já que copiar ou abrir não altera dado nenhum/
  );
  assert.match(regras, /Nenhum dos dois campos participa de cálculo financeiro/);
});
