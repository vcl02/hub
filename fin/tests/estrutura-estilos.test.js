// Contrato de composição visual: preserva ordem da cascata e responsabilidade dos módulos CSS.
const assert = require('./helpers/assert-tolerante');
const fs = require('node:fs');
const test = require('node:test');
const { declaracoes, regras } = require('./helpers/regras-css');
const { etiquetas } = require('./helpers/html');

const html = fs.readFileSync('index.html', 'utf8');

const estilos = [
  'css/base.css',
  'css/dashboard.css',
  'css/forms.css',
  'css/charts.css',
  'css/utilities.css',
  'css/mobile.css',
];

test('carrega os estilos em camadas e mantém o responsivo por último', () => {
  // as folhas do Fin, na ordem em que a página as declara (link rel=stylesheet, por href; ?v= de cache ignorado)
  const declaradas = etiquetas(html)
    .filter((e) => e.tag === 'link' && e.attrs.rel === 'stylesheet')
    .map((e) => e.attrs.href.split('?')[0])
    .filter((href) => href.startsWith('./css/'))
    .map((href) => href.slice(2));

  assert.deepEqual(declaradas, estilos);
});

test('cada camada possui a responsabilidade esperada', () => {
  const css = (arquivo) => fs.readFileSync(arquivo, 'utf8');

  // lidos como regras de CSS: o seletor existe e tem declarações de verdade
  assert.ok(declaracoes(css('css/base.css'), ':root').length > 0); // variáveis de tema
  assert.ok(declaracoes(css('css/dashboard.css'), '.tool').length > 0); // painel
  assert.ok(declaracoes(css('css/forms.css'), 'dialog#modalNovo').length > 0); // cadastro
  assert.ok(declaracoes(css('css/charts.css'), '#modalGrafico').length > 0); // gráficos
  // o responsivo do celular: há regras dentro da consulta de largura
  assert.ok(
    regras(css('css/mobile.css')).some(
      (regra) => regra.contexto === '@media (max-width: 640px)'
    )
  );
});
