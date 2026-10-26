'use strict';
// Notificações de verdade (Web Push): inscreve este aparelho (push_inscricao) com a chave pública da função agua-lembrete,
// mostra se estão ligadas e manda um teste. Navegador sem push (ou iPhone fora da tela inicial): a linha some.
const FUNCAO_PUSH = 'agua-lembrete';
const pushSuportado = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
const deB64url = s => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - s.length % 4) % 4)), c => c.charCodeAt(0));
async function inscricaoAtual() {
  try { return await (await navigator.serviceWorker.ready).pushManager.getSubscription(); } catch (e) { return null; }
}
async function pintarNotificacoes() {
  const ok = pushSuportado();
  $('n-linha').hidden = !ok;
  if (!ok) return;
  const negado = Notification.permission === 'denied', sub = Notification.permission === 'granted' ? await inscricaoAtual() : null;
  $('n-ativar').hidden = !!sub || negado;
  $('n-ligadas').hidden = !sub;
  $('n-negado').hidden = !negado;
}
async function ativarNotificacoes() {
  if (await Notification.requestPermission() !== 'granted') { toast('Notificações bloqueadas no celular.', true); pintarNotificacoes(); return; }
  try {
    const { data, error } = await sb.functions.invoke(FUNCAO_PUSH + '?chave', { method: 'GET' });
    if (error || !data?.publica) throw new Error('chave');
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription() || await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: deB64url(data.publica) });
    const { error: e } = await sb.from('push_inscricao').upsert({ user_id: usuario.id, endpoint: sub.endpoint, app: 'agua' }, { onConflict: 'user_id,endpoint' });
    if (e) throw e;
    toast('Notificações ligadas');
  } catch (e) { toast('Não consegui ligar as notificações.', true); }
  pintarNotificacoes();
}
async function testarNotificacao() {
  const { data, error } = await sb.functions.invoke(FUNCAO_PUSH, { body: { acao: 'teste' } });
  toast(error ? 'O teste falhou.' : data?.enviados ? 'Enviada: chega em instantes.' : 'Nenhum aparelho inscrito.', !!error || !data?.enviados);
}
$('n-ativar').addEventListener('click', ativarNotificacoes);
$('n-testar').addEventListener('click', testarNotificacao);
