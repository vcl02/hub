// Regras da Água sem navegador: cada função sai do arquivo publicado (tests/funcoes.mjs) e roda com dados fixos. O caminho
// pela tela fica em agua.test.mjs (poucos casos); aqui estão os números e as ramificações:
//   · beber (cada bebida, limites, dia anterior, toque repetido), botões de ml e as kcal das bebidas
//   · o dia no endereço (nomeDoDia, diaNaUrl), arrastar de lado e ← →, Esc
//   · o envio ao Supabase (dois aparelhos, envio sem resposta, formato antigo) com uma nuvem falsa
//   · o limite de tempo da rede e o texto da sincronização
//   · as notificações (inscrever, negar, o que a linha mostra) e o registro do service worker
import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { carregar, carregarArquivos } from '../../tests/funcoes.mjs';
import { PUBLICA } from './helpers/app.mjs';

const AGUA = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const A = (arquivo) => path.join(AGUA, arquivo);
const json = (x) => JSON.parse(JSON.stringify(x));
const inteiro = (n) => Math.round(n).toLocaleString('pt-BR');

const { BEBIDAS, nutrientesBebida } = carregar(A('bebidas.js'), [
  'BEBIDAS',
  'nutrientesBebida',
]);

// Relógio de mentira: `new Date()` e `Date.now()` valem o instante pedido (hora local, para não depender do fuso da máquina)
function relogio(inicio) {
  let t = new Date(inicio).getTime();

  class Relogio extends Date {
    constructor(...a) {
      super(...(a.length ? a : [t]));
    }
    static now() {
      return t;
    }
  }

  return {
    Date: Relogio,
    avancar: (ms) => {
      t += ms;
    },
  };
}

// ---------- beber ----------
function beberCom({ DIA = null, bebida = 'agua', repetir = false } = {}) {
  const lancados = [],
    avisos = [];

  const c = carregar(
    A('js/telas.js'),
    ['beber'],
    {
      DIA,
      bebida,
      ML_MAX: 3000,
      BEBIDAS,
      inteiro,
      toast: (msg, erro = false) => avisos.push([msg, erro]),
      repetido: () => repetir,
      agoraHHMM: () => '09:00',
      mudarHoje: (acao) => {
        const x = { aguas: [] };

        acao(x);
        lancados.push(...x.aguas);
      },
    },
    '__saida.bebidaAgora = () => bebida;'
  );

  return { ...c, lancados, avisos };
}

test('beber: água conta inteira; cada outra bebida só a parte que é água, marcada com a bebida e o volume; depois volta para água', () => {
  assert.deepEqual(
    json(
      (() => {
        const b = beberCom();

        b.beber(300);

        return [b.lancados, b.avisos];
      })()
    ),
    [[{ hora: '09:00', ml: 300 }], [['300 ml às 09:00', false]]]
  );

  // volume × quanto é água: 300 × 88%, 350 × 89%, 200 × 82%, 150 × 88%, 250 × 88%
  for (const [bebida, nome, volume, agua] of [
    ['suco', 'Suco', 300, 264],
    ['refri', 'Refri', 350, 312],
    ['toddy', 'Leite com Toddy', 200, 164],
    ['cappuccino', 'Cappuccino', 150, 132],
    ['leite', 'Leite', 250, 220],
  ]) {
    const b = beberCom({ bebida });

    b.beber(volume);
    assert.deepEqual(json(b.lancados), [{ hora: '09:00', ml: agua, bebida, volume }]);
    assert.deepEqual(b.avisos, [
      [`${nome} ${volume} ml: ${agua} ml de água às 09:00`, false],
    ]);
    assert.equal(b.bebidaAgora(), 'agua', bebida); // a escolha volta para água
  }
});

test('beber: fora de 1 a 3.000 ml avisa e não lança; dia anterior é só leitura; toque repetido é ignorado e não perde a escolha', () => {
  for (const ml of [0, -5, 3001, NaN]) {
    const b = beberCom({ bebida: 'suco' });

    b.beber(ml);
    assert.deepEqual(b.lancados, [], String(ml));
    assert.deepEqual(b.avisos, [['De 1 a 3.000 ml', true]], String(ml));
    assert.equal(b.bebidaAgora(), 'suco'); // errou o valor: a bebida escolhida fica
  }

  const limite = beberCom();

  limite.beber(3000);
  assert.equal(limite.lancados.length, 1); // 3.000 ml é o máximo permitido

  const passado = beberCom({ DIA: '2026-10-18' });

  passado.beber(300);
  assert.deepEqual([passado.lancados, passado.avisos], [[], []]); // nem aviso: o dia anterior não tem como beber

  const duplo = beberCom({ bebida: 'refri', repetir: true });

  duplo.beber(350);
  assert.deepEqual([duplo.lancados, duplo.avisos], [[], []]);
  assert.equal(duplo.bebidaAgora(), 'refri');
});

