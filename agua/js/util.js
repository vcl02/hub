'use strict';
// Utilidades: datas, números, armazenamento local, avisos e confirmação com toque duplo.
const $ = id => document.getElementById(id);
const store = {
  get: k => { try { return localStorage.getItem(k); } catch (e) { return null; } },
  set: (k, v) => { try { localStorage.setItem(k, v); return true; } catch (e) { return false; } }
};
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pad = n => String(n).padStart(2, '0');
const iso = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
const deIso = d => { const [a, m, dia] = d.split('-').map(Number); return new Date(a, m - 1, dia); };
const hoje = () => iso(new Date());
// ?dia=AAAA-MM-DD: a página inicial abriu o app num dia anterior, só leitura (hoje, futuro ou inválido: o app normal)
const diaDaUrl = () => { const d = new URLSearchParams(location.search).get('dia'); return d && /^\d{4}-\d{2}-\d{2}$/.test(d) && d < hoje() ? d : null; };
// O dia no endereço, como o ?ciclo do Fin: ?dia=AAAA-MM-DD num dia anterior, nada em hoje. Trocar de dia empilha no histórico
// (o Voltar do navegador volta ao dia visto antes); empilhar = false só substitui. Os outros parâmetros ficam.
function diaNaUrl(dia, empilhar = true) {
  const url = new URL(location.href);
  if (dia && dia < hoje()) url.searchParams.set('dia', dia); else url.searchParams.delete('dia');
  const destino = url.pathname + url.search + url.hash;
  if (destino === location.pathname + location.search + location.hash) return;
  if (empilhar) history.pushState(history.state, '', destino); else history.replaceState(history.state, '', destino);
}
const dataOk = d => /^\d{4}-\d{2}-\d{2}$/.test(d);
const agoraHHMM = () => { const d = new Date(); return pad(d.getHours()) + ':' + pad(d.getMinutes()); };
const minutos = h => { const [a, b] = h.split(':').map(Number); return a * 60 + b; };
const num = s => parseFloat(String(s ?? '').replace(',', '.'));
const fmt = n => (Math.round(n * 100) / 100).toLocaleString('pt-BR');
const virgula = n => String(n).replace('.', ',');
function dataCurta(d) { const [a, m, dia] = d.split('-'); return dia + '/' + m + (+a !== new Date().getFullYear() ? '/' + a.slice(2) : ''); }
function quando(d) {
  const t = new Date(), n = Math.round((new Date(t.getFullYear(), t.getMonth(), t.getDate()) - deIso(d)) / 864e5);
  return n === 0 ? 'hoje' : n === 1 ? 'ontem' : n > 1 && n < 7 ? 'há ' + n + ' dias' : dataCurta(d);
}

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
const somaDias = (d, n) => { const x = deIso(d); x.setDate(x.getDate() + n); return iso(x); };
const inteiro = n => Math.round(n).toLocaleString('pt-BR');

// ===== Esc =====
// Esc sai do app (volta para a página inicial do hub, ../) quando nada mais usou a tecla: o que está aberto (prévia, edição na
// linha) trata antes e chama preventDefault; num campo de texto, o 1º Esc só tira o foco. Mesma regra em todos os apps.
function sairDoApp() { location.href = '../'; }
addEventListener('keydown', ev => {
  if (ev.key !== 'Escape' || ev.defaultPrevented || ev.isComposing) return;
  if (ev.target.closest?.('input,textarea,select')) { ev.target.blur(); return; }
  if (document.querySelector('dialog[open]')) return;
  sairDoApp();
});
