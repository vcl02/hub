// Regressão do botão "Consolidar tudo": repete materializar/consolidar ciclo a ciclo sem abrir um por um, reaproveitando a mesma
// regra de aporte/resgate já usada na linha única. Aqui roda a consolidarTudo REAL (js/form.js) com as dependências simuladas
// (carga, gravação, toast, modal) e confere o que ela fez e em que ordem. O caminho na tela (Recarregar consolida do ciclo de hoje
// ao último com lançamento, resumo ciclo a ciclo, não duplica, sem rede não consolida) está em navegador-consolidar.test.js; a
// correção de datas em lote, em recorrencia-duplicada.test.js; a recarga/consolidação automática a cada 5/15 min, em
// consolidacao-automatica.test.js; o clique do Recarregar chamando consolidarTudo, em recarregar-faz-tudo.test.js.
const assert = require('./helpers/assert-tolerante');
const fs = require('node:fs');
const test = require('node:test');
const vm = require('node:vm');
const { extrairTrecho } = require('./helpers/carregar-funcoes');
const { carregarTela } = require('./helpers/tela-sem-navegador');
const { declaracoes } = require('./helpers/regras-css');
const { elementoPorId } = require('./helpers/html');

const formulario = fs.readFileSync('js/form.js', 'utf8');
const inicializacao = fs.readFileSync('js/bootstrap.js', 'utf8');
const regras = fs.readFileSync('docs/REGRAS.md', 'utf8');

const plano = (valor) => JSON.parse(JSON.stringify(valor));

// Roda a consolidarTudo de js/form.js. Cada dependência anota o que recebeu em `eventos`.
function montar({
  simulando = false,
  idxHoje = 0,
  ultimoCiclo = 2,
  ajustes = {},
  resultados = {},
  cargaOk = true,
  praSempre = { criadas: 0, log: [] },
  correcao = { corrigidos: 0, log: [] },
  depoisDaCorrecao = () => {},
  falhaNoAjuste = null,
  gravandoAjuste = false,
} = {}) {
  const eventos = [];
  const toasts = [];
  const modais = [];
  const avisosConsole = [];
  const titulos = [];
  const atributos = { 'aria-label': 'Recarregar' };

  const botao = {
    disabled: false,
    classes: new Set(),
    classList: {
      add: (c) => botao.classes.add(c),
      remove: (c) => botao.classes.delete(c),
    },
    _titulo: 'Recarregar',
    get title() {
      return this._titulo;
    },
    set title(v) {
      titulos.push(v);
      this._titulo = v;
    },
    getAttribute: (n) => atributos[n],
    setAttribute: (n, v) => {
      atributos[n] = v;
    },
  };

  const instantaneo = () => ({
    desabilitado: botao.disabled,
    carregando: botao.classes.has('carregando'),
    titulo: botao._titulo,
    rotulo: atributos['aria-label'],
    gravando: ctx.Estado.gravandoAjuste,
  });

  const ctx = {
    Estado: {
      simulando,
      idxHoje,
      gravandoAjuste,
      selecionados: new Set(['x']),
      ciclos: Array.from({ length: 6 }, (_, i) => ({ nome: `Ciclo ${i}` })),
      lancamentos: [{ periodoIdx: ultimoCiclo }, { periodoIdx: null }],
    },
    DATA_LIMITE_RECORRENCIA: '2032-12-31',
    console: { warn: (...a) => avisosConsole.push(a) },
    nomePeriodo: (c) => c.nome,
    brl: (v) => `R$ ${v.toFixed(2)}`,
    limparCachesFinanceiros: () => {},
    desenhar: () => eventos.push('desenhar'),
    desenharQuandoLivre: () => eventos.push('desenharQuandoLivre'),
    mostrarToast: (titulo, texto) => toasts.push([titulo, texto]),
    mostrarResultadoConsolidarTudo: (resumo, log) => modais.push([resumo, plano(log)]),
    load: async (opcoes) => {
      eventos.push(['load', opcoes.silencioso]);
      eventos.push(['botaoNaCarga', instantaneo()]);

      return cargaOk;
    },
    estenderPraSempre: async () => {
      eventos.push('praSempre');

      return praSempre;
    },
    corrigeRecorrenciasDuplicadasNoIntervalo: async (de, ate) => {
      eventos.push(['corrige', de, ate]);
      depoisDaCorrecao(ctx.Estado);

      return correcao;
    },
    ajusteDoCiclo: (idx) => ajustes[idx] || null,
    materializaOuConsolidaAjuste: async (idx, ehAporte, categ, valor) => {
      eventos.push(['ajuste', idx, ehAporte, categ, valor]);

      if (falhaNoAjuste) throw Error(falhaNoAjuste);

      return resultados[idx] || 'materializado';
    },
  };

  vm.createContext(ctx);
  vm.runInContext(
    `${extrairTrecho(formulario, 'async function consolidarTudo(', '\n}\n')}\n}\nglobalThis.consolidarTudo = consolidarTudo;`,
    ctx
  );

  const rodar = (opcoes = {}) =>
    ctx.consolidarTudo(botao, () => eventos.push('depoisDaCarga'), opcoes);

  return {
    rodar,
    ctx,
    botao,
    eventos,
    toasts,
    modais,
    titulos,
    avisosConsole,
    instantaneo,
  };
}

