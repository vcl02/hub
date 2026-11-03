// Núcleo comum (base/nucleo.js), sem navegador: o arquivo publicado roda inteiro num contexto isolado (tests/funcoes.mjs,
// carregarArquivos) com relógio, AbortController, fetch, tela e MutationObserver falsos. Só o núcleo é testado aqui; que cada
// app usa ele (e não uma cópia própria) fica em tests/repetidas.test.mjs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { carregarArquivos } from './funcoes.mjs';

const json = (x) => JSON.parse(JSON.stringify(x));

// A página que o núcleo vigia (o MutationObserver do toque duplo roda ao carregar o arquivo): sem botões, observador mudo.
// Os testes do toque duplo trocam por uma tela e um observador que o teste controla (toqueDuplo, abaixo).
const PAGINA = {
  document: { documentElement: {}, querySelectorAll: () => [] },
  MutationObserver: class {
    observe() {}
  },
};

// fetch que só termina se o sinal de cancelamento disparar (pedido pendurado no metrô); sinal já cancelado falha na hora,
// como o fetch do navegador
const pendurado = (url, op) =>
  new Promise((_, rejeita) => {
    const cancelar = () =>
      rejeita(Object.assign(new Error('abortado'), { name: 'AbortError' }));

    if (op.signal.aborted) cancelar();
    else op.signal.addEventListener('abort', cancelar);
  });

// O núcleo com o relógio na mão do teste: cada setTimeout fica em `prazos` (o teste dispara quando quiser), cada clearTimeout
// em `limpos`. `pedidos` guarda o que chegou ao fetch de verdade.
function nucleo(fetch) {
  const prazos = [],
    limpos = [],
    pedidos = [];

  const n = carregarArquivos(
    ['base/nucleo.js'],
    ['TETO_REDE_MS', 'TETO_FUNCAO_MS', 'criarFetchComTeto', 'fetchComTeto'],
    {
      ...PAGINA,
      AbortController,
      Response,
      TypeError,
      setTimeout: (f, ms) => {
        prazos.push({ f, ms });

        return prazos.length;
      },
      clearTimeout: (id) => limpos.push(id),
      fetch: (url, op) => {
        pedidos.push({ url, op });

        return fetch(url, op);
      },
    }
  );

  return { ...n, prazos, limpos, pedidos };
}

const BANCO = 'https://x.supabase.co/rest/v1/agua_dia?select=*',
  AUTH = 'https://x.supabase.co/auth/v1/token?grant_type=password',
  FUNCAO = 'https://x.supabase.co/functions/v1/al-estimar';

test('núcleo: os limites de todos os apps são 15 s (banco e Auth) e 40 s (a função), os de antes de virem para cá', () => {
  const n = nucleo(pendurado);

  assert.equal(n.TETO_REDE_MS, 15000);
  assert.equal(n.TETO_FUNCAO_MS, 40000);

  for (const [url, ms] of [
    [BANCO, 15000],
    [AUTH, 15000],
    [FUNCAO, 40000],
    [new URL(FUNCAO), 40000], // o supabase-js pode mandar URL em vez de texto
  ]) {
    n.prazos.length = 0;
    n.fetchComTeto(url).catch(() => {});
    assert.equal(n.prazos[0].ms, ms, String(url));
  }
});

test('núcleo: resposta normal chega inteira (corpo já lido, status, cabeçalhos) e o prazo é limpo', async () => {
  const n = nucleo(
    async () =>
      new Response('[{"data":"2026-11-02"}]', {
        status: 201,
        statusText: 'Created',
        headers: { 'content-range': '0-0/1' },
      })
  );

  const r = await n.fetchComTeto(BANCO, { method: 'POST', body: '{}' });

  assert.equal(r.status, 201);
  assert.equal(r.statusText, 'Created');
  assert.equal(r.headers.get('content-range'), '0-0/1');
  assert.equal(await r.text(), '[{"data":"2026-11-02"}]');
  assert.deepEqual(n.limpos, [1]); // o prazo do pedido foi limpo: não aborta nada depois
  // o pedido segue com o que o chamador pediu, mais o sinal do teto
  assert.equal(n.pedidos[0].op.method, 'POST');
  assert.equal(n.pedidos[0].op.body, '{}');
  assert.equal(n.pedidos[0].op.signal.aborted, false);
});

