'use strict';
/*
  Corpo — pesagem e barriga dia a dia, IMC, evolução e o perfil (idade, altura, basal).
  Dados no Supabase (projeto fin, tabela corpo_medida), com cópia local para funcionar sem internet (js/banco.js):
    db = { medidas: [{ data, hora, peso?, cintura? }],   // corpo_medida: 1 por dia; peso em kg, cintura = barriga na linha do umbigo (cm)
           dias:    [{ data, evacuou }] }                 // corpo_dia: evacuou sim ou não (sem linha = não respondido)
  Só este app grava corpo_medida. Treino e Alimentação leem pelo módulo compartilhado ../corpo/perfil.js (lerMedidas,
  medidasGuardadas, pesoNoDia), junto com PERFIL, idadeEm, tmb e kcalTreino.
*/
// Este módulo: Configuração: Supabase, conta e faixas aceitas.

// ===== Supabase (chave publicável: pode ficar no código; quem protege os dados é o RLS) =====
const SUPABASE_URL = 'https://yzmyncxoskvqzdczaill.supabase.co';
const SUPABASE_KEY = 'sb_publishable_Fq984qUdQO8mGq4PSYmUiQ_ySaLrmEQ';
const DONO = '32f70255-30a0-4e2b-ad76-31d7a1bf54f7';   // única conta com acesso (a mesma do hub, do tr e do al)
const EMAIL_POR_USUARIO = { victor: 'victor.cabrera0209@gmail.com' };   // login aceita o usuário ou o e-mail, como no hub
const emailDoLogin = texto => { const t = String(texto || '').trim(); return t.includes('@') ? t : EMAIL_POR_USUARIO[t.toLowerCase()] || null; };

// ===== Faixas aceitas (as mesmas checagens da tabela) =====
const PESO_MIN = 30, PESO_MAX = 300;   // kg
const CINTURA_MAX = 400;               // cm (sem trava baixa: qualquer medida > 0)
