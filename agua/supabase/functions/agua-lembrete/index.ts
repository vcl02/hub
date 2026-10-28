// agua-lembrete: notificação de verdade (Web Push) para beber água, com as mesmas regras dos lembretes do app.
// Chamada de hora em hora pelo pg_cron (migration agua/01) com o header x-agua-token. Decide pelo horário de São Paulo:
// só das 10 às 16; em casa de hora em hora, presencial (qua e qui) e fim de semana de 2 em 2 horas; e só manda se ainda
// não bebeu água no intervalo (de 30 min antes do horário até agora). Push sem conteúdo: o service worker mostra o texto.
// As chaves VAPID e o token do cron nascem aqui na 1ª chamada e ficam em public.push_chave, que só o banco e esta função
// (chave de serviço) leem: nunca no código, no repositório nem no chat.
// GET ?chave -> { publica }   (a chave pública, para o app se inscrever)
// GET ?ultimo -> { tipo }     (o último lembrete mandado: o service worker mostra o texto dele)
// POST com x-agua-token -> lembrete do horário (se for a hora e faltar água)
// POST com x-agua-token e { tipo: "dentes" } -> escovar os dentes (o banco chama 20 min depois da última comida lançada no
// Alimentação, migration agua/02), a qualquer hora
import "jsr:@supabase/functions-js@2.118.0/edge-runtime.d.ts";

const DONO = "32f70255-30a0-4e2b-ad76-31d7a1bf54f7";
const PRESENCIAL = [3, 4]; // qua e qui: o mesmo ROTINA.presencial de corpo/perfil.js (o teste confere)
const INICIO = 10, FIM = 16; // horas
const CONTATO = "mailto:victor.cabrera0209@gmail.com"; // exigido pelo protocolo VAPID (quem manda os pushes)

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

const b64url = (b: ArrayBuffer | Uint8Array) => {
  const a = b instanceof Uint8Array ? b : new Uint8Array(b);
  let s = ""; for (const x of a) s += String.fromCharCode(x);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};
const texto64 = (o: unknown) => b64url(new TextEncoder().encode(JSON.stringify(o)));

// Hora e dia em São Paulo
function agoraSP(d = new Date()) {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23", weekday: "short",
  }).formatToParts(d).map((x) => [x.type, x.value]));
  const dias: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return { data: `${p.year}-${p.month}-${p.day}`, hora: +p.hour, minuto: +p.minute, semana: dias[p.weekday] };
}
// É hora de lembrete? Em casa de hora em hora; presencial e fim de semana de 2 em 2 (10, 12, 14, 16)
function horaDeLembrete(hora: number, semana: number) {
  if (hora < INICIO || hora > FIM) return false;
  const passo = semana === 0 || semana === 6 || PRESENCIAL.includes(semana) ? 2 : 1;
  return (hora - INICIO) % passo === 0;
}

function supa() {
  const url = Deno.env.get("SUPABASE_URL")!;
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  return { url, headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" } };
}
async function rest(caminho: string, opcoes: RequestInit = {}) {
  const { url, headers } = supa();
  const r = await fetch(`${url}/rest/v1/${caminho}`, { ...opcoes, headers: { ...headers, ...(opcoes.headers || {}) } });
  if (!r.ok) throw new Error(`${caminho.split("?")[0]} ${r.status}`);
  return r.status === 204 || r.status === 201 ? null : r.json();
}

// Chaves VAPID (P-256) e token do cron: lidos da tabela; na 1ª vez, gerados e gravados
type Chave = { publica: string; privada: JsonWebKey; token: string };
async function chaves(): Promise<Chave> {
  const L = await rest("push_chave?select=publica,privada,token&id=eq.1") as Chave[];
  if (L.length) return L[0];
  const par = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]) as CryptoKeyPair;
  const publica = b64url(await crypto.subtle.exportKey("raw", par.publicKey));
  const privada = await crypto.subtle.exportKey("jwk", par.privateKey);
  const token = b64url(crypto.getRandomValues(new Uint8Array(32)));
  await rest("push_chave?on_conflict=id", { method: "POST", headers: { Prefer: "resolution=ignore-duplicates,return=minimal" }, body: JSON.stringify({ id: 1, publica, privada, token }) });
  return (await rest("push_chave?select=publica,privada,token&id=eq.1") as Chave[])[0];   // se duas chamadas correram juntas, vale a gravada
}