test('núcleo: resposta sem corpo (204, 304…) não tenta ler o corpo e passa o status', async () => {
  for (const status of [204, 205, 304]) {
    let lido = false;

    const n = nucleo(async () => ({
      status,
      statusText: '',
      headers: new Headers(),
      arrayBuffer: async () => {
        lido = true;

        return new ArrayBuffer(0);
      },
    }));

    const r = await n.fetchComTeto(BANCO);

    assert.equal(r.status, status);
    assert.equal(lido, false, `${status}: leu o corpo`);
    assert.deepEqual(n.limpos, [1]);
  }
});

test('núcleo: sem resposta até o prazo vira TypeError "Failed to fetch: sem resposta em N s", com o erro original em cause', async () => {
  for (const [url, s] of [
    [BANCO, 15],
    [FUNCAO, 40],
  ]) {
    const n = nucleo(pendurado),
      espera = n.fetchComTeto(url);

    n.prazos[0].f(); // passou o prazo
    const e = await espera.catch((x) => x);

    assert.equal(e.constructor, TypeError); // o supabase-js trata TypeError como falha de rede
    assert.equal(e.message, `Failed to fetch: sem resposta em ${s} s`);
    assert.equal(e.cause.name, 'AbortError');
    assert.equal(n.pedidos[0].op.signal.aborted, true); // o pedido de verdade foi cancelado, não fica pendurado
    assert.deepEqual(n.limpos, [1]);
  }
});

test('núcleo: a conexão que cai no meio da leitura da resposta também vira falha de rede (a leitura está dentro do prazo)', async () => {
  const n = nucleo(async (url, op) => ({
    status: 200,
    statusText: 'OK',
    headers: new Headers(),
    arrayBuffer: () => pendurado(url, op),
  }));

  const espera = n.fetchComTeto(BANCO);

  await new Promise((r) => setImmediate(r)); // os cabeçalhos chegaram; o corpo, não
  n.prazos[0].f();
  await assert.rejects(
    espera,
    (e) => e instanceof TypeError && /^Failed to fetch/.test(e.message)
  );
});

test('núcleo: cancelado por quem pediu (antes ou durante) segue como cancelado, não vira falha de rede', async () => {
  // durante
  const n = nucleo(pendurado),
    dono = new AbortController(),
    cancelado = n.fetchComTeto(BANCO, { signal: dono.signal });

  dono.abort();
  await assert.rejects(
    cancelado,
    (e) => e.name === 'AbortError' && !(e instanceof TypeError)
  );
  assert.deepEqual(n.limpos, [1]);

  // antes: já chega cancelado, o pedido sai com o sinal abortado
  const m = nucleo(pendurado),
    ja = new AbortController();

  ja.abort();
  const antes = m.fetchComTeto(BANCO, { signal: ja.signal });

  assert.equal(m.pedidos[0].op.signal.aborted, true);
  await assert.rejects(antes, (e) => e.name === 'AbortError');
});

test('núcleo: erro de rede que não é o prazo (sem internet) passa como veio', async () => {
  const offline = new TypeError('Failed to fetch');

  const n = nucleo(async () => {
    throw offline;
  });

  await assert.rejects(n.fetchComTeto(BANCO), (e) => e === offline);
  assert.deepEqual(n.limpos, [1]);
});

