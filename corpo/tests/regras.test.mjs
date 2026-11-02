// Regras do Corpo sem navegador (milissegundos): cada função sai do arquivo publicado do app (tests/funcoes.mjs da raiz) e roda com
// números fixos. A tela fica em corpo.test.mjs; aqui o IMC e as faixas, o horário de sempre, a validação das medidas, o primeiro
// lançamento do peso, a bexiga, o texto do sono, a cópia das pesagens para os outros apps e o limiar do arrasto de lado.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { carregar, carregarArquivos } from '../../tests/funcoes.mjs';

const HUB = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const arq = (p) => path.join(HUB, p);
const json = (x) => JSON.parse(JSON.stringify(x));

const P = carregarArquivos(
  [arq('corpo/perfil.js')],
  ['PERFIL', 'pesoNoDia', 'ordenarMedidas', 'medidasGuardadas', 'guardarMedidas']
);

const U = carregar(arq('corpo/js/util.js'), [
  'pad',
  'num',
  'fmt',
  'minutos',
  'dataOk',
  'arrastarDias',
]);

const K = carregarArquivos(
  [arq('corpo/js/config.js')],
  [
    'PESO_MIN',
    'PESO_MAX',
    'CINTURA_MAX',
    'DIAS_BEXIGA',
    'SONO_BOM',
    'horasDeSono',
    'nivelSono',
  ]
);

const T = (nomes, contexto = {}) =>
  carregar(arq('corpo/js/telas.js'), nomes, {
    ...U,
    ...K,
    PERFIL: P.PERFIL,
    ...contexto,
  });

test('IMC (peso ÷ altura²) e as faixas da OMS: cada limite cai na faixa de cima', () => {
  const { imc, faixaImc } = T(['imc', 'FAIXAS_IMC', 'faixaImc']);

  assert.equal(imc(90), 28.4); // 90 / 1,78²
  assert.deepEqual(
    [15.9, 16, 17, 18.4, 18.5, 24.9, 25, 29.9, 30, 34.9, 35, 39.9, 40].map(faixaImc),
    [
      'Magreza III',
      'Magreza II',
      'Magreza I',
      'Magreza I',
      'Normal',
      'Normal',
      'Sobrepeso',
      'Sobrepeso',
      'Obesidade I',
      'Obesidade I',
      'Obesidade II',
      'Obesidade II',
      'Obesidade III',
    ]
  );
});

test('quanto falta para a faixa seguinte rumo ao normal: anda de 0,1 em 0,1 kg com o mesmo IMC arredondado da tela', () => {
  const { imc, faixaImc, rumoAoNormal } = T([
    'imc',
    'FAIXAS_IMC',
    'faixaImc',
    'rumoAoNormal',
  ]);

  assert.deepEqual([102.3, 75, 50, 90].map(rumoAoNormal), [
    '7,5 kg até Sobrepeso',
    '',
    '0,6 kg até Magreza II',
    '11 kg até Normal',
  ]);
  // 94,8 kg ainda é IMC 29,9 (Sobrepeso); 94,9 já é 30 (Obesidade I)
  assert.deepEqual(
    [faixaImc(imc(94.8)), faixaImc(imc(94.9))],
    ['Sobrepeso', 'Obesidade I']
  );
});

test('horário de sempre: a mediana das últimas 7 pesagens com horário; uma fora da rotina não muda', () => {
  const horaHabitual = (medidas) =>
    T(['HORA_HABITUAL_N', 'recentes', 'horaHabitual'], {
      db: { medidas },
    }).horaHabitual();

  const dia = (d, hora, peso = 90) => ({ data: `2026-10-${d}`, hora, peso });

  const semana = [
    dia(14, '06:50'),
    dia(15, '07:10'),
    dia(16, '07:00'),
    dia(17, '07:05'),
    dia(18, '06:55'),
    dia(19, '07:00'),
    dia(20, '21:00'),
  ];

  assert.equal(horaHabitual([]), '');
  assert.equal(horaHabitual(semana), '07:00'); // a das 21:00 (a mais recente) não muda
  // 12 e 13 são antigas (fora das últimas 7); 21 e 22 à noite: 06:55 07:00 07:00 [07:05] 21:00 21:10 21:10, a rotina ainda é a manhã
  assert.equal(
    horaHabitual([
      dia(12, '21:05'),
      dia(13, '21:05'),
      ...semana,
      dia(21, '21:10'),
      dia(22, '21:10'),
    ]),
    '07:05'
  );
  // só conta pesagem com horário e com peso (barriga sozinha não)
  assert.equal(
    horaHabitual([dia(14, ''), dia(15, '07:00', null), dia(16, '08:00')]),
    '08:00'
  );
});

