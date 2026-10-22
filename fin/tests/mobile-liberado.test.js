// Contrato de paridade mobile/desktop: a única restrição de interface é por conta (Isabella),
// nunca por largura de tela. Cobre o encolhimento da navegação de ciclo (sem estourar a
// tela) e a ausência de qualquer menu escondendo a .tool.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');

const pagina = fs.readFileSync('index.html', 'utf8');
const estilosBase = fs.readFileSync('css/base.css', 'utf8');
const estilosMobile = fs.readFileSync('css/mobile.css', 'utf8');
const bootstrap = fs.readFileSync('js/bootstrap.js', 'utf8');
const regras = fs.readFileSync('docs/REGRAS.md', 'utf8');

test('não existe menu hambúrguer nem gaveta escondendo a .tool', () => {
    assert.doesNotMatch(pagina, /btMenuMobile/);
    assert.doesNotMatch(estilosBase, /btMenuMobile/);
    assert.doesNotMatch(estilosMobile, /btMenuMobile|\.tool\.aberto|\.tool\s*\{\s*display:\s*none/);
    assert.doesNotMatch(bootstrap, /btMenuMobile/);
    assert.doesNotMatch(regras, /hambúrguer/);
});

test('navegação de ciclo (setas, De/Até, Atual) encolhe e quebra em vez de estourar a tela', () => {
    const inicioMedia = estilosMobile.indexOf('@media (max-width: 640px)');
    assert.ok(inicioMedia >= 0, 'não achou o media query mobile');
    const blocoMedia = estilosMobile.slice(inicioMedia);
    assert.match(blocoMedia, /#fciclNav\s*\{[\s\S]*?flex:\s*1 1 100%;[\s\S]*?min-width:\s*0;/);
    assert.match(blocoMedia, /#navComparar\s*\{[\s\S]*?flex-wrap:\s*wrap;/);
    // De encolhe até zero; Até só ocupa o que sobra da linha, com um mínimo legível.
    assert.match(blocoMedia, /#fde\s*\{[\s\S]*?min-width:\s*0;/);
    assert.match(blocoMedia, /#fate\s*\{\s*\n\s*flex:\s*1 1 0;/);
});

test('mobile.css não esconde mais nada por largura de tela, só o que genuinamente não cabe', () => {
    // As restrições antigas (navegação De/Até, Atual, simulação, Duplicar/Excluir na barra)
    // saíram inteiramente: a paridade com o desktop é total.
    assert.doesNotMatch(estilosMobile, /#fde,\s*\n\s*#navCompararAte,|#navCompararAte,\s*\n\s*#fate,|#cicloHoje,\s*\n\s*#toggleSimulacao/);
    assert.doesNotMatch(estilosMobile, /#selbar #seldup|#selbar #seldel/);
    assert.doesNotMatch(estilosMobile, /display:\s*none\s*!important/);
    assert.match(estilosMobile, /\.head\s*\{[\s\S]*?flex-wrap:\s*wrap;/);
});

test('regra documentada em REGRAS.md', () => {
    assert.match(regras, /## Acesso/);
    assert.match(regras, /A garantia vem do RLS de `fin`, `fin_ciclo` e `fin_meta`: somente o mantenedor lê \(migration 39\) e grava \(migration 20\)/);
    assert.match(regras, /fica sempre visível, em qualquer largura — sem menu pra abrir\/fechar/);
});
