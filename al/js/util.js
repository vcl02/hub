'use strict';
// Utilidades: datas, números, armazenamento local, avisos e confirmação com toque duplo.
const $ = id => document.getElementById(id);
const store = {
  get: k => { try { return localStorage.getItem(k); } catch (e) { return null; } },
  set: (k, v) => { try { localStorage.setItem(k, v); return true; } catch (e) { return false; } },
  del: k => { try { localStorage.removeItem(k); } catch (e) {} }
};
const novoId = () => Math.random().toString(36).slice(2, 10);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pad = n => String(n).padStart(2, '0');
const iso = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
const deIso = d => { const [a, m, dia] = d.split('-').map(Number); return new Date(a, m - 1, dia); };
const hoje = () => iso(new Date());
// ?dia=AAAA-MM-DD: a página inicial abriu o app num dia anterior, só leitura (hoje, futuro ou inválido: o app normal)
const diaDaUrl = () => { const d = new URLSearchParams(location.search).get('dia'); return d && /^\d{4}-\d{2}-\d{2}$/.test(d) && d < hoje() ? d : null; };
const somaDias = (d, n) => { const x = deIso(d); x.setDate(x.getDate() + n); return iso(x); };
const agoraHHMM = () => { const d = new Date(); return pad(d.getHours()) + ':' + pad(d.getMinutes()); };
const num = s => parseFloat(String(s ?? '').replace(',', '.'));
const inteiro = n => Math.round(n).toLocaleString('pt-BR');
const umaCasa = n => (Math.round(n * 10) / 10).toLocaleString('pt-BR');
const fmtQtd = q => q === 0.5 ? '½' : q === 1.5 ? '1½' : String(q).replace('.', ',');
const NOME_DIA = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];
function nomeDoDia(d) {
  const n = Math.round((deIso(hoje()) - deIso(d)) / 864e5);
  if (n === 0) return 'Hoje';
  if (n === 1) return 'Ontem';
  const [, m, dia] = d.split('-');
  return NOME_DIA[deIso(d).getDay()] + ', ' + dia + '/' + m;
}
// Texto para comparar nomes: sem acento, minúsculo, espaços simples
const normal = s => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();

let tToast;
function toast(msg, erro = false) {
  $('toast').textContent = msg; $('toast').classList.toggle('erro', erro); $('toast').hidden = false;
  clearTimeout(tToast); tToast = setTimeout(() => { $('toast').hidden = true; }, 2800);
}
// Botões só com ícone: title e aria-label obrigatórios
const ICONES = {
  lixo: '<path d="M4 7h16"/><path d="M10 11v6M14 11v6"/><path d="M6 7l1 13h10l1-13"/><path d="M9 7V4h6v3"/>',
  x: '<path d="M6 6l12 12M18 6L6 18"/>',
  ok: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  lapis: '<path d="M4 20h4L19 9l-4-4L4 16v4z"/><path d="M13.5 6.5l4 4"/>'
};
const btIcone = (icone, titulo, attrs, classe = '') => `<button type="button" class="bt-ic ${classe}" ${attrs} title="${titulo}" aria-label="${titulo}"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONES[icone]}</svg></button>`;
function confirmar(btn) {   // toque duplo: o 1º só deixa o botão vermelho (3 s), o 2º confirma
  if (btn.classList.contains('armado')) return true;
  btn.classList.add('armado');
  setTimeout(() => btn.classList.remove('armado'), 3000);
  return false;
}
// Toque repetido sem querer (o dedo que bate duas vezes, o clique duplo): a mesma ação de novo em menos de 0,5 s é ignorada
const REPETIDO_MS = 500;
let ultimaAcao = { k: '', em: 0 };
function repetido(k) { const agora = Date.now(), r = ultimaAcao.k === k && agora - ultimaAcao.em < REPETIDO_MS; ultimaAcao = { k, em: agora }; return r; }