test('núcleo: criarFetchComTeto aceita limites próprios (para o Fin, quando migrar) sem mudar os dos apps', async () => {
  const n = nucleo(pendurado),
    doze = n.criarFetchComTeto({ rede: 12000 });

  const espera = doze(BANCO);

  assert.equal(n.prazos[0].ms, 12000);
  n.prazos[0].f();
  await assert.rejects(
    espera,
    (e) => e.message === 'Failed to fetch: sem resposta em 12 s'
  );

  n.prazos.length = 0;
  doze(FUNCAO).catch(() => {});
  assert.equal(n.prazos[0].ms, 40000); // o que não foi passado fica no padrão

  n.prazos.length = 0;
  n.criarFetchComTeto({ funcao: 60000 })(FUNCAO).catch(() => {});
  n.fetchComTeto(BANCO).catch(() => {});
  assert.deepEqual(
    n.prazos.map((p) => p.ms),
    [60000, 15000]
  ); // e o fetchComTeto dos apps segue com 15 s
});

// ---------- repetido(acao): a mesma ação de novo em menos de 0,5 s é ignorada (toque repetido sem querer) ----------
// O relógio é o Date.now() do contexto (o relógio falso do teste aqui; o pausado do Playwright nos testes de navegador).
function relogioDoNucleo() {
  let agora = 1000;

  const n = carregarArquivos(['base/nucleo.js'], ['REPETIDO_MS', 'repetido'], {
    ...PAGINA,
    Date: { now: () => agora },
  });

  return {
    ...n,
    andar: (ms) => {
      agora += ms;
    },
  };
}

test('núcleo: repetido ignora a mesma ação em menos de 0,5 s e aceita de novo a partir de 0,5 s', () => {
  const n = relogioDoNucleo();

  assert.equal(n.REPETIDO_MS, 500);
  assert.equal(n.repetido('beber agua 300'), false); // o 1º toque vale
  n.andar(499);
  assert.equal(n.repetido('beber agua 300'), true); // 0,499 s depois: o dedo que bateu duas vezes
  n.andar(500);
  assert.equal(n.repetido('beber agua 300'), false); // 0,5 s depois do último: outro copo de verdade
  n.andar(600);
  assert.equal(n.repetido('beber agua 300'), false);
});

test('núcleo: repetido conta do último toque (toques seguidos sem querer seguem ignorados)', () => {
  const n = relogioDoNucleo();

  n.repetido('x-mais 2026-11-03');
  n.andar(300);
  assert.equal(n.repetido('x-mais 2026-11-03'), true);
  n.andar(300); // 0,6 s do 1º, mas 0,3 s do 2º
  assert.equal(n.repetido('x-mais 2026-11-03'), true);
});

test('núcleo: repetido é por ação (botão, quantidade, dia): ações diferentes não se bloqueiam', () => {
  const n = relogioDoNucleo();

  assert.equal(n.repetido('beber agua 150'), false);
  n.andar(10);
  assert.equal(n.repetido('beber agua 300'), false); // outra quantidade: vale
  n.andar(10);
  assert.equal(n.repetido('ev-mais 2026-11-03'), false); // outro botão: vale
  n.andar(10);
  assert.equal(n.repetido('ev-mais 2026-11-02'), false); // o mesmo botão em outro dia: vale
  n.andar(10);
  assert.equal(n.repetido('beber agua 150'), false); // só a última ação conta: voltar à 1ª depois de outra vale
  n.andar(10);
  assert.equal(n.repetido('beber agua 150'), true);
});

// ---------- confirmar(botão): toque duplo, armado pela chave do item (data-armavel), fora do botão ----------
// O 1º toque arma por 3 s, o 2º confirma. A lista redesenhada no meio (botões novos) continua armada no mesmo item: o
// MutationObserver do núcleo chama pintarArmados a cada redesenho (aqui um observador falso que guarda o callback; no
// navegador: al/tests/dia.test.mjs, agua/tests/agua.test.mjs, corpo/tests/corpo.test.mjs e tr/tests/treino.test.mjs).
const botao = (chave) => {
  const classes = new Set();

  return {
    dataset: chave === undefined ? {} : { armavel: chave },
    classList: {
      toggle: (c, sim) => (sim ? classes.add(c) : classes.delete(c)),
      contains: (c) => classes.has(c),
    },
  };
};