const nomesDosEventos = (eventos) =>
  eventos.map((e) => (Array.isArray(e) ? e[0] : e)).filter((e) => e != 'botaoNaCarga');

const aporte = { tipo: 'aporte', categ: 'Investimento', v: -10 };

test('durante a varredura o botão fica desabilitado, girando e com a etapa no title/aria-label; no fim volta ao normal', async () => {
  const t = montar();
  const antes = t.instantaneo();

  await t.rodar();
  const naCarga = t.eventos.find((e) => e[0] == 'botaoNaCarga')[1];

  // Botão só de ícone: o texto não é trocado (apagaria o SVG); a etapa vai pro title e aria-label.
  assert.deepEqual(naCarga, {
    desabilitado: true,
    carregando: true,
    titulo: 'Recarregando…',
    rotulo: 'Recarregando…',
    gravando: true,
  });
  assert.deepEqual(t.titulos, [
    'Recarregando…',
    'Estendendo pra sempre…',
    'Consolidando…',
    'Recarregar',
  ]);
  assert.deepEqual(t.instantaneo(), { ...antes, gravando: false });
});

test('o botão volta ao normal também quando a varredura falha; a falha vira toast (clique) ou console (automática)', async () => {
  const clique = montar({ ajustes: { 0: aporte }, falhaNoAjuste: 'sem rede' });

  await clique.rodar();
  assert.deepEqual(clique.toasts, [['Falhou ao consolidar tudo', 'sem rede']]);
  assert.deepEqual(clique.instantaneo(), {
    desabilitado: false,
    carregando: false,
    titulo: 'Recarregar',
    rotulo: 'Recarregar',
    gravando: false,
  });
  assert.equal(clique.eventos.at(-1), 'desenhar');
  assert.deepEqual(clique.modais, []);

  const automatica = montar({ ajustes: { 0: aporte }, falhaNoAjuste: 'sem rede' });

  await automatica.rodar({ silencioso: true });
  assert.deepEqual(automatica.toasts, []);
  assert.deepEqual(plano(automatica.avisosConsole), [
    ['[consolidação automática] falhou:', 'sem rede'],
  ]);
  assert.equal(automatica.botao.disabled, false);
});

test('botão já desabilitado ou Aporte/Resgate ainda sendo gravado: não varre (clique duplo não duplica)', async () => {
  const desabilitado = montar();

  desabilitado.botao.disabled = true;
  await desabilitado.rodar();
  assert.deepEqual(desabilitado.eventos, []);
  assert.deepEqual(desabilitado.toasts, []);

  const gravando = montar({ gravandoAjuste: true });

  await gravando.rodar();
  assert.deepEqual(gravando.eventos, []);
  assert.deepEqual(gravando.toasts, [['Aguarde', 'Há um Aporte/Resgate sendo gravado.']]);
  assert.equal(gravando.ctx.Estado.gravandoAjuste, true); // quem está gravando continua dono da trava

  const automatica = montar({ gravandoAjuste: true });

  await automatica.rodar({ silencioso: true });
  assert.deepEqual(automatica.toasts, []); // a automática tenta no próximo ciclo, sem aviso
});

