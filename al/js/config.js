'use strict';
/*
  Alimentação (al) — o que comi no dia, em kcal e macros, contra o gasto do dia: mostra se estou em déficit.
  Dados no Supabase (projeto fin, tabelas al_*), com cópia local para funcionar sem internet (js/banco.js):
    db = {
      itens:     [{ id, nome, porcao, kcal, prot, carb, gord, usos }],       // comidas salvas: o cache da IA e o que foi digitado
      registros: [{ id, data, hora, item?, nome, porcao, qtd, kcal, prot, carb, gord }],   // valores de 1 porção; total = valor × qtd
      dias:      [{ data, caminhadas: [{ hora, minutos?, km? }] }]          // caminhada ("Andei +"): um trecho por marcação, soma no dia
      marmitas:  [{ id, nome, restam, itens: [{ nome, porcao, qtd, kcal, prot, carb, gord }] }]   // montadas antes, aplicadas no dia
    }
  Só leitura: horários e cardio dos treinos (tr_treino) e pesagens do app Corpo (corpo_medida, por ../corpo/perfil.js), guardados no
  aparelho para abrir sem internet. Perfil, taxa basal e calorias do treino também vêm de ../corpo/perfil.js (PERFIL, idadeEm, tmb, kcalTreino, kcalEsteira).
  A IA (Claude Haiku) roda na Edge Function al-estimar (supabase/functions), que guarda a chave: nunca no navegador.
*/
// Este módulo: Configuração: Supabase, conta, fator de atividade, caminhada e porções rápidas.

// ===== Supabase (chave publicável: pode ficar no código; quem protege os dados é o RLS) =====
const SUPABASE_URL = 'https://yzmyncxoskvqzdczaill.supabase.co';
const SUPABASE_KEY = 'sb_publishable_Fq984qUdQO8mGq4PSYmUiQ_ySaLrmEQ';
const DONO = '32f70255-30a0-4e2b-ad76-31d7a1bf54f7';   // única conta com acesso (a mesma do hub e do tr)
const EMAIL_POR_USUARIO = { victor: 'victor.cabrera0209@gmail.com' };   // login aceita o usuário ou o e-mail, como no hub
const emailDoLogin = texto => { const t = String(texto || '').trim(); return t.includes('@') ? t : EMAIL_POR_USUARIO[t.toLowerCase()] || null; };
const FUNCAO_IA = 'al-estimar';

// ===== Gasto do dia =====
// Fator de atividade, caminhada padrão e déficit planejado (DEFICIT_META) ficam em gasto.js (na pasta do al), que o hub também usa.
const TRECHOS_MAX = 30;    // trechos de caminhada por dia
const MARMITAS_MAX = 50;   // marmitas iguais de uma vez (o limite de al_marmita.restam)
const QTDS = [0.5, 1, 1.5, 2, 3];   // porções rápidas (× a porção salva)

// ===== Metas do dia (perder gordura mantendo músculo) =====
const PROT_G_KG = 1.6;      // proteína em g por kg de peso
const GORD_PCT = 0.25;      // gordura: 25% das kcal da meta; carboidrato fica com o resto
