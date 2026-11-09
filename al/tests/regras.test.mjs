// Regras do al sem navegador (milissegundos): cada função sai do arquivo publicado do app (tests/funcoes.mjs da raiz) e roda com
// números fixos. A tela fica nos testes de navegador (dia.test.mjs); aqui a conta, os avisos do saldo, as comidas salvas, as marmitas
// e as respostas da IA.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { carregar, carregarArquivos } from '../../tests/funcoes.mjs';

const HUB = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const arq = (p) => path.join(HUB, p);
const json = (x) => JSON.parse(JSON.stringify(x));

// Funções que devolvem lista: a lista nasce no contexto do vm; copia para este, para o deepEqual comparar
const daqui = (funcoes, nomes) => ({
  ...funcoes,
  ...Object.fromEntries(nomes.map((n) => [n, (...a) => json(funcoes[n](...a))])),
});

const G = carregarArquivos(
  [arq('corpo/perfil.js'), arq('al/gasto.js')],
  ['gastoNoDia', 'metaKcal']
);

const B = carregarArquivos([arq('agua/bebidas.js')], ['BEBIDAS', 'nutrientesBebida']);
const U = carregar(arq('al/js/util.js'), ['normal', 'inteiro', 'umaCasa', 'esc']);
const K = carregar(arq('al/js/config.js'), ['PROT_G_KG', 'GORD_PCT']);
const { macros } = carregar(arq('al/js/banco.js'), ['macros']);

const ms = (dia, h) => new Date(`${dia}T${String(h).padStart(2, '0')}:00:00`).getTime();
const SEXTA = '2026-09-18'; // 24 anos, basal de 100 kg = 1.998
const SEGUNDA = '2026-09-14';
const PESO = [{ data: '2026-09-10', hora: '', peso: 100 }];

const conta = (db, { medidas = PESO, treinos = [], bebidas = {} } = {}) =>
  daqui(
    carregar(
      arq('al/js/conta.js'),
      [
        'trechosDoDia',
        'comidoNoDia',
        'metaDoDia',
        'saldoDoDia',
        'gastoDoDia',
        'avisoAinda',
        'alertaUrgente',
        'linhasDoAlerta',
      ],
      {
        db,
        bebidas,
        medidas,
        tr: { treinos },
        ...G,
        ...B,
        ...K,
        inteiro: U.inteiro,
      }
    ),
    ['linhasDoAlerta']
  );

test('gasto do dia: treino de 1 h soma só o que passa da basal; a esteira depois dele também; sem pesagem, sem gasto', () => {
  const treino = { inicio: ms(SEXTA, 18), fim: ms(SEXTA, 19) };
  const c = conta({ registros: [], dias: [] }, { treinos: [treino] });

  // (3,5 − 1) × 1998 ÷ 24 × 1 h = 208 · rotina 2398 · meta 2606 − 500
  assert.deepEqual(
    [c.gastoDoDia(SEXTA).treino, c.gastoDoDia(SEXTA).total, c.metaDoDia(SEXTA).kcal],
    [208, 2606, 2106]
  );

  // 30 min a 6 km/h no plano: MET 3,86 → 161 kcal, menos a basal dessa meia hora (42) = 119 a mais
  const esteira = {
    ...treino,
    cardio: { inicio: ms(SEXTA, 19), ms: 30 * 6e4, vel: 6, incl: 0 },
  };

  const com = conta({ registros: [], dias: [] }, { treinos: [esteira] });

  assert.deepEqual(
    [com.gastoDoDia(SEXTA).treino, com.metaDoDia(SEXTA).kcal],
    [208 + 119, 2225]
  );
  const sem = conta({ registros: [], dias: [] }, { medidas: [] });

  assert.equal(sem.gastoDoDia(SEXTA), null);
  assert.equal(sem.metaDoDia(SEXTA), null);
  assert.deepEqual(json(sem.saldoDoDia(SEXTA).gasto), null);
  assert.equal(sem.saldoDoDia(SEXTA).saldo, null);
});

