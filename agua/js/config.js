'use strict';
/*
  Água — o que bebi (ml, com horário), contra a meta do dia. Lembretes das 10 às 16, no app e por notificação. Os xixis e a
  bexiga ficam no Corpo (que lê agua_dia para os ml por xixi).
  Dados no Supabase (projeto fin, tabela agua_dia), com cópia local para funcionar sem internet (js/banco.js):
    db = { dias: [{ data, aguas: [{ hora, ml, bebida?, volume? }] }] }   // 1 por dia; dia sem nada não fica guardado
  ml é sempre a água que conta para a meta: água pura, ml = o que bebi; suco ou refri, ml = a parte que é água do volume
  bebido (volume × BEBIDAS[bebida].agua). Assim quem só soma ml (hábitos do hub, bexiga do Corpo) já conta certo.
  Os botões de ml são as quantidades que já digitei (as mais usadas primeiro): não há quantidade fixa.
  Dias presenciais e a rotina da semana vêm de ../corpo/perfil.js (ROTINA).
*/
// Este módulo: Configuração: Supabase, conta, meta do dia e horários dos lembretes.

// ===== Supabase (chave publicável: pode ficar no código; quem protege os dados é o RLS) =====
const SUPABASE_URL = 'https://yzmyncxoskvqzdczaill.supabase.co';
const SUPABASE_KEY = 'sb_publishable_Fq984qUdQO8mGq4PSYmUiQ_ySaLrmEQ';
const DONO = '32f70255-30a0-4e2b-ad76-31d7a1bf54f7';   // única conta com acesso (a mesma do hub e dos outros apps)
const EMAIL_POR_USUARIO = { victor: 'victor.cabrera0209@gmail.com' };   // login aceita o usuário ou o e-mail, como no hub
const emailDoLogin = texto => { const t = String(texto || '').trim(); return t.includes('@') ? t : EMAIL_POR_USUARIO[t.toLowerCase()] || null; };

// ===== Meta e lembretes =====
const META_ML = 1000;              // mínimo do dia (começando)
const LEMBRETE_INICIO = 10, LEMBRETE_FIM = 16;   // horas: nada antes nem depois, para não acordar de noite para o banheiro
const ML_MAX = 3000;               // por vez
const BOTOES_ML = 6;               // quantos botões de ml (das quantidades já usadas)
// Bebidas além da água e quanto delas é água (estimativa de tabelas de composição de alimentos: suco ~88%, refrigerante
// ~89%, cappuccino com leite ~88%, leite com achocolatado ~82%). Só a parte que é água conta para a meta.
const BEBIDAS = Object.freeze({
  agua: { nome: 'Água', agua: 1 },
  suco: { nome: 'Suco', agua: 0.88 },
  refri: { nome: 'Refri', agua: 0.89 },
  cappuccino: { nome: 'Cappuccino', agua: 0.88 },
  toddy: { nome: 'Leite com Toddy', agua: 0.82 }
});
