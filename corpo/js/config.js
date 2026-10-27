'use strict';
/*
  Corpo — pesagem e barriga dia a dia, IMC, evolução e o perfil (idade, altura, basal).
  Dados no Supabase (projeto fin, tabela corpo_medida), com cópia local para funcionar sem internet (js/banco.js):
    db = { medidas: [{ data, hora, peso?, cintura? }],   // corpo_medida: 1 por dia; peso em kg, cintura = barriga na linha do umbigo (cm)
           dias:    [{ data, evacuacoes, xixis, dormiu?, acordou?, sono? }] }   // corpo_dia: horários das evacuações ("HH:MM",
                                                         // "" = sem horário), dos xixis ("HH:MM"), a hora em que dormiu e a em que
                                                         // acordou ("HH:MM", a noite que terminou no dia) e as horas de sono (dos dois)
  Só leitura: a água do dia (agua_dia, do app Água), para a bexiga (ml bebidos por xixi), guardada no aparelho.
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
const DIAS_GRAFICO = 90;              // evolução do peso e da barriga: os últimos 90 dias
const DIAS_BEXIGA = 7;                // bexiga: média dos últimos 7 dias com xixi
// ===== Sono =====
const SONO_ANTIGO_DORMIU = '23:00';    // sono lançado só em horas (antes dos horários): conta como dormiu às 23:00
const SONO_BOM = 8, SONO_OK = 7;       // 8 h ou mais: BOM · de 7 a 8: OK · menos de 7: RUIM (vermelho)
const DIAS_SONO = 7;                  // últimas noites na lista e na média
const horaOk = h => /^([01]\d|2[0-3]):[0-5]\d$/.test(h || '');
const maisMinutos = (h, m) => { const t = ((+h.slice(0, 2) * 60 + +h.slice(3)) + m) % 1440; return pad(Math.floor(t / 60)) + ':' + pad(t % 60); };
// Horas entre dormir e acordar (passando da meia-noite), 2 casas; falta um dos dois, null
const horasDeSono = (dormiu, acordou) => dormiu && acordou ? Math.round(((+acordou.slice(0, 2) * 60 + +acordou.slice(3)) - (+dormiu.slice(0, 2) * 60 + +dormiu.slice(3)) + 1440) % 1440 / 60 * 100) / 100 : null;
const nivelSono = h => h >= SONO_BOM ? { classe: 'bom', txt: 'BOM' } : h >= SONO_OK ? { classe: 'ok', txt: 'OK' } : { classe: 'ruim', txt: 'RUIM' };