test('conta do dia: comido = porção × qtd mais as bebidas da Água; meta de macros (proteína por kg, gordura 25%, carboidrato o resto); saldo', () => {
  const db = {
    registros: [
      // 2 ovos (90 kcal por porção) e 1 pão, e um registro de outro dia que não entra
      { data: SEXTA, qtd: 2, kcal: 90, prot: 6.25, carb: 0.6, gord: 7 },
      { data: SEXTA, qtd: 1, kcal: 140, prot: 4.7, carb: 29.3, gord: 1.5 },
      { data: '2026-09-17', qtd: 1, kcal: 999, prot: 99, carb: 99, gord: 99 },
    ],
    dias: [],
  };

  const c = conta(db, {
    bebidas: { [SEXTA]: [{ hora: '12:27', ml: 132, bebida: 'suco', volume: 150 }] },
  });

  // 180 + 140 + suco 150 ml (40 kcal e 10 g de carboidrato por 100 ml = 60 kcal e 15 g); macros arredondados no fim
  assert.deepEqual(json(c.comidoNoDia(SEXTA)), {
    kcal: 380,
    prot: 17,
    carb: 46,
    gord: 16,
  });
  assert.deepEqual(json(c.comidoNoDia('2026-09-16')), {
    kcal: 0,
    prot: 0,
    carb: 0,
    gord: 0,
  });
  // proteína 1,6 × 100 kg = 160 · gordura 25% de 2398 − 500 = 1898 ÷ 9 = 53 · carboidrato (1898 − 640 − 477) ÷ 4 = 195
  assert.deepEqual(json(c.metaDoDia(SEXTA)), {
    kcal: 1898,
    prot: 160,
    gord: 53,
    carb: 195,
  });
  const s = c.saldoDoDia(SEXTA);

  assert.equal(s.saldo, 380 - 2398); // negativo = déficit
  assert.equal(s.comido.kcal, 380);
});

test('avisos do saldo: passou da meta mas abaixo do gasto = ainda em déficit; passou do gasto = superávit', () => {
  const c = conta({ registros: [], dias: [] });
  const g = c.gastoDoDia(SEXTA); // gasto 2398, meta 1898

  assert.deepEqual(json(c.avisoAinda(g, 2200)), {
    classe: 'bom',
    texto: 'Ainda em déficit de 198 kcal',
  });
  assert.deepEqual(json(c.avisoAinda(g, 2398)), {
    classe: 'bom',
    texto: 'Ainda em déficit de 0 kcal',
  });
  assert.deepEqual(json(c.avisoAinda(g, 3000)), {
    classe: 'ruim',
    texto: 'Já em superávit de 602 kcal',
  });
});

test('alerta urgente: só hoje, só no treino opcional (segunda) e só depois de passar da meta; quarta, quinta e dia fechado não têm', () => {
  const c = conta({ registros: [], dias: [] });
  const segunda = c.gastoDoDia(SEGUNDA); // previsto: 208 kcal, extra
  const quarta = c.gastoDoDia('2026-09-16'); // treino fixo: previsto, mas não extra

  assert.equal(segunda.previsto.extra, true);
  assert.equal(quarta.previsto.extra, false);
  assert.equal(c.alertaUrgente(segunda, -102, true), true);
  assert.equal(c.alertaUrgente(segunda, 0, true), false); // exatamente na meta
  assert.equal(c.alertaUrgente(segunda, 300, true), false); // dentro da meta
  assert.equal(c.alertaUrgente(segunda, -102, false), false); // dia fechado
  assert.equal(c.alertaUrgente(quarta, -102, true), false); // dia fixo
  assert.equal(c.alertaUrgente(c.gastoDoDia(SEXTA), -102, true), false); // sem previsão
  assert.equal(c.alertaUrgente(null, -102, true), false); // sem pesagem
});

