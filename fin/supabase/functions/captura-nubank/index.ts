// captura-nubank: recebe lançamentos do Tasker e insere em public.fin
// Autenticação: header x-fin-token comparado ao secret FIN_TOKEN da função (definido no painel do
// Supabase, nunca no código nem no repositório, que é público). Sem o secret, recusa tudo.
// GET ?acao=categorias -> lista de categorias distintas (texto, separadas por vírgula; vírgula interna vira " + ")
// POST -> insere lançamento (com parcelas)
//   tipo: despesa_credito (cartão: cartao = "mp" é o Mercado Pago, senão Nubank), despesa_nupay (crédito
//         Nubank parcelado) ou despesa_debito (conta Nubank: Débito, pago, sem fatura e sempre 1 parcela)
//   auto: true -> só lança se o estabelecimento tem atalho (fin_atalho, migration 42), com o nome, a
//                 categoria e as parcelas dele; sem atalho, responde lancado: false e não grava nada.
//                 O atalho vale se o trecho dele está em qualquer parte do estabelecimento (a maquininha
//                 muda o resto), sem ligar pra acento, maiúscula, espaço ou pontuação; o trecho mais longo ganha
//   lembrar: true -> depois de lançar, grava (ou troca) o atalho com o que foi escolhido; trecho = a parte
//                 do estabelecimento que identifica o lugar (vazio, curto ou fora do nome: o nome inteiro)
//   tipo receita_debito -> entrada nova na conta (Pix recebido que não era conta prevista)
//   tipo conta_saida (Pix enviado, boleto pago) / conta_entrada (Pix recebido) -> paga uma conta prevista
//                 em aberto em fin (ver contaPrevista): estab = quem recebeu ou pagou
import "jsr:@supabase/functions-js@2.118.0/edge-runtime.d.ts";

// Cada cartão: compras a partir do dia de fechamento vão para a fatura do mês seguinte, que vence no
// dia de vencimento. O vencimento identifica o cartão no app (12 Nubank, 13 Mercado Pago, ver
// cartaoDaFatura em js/shared.js). Fechamento do Nubank inferido dos dados; o do Mercado Pago é
// suposição do mantenedor (7 dias antes do vencimento, como o Nubank), confirmar numa fatura real.
const CARTOES: Record<string, { fechamento: number; vencimento: number }> = {
  nubank: { fechamento: 5, vencimento: 12 },
  mp: { fechamento: 6, vencimento: 13 },
};
const MAX_PARCELAS = 24;
const SALDO_DESDE = "2026-08-07"; // o mesmo de js/app-state.js: conta em aberto desde aqui é atrasada, não esquecida
const TOLERANCIA = 0.3; // conta vinculada única com valor até 30% diferente do previsto: paga sozinha
const MAX_OPCOES = 6;
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

