// Regressão: no celular, arrastar a tela para o lado troca de ciclo como as setas (esquerda =
// próximo, direita = anterior), com o limiar do Treino; tabela que rola de lado só troca na
// ponta; campo, barra de seleção, menu, toast e modal aberto não trocam; seta desativada não.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');

const interacoes = fs.readFileSync('js/interactions.js', 'utf8');
const mobile = fs.readFileSync('css/mobile.css', 'utf8');
const regras = fs.readFileSync('docs/REGRAS.md', 'utf8');

test('mesmo limiar do Treino e direção das setas', () => {
    assert.match(interacoes, /if \(eixo !== 'x' \|\| !\(Math\.abs\(dx\) > 80 \|\| \(rapido && Math\.abs\(dx\) > 40\)\)\) return;/);
    assert.match(interacoes, /const direcao = dx < 0 \? 1 : -1;/);
    assert.match(interacoes, /const seta = el\(direcao > 0 \? 'cicloProximo' : 'cicloAnterior'\);\s*\n\s*if \(seta\.disabled\) return;\s*\n\s*seta\.click\(\);/);
});

test('tabela que rola de lado só troca na ponta; campo, seleção, menu, toast e modal não trocam', () => {
    assert.match(interacoes, /if \(bordas && !\(direcao > 0 \? bordas\.fim : bordas\.inicio\)\) return;/);
    assert.match(interacoes, /ev\.target\.closest\('input, textarea, select, #selbar, \.menuIcone, #toasts'\)/);
    assert.match(interacoes, /document\.querySelector\('dialog\[open\]'\)/);
});

test('o ciclo novo entra pelo lado do gesto, sem animação com movimento reduzido', () => {
    assert.match(mobile, /#out\.entraDaDireita \{ animation: cicloEntra/);
    assert.match(mobile, /@media \(prefers-reduced-motion: reduce\) \{\s*#out\.entraDaDireita, #out\.entraDaEsquerda \{ animation: none; \}/);
});

test('regra documentada', () => {
    assert.match(regras, /\*\*Arrastar para o lado\*\* \(celular\) troca de ciclo como as setas: para a esquerda o próximo/);
});