test('a ordem: recarrega do banco, volta ao ciclo, pra sempre, corrige datas e só então materializa/consolida', async () => {
  const t = montar({
    ajustes: { 0: aporte, 1: { tipo: 'resgate', categ: 'Resgate', v: 5 } },
  });

  await t.rodar();
  assert.deepEqual(nomesDosEventos(t.eventos), [
    'load',
    'depoisDaCarga',
    'praSempre',
    'corrige',
    'ajuste',
    'ajuste',
    'desenhar',
  ]);
  assert.deepEqual(plano(t.eventos.filter((e) => e[0] == 'load' || e[0] == 'corrige')), [
    ['load', false],
    ['corrige', 0, 2],
  ]);
  assert.deepEqual(plano(t.eventos.filter((e) => e[0] == 'ajuste')), [
    ['ajuste', 0, true, 'Investimento', -10],
    ['ajuste', 1, false, 'Resgate', 5],
  ]);
  assert.equal(t.ctx.Estado.selecionados.size, 0);
});

test('carga com falha para tudo; na simulação não recarrega (apagaria os lançamentos simulados); hoje fora de ciclo não varre', async () => {
  const falhou = montar({ cargaOk: false, ajustes: { 0: aporte } });

  await falhou.rodar();
  assert.deepEqual(nomesDosEventos(falhou.eventos), ['load']);
  assert.deepEqual(falhou.toasts, []);
  assert.equal(falhou.botao.disabled, false);

  const simulada = montar({ simulando: true });

  await simulada.rodar();
  assert.deepEqual(nomesDosEventos(simulada.eventos), [
    'depoisDaCarga',
    'praSempre',
    'corrige',
    'desenhar',
  ]);

  const foraDeCiclo = montar({ idxHoje: -1, ajustes: { 0: aporte } });

  await foraDeCiclo.rodar();
  assert.deepEqual(nomesDosEventos(foraDeCiclo.eventos), ['load', 'depoisDaCarga']);
});

test('corrige as datas do ciclo de hoje ao último com lançamento e recalcula o fim depois da correção', async () => {
  const t = montar({
    idxHoje: 1,
    ultimoCiclo: 2,
    correcao: { corrigidos: 1, log: ['Ciclo 2: "Luz" movida'] },
    // a correção empurrou uma linha para o ciclo 3: a varredura de Aporte/Resgate tem que ir até lá
    depoisDaCorrecao: (Estado) => Estado.lancamentos.push({ periodoIdx: 3 }),
    ajustes: { 3: { tipo: 'aporte', categ: 'Investimento', v: -7 } },
  });

  await t.rodar();
  assert.deepEqual(plano(t.eventos.find((e) => e[0] == 'corrige')), ['corrige', 1, 2]);
  assert.deepEqual(plano(t.eventos.filter((e) => e[0] == 'ajuste')), [
    ['ajuste', 3, true, 'Investimento', -7],
  ]);
});

test('o toast junta materializados, consolidados, datas corrigidas e pra sempre; o modal traz uma linha por ação, na ordem', async () => {
  const t = montar({
    praSempre: { criadas: 3, log: ['Pra sempre: Condomínio — 3 ocorrência(s).'] },
    correcao: {
      corrigidos: 2,
      log: [
        'Ciclo 0: "Luz" movida de 01/10/2026 para 01/11/2026 (recorrência duplicada no ciclo).',
      ],
    },
    ajustes: {
      0: { tipo: 'aporte', categ: 'Investimento', v: -100 },
      1: { tipo: 'resgate', categ: 'Resgate', v: 50, resgatouTudo: true },
      2: { tipo: 'resgate', categ: 'Resgate', v: -20, resgatouTudo: true },
    },
    resultados: { 1: 'consolidado' },
  });

  await t.rodar();

  const resumo =
    '2 materializado(s), 1 consolidado(s); 2 data(s) de recorrência duplicada corrigida(s); 3 ocorrência(s) pra sempre criada(s) até 2032.';

  assert.deepEqual(t.toasts, [['Consolidar tudo', resumo]]);
  assert.equal(t.modais.length, 1); // resposta direta ao clique: abre uma vez só
  assert.deepEqual(t.modais[0], [
    resumo,
    [
      'Pra sempre: Condomínio — 3 ocorrência(s).',
      'Ciclo 0: "Luz" movida de 01/10/2026 para 01/11/2026 (recorrência duplicada no ciclo).',
      'Ciclo 0: Materializado Aporte de R$ 100.00.',
      'Ciclo 1: Consolidado Resgate de R$ 50.00 (todo o guardado).',
      'Ciclo 2: Materializado Resgate de R$ 20.00 (resgate diminuído: o guardado não pode ficar negativo).',
    ],
  ]);
});