test('bebidas: kcal por volume (suco 300 ml = 120, refri 350 = 147, Toddy 200 = 170, cappuccino 150 = 90, leite 250 = 150); água e bebida sem volume não somam', () => {
  const kcal = (bebida, volume) => nutrientesBebida({ bebida, volume })?.kcal;

  assert.deepEqual(
    [
      kcal('suco', 300),
      kcal('refri', 350),
      kcal('toddy', 200),
      kcal('cappuccino', 150),
      kcal('leite', 250),
    ],
    [120, 147, 170, 90, 150]
  );
  assert.equal(nutrientesBebida({ bebida: 'agua', volume: 300 }), null);
  assert.equal(nutrientesBebida({ bebida: 'suco' }), null);
  assert.equal(nutrientesBebida({ bebida: 'vinho', volume: 100 }), null);
  assert.equal(nutrientesBebida({ hora: '10:00', ml: 300 }), null); // água pura
});

// ---------- botões de ml ----------
test('botões de ml: as quantidades já usadas, as mais repetidas primeiro (empate: a menor), no máximo 6, mostradas da menor para a maior', () => {
  const botoes = (aguas) =>
    json(
      carregar(A('js/conta.js'), ['botoesMl'], {
        db: { dias: [{ data: '2026-10-19', aguas }] },
        BOTOES_ML: 6,
      }).botoesMl()
    );

  assert.deepEqual(botoes([]), []);
  assert.deepEqual(botoes([{ ml: 300 }, { ml: 300 }, { ml: 500 }]), [300, 500]);
  // bebida conta pelo volume do copo, não pela água dela
  assert.deepEqual(
    botoes([{ ml: 312, bebida: 'refri', volume: 350 }, { ml: 200 }]),
    [200, 350]
  );
  // 7 quantidades, uma vez cada: sai a maior
  assert.deepEqual(
    botoes([150, 200, 250, 300, 350, 500, 750].map((ml) => ({ ml }))),
    [150, 200, 250, 300, 350, 500]
  );
  // a mais usada entra mesmo sendo grande
  assert.deepEqual(
    botoes([150, 200, 250, 300, 350, 500, 750, 750].map((ml) => ({ ml }))),
    [150, 200, 250, 300, 350, 750]
  );
});

test('o dia mais antigo que ‹ alcança: hoje, o dia pedido pelo endereço ou o 1º dia com água', () => {
  const primeiro = (pedido, dias) =>
    carregar(A('js/telas.js'), ['primeiroDia'], {
      hoje: () => '2026-10-19',
      DIA_PEDIDO: pedido,
      db: { dias: dias.map((data) => ({ data })) },
    }).primeiroDia();

  assert.equal(primeiro(null, []), '2026-10-19');
  assert.equal(primeiro(null, ['2026-10-17', '2026-10-18']), '2026-10-17');
  assert.equal(primeiro('2026-10-10', ['2026-10-17']), '2026-10-10'); // aberto num dia sem água: dá para voltar até ele
});

// ---------- util.js: o dia no endereço, arrastar de lado, Esc ----------
function util({ agora = '2026-10-19T12:00:00', location, history, document } = {}) {
  const ouvintes = {},
    r = relogio(agora);

  const U = carregarArquivos(
    [A('js/util.js')],
    ['nomeDoDia', 'diaNaUrl', 'arrastarDias', 'sairDoApp'],
    {
      Date: r.Date,
      URL,
      URLSearchParams,
      location,
      history,
      document: { documentElement: null, ...document },
      MutationObserver: class {
        observe() {} // o toque duplo vigia a página redesenhada (testado em tests/repetidas.test.mjs)
      },
      addEventListener: (tipo, f) => {
        ouvintes[tipo] = f;
      },
    }
  );

  return { ...U, ouvintes, relogio: r };
}

test('nome do dia na barra ‹ ›: Hoje, Ontem ou "quarta, 21/10"', () => {
  const { nomeDoDia } = util();

  assert.deepEqual(
    ['2026-10-19', '2026-10-18', '2026-10-17', '2026-10-14', '2026-01-01'].map(nomeDoDia),
    ['Hoje', 'Ontem', 'sábado, 17/10', 'quarta, 14/10', 'quinta, 01/01']
  );
});