test('medida válida: peso de 30 a 300 kg, barriga > 0 até 400 cm, vazio = não medido, e pelo menos um dos dois', () => {
  const { lerValores } = T(['lerValores']);

  assert.deepEqual(json(lerValores('89,5', '')), { peso: 89.5 });
  assert.deepEqual(json(lerValores('', '101,5')), { cintura: 101.5 });
  assert.deepEqual(json(lerValores(' 90 ', '102')), { peso: 90, cintura: 102 });
  assert.deepEqual(json(lerValores('', '')), { erro: 'Informe o peso ou a barriga' });
  assert.deepEqual(json(lerValores('20', '')), { erro: 'Peso entre 30 e 300 kg' });
  assert.deepEqual(json(lerValores('30', '')), { peso: 30 });
  assert.deepEqual(json(lerValores('300,1', '')), { erro: 'Peso entre 30 e 300 kg' });
  assert.deepEqual(json(lerValores('abc', '')), { erro: 'Peso entre 30 e 300 kg' });
  assert.deepEqual(json(lerValores('', '0')), { erro: 'Barriga em cm' });
  assert.deepEqual(json(lerValores('', '401')), { erro: 'Barriga em cm' });
});

test('quando o peso foi lançado (pesoEm): o primeiro lançamento fica, corrigir o valor não muda; sem peso, nada', () => {
  const { pesoLancado } = T(['pesoLancado']);

  assert.deepEqual(json(pesoLancado(undefined, { cintura: 100 })), {}); // só barriga
  const novo = json(pesoLancado(undefined, { peso: 90 }));

  assert.equal(new Date(novo.pesoEm).toISOString(), novo.pesoEm); // um instante válido, do relógio do celular
  assert.deepEqual(
    json(pesoLancado({ peso: 90, pesoEm: '2026-10-22T11:00:00.000Z' }, { peso: 89.8 })),
    { pesoEm: '2026-10-22T11:00:00.000Z' }
  ); // corrigir mantém o 1º lançamento
  assert.deepEqual(json(pesoLancado({ peso: 90 }, { peso: 89.8 })), {}); // lançado antes de existir pesoEm: não inventa
  assert.deepEqual(json(pesoLancado({ cintura: 100 }, { peso: 90 })).pesoEm?.length, 24); // o dia só tinha barriga: o peso é novo
});

test('bexiga: xixis por dia, intervalo médio no mesmo dia e ml bebidos por xixi (água da Água ÷ xixis), dos últimos 7 dias com xixi', () => {
  const bexiga = (dias, aguas = {}) =>
    json(T(['bexiga'], { db: { dias }, aguas, hoje: () => '2026-10-22' }).bexiga());

  const d18 = { data: '2026-10-18', xixis: ['09:00', '12:00', '15:00', '18:00'] };

  assert.equal(bexiga([]), null);
  assert.equal(bexiga([{ data: '2026-10-21', xixis: [] }]), null); // dia sem xixi não conta
  // só o dia 18: 4 xixis, 3 h entre um e outro, 800 ml ÷ 4 = 200 ml por xixi
  assert.deepEqual(bexiga([d18], { '2026-10-18': 800 }), {
    dias: 1,
    porDia: 4,
    intervalo: 180,
    mlPorXixi: 200,
  });
  // 18 e 22: (4 + 2) ÷ 2 = 3 por dia · intervalos 180, 180, 180 e 150 → 173 min · 800 ÷ 6 = 133 ml
  assert.deepEqual(
    bexiga([d18, { data: '2026-10-22', xixis: ['08:00', '10:30'] }], {
      '2026-10-18': 800,
    }),
    { dias: 2, porDia: 3, intervalo: 173, mlPorXixi: 133 }
  );
  // sem água lançada e com um xixi só: não há intervalo nem ml
  assert.deepEqual(bexiga([{ data: '2026-10-22', xixis: ['08:00'] }]), {
    dias: 1,
    porDia: 1,
    intervalo: null,
    mlPorXixi: null,
  });
  // dia depois de hoje não entra; só os 7 últimos dias com xixi
  assert.equal(bexiga([{ data: '2026-10-23', xixis: ['08:00'] }]), null);

  const dez = Array.from({ length: 10 }, (_, i) => ({
    data: `2026-10-${String(i + 1).padStart(2, '0')}`,
    xixis: ['08:00'],
  }));

  assert.equal(bexiga(dez).dias, 7);
});

