// Núcleo comum (base/nucleo.js), sem navegador: o arquivo publicado roda inteiro num contexto isolado (tests/funcoes.mjs,
// carregarArquivos) com relógio, AbortController e fetch falsos. Só o núcleo é testado aqui; que cada app usa ele (e não uma
// cópia própria) fica em tests/repetidas.test.mjs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { carregarArquivos } from './funcoes.mjs';

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