test('alerta urgente: as linhas dizem quanto passou, o que o treino ajuda e se o dia fecha em superávit', () => {
  const c = conta({ registros: [], dias: [] });
  const g = c.gastoDoDia(SEGUNDA); // meta 1898, gasto 2398, treino previsto 208

  // comeu 2000: passou 102, o treino cobre; e 2000 < 2398 não é superávit
  assert.deepEqual(c.linhasDoAlerta(g, 2000, 1898 - 2000), [
    'Passou <b>102 kcal</b> da meta.',
    'Se treinar, você ganha 208 kcal e <b>volta para a meta</b>.',
  ]);
  // comeu 2600: passou 702, o excesso cai para 494; sem treino fecha em superávit de 202, com treino ainda em déficit
  assert.deepEqual(c.linhasDoAlerta(g, 2600, 1898 - 2600), [
    'Passou <b>702 kcal</b> da meta.',
    'Se treinar, você ganha 208 kcal e o excesso cai para <b>494 kcal</b>.',
    'Sem treino o dia fecha em <b>superávit de 202 kcal</b>; treinando, ainda fecha em déficit.',
  ]);
  // comeu 2606 (exatamente o gasto + o treino): treinando fecha em 0, ainda conta como déficit
  assert.equal(
    c.linhasDoAlerta(g, 2606, 1898 - 2606)[2],
    'Sem treino o dia fecha em <b>superávit de 208 kcal</b>; treinando, ainda fecha em déficit.'
  );
  // comeu 2106: passou exatamente o que o treino devolve, então volta para a meta (e não é superávit)
  assert.deepEqual(c.linhasDoAlerta(g, 2106, 1898 - 2106), [
    'Passou <b>208 kcal</b> da meta.',
    'Se treinar, você ganha 208 kcal e <b>volta para a meta</b>.',
  ]);
  // comeu 2398 (exatamente o gasto): superávit de 0 não aparece
  assert.deepEqual(c.linhasDoAlerta(g, 2398, 1898 - 2398), [
    'Passou <b>500 kcal</b> da meta.',
    'Se treinar, você ganha 208 kcal e o excesso cai para <b>292 kcal</b>.',
  ]);
  // comeu 3200: nem treinando volta ao déficit
  assert.equal(
    c.linhasDoAlerta(g, 3200, 1898 - 3200)[2],
    'Sem treino o dia fecha em <b>superávit de 802 kcal</b>.'
  );
});

// ---------- Comidas salvas, marmitas e a IA ----------
const comidas = (db, extra = {}) =>
  daqui(
    carregar(
      arq('al/js/ia.js'),
      [
        'sugestoes',
        'frequentes',
        'itensIguais',
        'perguntarIA',
        'porQtd',
        'porPorcao',
        'mesmaComida',
        'salvarItem',
        'unirRepetidas',
        'comer',
        'guardarMarmita',
        'kcalMarmita',
      ],
      {
        db,
        normal: U.normal,
        macros,
        novoId: (() => {
          let n = 0;

          return () => 'id' + ++n;
        })(),
        hoje: () => SEXTA,
        agoraHHMM: () => '15:30',
        FUNCAO_IA: 'al-estimar',
        ...extra,
      }
    ),
    ['sugestoes', 'frequentes']
  );

const item = (id, nome, porcao, kcal, usos) => ({
  id,
  nome,
  porcao,
  kcal,
  prot: 3,
  carb: 9,
  gord: 0.3,
  usos,
});

test('comida salva por nome + medida: mesma medida atualiza os valores, medida nova é outra comida; total vira 1 porção', () => {
  const db = { itens: [], registros: [], marmitas: [] };
  const f = comidas(db);

  // 2 ovos = 180 kcal, 12,5 g de proteína no total → 1 porção: 90 e 6,25
  assert.deepEqual(
    json(
      f.porPorcao(
        { nome: 'Ovo', porcao: '1 unidade', kcal: 180, prot: 12.5, carb: 1.2, gord: 14 },
        2
      )
    ),
    { nome: 'Ovo', porcao: '1 unidade', kcal: 90, prot: 6.25, carb: 0.6, gord: 7 }
  );
  assert.equal(f.porQtd(10, 3), 3.33);

  const a = f.salvarItem({
    nome: 'Feijão',
    porcao: '1 concha pequena (~70 g)',
    kcal: 53,
    prot: 3,
    carb: 9,
    gord: 0.3,
  });

  const b = f.salvarItem({
    nome: 'feijao',
    porcao: '1 CONCHA pequena (~70 g)',
    kcal: 50,
    prot: 3,
    carb: 9,
    gord: 0.3,
  });

  const c = f.salvarItem({
    nome: 'feijão',
    porcao: '1 concha normal (~100 g)',
    kcal: 76,
    prot: 4.8,
    carb: 13.6,
    gord: 0.5,
  });

  assert.equal(a, b); // sem acento nem caixa: a mesma, com o valor corrigido
  assert.notEqual(a, c);
  assert.deepEqual(
    db.itens.map((i) => [i.nome, i.porcao, i.kcal, i.usos]),
    [
      ['Feijão', '1 concha pequena (~70 g)', 50, 0],
      ['feijão', '1 concha normal (~100 g)', 76, 0],
    ]
  );
  assert.equal(f.itensIguais('FEIJAO').length, 2); // nome igual com 2 medidas: escolhe nas sugestões
  assert.equal(f.itensIguais('feij').length, 0); // igual é o nome inteiro
});