test('o dia no endereço: ?dia só em dia anterior, empilha ou substitui no histórico, mantém os outros parâmetros e o #', () => {
  const loc = new URL('http://localhost/hub/agua/?v=1#topo'),
    pilha = [];

  const aplicar = (destino) => {
    loc.href = new URL(destino, loc).href;
  };

  const { diaNaUrl } = util({
    location: loc,
    history: {
      state: null,
      pushState: (s, t, destino) => {
        pilha.push(['push', destino]);
        aplicar(destino);
      },
      replaceState: (s, t, destino) => {
        pilha.push(['replace', destino]);
        aplicar(destino);
      },
    },
  });

  diaNaUrl('2026-10-18');
  diaNaUrl('2026-10-18'); // o mesmo dia de novo: nada muda
  diaNaUrl('2026-10-17', false); // sem empilhar: só substitui
  diaNaUrl('2026-10-19'); // hoje: o ?dia sai
  diaNaUrl('2026-10-30'); // futuro: sem ?dia (já não tinha: nada muda)
  diaNaUrl(null);
  assert.deepEqual(pilha, [
    ['push', '/hub/agua/?v=1&dia=2026-10-18#topo'],
    ['replace', '/hub/agua/?v=1&dia=2026-10-17#topo'],
    ['push', '/hub/agua/?v=1#topo'],
  ]);
});

// Evento de toque falso: alvo com closest() (para os campos que não arrastam)
const toque = (x, y = 300, { campo = false, dedos = 1 } = {}) => ({
  target: { closest: () => (campo ? {} : null) },
  touches: Array.from({ length: dedos }, () => ({ clientX: x, clientY: y })),
  changedTouches: [{ clientX: x, clientY: y }],
});

function arrastoCom() {
  const trocas = [],
    registrados = {},
    teclas = {},
    tela = {
      hidden: false,
      addEventListener: (tipo, f) => {
        registrados[tipo] = f;
      },
    };

  const u = util({
    document: {
      addEventListener: (tipo, f) => {
        teclas[tipo] = f;
      },
    },
  });

  u.arrastarDias(tela, (dir) => trocas.push(dir));

  const gesto = (dx, { dy = 0, ms = 500, ...opcoes } = {}) => {
    registrados.touchstart(toque(150, 300, opcoes));
    registrados.touchmove(toque(150 + dx, 300 + dy, opcoes));
    u.relogio.avancar(ms);
    registrados.touchend(toque(150 + dx, 300 + dy, opcoes));
  };

  const tecla = (key, extra = {}) => {
    let impediu = false;

    teclas.keydown({
      key,
      preventDefault: () => {
        impediu = true;
      },
      target: { closest: () => null },
      ...extra,
    });

    return impediu;
  };

  return { trocas, gesto, tecla, tela, registrados };
}

test('arrastar de lado: para a direita o dia anterior, para a esquerda o seguinte; 80 px, ou 40 px num gesto rápido', () => {
  const a = arrastoCom();

  a.gesto(150);
  a.gesto(-150);
  a.gesto(85); // logo acima de 80 px, devagar
  a.gesto(-85);
  assert.deepEqual(a.trocas, [-1, 1, -1, 1]);

  a.trocas.length = 0;
  a.gesto(60); // devagar e curto
  a.gesto(-79);
  assert.deepEqual(a.trocas, []);
  a.gesto(60, { ms: 100 }); // rápido: 40 px bastam
  a.gesto(-41, { ms: 100 });
  assert.deepEqual(a.trocas, [-1, 1]);

  a.trocas.length = 0;
  a.gesto(39, { ms: 100 }); // curto demais até para um gesto rápido
  a.gesto(100, { dy: 100 }); // na diagonal, não é de lado
  a.gesto(200, { campo: true }); // começou num campo
  a.gesto(200, { dedos: 2 }); // dois dedos (zoom)
  assert.deepEqual(a.trocas, []);
});

