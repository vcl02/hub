'use strict';
// Núcleo de código comum de todos os módulos (passo 4 da base comum, docs/DIRETRIZES.md seção 8): o que cada app repetia igual
// fica aqui, uma vez, testado uma vez (tests/nucleo.test.mjs). Script clássico, sem módulos nem build, como corpo/perfil.js:
// a página carrega ../base/nucleo.js depois do supabase.js e antes dos próprios scripts, e o service worker de cada app o guarda.
// Fatia 1: o limite de tempo dos pedidos ao Supabase (fetchComTeto). Fatia 2: o toque repetido sem querer (repetido) e o toque
// duplo para confirmar (confirmar e o armado pela chave do item). O que vem depois está em docs/DECISOES.md da raiz.

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

// ===== Toque duplo para confirmar (tirar, apagar, jogar fora) =====
// O 1º toque arma o item (o botão fica vermelho por 3 s) e o 2º confirma. O armado fica guardado pela chave do item
// (data-armavel no botão), não no botão: a tela redesenhada no meio (a nuvem que chega, o relógio, o cronômetro do Treino)
// devolve o vermelho ao botão novo do mesmo item, e o 2º toque tira esse item, nunca o vizinho que ficou no lugar.
const ARMADO_MS = 3000;
let armados = {}; // chave do item → até quando (ms)

const estaArmado = (chave) => armados[chave] > Date.now();

function armar(chave) {
  armados[chave] = Date.now() + ARMADO_MS;
  setTimeout(pintarArmados, ARMADO_MS); // o prazo acabou: o vermelho sai
}

function desarmar(chave) {
  delete armados[chave];
}

// Cada botão com data-armavel fica vermelho só enquanto o item dele está armado; o prazo vencido sai da lista
function pintarArmados() {
  document
    .querySelectorAll('[data-armavel]')
    .forEach((b) => b.classList.toggle('armado', estaArmado(b.dataset.armavel)));

  for (const k of Object.keys(armados)) if (!estaArmado(k)) delete armados[k];
}

// true no 2º toque no mesmo item dentro do prazo; o 1º só arma. Botão sem data-armavel nunca arma nem confirma: sem a
// chave, todos dividiriam uma só ("undefined") e o 2º toque num botão confirmaria o 1º de outro (erro no console, sem quebrar).
function confirmar(btn) {
  const k = btn.dataset.armavel;

  if (!k) {
    console.error('confirmar: botão sem data-armavel', btn);

    return false;
  }

  if (estaArmado(k)) {
    desarmar(k);
    pintarArmados();

    return true;
  }

  armar(k);
  pintarArmados();

  return false;
}

// Chave de item sem id (copo de água, trecho de caminhada, horário de evacuação ou xixi): o conteúdo e, entre iguais, a vez
// dele (#1, #2…); nunca a posição na lista, que muda quando a nuvem traz um item antes
function chavesDosItens(L, texto) {
  const vez = {};

  return L.map((x) => {
    const t = texto(x);

    vez[t] = (vez[t] || 0) + 1;

    return `${t}#${vez[t]}`;
  });
}

// Tela redesenhada (innerHTML novo, de qualquer desenho): os botões novos dos itens armados voltam vermelhos. Na página
// inicial, que não arma nada, a lista fica vazia e o observador não percorre a tela.
new MutationObserver(() => {
  if (Object.keys(armados).length) pintarArmados();
}).observe(document.documentElement, { childList: true, subtree: true });

// ===== Toque repetido sem querer =====
// O dedo que bate duas vezes, o clique duplo: a mesma ação (k) de novo em menos de 0,5 s é ignorada (true = ignore). Só nos
// botões que acrescentam à lista do dia (+ml, +1, Andei +); o Fin trava o botão enquanto o pedido está no ar.
const REPETIDO_MS = 500;
let ultimaAcao = { k: '', em: 0 };

function repetido(k) {
  const agora = Date.now(),
    r = ultimaAcao.k === k && agora - ultimaAcao.em < REPETIDO_MS;

  ultimaAcao = { k, em: agora };

  return r;
}