test('sugestões ao digitar: palavras no nome ou na medida, sem acento, mais usadas primeiro, no máximo 6; campo vazio = as mais usadas', () => {
  const db = {
    itens: [
      item('1', 'Pão francês', '1 unidade (~50 g)', 150, 4),
      item('2', 'Pão de queijo', '1 unidade', 90, 9),
      item('3', 'Ovo mexido', '1 unidade (~50 g)', 90, 0),
      item('4', 'Arroz branco', '1 colher', 32, 1),
    ],
  };

  const f = comidas(db);

  assert.deepEqual(
    f.sugestoes('pao').map((i) => i.id),
    ['2', '1']
  );
  assert.deepEqual(
    f.sugestoes('FRANCES').map((i) => i.id),
    ['1']
  );
  assert.deepEqual(
    f.sugestoes('unidade 50').map((i) => i.id),
    ['1', '3']
  ); // medida também conta
  assert.deepEqual(f.sugestoes('x'), []); // palavra de 1 letra não busca
  assert.equal(f.sugestoes('unidade', 2).length, 2);
  assert.deepEqual(
    f.frequentes().map((i) => i.id),
    ['2', '1', '4']
  ); // sem uso não aparece
  assert.equal(f.frequentes(1).length, 1);
});

test('repetidas de verdade viram uma só (usos somados, registros apontam para ela); medidas diferentes ficam', () => {
  const db = {
    itens: [
      item('f1', 'Feijão', '1 concha pequena (~70 g)', 53, 2),
      item('f2', 'feijão', '1 concha pequena (~70 g)', 53, 1),
      item('f3', 'Feijão', '1 concha normal (~100 g)', 76, 1),
    ],
    registros: [{ id: 'r1', item: 'f2', kcal: 53 }],
  };

  const f = comidas(db);

  assert.equal(f.unirRepetidas(), true);
  assert.deepEqual(db.itens.map((i) => [i.id, i.usos]).sort(), [
    ['f1', 3],
    ['f3', 1],
  ]);
  assert.deepEqual(db.registros, [{ id: 'r1', item: 'f1', kcal: 53 }]); // o que foi comido não muda
  assert.equal(f.unirRepetidas(), false); // nada mais a unir
});

test('comer: copia os valores da porção, conta o uso e só guarda a hora de hoje', () => {
  const db = { itens: [], registros: [], marmitas: [] };
  const f = comidas(db);
  const ovo = item('o', 'Ovo', '1 unidade', 90, 0);

  f.comer(ovo, SEXTA, 2);
  f.comer(ovo, '2026-09-17');
  assert.equal(ovo.usos, 2);
  assert.deepEqual(
    db.registros.map((r) => [r.data, r.hora, r.item, r.qtd, r.kcal]),
    [
      [SEXTA, '15:30', 'o', 2, 90],
      ['2026-09-17', '', 'o', 1, 90],
    ]
  );
  ovo.kcal = 1; // mudar a salva depois não muda o que já foi comido
  assert.equal(db.registros[0].kcal, 90);
});