test('← → trocam o dia, menos dentro de um campo, com a tela escondida ou com Ctrl, Alt ou Cmd; outras teclas passam', () => {
  const a = arrastoCom();

  assert.equal(a.tecla('ArrowLeft'), true);
  assert.equal(a.tecla('ArrowRight'), true);
  assert.deepEqual(a.trocas, [-1, 1]);

  a.trocas.length = 0;
  assert.equal(a.tecla('ArrowLeft', { target: { closest: () => ({}) } }), false); // as setas andam no texto
  assert.equal(a.tecla('ArrowLeft', { ctrlKey: true }), false);
  assert.equal(a.tecla('ArrowLeft', { altKey: true }), false);
  assert.equal(a.tecla('ArrowLeft', { metaKey: true }), false);
  assert.equal(a.tecla('a'), false);
  a.tela.hidden = true;
  assert.equal(a.tecla('ArrowLeft'), false);
  assert.deepEqual(a.trocas, []);
});

test('Esc: num campo só tira o foco; com um diálogo aberto ou já tratado por outro, não faz nada; sem nada aberto, sai do app (../)', () => {
  const tecla = ({ campo = false, dialogo = false, ...ev } = {}) => {
    const location = { href: 'http://localhost/agua/' };
    let focoTirado = false;

    const { ouvintes } = util({
      location,
      document: { querySelector: () => (dialogo ? {} : null) },
    });

    ouvintes.keydown({
      key: 'Escape',
      defaultPrevented: false,
      isComposing: false,
      target: {
        closest: () => (campo ? {} : null),
        blur: () => {
          focoTirado = true;
        },
      },
      ...ev,
    });

    return [location.href, focoTirado];
  };

  assert.deepEqual(tecla({ campo: true }), ['http://localhost/agua/', true]);
  assert.deepEqual(tecla({ dialogo: true }), ['http://localhost/agua/', false]);
  assert.deepEqual(tecla({ defaultPrevented: true }), ['http://localhost/agua/', false]);
  assert.deepEqual(tecla({ isComposing: true }), ['http://localhost/agua/', false]);
  assert.deepEqual(tecla({ key: 'Enter' }), ['http://localhost/agua/', false]);
  assert.deepEqual(tecla(), ['../', false]);
});

// ---------- o envio ao Supabase, com uma nuvem falsa ----------
// nuvem: { dias: { data: [copos] }, perderResposta: n, offline: bool }
function aparelho(nuvem, { local = [], base = null } = {}) {
  const guardado = new Map(),
    clonar = (x) => JSON.parse(JSON.stringify(x));

  const falha = { message: 'Failed to fetch' };

  const sb = {
    from: () => ({
      select: () => ({
        in: async (coluna, datas) =>
          nuvem.offline
            ? { data: null, error: falha }
            : {
                data: datas
                  .filter((d) => nuvem.dias[d])
                  .map((d) => ({ data: d, aguas: clonar(nuvem.dias[d]) })),
                error: null,
              },
      }),
      upsert: async (linhas) => {
        if (nuvem.offline) return { error: falha };

        for (const l of linhas) nuvem.dias[l.data] = clonar(l.aguas);

        // o pedido chegou ao banco, mas a resposta não volta (o sinal caiu no meio)
        if (nuvem.perderResposta > 0) {
          nuvem.perderResposta--;

          return { error: falha };
        }

        return { error: null };
      },
      delete: () => ({
        eq: async (coluna, data) => {
          delete nuvem.dias[data];

          return { error: null };
        },
      }),
    }),
  };

  const util = carregar(A('js/util.js'), ['num', 'dataOk']),
    avisos = [];

  const B = carregar(
    A('js/banco.js'),
    [
      'K_LOCAL',
      'db',
      'hhmmOk',
      'preparar',
      'linhas',
      'baseNormal',
      'diferenca',
      'lerVoo',
      'temPendente',
      'mesclar',
      'aguasDe',
      'enviar',
    ],
    {
      sb,
      BEBIDAS,
      ML_MAX: 3000,
      num: util.num,
      dataOk: util.dataOk,
      store: {
        get: (k) => guardado.get(k) ?? null,
        set: (k, v) => guardado.set(k, v) && true,
      },
      clearTimeout: () => {},
      pintarSync: () => avisos.push('pintou'),
    },
    `__saida.E = {
      get db() { return db; }, set db(v) { db = v; },
      get usuario() { return usuario; }, set usuario(v) { usuario = v; },
      get base() { return base; }, set base(v) { base = v; },
      get enviando() { return enviando; },
      get erroSync() { return erroSync; },
    };`
  );

  B.E.usuario = { id: 'u1' };
  B.E.db = B.preparar({ dias: local });
  B.E.base = base ? B.baseNormal(base) : B.linhas(B.E.db);
  B.guardado = guardado;
  B.nuvem = nuvem;

  // Beber: acrescenta o copo ao dia de hoje do aparelho (como mudarHoje) sem enviar ainda
  B.lanca = (data, copo) => {
    const d = B.E.db.dias.find((x) => x.data === data);

    if (d) d.aguas.push(copo);
    else B.E.db.dias.push({ data, aguas: [copo] });
    B.E.db = B.preparar(B.E.db);
  };

  B.tira = (data, ml) => {
    const d = B.E.db.dias.find((x) => x.data === data);

    d.aguas.splice(
      d.aguas.findIndex((a) => a.ml === ml),
      1
    );
    B.E.db = B.preparar(B.E.db);
  };

  B.mls = (data) => (nuvem.dias[data] || []).map((a) => a.ml).sort((a, b) => a - b);

  return B;
}

