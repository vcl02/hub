'use strict';
// Núcleo de código comum de todos os módulos (passo 4 da base comum, docs/DIRETRIZES.md seção 8): o que cada app repetia igual
// fica aqui, uma vez, testado uma vez (tests/nucleo.test.mjs). Script clássico, sem módulos nem build, como corpo/perfil.js:
// a página carrega ../base/nucleo.js depois do supabase.js e antes dos próprios scripts, e o service worker de cada app o guarda.
// Por enquanto só o limite de tempo dos pedidos ao Supabase (fetchComTeto); o que vem depois está em docs/DECISOES.md da raiz.

// Rede ruim (metrô): sem teto, um pedido que perde o sinal no meio pode ficar pendente por minutos, e o que espera por ele
// (o envio, a busca) fica preso até ele cair. Todo pedido ao Supabase, inclusive a leitura da resposta, tem limite; estourou,
// vira falha de rede comum ("Failed to fetch") e o pendente vai na próxima tentativa. A função (IA) tem mais tempo.
const TETO_REDE_MS = 15000,
  TETO_FUNCAO_MS = 40000;

// O fetch com teto para um par de limites (em ms): `rede` para o banco e o Auth, `funcao` para /functions/v1/. Sem argumento,
// os limites de todos os apps (15 s e 40 s); um app com limite próprio (o Fin, 12 s, quando migrar) cria o seu.
function criarFetchComTeto({ rede = TETO_REDE_MS, funcao = TETO_FUNCAO_MS } = {}) {
  return async function fetchComTeto(url, op = {}) {
    const c = new AbortController(),
      ms = String(url).includes('/functions/v1/') ? funcao : rede,
      t = setTimeout(() => c.abort(), ms);

    if (op.signal?.aborted) c.abort();
    else op.signal?.addEventListener('abort', () => c.abort());

    try {
      const r = await fetch(url, { ...op, signal: c.signal });

      const corpo = [101, 103, 204, 205, 304].includes(r.status)
        ? null
        : await r.arrayBuffer();

      return new Response(corpo, {
        status: r.status,
        statusText: r.statusText,
        headers: r.headers,
      });
    } catch (e) {
      if (c.signal.aborted && !op.signal?.aborted)
        throw new TypeError(`Failed to fetch: sem resposta em ${ms / 1000} s`, {
          cause: e,
        });
      throw e;
    } finally {
      clearTimeout(t);
    }
  };
}

// O que os apps passam ao cliente do Supabase: supabase.createClient(..., { global: { fetch: fetchComTeto } })
const fetchComTeto = criarFetchComTeto();
