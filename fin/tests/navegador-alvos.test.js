// No navegador, medidas (nada de captura de tela) das peças da base que o Fin usa: alvo de toque no celular, chip e selo na
// mesma altura nas metas, chips de categoria que quebram linha sem estourar a largura e os modais de Mês a mês, comprometidos
// e gráfico em 390 e 1280 px sem rolagem horizontal da página nem erro.
const assert = require('./helpers/assert-tolerante');
const { test } = require('node:test');
const { prepararNavegador, abrirFin, dadosDeExemplo } = require('./helpers/navegador');

prepararNavegador();

// Uma meta de carro financiada que não cabe (abre o plano com selos, chips e o aviso dos comprometidos) e categorias de
// nomes longos (chips do gráfico), com salários abertos nos ciclos seguintes
function dados() {
  const d = dadosDeExemplo();

  const dia = (ano, mes, diaDoMes) =>
    new Date(Date.UTC(ano, mes, diaDoMes)).toISOString().slice(0, 10);

  d.fin_ciclo = Array.from({ length: 16 }, (_, i) => ({
    id: i + 1,
    inicio: dia(2026, 8 + i, 15),
    fim: i === 15 ? null : dia(2026, 9 + i, 14),
  }));
  d.fin_meta = [
    {
      id: 7,
      nome: 'Carro',
      valor: 60000,
      mes: '2026-12-01',
      forma: 'financiamento',
      parcelas: 3,
      entrada: null,
      meses_ate_parcela: null,
      status: 'aberta',
    },
  ];
  d.fin.push(
    ...Array.from({ length: 15 }, (_, i) => ({
      id: String(100 + i),
      nome: 'Salário',
      data: dia(2026, 10 + i, 15),
      valor: 9000,
      categ: 'Salário',
      cred: false,
      pago: false,
      fatura: null,
      freq: null,
    })),
    ...[
      'Alimentação fora de casa',
      'Assinaturas e serviços digitais',
      'Manutenção do carro',
      'Presentes e comemorações',
      'Saúde e bem-estar',
      'Educação e cursos',
      'Viagens e passeios',
      'Roupas e acessórios',
    ].map((categ, i) => ({
      id: String(200 + i),
      nome: categ,
      data: '2026-10-17',
      valor: -50 - i,
      categ,
      cred: false,
      pago: true,
      fatura: null,
      freq: null,
    }))
  );

  return d;
}

// Abre o modal das metas e, de lá, o Mês a mês e o dos comprometidos
async function abrirModais(pg) {
  await pg.click('#btMetas');
  await pg.waitForSelector('#modalMetas', { state: 'visible' });
  await pg.click('#corpoMetas [data-meta="7"] [data-acao=mesAMes]');
  await pg.waitForSelector('#modalPlanoMeta', { state: 'visible' });
  await pg.click('#corpoPlanoMeta [data-acao=verComprometidos]');
  await pg.waitForSelector('#modalComprometidos', { state: 'visible' });
}

// Peças visíveis (com tamanho) de uma lista de seletores: [seletor, texto, largura, altura]
const medir = (pg, seletores) =>
  pg.evaluate(
    (sels) =>
      sels.flatMap((s) =>
        [...document.querySelectorAll(s)]
          .filter((e) => e.getClientRects().length && !e.closest('[hidden]'))
          .map((e) => {
            const r = e.getBoundingClientRect();

            return [s, e.id || e.textContent.trim().slice(0, 16), r.width, r.height];
          })
      ),
    seletores
  );

const abaixo = (medidas, minimo) =>
  medidas.filter(([, , w, h]) => Math.round(w) < minimo || Math.round(h) < minimo);