const DIA = '2026-10-19';

test('dois aparelhos no mesmo dia: o envio mescla com a nuvem (nada do outro aparelho some) e tirar aqui tira só o que foi tirado', async () => {
  const nuvem = { dias: { [DIA]: [{ hora: '09:00', ml: 300 }] } };

  const ap = aparelho(nuvem, {
    local: [{ data: DIA, aguas: [{ hora: '09:00', ml: 300 }] }],
  });

  // o outro aparelho (o computador) lança 500 ml; este não sabe e lança 200
  nuvem.dias[DIA].push({ hora: '09:00', ml: 500 });
  ap.lanca(DIA, { hora: '09:00', ml: 200 });
  await ap.enviar();

  assert.deepEqual(ap.mls(DIA), [200, 300, 500]);
  assert.deepEqual(
    json(ap.E.db.dias[0].aguas)
      .map((a) => a.ml)
      .sort((a, b) => a - b),
    [200, 300, 500]
  ); // e o aparelho já mostra o do outro
  assert.equal(ap.temPendente(), false);
  assert.equal(ap.E.erroSync, '');

  ap.tira(DIA, 300);
  await ap.enviar();
  assert.deepEqual(ap.mls(DIA), [200, 500]);

  // tirar o último copo que este aparelho conhece apaga o dia só se a nuvem não tem mais nada
  ap.tira(DIA, 200);
  ap.tira(DIA, 500);
  nuvem.dias[DIA].push({ hora: '10:00', ml: 150 }); // outro aparelho lançou mais um
  await ap.enviar();
  assert.deepEqual(ap.mls(DIA), [150]);
});

test('dia que só este aparelho tinha e foi todo tirado sai da nuvem; dia novo sobe com o usuário', async () => {
  const nuvem = { dias: { '2026-10-18': [{ hora: '10:00', ml: 300 }] } },
    subidos = [];

  const ap = aparelho(nuvem, {
    local: [{ data: '2026-10-18', aguas: [{ hora: '10:00', ml: 300 }] }],
  });

  ap.tira('2026-10-18', 300);
  ap.lanca(DIA, { hora: '09:00', ml: 250 });
  await ap.enviar();
  subidos.push(Object.keys(nuvem.dias));
  assert.deepEqual(subidos, [[DIA]]);
  assert.deepEqual(ap.mls(DIA), [250]);
  assert.equal(JSON.parse(ap.guardado.get('agua.base.u1'))[DIA].aguas[0].ml, 250); // a base do aparelho acompanha a nuvem
});

test('metrô: o envio chega ao banco mas a resposta se perde; o próximo não soma o mesmo copo de novo', async () => {
  const nuvem = { dias: {}, perderResposta: 1 };
  const ap = aparelho(nuvem);

  ap.lanca(DIA, { hora: '09:00', ml: 300 });
  await ap.enviar();
  assert.equal(ap.E.enviando, false); // não fica preso
  assert.match(ap.E.erroSync, /Failed to fetch/);
  assert.deepEqual(ap.mls(DIA), [300]); // o banco já gravou
  assert.equal(ap.temPendente(), true); // e o aparelho guardou como o dia deve ficar ("em voo")
  assert.deepEqual(json(JSON.parse(ap.guardado.get('agua.voo.u1'))), {
    [DIA]: [{ hora: '09:00', ml: 300 }],
  });

  await ap.enviar(); // a próxima tentativa (ao reconectar, 1 min...)
  assert.deepEqual(ap.mls(DIA), [300]); // um copo só
  assert.equal(ap.E.erroSync, '');
  assert.equal(ap.temPendente(), false);
  assert.equal(ap.guardado.get('agua.voo.u1'), '{}');

  ap.lanca(DIA, { hora: '09:30', ml: 200 }); // e o seguinte segue normal
  await ap.enviar();
  assert.deepEqual(ap.mls(DIA), [200, 300]);
});