// Assinatura VAPID (JWT ES256) para o servidor de push do endpoint
async function vapid(endpoint: string, c: Chave) {
  const chave = await crypto.subtle.importKey("jwk", c.privada, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
  const corpo = `${texto64({ typ: "JWT", alg: "ES256" })}.${texto64({ aud: new URL(endpoint).origin, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: CONTATO })}`;
  const assinatura = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, chave, new TextEncoder().encode(corpo));
  return `vapid t=${corpo}.${b64url(assinatura)}, k=${c.publica}`;
}

// Manda o push (sem conteúdo) para todas as inscrições do Victor; inscrição que o servidor diz não existir mais sai
async function enviarATodos(c: Chave) {
  const subs = await rest(`push_inscricao?select=endpoint&user_id=eq.${DONO}`) as Array<{ endpoint: string }>;
  let enviados = 0;
  for (const s of subs) {
    const r = await fetch(s.endpoint, { method: "POST", headers: { Authorization: await vapid(s.endpoint, c), TTL: "3600", Urgency: "high", "Content-Length": "0" } });
    if (r.status === 404 || r.status === 410) await rest(`push_inscricao?endpoint=eq.${encodeURIComponent(s.endpoint)}`, { method: "DELETE" });
    else if (r.ok) enviados++;
  }
  return { inscricoes: subs.length, enviados };
}

// Já bebeu água no intervalo deste lembrete? (de 30 min antes do horário até agora)
async function bebeuNoIntervalo(data: string, hora: number, minuto: number) {
  const L = await rest(`agua_dia?select=aguas&user_id=eq.${DONO}&data=eq.${data}`) as Array<{ aguas: Array<{ hora: string }> }>;
  const de = hora * 60 - 30, ate = hora * 60 + minuto;
  return (L[0]?.aguas || []).some((a) => { const [h, m] = String(a.hora).split(":").map(Number); const x = h * 60 + m; return x >= de && x <= ate; });
}

// O último lembrete mandado (o push vai sem conteúdo: o service worker pergunta qual foi). Sem a tabela (migration agua/02
// ainda não aplicada), segue sem marcar: o service worker cai no texto da água.
async function marcarUltimo(tipo: string) {
  await rest("push_ultimo?on_conflict=id", { method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=minimal" }, body: JSON.stringify({ id: 1, tipo, em: new Date().toISOString() }) }).catch(() => {});
}

// Comparação em tempo constante (o tempo da resposta não revela quantos caracteres do token acertaram)
function iguais(a: string, b: string) {
  const x = new TextEncoder().encode(a), y = new TextEncoder().encode(b);
  let d = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) d |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return d === 0;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  try {
    const url = new URL(req.url);
    if (req.method === "GET" && url.searchParams.has("chave")) return json({ publica: (await chaves()).publica });
    if (req.method === "GET" && url.searchParams.has("ultimo")) {
      const L = await rest("push_ultimo?select=tipo&id=eq.1").catch(() => []) as Array<{ tipo: string }>;
      return json({ tipo: L[0]?.tipo || "agua" });
    }
    if (req.method !== "POST") return json({ erro: "método" }, 405);
    // Só o agendamento, com o token da tabela
    const c = await chaves();
    if (!iguais(req.headers.get("x-agua-token") ?? "", c.token)) return json({ erro: "token" }, 401);
    const corpo = await req.json().catch(() => ({})) as { tipo?: string };
    if (corpo?.tipo === "dentes") { await marcarUltimo("dentes"); return json({ enviado: true, tipo: "dentes", ...(await enviarATodos(c)) }); }
    const agora = agoraSP();
    if (!horaDeLembrete(agora.hora, agora.semana)) return json({ enviado: false, motivo: "fora do horário" });
    if (await bebeuNoIntervalo(agora.data, agora.hora, agora.minuto)) return json({ enviado: false, motivo: "já bebeu" });
    await marcarUltimo("agua");
    return json({ enviado: true, ...(await enviarATodos(c)) });
  } catch (e) {
    return json({ erro: String((e as Error)?.message || e) }, 502);
  }
});
