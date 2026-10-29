// captura-nubank: recebe lançamentos do Tasker e insere em public.fin
// Autenticação: header x-fin-token comparado ao secret FIN_TOKEN da função (definido no painel do
// Supabase, nunca no código nem no repositório, que é público). Sem o secret, recusa tudo.
// GET ?acao=categorias -> lista de categorias distintas (texto, separadas por vírgula; vírgula interna vira " + ")
// POST -> insere lançamento (com parcelas)
//   auto: true -> só lança se o estabelecimento tem atalho (fin_atalho, migration 42), com o nome, a
//                 categoria e as parcelas dele; sem atalho, responde lancado: false e não grava nada.
//                 O atalho vale se o trecho dele está em qualquer parte do estabelecimento (a maquininha
//                 muda o resto), sem ligar pra acento, maiúscula, espaço ou pontuação; o trecho mais longo ganha
//   lembrar: true -> depois de lançar, grava (ou troca) o atalho com o que foi escolhido; trecho = a parte
//                 do estabelecimento que identifica o lugar (vazio, curto ou fora do nome: o nome inteiro)
import "jsr:@supabase/functions-js@2.118.0/edge-runtime.d.ts";

const DIA_FECHAMENTO = 5; // compras a partir deste dia vão para a fatura do mês seguinte (inferido dos dados)
const DIA_VENCIMENTO = 12;
const MAX_PARCELAS = 24;
const CATEG_PADRAO = "A classificar";
const SEP_INTERNO = " + "; // representa a vírgula de categorias compostas ("Lazer, Isabella") na lista do Tasker
const MAPA_CATEG: Array<[RegExp, string]> = [
  [/uber|99/i, "Transporte"],
];

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

async function sha256(s: string) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return new Uint8Array(buf);
}

// Compara pelos hashes, em tempo constante: o tempo da resposta não revela quantos caracteres
// do token acertaram, e comparar hashes iguala os tamanhos.
async function tokenValido(recebido: string, esperado: string) {
  const [a, b] = await Promise.all([sha256(recebido), sha256(esperado)]);
  let diferenca = 0;
  for (let i = 0; i < a.length; i++) diferenca |= a[i] ^ b[i];
  return diferenca === 0;
}

function dataSP(d: Date) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(d);
}

function dataDaCompra(ts: unknown) {
  // ts = segundos desde 1970 (momento da notificação). Inválido/futuro/>60 dias -> agora.
  const agora = Date.now();
  const n = Number(ts);
  if (Number.isFinite(n) && n > 0) {
    const ms = n * 1000;
    if (ms <= agora + 3600_000 && ms >= agora - 60 * 86400_000) return { data: dataSP(new Date(ms)), origem: "ts" };
  }
  return { data: dataSP(new Date(agora)), origem: "agora" };
}