test('sem internet o envio falha sem prender o aparelho; o copo fica pendente e sobe ao reconectar', async () => {
  const nuvem = { dias: {}, offline: true };
  const ap = aparelho(nuvem);

  ap.lanca(DIA, { hora: '09:00', ml: 300 });
  await ap.enviar();
  assert.equal(ap.E.enviando, false);
  assert.match(ap.E.erroSync, /Failed to fetch/);
  assert.equal(ap.temPendente(), true);
  assert.deepEqual(ap.mls(DIA), []);

  nuvem.offline = false;
  await ap.enviar();
  assert.deepEqual(ap.mls(DIA), [300]);
  assert.equal(ap.temPendente(), false);
});

test('cópia e base do aparelho num formato antigo (com xixis) não parecem pendentes: não sobem por cima da nuvem nem apagam o dia', async () => {
  // O que aconteceu em 27/10/2026: o celular tinha a base e a cópia da versão com xixi; hoje só com xixi (sem água).
  // A nuvem já tinha a água de hoje (lançada em outro aparelho) e uma bebida em ontem que a cópia não conhecia.
  const nuvem = {
    dias: {
      '2026-10-18': [
        { hora: '10:00', ml: 300 },
        { hora: '12:27', ml: 132, bebida: 'suco', volume: 150 },
      ],
      [DIA]: [{ hora: '08:30', ml: 500 }],
    },
  };

  const antigos = [
    { data: '2026-10-18', aguas: [{ hora: '10:00', ml: 300 }], xixis: [] },
    { data: DIA, aguas: [], xixis: ['08:00'] },
  ];

  const base = Object.fromEntries(antigos.map((d) => [d.data, d]));
  const ap = aparelho(nuvem, { local: antigos, base });

  // sem a limpeza da base, o dia de hoje (sem água) pareceria apagado aqui
  assert.notEqual(ap.diferenca(base, ap.linhas(ap.E.db)), null);
  assert.deepEqual(Object.keys(ap.E.base), ['2026-10-18']); // a base passou pela mesma limpeza do db
  assert.equal(ap.temPendente(), false);
  await ap.enviar();
  assert.deepEqual(Object.keys(nuvem.dias).sort(), ['2026-10-18', DIA]); // nada apagado
  assert.equal(nuvem.dias['2026-10-18'][1].bebida, 'suco'); // nem sobrescrito
  assert.deepEqual(ap.mls(DIA), [500]);
});

test('base guardada ilegível ou que não é um objeto vale como sem base', () => {
  const { baseNormal } = aparelho({ dias: {} });

  assert.equal(baseNormal(null), null);
  assert.equal(baseNormal('texto'), null);
  assert.equal(baseNormal(undefined), null);
});

// ---------- rede: limite de tempo e o texto da sincronização ----------
test('pintarSync: sem pendente nada aparece; erro de rede vira "Sem internet"; outro erro vira "Erro ao enviar" em vermelho', () => {
  const caso = ({ pendente, erro, online = true }) => {
    const el = { hidden: true, textContent: '', classes: new Set() };

    el.classList = { toggle: (c, on) => (on ? el.classes.add(c) : el.classes.delete(c)) };

    const { pintarSync } = carregar(A('js/banco.js'), ['pintarSync'], {
      erroSync: erro,
      temPendente: () => pendente,
      navigator: { onLine: online },
      $: () => el,
    });

    pintarSync();

    return [el.hidden, el.textContent, el.classes.has('erro')];
  };

  assert.deepEqual(caso({ pendente: false, erro: 'Failed to fetch' }), [true, '', false]);
  assert.deepEqual(caso({ pendente: true, erro: '' }), [true, '', false]); // enviando, sem erro: não avisa
  assert.deepEqual(caso({ pendente: true, erro: 'Failed to fetch' }), [
    false,
    'Sem internet: salvo no aparelho, envia quando conectar.',
    false,
  ]);
  assert.deepEqual(caso({ pendente: true, erro: 'x', online: false }), [
    false,
    'Sem internet: salvo no aparelho, envia quando conectar.',
    false,
  ]);
  assert.deepEqual(caso({ pendente: true, erro: 'permission denied' }), [
    false,
    'Erro ao enviar para a nuvem: permission denied',
    true,
  ]);
});