test('marmita: guarda cada item por porção com a quantidade; total das kcal; quantidade inválida vira 1', () => {
  const db = { itens: [], registros: [], marmitas: [] };
  const f = comidas(db);

  f.guardarMarmita(
    [
      {
        nome: 'Arroz',
        porcao: '1 colher',
        qtd: 6,
        kcal: 192,
        prot: 3.6,
        carb: 42,
        gord: 0.6,
      },
      {
        nome: 'Frango',
        porcao: '100 g',
        qtd: 1.5,
        kcal: 240,
        prot: 48,
        carb: 0,
        gord: 4.5,
      },
      { nome: 'Sopa', porcao: '1 concha', qtd: 0, kcal: 90, prot: 4, carb: 12, gord: 3 },
    ],
    'Almoço',
    2
  );
  const m = db.marmitas[0];

  assert.deepEqual(
    [m.nome, m.restam, m.itens.map((i) => [i.nome, i.qtd, i.kcal])],
    [
      'Almoço',
      2,
      [
        ['Arroz', 6, 32],
        ['Frango', 1.5, 160],
        ['Sopa', 1, 90],
      ],
    ]
  );
  assert.equal(f.kcalMarmita(m), 6 * 32 + 1.5 * 160 + 90); // 522
});

test('IA: chama a Edge Function al-estimar com o texto; erro vira mensagem da tela; sem internet e sem comida também', async () => {
  const chamadas = [];

  const com = (resposta, onLine = true) =>
    comidas(
      { itens: [] },
      {
        navigator: { onLine },
        sb: {
          functions: {
            invoke: async (nome, opcoes) => {
              chamadas.push([nome, opcoes]);

              return resposta;
            },
          },
        },
      }
    ).perguntarIA;

  const OVO = { nome: 'Ovo', kcal: 180 };

  assert.deepEqual(json(await com({ data: { itens: [OVO] } })('2 ovos')), [OVO]);
  assert.deepEqual(json(chamadas), [['al-estimar', { body: { texto: '2 ovos' } }]]);

  const erro = (resposta, onLine) => async () => com(resposta, onLine)('x');

  const msg = (m) => (e) => {
    assert.equal(e.message, m);

    return true;
  };

  const status = (s) => ({ data: null, error: { context: { status: s } } });

  await assert.rejects(
    erro(status(429)),
    msg('Limite de consultas do dia atingido. Digite os valores.')
  );
  await assert.rejects(
    erro(status(503)),
    msg('IA indisponível agora. Digite os valores.')
  );
  await assert.rejects(
    erro(status(401)),
    msg('Sessão expirada: entre de novo no hub. Digite os valores.')
  );
  await assert.rejects(
    erro(status(403)),
    msg('Sessão expirada: entre de novo no hub. Digite os valores.')
  );
  await assert.rejects(
    erro(status(500)),
    msg('Não consegui estimar. Digite os valores.')
  );
  await assert.rejects(erro({ data: { itens: [] } }), msg('Não reconheci comida nisso.'));
  await assert.rejects(erro({ data: {} }), msg('Não reconheci comida nisso.'));
  await assert.rejects(
    erro({ data: { itens: [OVO] } }, false),
    msg('Sem internet: digite os valores.')
  );
  assert.equal(chamadas.length, 1 + 7); // offline nem chama
});

// ---------- Prévia e lista ----------
test('prévia: o item guarda o total e os valores de 1 porção (total ÷ qtd); qtd vazia ou zero vira 1', () => {
  const { itemDaPrevia } = carregar(arq('al/js/telas.js'), ['CAMPOS', 'itemDaPrevia'], {
    macros,
  });

  const p = json(
    itemDaPrevia({
      nome: 'Ovo',
      porcao: '1 unidade',
      qtd: 2,
      kcal: 180,
      prot: 12.5,
      carb: 1.2,
      gord: 14,
    })
  );

  assert.deepEqual(p.unid, { kcal: 90, prot: 6.25, carb: 0.6, gord: 7 });
  assert.equal(p.kcal, 180); // o total é o que entra no dia
  assert.equal(
    json(
      itemDaPrevia({
        nome: 'Pão',
        porcao: '',
        qtd: 0,
        kcal: 150,
        prot: 1,
        carb: 1,
        gord: 1,
      })
    ).qtd,
    1
  );
  assert.equal(
    json(itemDaPrevia({ nome: 'Pão', porcao: '', kcal: 150, prot: 1, carb: 1, gord: 1 }))
      .unid.kcal,
    150
  );
});