test('celular (toque): botões de ação com 44 px, peças compactas e campos com o mínimo para o dedo', async () => {
  const { ctx, pg, erros } = await abrirFin('', dados(), 0, { celular: true });

  assert.equal(await pg.evaluate(() => matchMedia('(pointer: coarse)').matches), true);
  // Página: cabeçalho (‹ › e os botões de ação) e as peças compactas das tabelas
  assert.deepEqual(abaixo(await medir(pg, ['.bt-ic:not(.compacto)']), 44), []);

  const compactas = await medir(pg, [
    '.chip.compacto',
    '.bt-ic.compacto',
    '.blk h3 .tog',
  ]);

  assert.ok(compactas.length >= 10, `peças compactas achadas: ${compactas.length}`);
  assert.deepEqual(abaixo(compactas, 24), []);
  // Cadastro: ± e fechar são botões de ação; os campos têm a altura de um campo da base
  await pg.click('#abreNovo');
  assert.deepEqual(abaixo(await medir(pg, ['#modalNovo .bt-ic:not(.compacto)']), 44), []);
  assert.deepEqual(abaixo(await medir(pg, ['#modalNovo .campo']), 44), []);
  await pg.keyboard.press('Escape');
  // Metas: campos compactos e botões de ação do modal
  await abrirModais(pg);
  assert.deepEqual(
    abaixo(await medir(pg, ['dialog[open] .bt-ic:not(.compacto)']), 44),
    []
  );
  assert.deepEqual(abaixo(await medir(pg, ['#modalMetas .campo.compacto']), 44), []);
  assert.deepEqual(abaixo(await medir(pg, ['dialog[open] .chip.compacto']), 24), []);
  assert.deepEqual(erros, []);
  await ctx.close();
});

// Com o mouse (1280 px, sem toque) o mínimo de 24 px das peças compactas não vale: a linha de filtros do thead, os chips do
// teto e o + das seções ficam na altura da base. Compara com a mesma página sem as regras de 24 px do css/mobile.css
// (tiradas pelo CSSOM), tolerância 0; não depende da fonte da máquina. Com o mínimo fora do pointer: coarse, o chip do teto
// ia de 21,6 para 24 px.
test('computador (mouse, 1280 px): filtros do thead, chips do teto e + das seções sem o mínimo do dedo', async () => {
  const { ctx, pg, erros } = await abrirFin('', dados(), 0);

  await pg.setViewportSize({ width: 1280, height: 844 });
  assert.equal(await pg.evaluate(() => matchMedia('(pointer: coarse)').matches), false);

  const alturas = () =>
    pg.evaluate(() => {
      const h = (s) =>
        [...document.querySelectorAll(s)]
          .filter((e) => e.getClientRects().length && !e.closest('[hidden]'))
          .map((e) => e.getBoundingClientRect().height);

      return {
        filtros: h('thead tr.filtros'),
        chipTeto: h('[data-filtro-teto]'),
        tog: h('.blk h3 .tog'),
      };
    });

  const com = await alturas();

  assert.ok(
    Object.values(com).every((L) => L.length),
    JSON.stringify(com)
  );

  // As regras de 24 px do css/mobile.css (dentro ou fora de @media), tiradas da página
  const tiradas = await pg.evaluate(() => {
    const folha = [...document.styleSheets].find((s) =>
      s.href?.endsWith('/css/mobile.css')
    );

    let n = 0;

    const tirar = (lista) => {
      for (let i = lista.cssRules.length - 1; i >= 0; i--) {
        const r = lista.cssRules[i];

        if (r.style?.minHeight === '24px') {
          lista.deleteRule(i);
          n++;
        } else if (r.cssRules) tirar(r); // @media
      }
    };

    tirar(folha);

    return n;
  });

  assert.equal(tiradas, 2); // .chip.compacto e .blk h3 .tog
  assert.deepEqual(com, await alturas());
  assert.deepEqual(erros, []);
  await ctx.close();
});