function calcFatura(data: string, cartao = "nubank") {
  const { fechamento, vencimento } = CARTOES[cartao] ?? CARTOES.nubank;
  let [a, m, d] = data.split("-").map(Number);
  if (d >= fechamento) { m += 1; if (m > 12) { m = 1; a += 1; } }
  return `${a}-${String(m).padStart(2, "0")}-${String(vencimento).padStart(2, "0")}`;
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

const limpa = (v: unknown) => {
  const s = String(v ?? "").trim();
  return s && !s.startsWith("%") ? s : ""; // ignora variável do Tasker não preenchida
};
const sim = (v: unknown) => v === true || v === "true";
const centavos = (v: number) => Math.round(Math.abs(v) * 100);
const brl = (v: number) => {
  const [i, d] = (centavos(v) / 100).toFixed(2).split(".");
  return `${i.replace(/\B(?=(\d{3})+(?!\d))/g, ".")},${d}`;
};
const diaMes = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;

async function inserir(linhas: unknown[]) {
  const { url, headers } = supa();
  const r = await fetch(`${url}/rest/v1/fin`, {
    method: "POST",
    headers: { ...headers, Prefer: "return=representation" },
    body: JSON.stringify(linhas),
  });
  const txt = await r.text();
  if (!r.ok) throw new Error(`inserir ${r.status}: ${txt}`);
  return (JSON.parse(txt) as Array<{ id: number }>).map((x) => x.id);
}

// ---------- Contas previstas (Pix enviado, boleto pago, Pix recebido) ----------
// Em vez de lançar, marca como paga uma linha que já existe em fin, em aberto (pago = false), fora do
// cartão e no sentido certo (saída negativa, entrada positiva). Candidatas: do ciclo de hoje, as
// atrasadas (desde SALDO_DESDE, menos Investimento, como ehDebitoAtrasado no app) e as do próximo
// ciclo (estas só na lista, nunca sozinhas: pagar antes muda a linha de ciclo).
// Vínculo (fin_vinculo, migration 43): trecho de quem recebeu ou pagou -> conta (nome sem parcela +
// categoria). Uma pessoa pode ter várias contas (o iPhone e outra pagos pra mesma pessoa).
// Ao pagar: pago, data = dia do pagamento e valor = o pago (o previsto fica em fin_historico).
type Conta = { id: number; data: string; valor: number; nome: string; categ: string; atrasado?: boolean; proximo?: boolean };
const semParcela = (nome: string) => nome.replace(/\s*\(?\s*\d+\s*\/\s*\d+\s*\)?\s*$/, "").trim();
const contaDe = (l: { nome: string; categ: string }) => `${chaveDoEstab(semParcela(l.nome))}|${chaveDoEstab(l.categ)}`;
const ehInvestimento = (categ: string) => String(categ ?? "").split(/\s*,\s*/).some((c) => /^investimento$/i.test(c));

async function contasEmAberto(entrada: boolean, hoje: string) {
  const { url, headers } = supa();
  const rc = await fetch(`${url}/rest/v1/fin_ciclo?select=inicio,fim&order=inicio`, { headers });
  if (!rc.ok) throw new Error(`ciclos ${rc.status}: ${await rc.text()}`);
  const ciclos = (await rc.json()) as Array<{ inicio: string; fim: string | null }>;
  const i = ciclos.findIndex((c) => c.inicio <= hoje && (!c.fim || hoje <= c.fim));
  if (i < 0) throw new Error(`nenhum ciclo contém ${hoje}`);
  const atual = ciclos[i], prox = ciclos[i + 1];
  const ate = (prox ? prox.fim : atual.fim) ?? "9999-12-31";
  const r = await fetch(`${url}/rest/v1/fin?select=id,data,valor,nome,categ&cred=eq.false&pago=eq.false` +
    `&valor=${entrada ? "gt" : "lt"}.0&data=gte.${SALDO_DESDE}&data=lte.${ate}&order=data,id`, { headers });
  if (!r.ok) throw new Error(`contas ${r.status}: ${await r.text()}`);
  return ((await r.json()) as Conta[])
    .map((l) => ({ ...l, valor: Number(l.valor), atrasado: l.data < atual.inicio, proximo: !!atual.fim && l.data > atual.fim }))
    .filter((l) => !(l.atrasado && ehInvestimento(l.categ)))
    .sort((a, b) => a.data.localeCompare(b.data) || a.id - b.id); // a mais antiga primeiro (contaSozinha)
}

async function vinculosDe(quem: string) {
  const alvo = compacta(quem);
  if (!alvo) return [];
  const { url, headers } = supa();
  const r = await fetch(`${url}/rest/v1/fin_vinculo?select=chave,nome,categ`, { headers });
  if (!r.ok) throw new Error(`vinculos ${r.status}: ${await r.text()}`);
  const linhas = (await r.json()) as Array<{ chave: string; nome: string; categ: string }>;
  return linhas.filter((v) => { const t = compacta(v.chave); return t && alvo.includes(t); });
}

// Marca sozinha só quando não há dúvida: uma conta vinculada (a mais antiga, se a mesma conta está em
// aberto em dois meses) com o valor igual ou até 30% diferente, ou, com várias vinculadas, a única com
// o valor exato. O resto pergunta (Trybe e Água, ambas R$ 250,00, mostram por que valor só não basta).
function contaSozinha(vinculadas: Conta[], valor: number) {
  const porConta = new Map<string, Conta>();
  for (const l of vinculadas.filter((l) => !l.proximo)) if (!porConta.has(contaDe(l))) porConta.set(contaDe(l), l);
  const unicas = [...porConta.values()];
  const igual = (l: Conta) => centavos(l.valor) === centavos(valor);
  if (unicas.length === 1) {
    const l = unicas[0];
    return Math.abs(centavos(valor) - centavos(l.valor)) <= TOLERANCIA * centavos(l.valor) ? l : null;
  }
  const iguais = unicas.filter(igual);
  return iguais.length === 1 ? iguais[0] : null;
}

// Lista pra escolher no Tasker: vinculadas primeiro, depois o valor mais perto e a data mais perto.
// Rótulo sem vírgula (a lista do Tasker separa por vírgula): o centavo usa "‚" (U+201A), que parece vírgula.
function opcoesPara(contas: Conta[], vinculadas: Conta[], valor: number, hoje: string) {
  const vinc = new Set(vinculadas.map((l) => l.id));
  const dist = (d: string) => Math.abs(Date.parse(d) - Date.parse(hoje));
  const perto = (l: Conta) => Math.abs(centavos(l.valor) - centavos(valor));
  return [...contas]
    .sort((a, b) => Number(vinc.has(b.id)) - Number(vinc.has(a.id)) || perto(a) - perto(b) || dist(a.data) - dist(b.data))
    .slice(0, MAX_OPCOES)
    .map((l) => ({
      id: l.id,
      rotulo: `${l.nome} R$ ${brl(l.valor)} · ${diaMes(l.data)}${l.atrasado ? " · atrasado" : ""}${l.proximo ? " · próx. ciclo" : ""}`.replace(/,/g, "\u201a"),
    }));
}

async function pagar(id: number, dia: string, valor: number, entrada: boolean) {
  const { url, headers } = supa();
  const filtro = `id=eq.${id}&cred=eq.false&pago=eq.false&valor=${entrada ? "gt" : "lt"}.0`;
  const antes = await fetch(`${url}/rest/v1/fin?${filtro}&select=id,data,valor,nome,categ`, { headers });
  if (!antes.ok) throw new Error(`conta ${antes.status}: ${await antes.text()}`);
  const [conta] = (await antes.json()) as Conta[];
  if (!conta) return null;
  const r = await fetch(`${url}/rest/v1/fin?${filtro}`, {
    method: "PATCH",
    headers: { ...headers, Prefer: "return=representation" },
    body: JSON.stringify({ pago: true, data: dia, valor: (entrada ? 1 : -1) * centavos(valor) / 100 }),
  });
  if (!r.ok) throw new Error(`pagar ${r.status}: ${await r.text()}`);
  return ((await r.json()) as Conta[]).length ? { ...conta, valor: Number(conta.valor) } : null;
}

const textoDoPagamento = (conta: Conta, valor: number, entrada: boolean) =>
  `${conta.nome}: ${entrada ? "recebido" : "pago"} R$ ${brl(valor)}` +
  (centavos(conta.valor) !== centavos(valor) ? ` (previsto R$ ${brl(conta.valor)})` : "");

async function lembrarVinculo(chave: string, conta: Conta) {
  if (!chave) throw new Error("sem o nome de quem recebeu ou pagou");
  const { url, headers } = supa();
  const r = await fetch(`${url}/rest/v1/fin_vinculo?on_conflict=chave,nome,categ`, {
    method: "POST",
    headers: { ...headers, Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify({ chave, nome: semParcela(conta.nome), categ: conta.categ, atualizado_em: new Date().toISOString() }),
  });
  if (!r.ok) throw new Error(`vinculo ${r.status}: ${await r.text()}`);
}

// id: conta escolhida no Tasker; acao "opcoes": a lista pra escolher; auto: tenta sozinho (Nubank A).
async function contaPrevista(b: Record<string, unknown>, entrada: boolean) {
  const valor = parseFloat(String(b.valor ?? "").replace(",", "."));
  if (!isFinite(valor) || valor <= 0) return json({ erro: "valor invalido", recebido: b.valor }, 400);
  const quem = limpa(b.estab);
  const { data: dia } = dataDaCompra(b.ts);

  if (limpa(b.id)) {
    const id = parseInt(limpa(b.id), 10);
    if (!(id > 0)) return json({ erro: "id invalido", recebido: b.id }, 400);
    let conta: Conta | null;
    try { conta = await pagar(id, dia, valor, entrada); } catch (e) { return json({ erro: "falha ao pagar", detalhe: String(e) }, 500); }
    if (!conta) return json({ erro: "conta nao esta mais em aberto", id }, 409);
    const resposta: Record<string, unknown> = { ok: true, pago: true, id, nome: conta.nome, texto: textoDoPagamento(conta, valor, entrada) };
    // Como o atalho: o pagamento já entrou, então falhar aqui vira aviso, não erro.
    if (sim(b.lembrar)) {
      const { chave, aviso } = chaveDoTrecho(quem, limpa(b.trecho));
      try {
        await lembrarVinculo(chave, conta);
        resposta.lembrado = true;
        resposta.vinculo = chave;
        if (aviso) resposta.aviso = aviso;
      } catch (e) { resposta.aviso = `vinculo nao gravado: ${e}`; }
    }
    return json(resposta);
  }

  let contas: Conta[], vinculadas: Conta[];
  try {
    contas = await contasEmAberto(entrada, dia);
    const vinculos = new Set((await vinculosDe(quem)).map(contaDe));
    vinculadas = contas.filter((l) => vinculos.has(contaDe(l)));
  } catch (e) { return json({ erro: "falha ao ler contas", detalhe: String(e) }, 500); }

  if (b.acao === "opcoes") return json({ ok: true, opcoes: opcoesPara(contas, vinculadas, valor, dia) });
  if (!sim(b.auto)) return json({ erro: "use id, acao opcoes ou auto" }, 400);

  const escolhida = contaSozinha(vinculadas, valor);
  if (escolhida) {
    try {
      const conta = await pagar(escolhida.id, dia, valor, entrada);
      if (conta) return json({ ok: true, pago: true, id: conta.id, nome: conta.nome, texto: textoDoPagamento(conta, valor, entrada) });
    } catch (e) { return json({ erro: "falha ao pagar", detalhe: String(e) }, 500); }
  }
  // Sem conta vinculada nenhuma, quem tem atalho ("Novo lançamento" + "Sempre assim? Sim") vira
  // lançamento novo na conta, pago, como uma compra no débito.
  if (!vinculadas.length) {
    let atalho: { nome: string; categ: string } | null;
    try { atalho = await atalhoDo(quem); } catch (e) { return json({ erro: "falha ao ler atalho", detalhe: String(e) }, 500); }
    if (atalho) {
      const linha = { data: dia, valor: (entrada ? 1 : -1) * centavos(valor) / 100, nome: atalho.nome, categ: atalho.categ,
        freq: null, cred: false, pago: true, fatura: null, obs: "auto:tasker" };
      try {
        const ids = await inserir([linha]);
        return json({ ok: true, lancado: true, ids, nome: atalho.nome, categ: atalho.categ, forma: entrada ? "entrada" : "débito" });
      } catch (e) { return json({ erro: "falha ao inserir", detalhe: String(e) }, 500); }
    }
  }
  return json({ ok: true, pago: false, lancado: false });
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
  if (tipo === "conta_saida" || tipo === "conta_entrada") return await contaPrevista(b, tipo === "conta_entrada");
  if (!tipo.startsWith("despesa") && tipo !== "receita_debito") return json({ ok: true, ignorado: `tipo ${tipo || "vazio"}` });

  // Débito (conta Nubank) não tem fatura nem parcelas; crédito vai pro cartão da notificação.
  // receita_debito: entrada nova na conta, mesmas regras do débito com o valor positivo.
  const receita = tipo === "receita_debito";
  const debito = tipo === "despesa_debito" || receita;
  const cartao = debito ? null : b.cartao === "mp" ? "mp" : "nubank";
  const parcelasRecebidas = debito ? 1 : parseInt(String(b.parcelas ?? "1"), 10) || 1;
  if (parcelasRecebidas < 1 || parcelasRecebidas > MAX_PARCELAS) return json({ erro: "parcelas invalidas", recebido: b.parcelas }, 400);

  const valor = parseFloat(String(b.valor ?? "").replace(",", "."));
  if (!isFinite(valor) || valor <= 0) return json({ erro: "valor invalido", recebido: b.valor }, 400);

  const estab = limpa(b.estab);

  // Lançamento sozinho (Tasker, assim que a notificação chega): só com atalho do estabelecimento.
  // Parcelas da notificação (NuPay "em 3x") valem sobre as do atalho.
  let atalho: { nome: string; categ: string; parcelas: number } | null = null;
  if (sim(b.auto)) {
    try { atalho = await atalhoDo(estab); } catch (e) { return json({ erro: "falha ao ler atalho", detalhe: String(e) }, 500); }
    if (!atalho) return json({ ok: true, lancado: false });
  }
  const parcelas = !debito && atalho && parcelasRecebidas == 1 ? atalho.parcelas : parcelasRecebidas;
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
      valor: (receita ? cent : -cent) / 100,
      nome: parcelas > 1 ? `${nome} (${i + 1}/${parcelas})` : nome,
      categ,
      freq: null,
      cred: !debito,
      pago: true,
      fatura: debito ? null : calcFatura(dataParcela, cartao!),
      obs: parcelas > 1 ? `auto:tasker parc ${i + 1}/${parcelas}` : "auto:tasker",
    };
  });

  if (b.dry_run === true || b.dry_run === "true") return json({ ok: true, dry_run: true, data_origem: origem, linhas });

  let ids: number[];
  try { ids = await inserir(linhas); } catch (e) { return json({ erro: "falha ao inserir", detalhe: String(e) }, 500); }
  const forma = receita ? "entrada" : debito ? "débito" : cartao === "mp" ? "Mercado Pago" : "Nubank";
  const resposta: Record<string, unknown> = { ok: true, lancado: true, ids, data_origem: origem, parcelas, nome, categ, forma };
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