test('texto do sono: horas ("9 h 30") e a etiqueta BOM (8 h ou mais), OK (7 a 8) ou RUIM (menos de 7); passando da meia-noite', () => {
  const { sonoTxt, fmtMin } = T(['sonoTxt', 'fmtMin']);

  assert.deepEqual([45, 60, 173, 180, 570].map(fmtMin), [
    '45 min',
    '1 h',
    '2 h 53',
    '3 h',
    '9 h 30',
  ]);
  const noite = (dormiu, acordou) => sonoTxt(K.horasDeSono(dormiu, acordou));

  assert.equal(noite('23:40', '07:10'), '<b>7 h 30</b> <span class="nivel ok">OK</span>');
  assert.equal(noite('22:30', '06:30'), '<b>8 h</b> <span class="nivel bom">BOM</span>'); // 8 h já é BOM
  assert.equal(
    noite('00:15', '07:14'),
    '<b>6 h 59</b> <span class="nivel ruim">RUIM</span>'
  ); // menos de 7: vermelho
  assert.equal(noite('01:00', '08:00'), '<b>7 h</b> <span class="nivel ok">OK</span>');
});

test('cópia das pesagens para os outros apps: em ordem de data, sem medida vazia nem data inválida; pesoNoDia lê dela', () => {
  const guardado = {};

  const fake = {
    getItem: (k) => guardado[k] ?? null,
    setItem: (k, v) => {
      guardado[k] = v;
    },
  };

  const { guardarMedidas, medidasGuardadas, pesoNoDia } = carregarArquivos(
    [arq('corpo/perfil.js')],
    ['guardarMedidas', 'medidasGuardadas', 'pesoNoDia'],
    { localStorage: fake }
  );

  assert.deepEqual(json(medidasGuardadas('x')), []); // nada guardado ainda

  guardarMedidas('x', [
    {
      data: '2026-10-22',
      hora: '08:00',
      peso: 90,
      cintura: 100,
      peso_em: '2026-10-22T11:00:00Z',
    },
    { data: '2026-10-20', hora: '8h', peso: '91' },
    { data: '2026-10-21', hora: '07:00' }, // sem peso nem barriga: sai
    { data: '22/10', peso: 90 }, // data inválida: sai
  ]);
  const L = json(medidasGuardadas('x'));

  assert.deepEqual(L, [
    { data: '2026-10-20', hora: '', peso: 91 },
    {
      data: '2026-10-22',
      hora: '08:00',
      peso: 90,
      cintura: 100,
      pesoEm: '2026-10-22T11:00:00.000Z',
    },
  ]);
  assert.deepEqual(
    [pesoNoDia(L, '2026-10-19'), pesoNoDia(L, '2026-10-22'), pesoNoDia([], '2026-10-22')],
    [
      91, // antes da 1ª pesagem vale a 1ª
      90,
      null,
    ]
  );
  guardado['corpo.medidas.x'] = '{quebrado';
  assert.deepEqual(json(medidasGuardadas('x')), []); // cópia ilegível não derruba o app
  assert.doesNotThrow(() =>
    carregarArquivos([arq('corpo/perfil.js')], ['guardarMedidas'], {
      localStorage: {
        setItem: () => {
          throw new Error('cheio');
        },
      },
    }).guardarMedidas('x', [])
  );
});

test('perfil.js só lê as pesagens: pede corpo_medida em páginas de 1000 e guarda a cópia local, sem gravar nada na nuvem', async () => {
  const pedidos = [],
    guardado = {};

  const { lerMedidas } = carregarArquivos([arq('corpo/perfil.js')], ['lerMedidas'], {
    localStorage: {
      getItem: (k) => guardado[k] ?? null,
      setItem: (k, v) => (guardado[k] = v),
    },
  });

  // qualquer coisa além de from().select().range() lança: o módulo compartilhado não pode escrever
  const consulta = (tabela) => ({
    select: (cols) => ({
      range: async (de, ate) => {
        pedidos.push([tabela, cols, de, ate]);
        const n = de === 0 ? 1000 : 3;

        return {
          data: Array.from({ length: n }, (_, i) => ({
            data: `2026-01-${String(((de + i) % 28) + 1).padStart(2, '0')}`,
            hora: '',
            peso: 90 + i / 100,
          })),
          error: null,
        };
      },
    }),
  });

  const sb = {
    from: (t) => {
      const q = consulta(t);

      return new Proxy(q, {
        get: (alvo, k) => {
          if (!(k in alvo)) throw new Error(`o perfil.js não pode chamar ${String(k)}`);

          return alvo[k];
        },
      });
    },
  };

  const L = await lerMedidas(sb, 'x');

  assert.deepEqual(pedidos, [
    ['corpo_medida', '*', 0, 999],
    ['corpo_medida', '*', 1000, 1999],
  ]);
  assert.ok(L.length > 0 && guardado['corpo.medidas.x']);
  await assert.rejects(
    () =>
      lerMedidas(
        {
          from: () => ({
            select: () => ({
              range: async () => ({ data: null, error: new Error('rede') }),
            }),
          }),
        },
        'x'
      ),
    /rede/
  );
});