// ---------- notificações ----------
function notificacoesCom({
  permissao = 'default',
  resposta = 'granted',
  inscrito = false,
  semPush = false,
  chave = { data: { publica: PUBLICA } },
  erroUpsert = null,
} = {}) {
  const elementos = {},
    avisos = [],
    chamadas = { invoke: [], upsert: [], subscribe: [] };

  const el = (id) =>
    (elementos[id] ||= {
      hidden: true,
      addEventListener() {},
    });

  let permissaoAtual = permissao,
    sub = inscrito ? { endpoint: 'https://push.exemplo.test/ja' } : null;

  const pushManager = {
    getSubscription: async () => sub,
    subscribe: async (o) => {
      chamadas.subscribe.push({
        userVisibleOnly: o.userVisibleOnly,
        chave: Array.from(o.applicationServerKey),
      });

      return (sub = { endpoint: 'https://push.exemplo.test/abc' });
    },
  };

  const janela = semPush
    ? { Notification: true }
    : { PushManager: function () {}, Notification: true };

  const N = carregar(
    A('js/notificacoes.js'),
    [
      'FUNCAO_PUSH',
      'pushSuportado',
      'deB64url',
      'inscricaoAtual',
      'pintarNotificacoes',
      'ativarNotificacoes',
    ],
    {
      atob,
      window: janela,
      navigator: { serviceWorker: { ready: Promise.resolve({ pushManager }) } },
      Notification: {
        get permission() {
          return permissaoAtual;
        },
        requestPermission: async () => (permissaoAtual = resposta),
      },
      $: el,
      usuario: { id: 'u1' },
      toast: (msg, erro = false) => avisos.push([msg, erro]),
      sb: {
        functions: {
          invoke: async (nome, opcoes) => {
            chamadas.invoke.push([nome, opcoes]);

            return chave;
          },
        },
        from: (tabela) => ({
          upsert: async (linha, opcoes) => {
            chamadas.upsert.push([tabela, linha, opcoes]);

            return { error: erroUpsert };
          },
        }),
      },
    }
  );

  const linha = () =>
    ['n-ativar', 'n-ligadas', 'n-negado'].filter(
      (id) => elementos[id] && !elementos[id].hidden
    );

  return { ...N, avisos, chamadas, linha, el };
}

test('notificações: ativar pede a permissão, inscreve com a chave da função (65 bytes) e grava o aparelho; a linha passa a mostrar "ligadas"', async () => {
  const n = notificacoesCom();

  await n.pintarNotificacoes();
  assert.deepEqual(n.linha(), ['n-ativar']);
  assert.equal(n.el('n-linha').hidden, false);
  await n.ativarNotificacoes();
  await new Promise((r) => setImmediate(r)); // a linha se repinta logo depois, sem esperar

  assert.deepEqual(json(n.chamadas.invoke), [['agua-lembrete?chave', { method: 'GET' }]]);
  assert.deepEqual(n.chamadas.subscribe, [
    { userVisibleOnly: true, chave: [4, ...Array.from({ length: 64 }, (_, i) => i + 1)] },
  ]);
  assert.deepEqual(json(n.chamadas.upsert), [
    [
      'push_inscricao',
      { user_id: 'u1', endpoint: 'https://push.exemplo.test/abc', app: 'agua' },
      { onConflict: 'user_id,endpoint' },
    ],
  ]);
  assert.deepEqual(n.avisos, [['Notificações ligadas', false]]);
  assert.deepEqual(n.linha(), ['n-ligadas']);
  assert.equal(n.FUNCAO_PUSH, 'agua-lembrete');
});

test('notificações: aparelho já inscrito não inscreve de novo; permissão negada avisa e não grava; falha da função ou do banco avisa', async () => {
  const jaInscrito = notificacoesCom({ inscrito: true });

  await jaInscrito.ativarNotificacoes();
  assert.deepEqual(jaInscrito.chamadas.subscribe, []);
  assert.equal(jaInscrito.chamadas.upsert[0][1].endpoint, 'https://push.exemplo.test/ja');

  const negado = notificacoesCom({ resposta: 'denied' });

  await negado.ativarNotificacoes();
  assert.deepEqual(negado.avisos, [['Notificações bloqueadas no celular.', true]]);
  assert.deepEqual(negado.chamadas.invoke, []);
  assert.deepEqual(negado.chamadas.upsert, []);
  assert.deepEqual(negado.linha(), ['n-negado']);

  for (const falha of [
    notificacoesCom({ chave: { data: null, error: { message: 'x' } } }), // a função não respondeu
    notificacoesCom({ chave: { data: {} } }), // sem chave pública
    notificacoesCom({ erroUpsert: { message: 'rls' } }), // o banco recusou
  ]) {
    await falha.ativarNotificacoes();
    assert.deepEqual(falha.avisos, [['Não consegui ligar as notificações.', true]]);
  }
});