function toqueDuplo() {
  let agora = 1000,
    botoes = [],
    pinturas = 0, // quantas vezes o pintarArmados percorreu a tela (document.querySelectorAll)
    aoMudar = null, // o callback que o núcleo deu ao MutationObserver
    vigiado = null;

  const timers = [],
    errosConsole = [],
    raiz = {};

  const U = carregarArquivos(
    ['base/nucleo.js'],
    ['ARMADO_MS', 'armados', 'estaArmado', 'confirmar', 'chavesDosItens'],
    {
      Date: { now: () => agora },
      setTimeout: (f, ms) => timers.push({ f, em: agora + ms }),
      console: { error: (...a) => errosConsole.push(a) },
      document: {
        documentElement: raiz,
        querySelectorAll: (sel) => {
          assert.equal(sel, '[data-armavel]');
          pinturas++;

          return botoes;
        },
      },
      MutationObserver: class {
        constructor(f) {
          aoMudar = f;
        }

        observe(alvo, o) {
          vigiado = { alvo, o: json(o) };
        }
      },
    }
  );

  // a página inteira, qualquer desenho
  assert.equal(vigiado.alvo, raiz);
  assert.deepEqual(vigiado.o, { childList: true, subtree: true });

  return {
    ...U,
    errosConsole,
    pinturas: () => pinturas,
    // o DOM mudou: o callback do observador do núcleo, como o navegador chama
    mudou: () => aoMudar([]),
    // a lista desenhada de novo: botões novos (sem a classe) e o observador do núcleo, que vê a mudança
    desenhar: (chaves) => {
      botoes = chaves.map(botao);
      aoMudar([]);

      return botoes;
    },
    // o relógio anda e os timers vencidos rodam
    andar: (ms) => {
      agora += ms;

      for (const t of timers.splice(0)) {
        if (t.em <= agora) t.f();
        else timers.push(t);
      }
    },
  };
}

test('núcleo: confirmar arma por 3 s e o 2º toque no mesmo item confirma', () => {
  const u = toqueDuplo();
  let [a, b] = u.desenhar(['a', 'b']);

  assert.equal(u.ARMADO_MS, 3000);
  assert.equal(u.confirmar(a), false); // 1º toque: só arma
  assert.equal(a.classList.contains('armado'), true);
  assert.equal(b.classList.contains('armado'), false); // o vizinho não
  assert.equal(u.confirmar(b), false); // outro item arma o dele, sem confirmar o 1º
  u.andar(2999);
  assert.equal(u.confirmar(a), true); // 2º toque dentro dos 3 s: confirma
  assert.equal(a.classList.contains('armado'), false); // e desarma (um item igual que fique no lugar não sai junto)
  assert.equal(u.estaArmado('a'), false);
  u.andar(1);
  assert.equal(b.classList.contains('armado'), false); // os 3 s do b acabaram: o vermelho sai sozinho
  assert.equal(u.confirmar(b), false); // e o toque seguinte só arma de novo
  [a] = u.desenhar(['a', 'b']);
  assert.equal(u.confirmar(a), false);
  u.andar(3000);
  assert.equal(u.confirmar(a), false); // 3 s depois do 1º: vencido, arma de novo
});

