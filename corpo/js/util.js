'use strict';
// Utilidades: datas, números, armazenamento local, avisos, confirmação com toque duplo e gráfico de linha.
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

// ===== Gráfico de linha (peso ou barriga) =====
function grafico(box, P, unidade, rotulo) {   // P = [{ data, valor }] em ordem cronológica
  // Com menos de 2 pontos não há linha: some o gráfico e o título dele (h3 logo antes), sem caixa vazia
  const titulo = box.previousElementSibling?.matches('h3.sec') ? box.previousElementSibling : null;
  box.hidden = P.length < 2; if (titulo) titulo.hidden = box.hidden;
  if (P.length < 2) { box.innerHTML = ''; return; }
  const W = 320, H = 120, l = 40, r = 12, t = 12, b = 22;
  let lo = Math.min(...P.map(p => p.valor)), hi = Math.max(...P.map(p => p.valor));
  if (lo === hi) { lo -= 1; hi += 1; }
  const x = i => l + i * (W - l - r) / (P.length - 1), y = c => t + (hi - c) * (H - t - b) / (hi - lo);
  const pts = P.map((p, i) => x(i).toFixed(1) + ',' + y(p.valor).toFixed(1)), fim = P[P.length - 1];
  box.innerHTML = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${rotulo}">
    <line x1="${l}" x2="${W - r}" y1="${y(hi)}" y2="${y(hi)}" stroke="var(--line)" stroke-dasharray="3 3"/>
    <line x1="${l}" x2="${W - r}" y1="${y(lo)}" y2="${y(lo)}" stroke="var(--line)" stroke-dasharray="3 3"/>
    <text x="${l - 6}" y="${y(hi) + 4}" text-anchor="end" font-size="11" fill="var(--muted)">${fmt(hi)}</text>
    <text x="${l - 6}" y="${y(lo) + 4}" text-anchor="end" font-size="11" fill="var(--muted)">${fmt(lo)}</text>
    <path d="M${x(0)},${H - b} L${pts.join(' L')} L${x(P.length - 1)},${H - b} Z" fill="var(--teal)" fill-opacity=".12"/>
    <polyline points="${pts.join(' ')}" fill="none" stroke="var(--teal)" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>
    <circle cx="${x(P.length - 1)}" cy="${y(fim.valor)}" r="4.5" fill="var(--teal)"/>
    <text x="${l}" y="${H - 5}" font-size="11" fill="var(--muted)">${dataCurta(P[0].data)}</text>
    <text x="${W - r}" y="${H - 5}" text-anchor="end" font-size="11" fill="var(--muted)">${dataCurta(fim.data)} · ${fmt(fim.valor)} ${esc(unidade)}</text>
  </svg>`;
}
