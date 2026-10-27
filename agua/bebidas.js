'use strict';
// Bebidas que a Água aceita além da água: quanto de cada uma é água (conta para a meta da Água) e as calorias e macros
// por 100 ml (contam como comido no Alimentação e no hábito do déficit da página inicial). Estimativas de tabelas de
// composição e rótulos comuns: suco de pó (tipo Tang) ou de caixinha, refrigerante comum, cappuccino com leite e leite
// integral com achocolatado. Módulo compartilhado: a Água, o Alimentação (../agua/bebidas.js) e a página inicial carregam.
const BEBIDAS = Object.freeze({
  agua: { nome: 'Água', agua: 1, kcal: 0, prot: 0, carb: 0, gord: 0 },
  suco: { nome: 'Suco', agua: 0.88, kcal: 40, prot: 0, carb: 10, gord: 0 },
  refri: { nome: 'Refri', agua: 0.89, kcal: 42, prot: 0, carb: 10.6, gord: 0 },
  cappuccino: { nome: 'Cappuccino', agua: 0.88, kcal: 60, prot: 2.5, carb: 7, gord: 2.5 },
  toddy: { nome: 'Leite com Toddy', agua: 0.82, kcal: 85, prot: 3, carb: 12, gord: 3 }
});
// O que uma bebida lançada na Água ({ bebida, volume } em ml) soma de kcal e macros; água pura (ou sem volume), nada
function nutrientesBebida(a) {
  const b = a && a.bebida !== 'agua' && BEBIDAS[a.bebida], v = +a?.volume;
  if (!b || !(v > 0)) return null;
  return { kcal: b.kcal * v / 100, prot: b.prot * v / 100, carb: b.carb * v / 100, gord: b.gord * v / 100 };
}
