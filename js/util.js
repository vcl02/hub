'use strict';
// Utilidades: datas, números, armazenamento local, avisos, navegação entre telas e gráfico de linha.
// ===== Utilidades =====
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
const num = s => parseFloat(String(s ?? '').replace(',', '.'));
const fmt = n => (Math.round(n * 100) / 100).toLocaleString('pt-BR');
const virgula = n => String(n).replace('.', ',');
const intEntre = (v, min, max, padrao) => { const n = parseInt(v, 10); return n >= min && n <= max ? n : padrao; };
const vibrar = ms => { try { navigator.vibrate?.(ms); } catch (e) {} };
const dataOk = d => /^\d{4}-\d{2}-\d{2}$/.test(d);
function dataCurta(d) { const [a, m, dia] = d.split('-'); return dia + '/' + m + (+a !== new Date().getFullYear() ? '/' + a.slice(2) : ''); }
function quando(d) {
  const t = new Date(), n = Math.round((new Date(t.getFullYear(), t.getMonth(), t.getDate()) - deIso(d)) / 864e5);
  return n === 0 ? 'hoje' : n === 1 ? 'ontem' : n > 1 && n < 7 ? 'há ' + n + ' dias' : dataCurta(d);
}
const diasDesde = d => Math.round((deIso(hoje()) - deIso(d)) / 864e5);
const hhmm = t => new Date(t).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
const minutos = h => { const [a, b] = h.split(':').map(Number); return a * 60 + b; };
const comHora = (ms, h) => { const d = new Date(ms), [a, b] = h.split(':').map(Number); d.setHours(a, b, 0, 0); return d.getTime(); };
const duracao = ms => { const m = Math.max(0, Math.round(ms / 60000)); return m < 60 ? m + ' min' : Math.floor(m / 60) + ' h ' + pad(m % 60) + ' min'; };

// ===== Avisos (com "Desfazer") =====
let tToast, desfazerFn = null;
function toast(msg, desfazer, erro = false) {
  $('toast-msg').textContent = msg; desfazerFn = desfazer || null; $('toast-desfazer').hidden = !desfazer;
  $('toast').classList.toggle('erro', erro);
  $('toast').hidden = false; clearTimeout(tToast);
  tToast = setTimeout(() => { $('toast').hidden = true; desfazerFn = null; }, desfazer ? 6000 : 2600);
}
$('toast-desfazer').addEventListener('click', () => { const f = desfazerFn; desfazerFn = null; $('toast').hidden = true; f?.(); });
function confirmar(btn, texto) {   // 1º toque arma, 2º confirma
  if (btn.classList.contains('armed')) return true;
  const antes = btn.textContent; btn.classList.add('armed'); btn.textContent = texto;
  setTimeout(() => { if (btn.isConnected) { btn.classList.remove('armed'); btn.textContent = antes; } }, 3000);
  return false;
}

// ===== Navegação =====
const telas = {};
let pilha = [];
function mostrar(nome) {
  document.querySelectorAll('section.view').forEach(v => { v.hidden = v.id !== 'v-' + nome; });
  $('agua').hidden = true; $('parabens').hidden = true;   // telas cheias: cada tela mostra a sua de novo se precisar
  telas[nome]?.();
  salvarSessao();
  window.scrollTo(0, 0);
  aplicarAtualizacao();
}
function ir(nome) {
  if (nome === 'inicio' || nome === 'bloqueio') { pilha = [nome]; history.replaceState(null, ''); }
  else { pilha.push(nome); history.pushState(null, ''); }
  mostrar(nome);
}
function voltar() { if (pilha.length > 1) history.back(); else mostrar('inicio'); }
addEventListener('popstate', () => { if (db && pilha.length > 1) { pilha.pop(); mostrar(pilha[pilha.length - 1]); } });

// ===== Gráfico de linha (carga ou peso corporal) =====
function grafico(box, P, unidade, rotulo) {   // P = [{ data, valor }] em ordem cronológica
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
    <path d="M${x(0)},${H - b} L${pts.join(' L')} L${x(P.length - 1)},${H - b} Z" fill="var(--blue)" fill-opacity=".12"/>
    <polyline points="${pts.join(' ')}" fill="none" stroke="var(--blue)" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>
    <circle cx="${x(P.length - 1)}" cy="${y(fim.valor)}" r="4.5" fill="var(--blue)"/>
    <text x="${l}" y="${H - 5}" font-size="11" fill="var(--muted)">${dataCurta(P[0].data)}</text>
    <text x="${W - r}" y="${H - 5}" text-anchor="end" font-size="11" fill="var(--muted)">${dataCurta(fim.data)} · ${fmt(fim.valor)} ${esc(unidade)}</text>
  </svg>`;
}