test('núcleo: o armado sobrevive ao redesenho da lista (botão novo do mesmo item) e some com o item', () => {
  const u = toqueDuplo();
  const [a] = u.desenhar(['a', 'b']);

  u.confirmar(a);
  u.andar(1000);
  const [n, a2, b] = u.desenhar(['x', 'a', 'b']); // a nuvem chegou: lista nova, outro item antes

  assert.equal(n.classList.contains('armado'), false); // quem ficou na posição do armado não herda
  assert.equal(b.classList.contains('armado'), false);
  assert.equal(a2.classList.contains('armado'), true); // o botão novo do mesmo item volta vermelho
  assert.equal(u.confirmar(a2), true); // e o 2º toque confirma (uma vez)
  assert.equal(u.confirmar(a2), false);

  const [c] = u.desenhar(['c']);

  u.confirmar(c);
  const [d] = u.desenhar(['d']); // a nuvem trouxe outra lista, sem o item armado: nada armado na tela

  assert.equal(d.classList.contains('armado'), false);
  assert.equal(u.confirmar(d), false); // o toque no item novo só arma o dele
  u.andar(3000);
  assert.equal(Object.keys(u.armados).length, 0); // vencidos saem da lista
});

test('núcleo: botão sem data-armavel nunca arma nem confirma (nem o 2º toque, nem tocando outro sem chave)', () => {
  const u = toqueDuplo();
  const [a, b] = u.desenhar([undefined, undefined]);

  assert.equal(u.confirmar(a), false);
  assert.equal(a.classList.contains('armado'), false); // nem fica vermelho
  assert.equal(u.confirmar(b), false); // outro sem chave: não confirma o 1º (antes, os dois dividiam a chave "undefined")
  assert.equal(u.confirmar(a), false); // nem o 2º toque no mesmo
  assert.deepEqual(Object.keys(u.armados), []);
  assert.equal(u.errosConsole.length, 3); // cada toque avisa no console, sem quebrar
});

test('núcleo: o observador da tela repinta só quando há item armado', () => {
  const u = toqueDuplo();
  const [a] = u.desenhar(['a', 'b']);
  const antes = u.pinturas();

  u.mudou(); // nada armado (a página inicial, por exemplo): o redesenho não percorre a tela
  assert.equal(u.pinturas(), antes);
  u.confirmar(a);
  const armado = u.pinturas();

  u.mudou(); // com armado: repinta
  assert.equal(u.pinturas(), armado + 1);
  u.andar(3000); // venceu: sai da lista e o observador volta a não repintar
  const vencido = u.pinturas();

  u.mudou();
  assert.equal(u.pinturas(), vencido);
});

test('núcleo: chavesDosItens dá a cada item o conteúdo e a vez entre iguais, nunca a posição', () => {
  const { chavesDosItens } = toqueDuplo();
  const texto = (x) => x.t;

  assert.deepEqual(json(chavesDosItens([{ t: 'a' }, { t: 'b' }, { t: 'a' }], texto)), [
    'a#1',
    'b#1',
    'a#2',
  ]);
  // outro item antes: as chaves de a e b não mudam
  assert.deepEqual(
    json(chavesDosItens([{ t: 'x' }, { t: 'a' }, { t: 'b' }], texto)).slice(1),
    ['a#1', 'b#1']
  );
  assert.deepEqual(json(chavesDosItens([], texto)), []);
});

// O MutationObserver dos outros testes é falso e prova o callback; este captura os argumentos de observe: o núcleo vigia a
// página inteira (document.documentElement), só a árvore (childList + subtree) e nunca atributos (pintarArmados mexe na classe
// `armado`, e observar atributos faria o próprio repintar disparar o observador sem fim).
test('núcleo: o observador do toque duplo vigia document.documentElement, só childList e subtree', () => {
  const chamadas = [],
    raiz = { raiz: true };

  carregarArquivos(['base/nucleo.js'], [], {
    document: { documentElement: raiz, querySelectorAll: () => [] },
    MutationObserver: class {
      observe(...args) {
        chamadas.push(args);
      }
    },
  });

  assert.equal(chamadas.length, 1);
  assert.equal(chamadas[0].length, 2);
  assert.equal(chamadas[0][0], raiz);
  assert.deepEqual(Object.keys(chamadas[0][1]).sort(), ['childList', 'subtree']);
  assert.equal(chamadas[0][1].childList, true);
  assert.equal(chamadas[0][1].subtree, true);
  assert.equal('attributes' in chamadas[0][1], false);
});
