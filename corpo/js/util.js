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
const somaDias = (d, n) => { const x = deIso(d); x.setDate(x.getDate() + n); return iso(x); };
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
// Eixo horizontal pela data (a distância entre os pontos é a distância entre os dias), com 3 datas marcadas: a 1ª, a do
// meio e a última. Eixo vertical com 3 valores: o menor, o do meio e o maior, cada um com sua linha tracejada.
function grafico(box, P, unidade, rotulo) {   // P = [{ data, valor, hora? }] em ordem cronológica
  // Com menos de 2 pontos não há linha: some o gráfico e o título dele (h3 logo antes), sem caixa vazia
  const titulo = box.previousElementSibling?.matches('h3.sec') ? box.previousElementSibling : null;
  box.hidden = P.length < 2; if (titulo) titulo.hidden = box.hidden;
  if (P.length < 2) { box.innerHTML = ''; return; }
  const W = 320, H = 140, l = 44, r = 14, t = 12, b = 24;
  let lo = Math.min(...P.map(p => p.valor)), hi = Math.max(...P.map(p => p.valor));
  if (lo === hi) { lo -= 1; hi += 1; }
  const dia = d => Math.round(deIso(d) / 864e5), d0 = dia(P[0].data), d1 = dia(P[P.length - 1].data);
  const x = d => l + (dia(d) - d0) * (W - l - r) / (d1 - d0), y = c => t + (hi - c) * (H - t - b) / (hi - lo);
  const pts = P.map(p => x(p.data).toFixed(1) + ',' + y(p.valor).toFixed(1)), fim = P[P.length - 1];
  const meioDia = iso(new Date((d0 + d1) / 2 * 864e5 + 12 * 36e5)), meioValor = (lo + hi) / 2;
  const valores = [hi, meioValor, lo].map(v => `<line x1="${l}" x2="${W - r}" y1="${y(v)}" y2="${y(v)}" stroke="var(--line)" stroke-dasharray="3 3"/>
    <text class="eixo-y" x="${l - 6}" y="${y(v) + 4}" text-anchor="end" font-size="11" fill="var(--muted)">${fmt(Math.round(v * 10) / 10)}</text>`).join('');
  const datas = [[P[0].data, 'start', l], [meioDia, 'middle', (l + W - r) / 2], [fim.data, 'end', W - r]]
    .map(([d, ancora, px]) => `<text class="eixo-x" x="${px}" y="${H - 6}" text-anchor="${ancora}" font-size="11" fill="var(--muted)">${dataCurta(d)}</text>`).join('');
  box.innerHTML = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${rotulo}">
    ${valores}
    <path d="M${x(P[0].data)},${H - b} L${pts.join(' L')} L${x(fim.data)},${H - b} Z" fill="var(--teal)" fill-opacity=".12"/>
    <polyline points="${pts.join(' ')}" fill="none" stroke="var(--teal)" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>
    ${P.map(p => `<circle cx="${x(p.data)}" cy="${y(p.valor)}" r="2.5" fill="var(--teal)"/>`).join('')}
    <circle cx="${x(fim.data)}" cy="${y(fim.valor)}" r="4.5" fill="var(--teal)"/>
    ${datas}
    <g class="dica" visibility="hidden" pointer-events="none">
      <line y1="${t}" y2="${H - b}" stroke="var(--muted)" stroke-dasharray="2 3"/>
      <circle r="5" fill="var(--bg)" stroke="var(--teal)" stroke-width="2.5"/>
      <rect height="20" rx="6" fill="#30353A" stroke="var(--line)"/>
      <text font-size="11" fill="var(--fg)" text-anchor="middle"></text>
    </g>
  </svg>`;
  // Mouse em cima (ou dedo encostado/arrastando, no celular): data, horário (se houver) e valor do ponto mais perto, com uma
  // linha até ele
  const svg = box.querySelector('svg'), dica = svg.querySelector('.dica');
  const mostrar = ev => {
    const caixa = svg.getBoundingClientRect(), vx = (ev.clientX - caixa.left) * W / caixa.width;
    const i = P.reduce((m, p, k) => Math.abs(x(p.data) - vx) < Math.abs(x(P[m].data) - vx) ? k : m, 0), px = x(P[i].data), py = y(P[i].valor);
    const txt = `${dataCurta(P[i].data)}${P[i].hora ? ' ' + P[i].hora : ''} · ${fmt(P[i].valor)} ${unidade}`, larg = txt.length * 6 + 14;
    const cx = Math.min(W - r - larg / 2, Math.max(l + larg / 2, px)), ty = py - 30 < 0 ? py + 12 : py - 30;
    dica.querySelector('line').setAttribute('x1', px); dica.querySelector('line').setAttribute('x2', px);
    dica.querySelector('circle').setAttribute('cx', px); dica.querySelector('circle').setAttribute('cy', py);
    Object.entries({ x: cx - larg / 2, y: ty, width: larg }).forEach(([k, v]) => dica.querySelector('rect').setAttribute(k, v));
    dica.querySelector('text').setAttribute('x', cx); dica.querySelector('text').setAttribute('y', ty + 14);
    dica.querySelector('text').textContent = txt;
    dica.setAttribute('visibility', 'visible');
  };
  svg.addEventListener('pointermove', mostrar);
  svg.addEventListener('pointerdown', mostrar);
  svg.addEventListener('pointerleave', () => dica.setAttribute('visibility', 'hidden'));
}