test('sem nada a fazer: só o toast, sem modal', async () => {
  const t = montar();

  await t.rodar();
  assert.deepEqual(t.toasts, [
    [
      'Consolidar tudo',
      'Nenhum ciclo com Aporte sugerido, Resgate necessário, recorrência duplicada ou pra sempre pendente.',
    ],
  ]);
  assert.deepEqual(t.modais, []);
});

test('consolidação automática (silenciosa): carga sem aviso, sem pra sempre, sem mover datas, sem modal e sem pisar em campo em edição', async () => {
  const nada = montar();

  await nada.rodar({ silencioso: true });
  assert.deepEqual(plano(nada.eventos.filter((e) => e[0] == 'load')), [['load', true]]);
  assert.deepEqual(nomesDosEventos(nada.eventos), [
    'load',
    'depoisDaCarga',
    'desenharQuandoLivre',
  ]);
  assert.deepEqual(nada.toasts, []); // nada gravado: nem toast

  const gravou = montar({ ajustes: { 0: aporte } });

  await gravou.rodar({ silencioso: true });
  assert.deepEqual(gravou.toasts, [
    ['Consolidado automaticamente', '1 materializado(s), 0 consolidado(s).'],
  ]);
  assert.deepEqual(gravou.modais, []);
});

test('carga bem-sucedida anota o momento (base da recarga automática); carga que falha não anota', async () => {
  const dados = {
    fin: [],
    fin_ciclo: [{ id: 1, inicio: '2026-10-15', fim: null }],
    fin_meta: [],
  };

  const ok = carregarTela({ dados });

  ok.ctx.desenhar = () => {};

  assert.equal(await ok.bruto('load()'), true);
  assert.ok(ok.rodar('Estado.ultimaCarga') > 0);

  const falha = carregarTela({ dados: {} });

  falha.ctx.mostrarToast = () => {};

  assert.equal(await falha.bruto('load({ silencioso: true })'), false);
  assert.equal(falha.rodar('Estado.ultimaCarga'), 0);
});

test('a recarga automática só roda com a tela livre: visível, sem simulação, modal, seleção, campo em edição ou Recarregar ocupado', () => {
  const livre = (ajuste = () => {}) => {
    const ctx = {
      Estado: { simulando: false, selecionados: new Set() },
      document: { hidden: false, querySelector: () => null, activeElement: null },
      app: { style: { display: 'block' } },
      recarregar: { disabled: false },
    };

    ctx.el = (id) => ctx[id];
    ajuste(ctx);
    vm.createContext(ctx);
    vm.runInContext(
      `${extrairTrecho(inicializacao, 'const telaLivreParaRecarregar', '\n\n')}\nglobalThis.livre = telaLivreParaRecarregar;`,
      ctx
    );

    return ctx.livre();
  };

  assert.equal(livre(), true);
  assert.equal(
    livre((c) => (c.app.style.display = 'none')),
    false
  );
  assert.equal(
    livre((c) => (c.document.hidden = true)),
    false
  );
  assert.equal(
    livre((c) => (c.Estado.simulando = true)),
    false
  );
  assert.equal(
    livre((c) => (c.document.querySelector = (q) => (q == 'dialog[open]' ? {} : null))),
    false
  );
  assert.equal(
    livre((c) => c.Estado.selecionados.add('7')),
    false
  );
  assert.equal(
    livre(
      (c) =>
        (c.document.activeElement = { matches: (q) => q == 'input, select, textarea' })
    ),
    false
  );
  assert.equal(
    livre((c) => (c.recarregar.disabled = true)),
    false
  );
});

