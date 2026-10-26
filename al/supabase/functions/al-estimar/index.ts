// al-estimar: recebe o texto do que foi comido e devolve os itens com porção, kcal e macros estimados pela IA (Claude Haiku).
// A chave da Anthropic fica só no secret ANTHROPIC_API_KEY da função (painel do Supabase), nunca no código nem no
// repositório, que é público. Sem o secret, recusa tudo (503).
// Só a conta do Victor usa: a sessão do Supabase (Authorization: Bearer) é conferida no Auth antes de qualquer coisa.
// Limite de chamadas por dia em public.al_uso, gravado com a própria sessão (o RLS só libera o Victor).
// POST { texto } -> { itens: [{ nome, porcao, kcal, prot, carb, gord }] }
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import Anthropic from "npm:@anthropic-ai/sdk@0.133.0";

const DONO = "32f70255-30a0-4e2b-ad76-31d7a1bf54f7";
const SUPABASE_KEY = "sb_publishable_Fq984qUdQO8mGq4PSYmUiQ_ySaLrmEQ"; // publicável, a mesma dos apps: só identifica o projeto
const MODELO = "claude-haiku-5-5";
const LIMITE_DIA = 40; // chamadas por dia: teto de gasto mesmo se algo chamar em loop
const MAX_TEXTO = 500;
const MAX_ITENS = 20;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

const INSTRUCOES = `Você estima calorias e macronutrientes do que uma pessoa comeu, a partir da descrição dela em português do Brasil.
Separe a descrição em itens, um por alimento ou preparo (ex.: "2 ovos mexidos e um pão francês" = 2 itens).
Para cada item:
- nome: curto, sem a quantidade (ex.: "Ovo mexido", "Pão francês").
- porcao: a quantidade descrita com o peso aproximado em gramas ou ml (ex.: "2 unidades (~100 g)", "1 concha (~140 g)"). Se a quantidade não foi dita, assuma a porção comum de um adulto no Brasil e escreva qual foi.
- kcal, prot, carb, gord: totais da porção inteira (kcal, e gramas de proteína, carboidrato e gordura), com valores típicos de tabelas brasileiras de composição de alimentos (como a TACO) e de rótulos comuns. Considere o preparo (frito, com óleo, com açúcar) quando ele for dito.
Arredonde kcal para inteiro e os gramas para uma casa decimal. As kcal devem bater, aproximadamente, com 4 × proteína + 4 × carboidrato + 9 × gordura.
Se a descrição não for comida nem bebida, devolva a lista vazia.`;

const ESQUEMA = {
  type: "object",
  properties: {
    itens: {
      type: "array",
      items: {
        type: "object",
        properties: {
          nome: { type: "string" },
          porcao: { type: "string" },
          kcal: { type: "number" },
          prot: { type: "number" },
          carb: { type: "number" },
          gord: { type: "number" },
        },
        required: ["nome", "porcao", "kcal", "prot", "carb", "gord"],
        additionalProperties: false,
      },
    },
  },
  required: ["itens"],
  additionalProperties: false,
};

function dataSP(d: Date) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(d);
}

// Número dentro da faixa aceita pelas tabelas (al_item/al_registro), arredondado como na tela.
function numero(v: unknown, max: number, casas: number) {
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0) return 0;
  const f = 10 ** casas;
  return Math.round(Math.min(n, max) * f) / f;
}
const texto = (v: unknown, max: number) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, max);

function limpar(bruto: unknown) {
  const itens = Array.isArray((bruto as { itens?: unknown })?.itens) ? (bruto as { itens: unknown[] }).itens : [];
  return itens.slice(0, MAX_ITENS).map((i) => {
    const x = (i ?? {}) as Record<string, unknown>;
    return {
      nome: texto(x.nome, 60),
      porcao: texto(x.porcao, 60),
      kcal: numero(x.kcal, 5000, 0),
      prot: numero(x.prot, 500, 1),
      carb: numero(x.carb, 500, 1),
      gord: numero(x.gord, 500, 1),
    };
  }).filter((i) => i.nome);
}

// Quem chamou: a sessão do Supabase tem de ser a do Victor.
async function usuario(url: string, token: string) {
  const r = await fetch(`${url}/auth/v1/user`, { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${token}` } });
  if (!r.ok) return null;
  const u = await r.json() as { id?: string };
  return u?.id || null;
}

// Conta a chamada do dia antes de chamar a IA (falha também conta) e diz se ainda cabe no limite.
async function contarChamada(url: string, token: string) {
  const headers = { apikey: SUPABASE_KEY, Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
  const dia = dataSP(new Date());
  const r = await fetch(`${url}/rest/v1/al_uso?select=chamadas&data=eq.${dia}`, { headers });
  if (!r.ok) throw new Error(`al_uso ${r.status}`);
  const linhas = await r.json() as Array<{ chamadas: number }>;
  const feitas = linhas[0]?.chamadas ?? 0;
  if (feitas >= LIMITE_DIA) return false;
  const w = await fetch(`${url}/rest/v1/al_uso?on_conflict=user_id,data`, {
    method: "POST",
    headers: { ...headers, Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify({ user_id: DONO, data: dia, chamadas: feitas + 1 }),
  });
  if (!w.ok) throw new Error(`al_uso ${w.status}`);
  return true;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (req.method !== "POST") return json({ erro: "método" }, 405);
  const chave = Deno.env.get("ANTHROPIC_API_KEY");
  if (!chave) return json({ erro: "IA não configurada" }, 503);
  const url = Deno.env.get("SUPABASE_URL")!;

  const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  const id = token ? await usuario(url, token) : null;
  if (!id) return json({ erro: "sem sessão" }, 401);
  if (id !== DONO) return json({ erro: "sem acesso" }, 403);

  let corpo: { texto?: unknown };
  try { corpo = await req.json(); } catch { return json({ erro: "corpo" }, 400); }
  const descricao = texto(corpo?.texto, MAX_TEXTO + 1);
  if (!descricao || descricao.length > MAX_TEXTO) return json({ erro: "texto" }, 400);

  try {
    if (!await contarChamada(url, token)) return json({ erro: "limite do dia" }, 429);
  } catch (e) {
    return json({ erro: String((e as Error)?.message || e) }, 502);
  }

  const cliente = new Anthropic({ apiKey: chave });
  try {
    const resposta = await cliente.messages.create({
      model: MODELO,
      max_tokens: 4000,
      system: INSTRUCOES,
      output_config: { effort: "low", format: { type: "json_schema", schema: ESQUEMA } },
      messages: [{ role: "user", content: descricao }],
    });
    if (resposta.stop_reason === "refusal") return json({ erro: "recusado" }, 422);
    if (resposta.stop_reason === "max_tokens") return json({ erro: "resposta incompleta" }, 502);
    const bloco = resposta.content.find((b) => b.type === "text");
    if (!bloco || bloco.type !== "text") return json({ erro: "sem resposta" }, 502);
    return json({ itens: limpar(JSON.parse(bloco.text)) });
  } catch (e) {
    if (e instanceof Anthropic.RateLimitError) return json({ erro: "IA ocupada" }, 503);
    if (e instanceof Anthropic.AuthenticationError) return json({ erro: "chave da IA inválida" }, 503);
    if (e instanceof Anthropic.APIError) return json({ erro: `IA ${e.status}` }, 502);
    if (e instanceof SyntaxError) return json({ erro: "resposta inválida" }, 502);
    return json({ erro: "falha na IA" }, 502);
  }
});
