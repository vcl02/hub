'use strict';
// Inicialização: atualização automática para a versão publicada e entrada no app.
// ===== Sempre a última versão =====
// Ao abrir, ao voltar para o app e a cada 10 min, compara os arquivos publicados com os que estão rodando.
// Se mudaram, recarrega sozinho (a sessão do dia está salva). Espera o treino acabar e não age em telas com formulário.
const ARQUIVOS_APP = ['index.html', ...[...document.querySelectorAll('link[rel=stylesheet][href^="css/"], script[src^="js/"]')].map(e => e.getAttribute('href') || e.getAttribute('src'))];
const TELAS_SEGURAS = ['inicio', 'exercicio', 'conquistas', 'fim', 'treinos'];
let versaoAtual = null, atualizacaoPendente = false, ultimaChecagem = 0;
const hash = s => { let h = 0x811c9dc5; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); } return (h >>> 0).toString(36); };
async function checarAtualizacao(forcar = false) {
  if (!navigator.onLine || (!forcar && Date.now() - ultimaChecagem < 60000)) return;
  ultimaChecagem = Date.now();
  try {
    const textos = await Promise.all(ARQUIVOS_APP.map(a => fetch(a + '?v=' + Date.now(), { cache: 'no-store' }).then(r => { if (!r.ok) throw new Error(r.status); return r.text(); })));
    const v = hash(textos.join('\n'));
    if (!versaoAtual) versaoAtual = v;          // 1ª checagem = versão que está rodando
    else if (v !== versaoAtual) { atualizacaoPendente = true; aplicarAtualizacao(); }
  } catch (e) {}
}
function aplicarAtualizacao() {
  if (!atualizacaoPendente || !TELAS_SEGURAS.includes(pilha[pilha.length - 1])) return;
  if (!db || T.fim || emAndamento(ultimoTreino())) return;   // nunca no meio do treino: espera ele acabar
  atualizacaoPendente = false; salvarSessao();
  toast('Atualizando para a versão nova…');
  setTimeout(() => location.reload(), 900);
}
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') checarAtualizacao(); });
addEventListener('online', () => checarAtualizacao(true));
setInterval(() => { checarAtualizacao(); aplicarAtualizacao(); }, 10 * 60 * 1000);

// ===== Início do app =====
(async () => {
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).catch(() => {});
  checarAtualizacao(true);
  const { data } = await sb.auth.getSession();   // sessão salva no aparelho: entra direto, mesmo sem internet
  if (data.session) carregar(data.session.user); else telaLogin();
})();
