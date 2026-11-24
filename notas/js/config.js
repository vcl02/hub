'use strict';
/*
  Notas — anotações: várias notas, cada uma com título separado e texto Markdown. No PC, editor como o VS Code; no celular,
  cada parágrafo um balão, como uma conversa.
  Dados no Supabase (projeto fin, tabela notas_nota), com cópia local para funcionar sem internet (js/banco.js):
    db = { notas: [{ id, titulo, texto, criadaEm, editadaEm }] } // a mais recente primeiro; datas em ISO (UTC)
  Cada nota é gravada inteira (o texto final): quem salva por último vale, sem mescla entre aparelhos. O histórico de cada
  gravação (antes e depois) fica no hub_historico.
*/
// Este módulo: Configuração: Supabase e conta.

// ===== Supabase (chave publicável: pode ficar no código; quem protege os dados é o RLS) =====
const SUPABASE_URL = 'https://yzmyncxoskvqzdczaill.supabase.co';
const SUPABASE_KEY = 'sb_publishable_Fq984qUdQO8mGq4PSYmUiQ_ySaLrmEQ';
const DONO = '32f70255-30a0-4e2b-ad76-31d7a1bf54f7'; // única conta com acesso (a mesma do hub e dos outros apps)
const EMAIL_POR_USUARIO = { victor: 'victor.cabrera0209@gmail.com' }; // login aceita o usuário ou o e-mail, como no hub

const emailDoLogin = (texto) => {
  const t = String(texto || '').trim();

  return t.includes('@') ? t : EMAIL_POR_USUARIO[t.toLowerCase()] || null;
};