test('bebida da Água na lista: só para ver (sem seletor nem botão), com kcal e macros da bebida', () => {
  const { linhaBebida } = carregar(arq('al/js/telas.js'), ['linhaBebida'], {
    ...U,
    ...B,
  });

  const html = linhaBebida({ hora: '12:27', ml: 132, bebida: 'suco', volume: 150 });

  // suco 150 ml: 60 kcal e 15 g de carboidrato
  for (const parte of [
    '12:27',
    '<b>Suco</b>',
    '150 ml · da Água',
    'P 0 · C 15 · G 0',
    '>60 <small>kcal',
  ])
    assert.ok(html.includes(parte), parte);
  assert.ok(
    !html.includes('<select') && !html.includes('<button'),
    'muda na Água, não aqui'
  );
});

// ---------- Treinos do Treino (tr_treino) para o gasto ----------
test('baixarTreino: lê inicio, fim e cardio de tr_treino; cardio sem tempo ou sem velocidade cai, inclinação negativa vira 0; o cardio chega ao gasto', async () => {
  const dia = (h, m = 0) =>
    new Date(`${SEXTA}T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00`);

  const iso = (d) => d.toISOString();
  const linha = (h, cardio) => ({ inicio: iso(dia(h)), fim: iso(dia(h + 1)), cardio });

  const pedidos = [],
    guardado = {};

  const linhas = [
    linha(7, { ms: 30 * 6e4, vel: 6, incl: 0 }), // válido
    linha(9, { ms: 0, vel: 6, incl: 0 }), // sem tempo: cai
    linha(11, { ms: 30 * 6e4, vel: 0, incl: 0 }), // sem velocidade: cai
    linha(13, { ms: 30 * 6e4, vel: 6, incl: -5 }), // inclinação negativa: 0
    linha(15, null), // sem cardio
  ];

  const B_ = carregar(
    arq('al/js/banco.js'),
    ['baixarTreino'],
    {
      todas: async (tabela, colunas) => {
        pedidos.push([tabela, colunas]);

        return tabela === 'tr_treino' ? linhas : [];
      },
      lerMedidas: async () => PESO,
      sb: {},
      usuario: { id: 'u' },
      store: { set: (k, v) => (guardado[k] = v) },
      K_TR: (id) => 'al.tr.' + id,
      K_BEBIDAS: (id) => 'al.bebidas.' + id,
      nutrientesBebida: () => null,
      tr: null,
      medidas: null,
      bebidas: {},
    },
    '__saida.tr = () => tr;'
  );

  await B_.baixarTreino();
  assert.deepEqual(pedidos[0], ['tr_treino', 'inicio,fim,cardio']);
  const { treinos } = json(B_.tr());

  assert.deepEqual(
    treinos.map((t) => t.cardio ?? null),
    [
      { ms: 30 * 6e4, vel: 6, incl: 0 },
      null,
      null,
      { ms: 30 * 6e4, vel: 6, incl: 0 },
      null,
    ]
  );
  assert.equal(treinos[0].inicio, dia(7).getTime());
  assert.equal(treinos[0].fim, dia(8).getTime());
  assert.deepEqual(JSON.parse(guardado['al.tr.u']).treinos.length, 5);

  // chega ao gasto: só o treino das 7 h com 30 min a 6 km/h (119 kcal acima da basal) + 1 h de treino (208)
  const so = conta({ registros: [], dias: [] }, { treinos: [treinos[0]] });

  const semCardio = conta(
    { registros: [], dias: [] },
    { treinos: [{ inicio: treinos[0].inicio, fim: treinos[0].fim }] }
  );

  assert.equal(so.gastoDoDia(SEXTA).treino - semCardio.gastoDoDia(SEXTA).treino, 119);
});