test('notificações: a linha mostra ativar, ligadas ou bloqueado conforme a permissão e a inscrição; sem push no navegador ela some', async () => {
  const estado = async (opcoes) => {
    const n = notificacoesCom(opcoes);

    await n.pintarNotificacoes();

    return [n.el('n-linha').hidden, n.linha()];
  };

  assert.deepEqual(await estado({ permissao: 'default' }), [false, ['n-ativar']]);
  assert.deepEqual(await estado({ permissao: 'granted' }), [false, ['n-ativar']]); // permitiu mas ainda sem inscrição
  assert.deepEqual(await estado({ permissao: 'granted', inscrito: true }), [
    false,
    ['n-ligadas'],
  ]);
  assert.deepEqual(await estado({ permissao: 'denied' }), [false, ['n-negado']]);
  assert.deepEqual(await estado({ semPush: true }), [true, []]); // ex.: iPhone fora da tela inicial
});

// ---------- inicialização ----------
// bootstrap.js roda inteiro num contexto com o mínimo da página simulado (nada de navegador)
function iniciar({ pathname = '/', search = '', hash = '' } = {}) {
  const registros = [],
    elementos = {};

  const el = (id) =>
    (elementos[id] ||= {
      hidden: false,
      value: '',
      textContent: '',
      addEventListener() {},
    });

  const location = {
    pathname,
    search,
    hash,
    trocados: [],
    replace(destino) {
      this.trocados.push(destino);
    },
  };

  const contexto = {
    $: el,
    location,
    encodeURIComponent,
    navigator: {
      serviceWorker: {
        register: (...argumentos) => {
          registros.push(argumentos);

          return Promise.resolve();
        },
      },
    },
    sb: { auth: { getSession: async () => ({ data: { session: null } }) } },
    // o que os outros arquivos entregam ao bootstrap.js
    db: null,
    usuario: null,
    base: null,
  };

  vm.runInNewContext(readFileSync(A('js/bootstrap.js'), 'utf8'), contexto);

  return { registros, location, el, contexto };
}

test('inicialização: registra o service worker sem cache de HTTP; sem sessão, fora do hub, mostra o login próprio', async () => {
  const sem = iniciar({ pathname: '/' }); // servido fora do hub (testes)

  assert.deepEqual(json(sem.registros), [['sw.js', { updateViaCache: 'none' }]]);
  await new Promise((r) => setImmediate(r));
  assert.equal(sem.el('v-login').hidden, false);
  assert.deepEqual(sem.location.trocados, []);
});

test('inicialização: dentro do hub, sem sessão vai para o login da página inicial e volta para a Água no mesmo dia', async () => {
  for (const [pathname, busca] of [
    ['/hub/agua/', '?dia=2026-10-18'],
    ['/hub/agua/index.html', ''],
  ]) {
    const hub = iniciar({ pathname, search: busca, hash: '' });

    await new Promise((r) => setImmediate(r));
    assert.deepEqual(hub.location.trocados, [
      '../?volta=' + encodeURIComponent('agua/' + busca),
    ]);
  }
});

// ---------- Edge Function e config: as constantes que o app e a função combinam ----------
test('config: dono, chave publicável e horários dos lembretes', () => {
  const C = carregar(A('js/config.js'), [
    'DONO',
    'SUPABASE_KEY',
    'LEMBRETE_INICIO',
    'EMAIL_POR_USUARIO',
    'emailDoLogin',
    'META_ML',
  ]);

  assert.equal(C.DONO, '32f70255-30a0-4e2b-ad76-31d7a1bf54f7');
  assert.ok(C.SUPABASE_KEY.startsWith('sb_publishable_'));
  assert.equal(C.LEMBRETE_INICIO, 10);
  assert.equal(C.META_ML, 1000);
  assert.equal(C.emailDoLogin('victor'), 'victor.cabrera0209@gmail.com');
  assert.equal(C.emailDoLogin(' Victor '), 'victor.cabrera0209@gmail.com');
  assert.equal(C.emailDoLogin('eu@teste.com'), 'eu@teste.com');
  assert.equal(C.emailDoLogin('fulano'), null);
  assert.equal(C.emailDoLogin(''), null);
});
