'use strict';
/*
  Água — o que bebi (ml, com horário) e as idas ao banheiro (xixi), para entender quanto dá para beber por dia sem ficar
  insustentável. Lembretes só dentro do app (sem notificação), das 10 às 16.
  Dados no Supabase (projeto fin, tabela agua_dia), com cópia local para funcionar sem internet (js/banco.js):
    db = { dias: [{ data, aguas: [{ hora, ml }], xixis: ["HH:MM"] }] }   // 1 por dia; dia sem nada não fica guardado
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
