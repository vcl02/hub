'use strict';
// Perfil do mantenedor, compartilhado pelos apps do hub (tr e al): altura, nascimento, sexo, idade, taxa basal e calorias do treino.
// Fica só no código, fora do banco. Os apps carregam com <script src="../perfil.js"> antes dos próprios scripts.
const PERFIL = Object.freeze({ altura: 1.78, nascimento: '2002-09-14', sexo: 'M' });   // altura em metros; sexo M | F
// Idade completa no dia (AAAA-MM-DD)
function idadeEm(dia) { const [a, m, d] = dia.split('-').map(Number), [na, nm, nd] = PERFIL.nascimento.split('-').map(Number); return a - na - (m < nm || (m === nm && d < nd) ? 1 : 0); }
// Taxa metabólica basal (Mifflin-St Jeor), kcal/dia
const tmb = (peso, dia) => Math.round(10 * peso + 6.25 * PERFIL.altura * 100 - 5 * idadeEm(dia) + (PERFIL.sexo === 'M' ? 5 : -161));
// Calorias de um treino de musculação: MET 3,5 (Compendium of Physical Activities, código 02054) com 1 MET = a sua
// basal por hora (não os 1 kcal/kg/h do padrão), então idade, altura e sexo entram na conta. ms = duração do treino.
const MET_MUSCULACAO = 3.5;
const kcalTreino = (peso, dia, ms) => Math.round(MET_MUSCULACAO * tmb(peso, dia) / 24 * ms / 36e5);