test('tocar fora do modal do resultado o fecha; tocar dentro não', () => {
  const modal = {
    fechou: 0,
    ouvintes: {},
    close() {
      this.fechou++;
    },
    addEventListener(tipo, f) {
      this.ouvintes[tipo] = f;
    },
  };

  const ctx = { el: (id) => (id == 'modalConsolidarTudo' ? modal : {}) };

  vm.runInNewContext(
    `${extrairTrecho(inicializacao, "el('modalConsolidarTudo').addEventListener", '\n});')}\n});`,
    ctx
  );
  modal.ouvintes.click({ target: {} });
  assert.equal(modal.fechou, 0);
  modal.ouvintes.click({ target: modal });
  assert.equal(modal.fechou, 1);
});

test('o fundo escurecido do modal do resultado é o mesmo do diagnóstico: os dois são o .modal da base (CSS)', () => {
  const base = fs.readFileSync('../base/componentes.css', 'utf8');

  assert.ok(
    declaracoes(base, '.modal::backdrop', '').includes('background: rgba(0, 0, 0, 0.68)')
  );

  for (const id of ['modalConsolidarTudo', 'modalDiagnostico']) {
    const modal = elementoPorId(fs.readFileSync('index.html', 'utf8'), id, {
      obrigatorio: true,
    });

    assert.equal(modal.tag, 'dialog', id);
    assert.equal(modal.attrs.class, 'modal', id);
  }
});

test('regra documentada em REGRAS.md', () => {
  assert.match(
    regras,
    /\*\*Consolidar tudo\*\* \(hoje parte do clique no botão verde \*\*Recarregar\*\* do cabeçalho\) repete essa mesma ação \(materializar\/consolidar\) em sequência, do ciclo atual até o último ciclo que tiver algum lançamento/
  );
  assert.match(
    regras,
    /o próprio botão fica desabilitado \(`disabled`, de verdade bloqueado pro navegador — mesmo esquema visual apagado do Salvar do cadastro e do Duplicar\/Editar\/Excluir da barra de seleção/
  );
  assert.match(
    regras,
    /e o ícone do Recarregar gira, com o title\/aria-label passando a "Recarregando…" e depois "Consolidando…", pra bloquear clique duplo/
  );
  assert.match(regras, /volta ao normal ao final, com sucesso ou falha/);
  assert.match(
    regras,
    /o clique no Recarregar também corrige toda recorrência duplicada nesse mesmo intervalo \(mesma regra do botão "↷" ao lado da Data/
  );
  assert.match(
    regras,
    /sem pedir confirmação por linha, já que o clique em "Consolidar tudo" é a confirmação da varredura inteira/
  );
  assert.match(regras, /Ciclos anteriores ao atual nunca entram nessa varredura\./);
  assert.match(
    regras,
    /a conclusão sempre aparece em toast contando quantos foram materializados, quantos foram consolidados e quantas datas de recorrência duplicada foram corrigidas/
  );
  assert.match(
    regras,
    /abre sozinho um modal \(`#modalConsolidarTudo`\) com o mesmo resumo e uma linha por ação de verdade executada/
  );
  assert.match(
    regras,
    /Quando a varredura não encontra nada a fazer, aparece só o toast \("Nenhum ciclo com Aporte sugerido, Resgate necessário, recorrência duplicada ou pra sempre pendente\."\), sem modal/
  );
  assert.match(
    regras,
    /Diferente do modal de diagnóstico de carga \(que só abre por escolha do usuário, pra não interromper a consulta\), este abre automaticamente porque é resposta direta a um clique explícito do próprio usuário/
  );
  assert.match(regras, /sem botão de fechar, mesmo padrão de clicar fora ou Esc/);
  assert.match(
    regras,
    /Não altera nem recalcula nada: só lê o que a varredura já gravou\./
  );
  assert.match(
    regras,
    /Antes de varrer, \*\*Consolidar tudo\*\* sempre recarrega os dados do banco/
  );
  assert.match(
    regras,
    /Recarga automática: 5 minutos depois da última carga bem-sucedida/
  );
});