for (const largura of [390, 1280]) {
  test(`metas em ${largura} px: chips e selos do plano na mesma altura`, async () => {
    const { ctx, pg, erros } = await abrirFin('', dados(), 0, {
      celular: largura === 390,
      chartFalso: true,
    });

    await pg.setViewportSize({ width: largura, height: 844 });
    await pg.click('#btMetas');
    await pg.waitForSelector('#modalMetas', { state: 'visible' });

    const planos = await pg.evaluate(() =>
      [...document.querySelectorAll('#modalMetas .metaPlano')].map((plano) => ({
        estilo: getComputedStyle(plano).alignItems,
        itens: [...plano.children].map((e) => [
          e.className,
          Math.round(e.getBoundingClientRect().height),
        ]),
      }))
    );

    assert.ok(
      planos.some((p) => p.itens.some(([c]) => c.startsWith('chip'))) &&
        planos.some((p) => p.itens.some(([c]) => c.startsWith('selo'))),
      JSON.stringify(planos)
    );

    for (const p of planos) {
      assert.equal(p.estilo, 'center'); // lado a lado, alinhados pelo meio
      assert.equal(new Set(p.itens.map(([, h]) => h)).size, 1, JSON.stringify(p.itens));
    }

    assert.deepEqual(erros, []);
    await ctx.close();
  });

  test(`Mês a mês, comprometidos e gráfico em ${largura} px: sem rolagem horizontal da página nem peça fora do modal`, async () => {
    const { ctx, pg, erros } = await abrirFin('', dados(), 0, {
      celular: largura === 390,
      chartFalso: true,
    });

    await pg.setViewportSize({ width: largura, height: 844 });

    // Para cada modal aberto: a página não ganha rolagem horizontal, o modal cabe na tela e nenhuma peça passa da borda
    // dele (fora do que tem rolagem própria, como a tabela do Mês a mês)
    const estouros = () =>
      pg.evaluate(() => {
        const rolagem = (e) =>
          !!e.parentElement &&
          (/auto|scroll|hidden/.test(getComputedStyle(e.parentElement).overflowX) ||
            rolagem(e.parentElement));

        const dialogos = [...document.querySelectorAll('dialog[open]')];
        const fora = [];

        for (const d of dialogos) {
          const caixa = d.getBoundingClientRect();

          if (caixa.left < -0.5 || caixa.right > innerWidth + 0.5)
            fora.push([d.id, 'modal fora da tela', caixa.left, caixa.right]);

          for (const e of d.querySelectorAll('*')) {
            if (!e.getClientRects().length || rolagem(e) || e.closest('[hidden]'))
              continue;
            const r = e.getBoundingClientRect();

            if (r.right > caixa.right + 0.5 || r.left < caixa.left - 0.5)
              fora.push([d.id, e.id || e.className || e.tagName, r.left, r.right]);
          }
        }

        return {
          pagina: document.documentElement.scrollWidth - innerWidth,
          fora,
          abertos: dialogos.map((d) => d.id),
        };
      });

    const confere = async (id) => {
      const r = await estouros();

      assert.ok(r.abertos.includes(id), `${id} deveria estar aberto: ${r.abertos}`);
      assert.ok(r.pagina <= 0, `${id}: a página rola ${r.pagina}px para o lado`);
      assert.deepEqual(r.fora, [], id);
    };

    await abrirModais(pg);
    await confere('modalMetas');
    await confere('modalPlanoMeta');
    await confere('modalComprometidos');

    for (let i = 0; i < 3; i++) await pg.keyboard.press('Escape');
    await pg.waitForFunction(() => !document.querySelector('dialog[open]'));

    await pg.click('#btGrafico');
    await pg.waitForSelector('#modalGrafico', { state: 'visible' });
    await pg.click('#excluirCatBtn'); // abre a lista de categorias (chips)
    await confere('modalGrafico');

    // Chips das categorias: quebram em linhas e nunca passam do modal
    const chips = await pg.evaluate(() => {
      const modal = document.getElementById('modalGrafico').getBoundingClientRect();

      const itens = [...document.querySelectorAll('#fExcluirCat .chip')]
        .filter((e) => e.getClientRects().length)
        .map((e) => e.getBoundingClientRect());

      return {
        n: itens.length,
        linhas: new Set(itens.map((r) => Math.round(r.top))).size,
        estoura: itens.filter((r) => r.right > modal.right + 0.5).length,
      };
    });

    assert.ok(chips.n >= 8, JSON.stringify(chips));
    assert.equal(chips.estoura, 0, JSON.stringify(chips));

    if (largura === 390) assert.ok(chips.linhas >= 2, JSON.stringify(chips)); // no celular, em várias linhas
    assert.deepEqual(erros, []);
    await ctx.close();
  });
}