// ---------- Arrastar de lado ----------
const gesto = ({ dx, dy = 0, ms = 500, dedos = 1, alvoEmCampo = false }) => {
  const ouvintes = {},
    doc = {},
    chamadas = [];

  let agora = 1000;

  const tela = {
    hidden: false,
    addEventListener: (t, f) => {
      ouvintes[t] = f;
    },
  };

  const { arrastarDias } = carregar(arq('corpo/js/util.js'), ['arrastarDias'], {
    document: { addEventListener: (t, f) => (doc[t] = f) },
    Date: { now: () => agora },
  });

  arrastarDias(tela, (dir) => chamadas.push(dir), 'input');
  const alvo = { closest: () => (alvoEmCampo ? {} : null) };

  const toques = (x, y) =>
    Array.from({ length: dedos }, () => ({ clientX: x, clientY: y }));

  ouvintes.touchstart({ touches: toques(150, 300), target: alvo });
  ouvintes.touchmove({ touches: toques(150 + dx, 300 + dy) });
  agora += ms;
  ouvintes.touchend({ changedTouches: toques(150 + dx, 300 + dy) });

  return chamadas;
};

test('arrastar de lado: para a direita o dia anterior, para a esquerda o seguinte; 80 px, ou 40 px num gesto rápido; só horizontal', () => {
  assert.deepEqual(gesto({ dx: 150 }), [-1]);
  assert.deepEqual(gesto({ dx: -150 }), [1]);
  assert.deepEqual(gesto({ dx: 81 }), [-1]);
  assert.deepEqual(gesto({ dx: 79 }), []); // curto e lento
  assert.deepEqual(gesto({ dx: 41, ms: 100 }), [-1]); // curto mas rápido
  assert.deepEqual(gesto({ dx: -41, ms: 100 }), [1]);
  assert.deepEqual(gesto({ dx: 39, ms: 100 }), []);
  assert.deepEqual(gesto({ dx: 150, dy: 140 }), []); // diagonal é rolagem
  assert.deepEqual(gesto({ dx: 150, dedos: 2 }), []); // dois dedos (zoom)
  assert.deepEqual(gesto({ dx: 150, alvoEmCampo: true }), []); // campo e gráfico não arrastam
});

test('← → no computador trocam o dia, menos digitando, com Ctrl/Alt/Meta ou com a tela escondida', () => {
  const doc = {},
    chamadas = [],
    tela = { hidden: false, addEventListener: () => {} };

  const { arrastarDias } = carregar(arq('corpo/js/util.js'), ['arrastarDias'], {
    document: { addEventListener: (t, f) => (doc[t] = f) },
  });

  arrastarDias(tela, (dir) => chamadas.push(dir));

  const tecla = (key, extra = {}, campo = false) => {
    let barrou = false;

    doc.keydown({
      key,
      target: { closest: () => (campo ? {} : null) },
      preventDefault: () => (barrou = true),
      ...extra,
    });

    return barrou;
  };

  assert.equal(tecla('ArrowLeft'), true);
  assert.equal(tecla('ArrowRight'), true);
  assert.equal(tecla('ArrowLeft', {}, true), false); // dentro de um campo a seta anda no texto
  assert.equal(tecla('ArrowLeft', { ctrlKey: true }), false);
  assert.equal(tecla('ArrowLeft', { altKey: true }), false);
  assert.equal(tecla('ArrowLeft', { metaKey: true }), false);
  assert.equal(tecla('a'), false);
  tela.hidden = true;
  assert.equal(tecla('ArrowRight'), false);
  assert.deepEqual(chamadas, [-1, 1]);
});