function somaMeses(data: string, k: number) {
  let [a, m, d] = data.split("-").map(Number);
  m += k;
  a += Math.floor((m - 1) / 12);
  m = ((m - 1) % 12) + 1;
  const ultimo = new Date(Date.UTC(a, m, 0)).getUTCDate();
  d = Math.min(d, ultimo);
  return `${a}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function calcFatura(data: string) {
  let [a, m, d] = data.split("-").map(Number);
  if (d >= DIA_FECHAMENTO) { m += 1; if (m > 12) { m = 1; a += 1; } }
  return `${a}-${String(m).padStart(2, "0")}-${String(DIA_VENCIMENTO).padStart(2, "0")}`;
}

function supa() {
  const url = Deno.env.get("SUPABASE_URL")!;
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const headers = { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" };
  return { url, headers };
}

// Chave do atalho: o trecho sem acento, em minúsculas e com pontuação e espaços viram um espaço só
// ("NAQUELE  CAFÉ" e "naquele-cafe" dão "naquele cafe"). A comparação usa a forma compacta, sem espaço
// nenhum, então "NAQUELECAFE" também acha "naquele cafe".
const MIN_TRECHO = 4; // trecho mais curto pegaria lugar demais (o nome inteiro sempre vale)
const chaveDoEstab = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const compacta = (s: string) => chaveDoEstab(s).replace(/ /g, "");

async function atalhoDo(estab: string) {
  const alvo = compacta(estab);
  if (!alvo) return null;
  const { url, headers } = supa();
  const r = await fetch(`${url}/rest/v1/fin_atalho?select=chave,nome,categ,parcelas`, { headers });
  if (!r.ok) throw new Error(`atalho ${r.status}: ${await r.text()}`);
  const linhas = (await r.json()) as Array<{ chave: string; nome: string; categ: string; parcelas: number }>;
  return linhas
    .map((l) => ({ ...l, trecho: compacta(l.chave) }))
    .filter((l) => l.trecho && alvo.includes(l.trecho))
    .sort((a, b) => b.trecho.length - a.trecho.length)[0] ?? null;
}

// Trecho que vira a chave: só vale se está no estabelecimento e não é curto demais; senão, o nome inteiro.
function chaveDoTrecho(estab: string, trecho: string) {
  const inteiro = chaveDoEstab(estab);
  const t = chaveDoEstab(trecho);
  if (!t || t === inteiro) return { chave: inteiro };
  if (compacta(t).length < MIN_TRECHO) return { chave: inteiro, aviso: `trecho "${trecho}" curto demais, guardei o nome inteiro` };
  if (!compacta(estab).includes(compacta(t))) return { chave: inteiro, aviso: `trecho "${trecho}" fora do nome, guardei o nome inteiro` };
  return { chave: t };
}

async function lembrarAtalho(chave: string, estab: string, nome: string, categ: string, parcelas: number) {
  if (!chave) throw new Error("sem estabelecimento");
  const { url, headers } = supa();
  const r = await fetch(`${url}/rest/v1/fin_atalho?on_conflict=chave`, {
    method: "POST",
    headers: { ...headers, Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify({ chave, estab, nome, categ, parcelas, atualizado_em: new Date().toISOString() }),
  });
  if (!r.ok) throw new Error(`lembrar ${r.status}: ${await r.text()}`);
}

async function listaCategorias() {
  const { url, headers } = supa();
  const r = await fetch(`${url}/rest/v1/rpc/fin_categorias`, { method: "POST", headers, body: "{}" });
  if (!r.ok) throw new Error(`rpc ${r.status}: ${await r.text()}`);
  const rows = (await r.json()) as unknown[];
  const nomes = rows
    .map((x) => (typeof x === "string" ? x : String((x as Record<string, unknown>)?.fin_categorias ?? "")))
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => s.split(/\s*,\s*/).join(SEP_INTERNO));
  const unicos = Array.from(new Set(nomes)).sort((a, b) => a.localeCompare(b, "pt-BR"));
  if (!unicos.includes(CATEG_PADRAO)) unicos.push(CATEG_PADRAO);
  return unicos;
}

Deno.serve(async (req) => {
  // Sem o secret (ou curto demais), ninguém entra: nunca cai num token vazio ou previsível.
  const esperado = Deno.env.get("FIN_TOKEN") ?? "";
  if (esperado.length < 32) return json({ erro: "token do servidor nao configurado" }, 503);
  const token = req.headers.get("x-fin-token") ?? "";
  if (!token || !(await tokenValido(token, esperado))) return json({ erro: "nao autorizado" }, 401);

  if (req.method === "GET") {
    const acao = new URL(req.url).searchParams.get("acao");
    if (acao !== "categorias") return json({ erro: "acao invalida" }, 400);
    try {
      const lista = await listaCategorias();
      return new Response(lista.join(","), { headers: { "Content-Type": "text/plain; charset=utf-8" } });
    } catch (e) {
      return json({ erro: "falha ao listar categorias", detalhe: String(e) }, 500);
    }
  }

  if (req.method !== "POST") return json({ erro: "use GET ou POST" }, 405);

  let b: Record<string, unknown>;
  try { b = await req.json(); } catch { return json({ erro: "json invalido" }, 400); }

  const tipo = String(b.tipo ?? "");
  if (!tipo.startsWith("despesa")) return json({ ok: true, ignorado: `tipo ${tipo || "vazio"}` });

  const parcelasRecebidas = parseInt(String(b.parcelas ?? "1"), 10) || 1;
  if (parcelasRecebidas < 1 || parcelasRecebidas > MAX_PARCELAS) return json({ erro: "parcelas invalidas", recebido: b.parcelas }, 400);

  const valor = parseFloat(String(b.valor ?? "").replace(",", "."));
  if (!isFinite(valor) || valor <= 0) return json({ erro: "valor invalido", recebido: b.valor }, 400);

  const limpa = (v: unknown) => {
    const s = String(v ?? "").trim();
    return s && !s.startsWith("%") ? s : ""; // ignora variável do Tasker não preenchida
  };
  const estab = limpa(b.estab);
  const sim = (v: unknown) => v === true || v === "true";

  // Lançamento sozinho (Tasker, assim que a notificação chega): só com atalho do estabelecimento.
  // Parcelas da notificação (NuPay "em 3x") valem sobre as do atalho.
  let atalho: { nome: string; categ: string; parcelas: number } | null = null;
  if (sim(b.auto)) {
    try { atalho = await atalhoDo(estab); } catch (e) { return json({ erro: "falha ao ler atalho", detalhe: String(e) }, 500); }
    if (!atalho) return json({ ok: true, lancado: false });
  }
  const parcelas = atalho && parcelasRecebidas == 1 ? atalho.parcelas : parcelasRecebidas;
  const nome = atalho?.nome || limpa(b.nome) || estab || "Sem nome";
  const categRecebida = limpa(b.categ).split(/\s*\+\s*/).filter(Boolean).join(", ");
  const categ = atalho?.categ || categRecebida || MAPA_CATEG.find(([re]) => re.test(estab))?.[1] || CATEG_PADRAO;

  const { data, origem } = dataDaCompra(b.ts);

  // valor recebido = total da compra; divide em centavos e joga a sobra na 1ª parcela
  const totalCent = Math.round(valor * 100);
  const baseCent = Math.floor(totalCent / parcelas);
  const sobra = totalCent - baseCent * parcelas;

  const linhas = Array.from({ length: parcelas }, (_, i) => {
    const dataParcela = somaMeses(data, i);
    const cent = baseCent + (i === 0 ? sobra : 0);
    return {
      data: dataParcela,
      valor: -cent / 100,
      nome: parcelas > 1 ? `${nome} (${i + 1}/${parcelas})` : nome,
      categ,
      freq: null,
      cred: true,
      pago: true,
      fatura: calcFatura(dataParcela),
      obs: parcelas > 1 ? `auto:tasker parc ${i + 1}/${parcelas}` : "auto:tasker",
    };
  });

  if (b.dry_run === true || b.dry_run === "true") return json({ ok: true, dry_run: true, data_origem: origem, linhas });

  const { url, headers } = supa();
  const r = await fetch(`${url}/rest/v1/fin`, {
    method: "POST",
    headers: { ...headers, Prefer: "return=representation" },
    body: JSON.stringify(linhas),
  });
  const txt = await r.text();
  if (!r.ok) return json({ erro: "falha ao inserir", status: r.status, detalhe: txt }, 500);
  const ins = JSON.parse(txt) as Array<{ id: number }>;
  const resposta: Record<string, unknown> = { ok: true, lancado: true, ids: ins.map((x) => x.id), data_origem: origem, parcelas, nome, categ };
  // "Sempre assim?" = Sim no Tasker: o lançamento já entrou, então falhar aqui vira aviso, não erro
  // (erro faria o Tasker tentar de novo e duplicar o lançamento).
  if (sim(b.lembrar)) {
    const { chave, aviso } = chaveDoTrecho(estab, limpa(b.trecho));
    try {
      await lembrarAtalho(chave, estab, nome, categ, parcelas);
      resposta.lembrado = true;
      resposta.atalho = chave;
      if (aviso) resposta.aviso = aviso;
    } catch (e) { resposta.aviso = `atalho nao gravado: ${e}`; }
  }
  return json(resposta);
});
