// Metas (fin_meta, migration 36): o plano em cascata (à vista, cartão, financiamento, não
// cabe), as linhas previstas na base e no Comprometido, a grade do modal e a migration 38 (sem
// âncora). Roda o código real de
// domain/shared/finance + as regras de Comprometido de charts.js num cenário de 12 ciclos.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');
const vm = require('node:vm');

const ler = arquivo => fs.readFileSync(arquivo, 'utf8');
const graficos = ler('js/charts.js');
const interacoes = ler('js/interactions.js');
const formulario = ler('js/form.js');
const visoes = ler('js/cycle-views.js');
const api = ler('js/supabase-api.js');
const pagina = ler('index.html');
const regras = ler('docs/REGRAS.md');
const migration = ler('migrations/36-metas.sql');

// 12 ciclos de out/26 a set/27, começando dia 5. Cada um: entra 3.000, sai 1.000 (sobra 2.000
// por ciclo, que vira Aporte sugerido: guardado de 2.000 × (ciclo + 1)). Tetos de Besteira e
// Isabella zerados pra não haver previstas deles. Nubank 3.350, Mercado Pago 1.100.
const iso = (ano, mes, dia) => `${ano}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
const CICLOS = Array.from({ length: 12 }, (_, i) => {
    const mes = 10 + i, ano = 2026 + Math.floor((mes - 1) / 12), m = ((mes - 1) % 12) + 1;
    const fimMes = m === 12 ? 1 : m + 1, fimAno = m === 12 ? ano + 1 : ano;
    return { id: `c:${i + 1}`, cicloId: i + 1, ini: iso(ano, m, 5), fat: iso(fimAno, fimMes, 4) };
});

function carrega(metas, { extras = [], tetoBesteira = 0, reservaAluguel = false } = {}) {
    const lancamentos = [...extras, ...CICLOS.flatMap((c, i) => [
        { id: 100 + i, nome: 'Faturamento PJ', categ: 'Renda', data: c.ini, v: 3000, valor: 3000, cred: false, pago: true, periodoIdx: i },
        { id: 200 + i, nome: 'Aluguel', categ: 'Casa', data: c.ini, v: -1000, valor: -1000, cred: false, pago: true, reserva: reservaAluguel, periodoIdx: i },
    ])];
    const estado = {
        idxHoje: 0, ciclos: CICLOS.map(c => ({ ...c })), faturas: [], lancamentos, metas,
        limitesPorCiclo: new Map(CICLOS.map(c => [c.cicloId, { id: c.cicloId, limite_besteira: tetoBesteira, limite_isabella: 0 }])),
    };
    const contexto = { Estado: estado, SALDO_DESDE: '2026-01-01', MESES: [], document: { getElementById: () => ({}) }, setTimeout, clearTimeout };
    vm.createContext(contexto);
    ['js/domain.js', 'js/shared.js', 'js/finance.js'].forEach(arquivo => vm.runInContext(ler(arquivo), contexto));
    vm.runInContext('const filtrarLancamentos = () => lancamentosComPrevistas();', contexto);   // tables.js
    const limites = graficos.slice(graficos.indexOf('const LIMITES_COMPROMISSOS'), graficos.indexOf('\n];\n', graficos.indexOf('const LIMITES_COMPROMISSOS')) + 4);
    // Reserva (meta e Liberdade usam) e Comprometido: os trechos reais de charts.js.
    const constantes = graficos.slice(graficos.indexOf('const MESES_META_RESERVA_EMERGENCIA'), graficos.indexOf('const PERCENTUAL_MINIMO_PIZZA'));
    vm.runInContext(limites + constantes + graficos.slice(graficos.indexOf('function dadosMetaReservaEmergencia('), graficos.indexOf('function dadosCompromissosCiclo(')), contexto);
    vm.runInContext(`limparCachesFinanceiros();
        globalThis.r = { plano: planoDasMetas(), base: lancamentosComPrevistas(), cicloDoMes, guardadoAte, receitaPraCaber, receitasPraCaber, candidatosPraCaber, comprometidosAteAFalta };`, contexto);
    return contexto.r;
}

const meta = (id, nome, valor, mes, extra = {}) => ({ id, nome, valor, mes, forma: 'auto', parcelas: null, entrada: null, meses_ate_parcela: null, status: 'aberta', ...extra });
const doPlano = (r, id) => r.plano.find(p => p.meta.id === id);

test('cenário: guardado projetado cresce 2.000 por ciclo (sem metas)', () => {
    const r = carrega([]);
    assert.equal(r.guardadoAte(0), 2000);
    assert.equal(r.guardadoAte(1), 4000);
    assert.deepEqual(JSON.parse(JSON.stringify(r.plano)), []);
});

test('ciclo da meta é o que começa no mês dela; linha sem valor (âncora antiga) não gera plano', () => {
    const r = carrega([meta(1, 'Chaves do AP', null, '2027-03-01'), meta(2, 'Mesa', 900, '2026-12-01', { ancora_meta_id: 1, deslocamento: 3 })]);
    // A meta vale pelo próprio mês: âncora e deslocamento antigos não mudam nada.
    assert.deepEqual(JSON.parse(JSON.stringify(r.plano.map(p => [p.meta.id, p.mes, p.ciclo]))), [[2, '2026-12-01', 2]]);
    assert.equal(r.cicloDoMes('2027-03-01'), 5);
    assert.equal(r.cicloDoMes('2030-01-01'), -1);
    assert.equal(r.cicloDoMes(null), -1);
});

test('cascata: à vista; a seguinte no mesmo mês não cabe; cartão; débito com entrada antes da 1ª parcela', () => {
    const r = carrega([
        meta(1, 'Cadeira', 1500, '2026-11-01'),
        meta(2, 'Geladeira', 4000, '2026-11-01'),
        meta(3, 'TV', 2000, '2027-01-01', { forma: 'cartao' }),
        meta(4, 'Carro', 30000, '2027-05-01', { forma: 'financiamento', entrada: 5000, parcelas: 24, meses_ate_parcela: 2 }),
        meta(5, 'Fogão', 3000, '2027-05-01', { forma: 'cartao', entrada: 1000 }),
    ]);
    const cadeira = doPlano(r, 1), geladeira = doPlano(r, 2), tv = doPlano(r, 3), carro = doPlano(r, 4), fogao = doPlano(r, 5);
    assert.equal(cadeira.forma, 'avista');                 // "auto" vale como à vista
    assert.equal(cadeira.cabe, true);
    assert.equal(cadeira.disponivel, 4000);
    // Nov/26: 4.000 de guardado − 1.500 da Cadeira − 4.000 = −1.500. Em Dez/26 (6.000) caberia.
    assert.equal(geladeira.cabe, false);
    assert.equal(geladeira.falta, 1500);
    assert.equal(geladeira.cicloFalta, 1);
    assert.equal(geladeira.cabeEm, 2);
    // TV: compra em Jan/27 (1ª parcela no mês seguinte), Nubank 10x de 200.
    assert.equal(tv.forma, 'cartao');
    assert.equal(tv.cartao, 'nubank');
    assert.equal(tv.cabe, true);
    assert.deepEqual([tv.parcelas, tv.parcela], [10, 200]);
    assert.ok(tv.linhas.every(l => l._compra === 3));
    assert.ok(tv.linhas.every(l => l.cred && l.recorrencia_id === 'meta-3' && l.fatura.endsWith('-12') && l.periodoIdx >= 4));
    // Carro: 1ª parcela em Mai/27 (7), entrada 5.000 dois meses antes (Mar/27, 5), 25.000 em 24x de 1.041,67.
    assert.equal(carro.cabe, true);
    assert.deepEqual([carro.entrada, carro.parcelas, carro.parcela, carro.cicloEntrada], [5000, 24, 1041.67, 5]);
    assert.deepEqual(JSON.parse(JSON.stringify(carro.linhas.filter(l => l.nome === 'Entrada · Carro').map(l => [l.periodoIdx, l.v, l.cred]))), [[5, -5000, false]]);
    assert.equal(Math.min(...carro.linhas.filter(l => l.comprometido).map(l => l.periodoIdx)), 7);
    assert.ok(carro.comprometidoMax > 0);                   // informativo
    // Fogão: entrada 1.000 e só o resto (2.000) no cartão: o Nubank tem 3.350 menos 4 parcelas
    // da TV ainda não cobradas em Mai/27 (800) = 2.550, que comporta os 2.000.
    assert.equal(fogao.cabe, true);
    assert.deepEqual([fogao.forma, fogao.cartao, fogao.entrada, fogao.parcela], ['cartao', 'nubank', 1000, 200]);
    assert.equal(fogao.linhas.filter(l => l.cred).reduce((s, l) => s - l.v, 0), 800);   // 4 de 10 no horizonte (jun a set/27)
    assert.equal(fogao.linhas.filter(l => !l.cred).reduce((s, l) => s - l.v, 0), 1000);
    assert.equal(new Set(fogao.linhas.map(l => l.id)).size, fogao.linhas.length);
});

test('parcelado no débito: confere o dinheiro em cada parcela e diz quando caberia', () => {
    // Móveis 40.000: 1ª parcela em Abr/27 (6), entrada 10.000 um mês antes (padrão, Mar/27, 5),
    // 10x de 3.000. O guardado cresce 2.000 por mês e as parcelas levam 3.000: Mar 2.000, Abr
    // 1.000, Mai 0, Jun −1.000 … Set/27 −4.000. Começando em Jun/27 (8, entrada em Mai/27),
    // tudo cabe até o fim do horizonte.
    const moveis = doPlano(carrega([meta(1, 'Móveis planejados', 40000, '2027-04-01', { forma: 'financiamento', entrada: 10000 })]), 1);
    assert.equal(moveis.cabe, false);
    assert.deepEqual([moveis.parcelas, moveis.parcela, moveis.falta, moveis.cicloFalta, moveis.cabeEm], [10, 3000, 4000, 8, 8]);
    assert.deepEqual(JSON.parse(JSON.stringify(moveis.linhas.map(l => [l.periodoIdx, l.v]))),
        [[5, -10000], [6, -3000], [7, -3000], [8, -3000], [9, -3000], [10, -3000], [11, -3000]]);   // só o horizonte
    // Entrada no mesmo mês da 1ª parcela (0 meses).
    const junto = doPlano(carrega([meta(1, 'Mesa', 1000, '2027-03-01', { forma: 'financiamento', entrada: 400, parcelas: 2, meses_ate_parcela: 0 })]), 1);
    assert.deepEqual(JSON.parse(JSON.stringify(junto.linhas.map(l => [l.periodoIdx, l.v]))), [[5, -400], [5, -300], [6, -300]]);
});

test('mês da meta: débito começa nele, cartão compra nele; sem entrada, o mês da entrada não vale', () => {
    // meses_ate_parcela guardado de antes (3) fica sem efeito sem entrada.
    const r = carrega([
        meta(1, 'PS5', 4000, '2026-11-01', { forma: 'financiamento', parcelas: 4, meses_ate_parcela: 3 }),
        meta(2, 'TV', 1000, '2027-01-01', { forma: 'cartao', parcelas: 2, meses_ate_parcela: 3 }),
    ]);
    const ps5 = doPlano(r, 1), tv = doPlano(r, 2);
    assert.deepEqual(JSON.parse(JSON.stringify(ps5.linhas.map(l => [l.periodoIdx, l.v]))), [[1, -1000], [2, -1000], [3, -1000], [4, -1000]]);
    assert.ok(tv.linhas.every(l => l._compra === 3));        // compra em Jan/27, 1ª fatura no seguinte
    // Com entrada, o mês dela vale: 1ª parcela em Fev/27 (4), entrada 3 meses antes (Nov/26, 1).
    const comEntrada = doPlano(carrega([meta(1, 'PS5', 4000, '2027-02-01', { forma: 'financiamento', entrada: 1000, parcelas: 3, meses_ate_parcela: 3 })]), 1);
    assert.deepEqual(JSON.parse(JSON.stringify(comEntrada.linhas.map(l => [l.periodoIdx, l.v]))), [[1, -1000], [4, -1000], [5, -1000], [6, -1000]]);
});

test('plano em pílulas: situação, entrada, parcelas, Comprometido e falta, com cores', () => {
    // Só o trecho do plano (cycle-views.js), com domain/shared reais e 12 ciclos.
    const trecho = visoes.slice(visoes.indexOf('const mesAbrev'), visoes.indexOf('function htmlModalMetas('));
    const contexto = vm.createContext({ MESES: ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'] });
    ['js/domain.js', 'js/shared.js'].forEach(arquivo => vm.runInContext(ler(arquivo), contexto));
    contexto.Estado = { ciclos: CICLOS.map(c => ({ ...c })) };
    vm.runInContext(`const pct1 = n => n.toFixed(1).replace('.', ',') + '%';
        const LIMITES_COMPROMISSOS = [{ percentual: 50 }];
        const formaDaMeta = meta => (['cartao', 'financiamento'].includes(meta.forma) ? meta.forma : 'avista');
        ${trecho} globalThis.t = { partesDoPlanoDaMeta, htmlDoPlanoDaMeta, rotuloDoMesDaMeta };`, contexto);
    const { partesDoPlanoDaMeta, htmlDoPlanoDaMeta, rotuloDoMesDaMeta } = contexto.t;
    const base = { mes: '2026-11-01', ciclo: 1, cicloEntrada: 1, disponivel: 0, forma: 'financiamento', entrada: 0, parcelas: 21, parcela: 190.48, meta: { valor: 4000 } };
    const nbsp = s => s.replace(/ /g, ' ');
    // Cada parte como "classe: rótulo | valor | detalhe".
    const partes = p => JSON.parse(JSON.stringify(partesDoPlanoDaMeta({ ...base, ...p }).partes
        .map(x => nbsp(`${x.classe || ''}: ${[x.rotulo, x.valor, x.detalhe].map(v => v || '').join(' | ')}`))));
    assert.deepEqual(partes({ cabe: true }), ['vd:  | Cabe | ', ': Débito | 21x R$ 190,48 | Nov/26 a Jul/28']);
    // Débito com entrada antes e Comprometido acima do teto (50%): vermelho, só informativo.
    assert.deepEqual(partes({ entrada: 1000, cicloEntrada: 0, cabe: true, comprometidoMax: 101.6 }),
        ['vd:  | Cabe | ', ': Entrada | R$ 1.000,00 | Out/26', ': Débito | 21x R$ 190,48 | Nov/26 a Jul/28', 'vm: Comprometido até | 101,6% | ']);
    assert.deepEqual(partes({ cabe: true, comprometidoMax: 40 }).at(-1), ': Comprometido até | 40,0% | ');
    // Sem caber: o maior buraco desde o 1º mês sem dinheiro, e quando caberia (âmbar).
    assert.deepEqual(partes({ cabe: false, falta: 4000, cicloFalta: 3, cabeEm: 5 }).slice(-2),
        ['vm: Faltam até | R$ 4.000,00 | desde Jan/27', 'am: Cabe começando em | Mar/27 | ']);
    // Cartão: faturas a partir do mês seguinte à compra, com o nome dele.
    assert.deepEqual(partes({ forma: 'cartao', cartao: 'nubank', cabe: false, semLimite: true, cabeEm: 5 }),
        ['vm:  | Não cabe | ', ': Nubank | 21x R$ 190,48 | Dez/26 a Ago/28', 'vm: Sem limite no cartão |  | ', 'am: Cabe comprando em | Mar/27 | ']);
    assert.deepEqual(partes({ forma: 'avista', cabe: false, falta: 10, cicloFalta: 1, cabeEm: 5 }),
        ['vm:  | Não cabe | ', ': À vista | R$ 4.000,00 | Nov/26', 'vm: Faltam até | R$ 10,00 | desde Nov/26', 'am: Cabe em | Mar/27 | ']);
    assert.deepEqual(partes({ ciclo: -1 }), [': Fora dos ciclos carregados |  | ']);
    // HTML: pílulas com rótulo em itálico, valor em negrito e o mês apagado.
    assert.equal(nbsp(htmlDoPlanoDaMeta({ ...base, entrada: 1000, cabe: true })),
        '<span class="metaPlano vd" title="Guardado projetado disponível em Nov/26: R$ 0,00">' +
        '<span class="mpParte mpSituacao vd"><b>Cabe</b></span> ' +
        '<span class="mpParte"><i>Entrada</i> <b>R$ 1.000,00</b> <span class=mpDetalhe>Nov/26</span></span> ' +
        '<span class="mpParte"><i>Débito</i> <b>21x R$ 190,48</b> <span class=mpDetalhe>Nov/26 a Jul/28</span></span></span>');
    assert.match(regras, /cada meta mostra o plano embaixo dos campos em \*\*pílulas\*\*, com o rótulo em itálico, o valor em negrito e o mês apagado/);
    assert.match(ler('css/forms.css'), /\.mpParte\.am \{ color: #F0A83A; background: var\(--orange-soft\); border-color: #6A5330; \}/);
    assert.equal(rotuloDoMesDaMeta({ forma: 'financiamento', entrada: 500 }), '1ª parcela');
    assert.equal(rotuloDoMesDaMeta({ forma: 'cartao', entrada: 500 }), 'Compra');
    assert.equal(rotuloDoMesDaMeta({ forma: 'auto' }), 'Pagamento');
    // Mudar o mês da meta ou pôr uma entrada nova volta o mês dela pra 1 mês antes; mudar o
    // mês da entrada (ou o valor de uma que já existe) mantém.
    assert.match(interacoes, /const voltaEntrada = campo === 'mes' \? meta\.entrada > 0 : campo === 'entrada' && valor > 0 && !\(meta\.entrada > 0\);/);
    assert.match(interacoes, /if \(voltaEntrada && meta\.meses_ate_parcela !== 1\) campos\.meses_ate_parcela = 1;/);
    assert.match(regras, /mudar o mês da 1ª parcela\/compra, ou pôr uma entrada onde não havia, volta o mês dela pra 1 mês antes, e mudar o Mês da entrada ou o valor de uma entrada que já existe mantém o escolhido/);
    // As vezes ficam junto do valor total (linha de cima); o mês da entrada embaixo, só com entrada.
    assert.ok(visoes.indexOf("campo('mcValor'") < visoes.indexOf("campo('mcVezes'") && visoes.indexOf("campo('mcVezes'") < visoes.indexOf("campo('mcMes'"));
    assert.match(visoes, /\(parcelado && m\.entrada > 0 \? campo\('mcMesEntrada', 'Mês da entrada', entrada\('mes_entrada', mesEntrada, 'type=month'\)\) : ''\)/);
    assert.doesNotMatch(visoes, /primeira_parcela/);
});

test('parcelado no meu cartão sem limite em nenhum cartão: não cabe e o plano diz por quê', () => {
    const sofa = doPlano(carrega([meta(1, 'Sofá', 5000, '2027-01-01', { forma: 'cartao' })]), 1);
    assert.deepEqual([sofa.cabe, sofa.semLimite, sofa.cartao, sofa.cabeEm], [false, true, 'nubank', null]);
    // Cartão nunca cobra no mesmo mês da compra: a 1ª fatura é a do mês seguinte.
    const tv = doPlano(carrega([meta(1, 'TV', 2000, '2027-01-01', { forma: 'cartao', meses_ate_parcela: 0 })]), 1);
    assert.equal(Math.min(...tv.linhas.map(l => l.periodoIdx)), 4);
});

test('linhas do plano entram na base como previstas (id negativo, _meta) e só no horizonte', () => {
    const r = carrega([meta(3, 'TV', 2000, '2027-01-01', { forma: 'cartao' })]);
    const linhas = r.base.filter(l => l._meta != null);
    assert.ok(linhas.every(l => l.id < 0 && l._prev === 1 && l.periodoIdx != null && l.pago === false));
    assert.equal(new Set(linhas.map(l => l.id)).size, linhas.length);   // ids distintos
    // TV comprada em jan/27 (ciclo 3): parcelas de fev/27 (ciclo 4) até set/27 (11) → 8 no horizonte.
    assert.equal(linhas.length, 8);
});

test('meta comprada, desistida ou sem data não gera plano nem linha', () => {
    const r = carrega([meta(1, 'Mesa', 900, '2026-12-01', { status: 'comprada' }), meta(2, 'Cama', 900, null), meta(3, 'Fogão', 900, '2026-12-01', { status: 'desistida' })]);
    assert.deepEqual(JSON.parse(JSON.stringify(r.plano.map(p => [p.meta.id, p.ciclo, p.linhas.length]))), [[2, -1, 0]]);
    assert.equal(r.base.filter(l => l._meta != null).length, 0);
});

test('Comprometido do ciclo enxerga as linhas das metas; cadastro e tela ligados', () => {
    assert.match(graficos, /const linhas = \[\.\.\.Estado\.lancamentos, \.\.\.linhasDasMetas\(\)\]/);
    // Plano refeito ao limpar os caches, com tudo zerado (nunca no meio de um saldo em cálculo).
    assert.match(ler('js/finance.js'), /function limparCachesFinanceiros\(\) \{\s*\n\s*limparCachesDeSaldo\(\);\s*\n\s*_planoMetas = null;\s*\n\s*planoDasMetas\(\);/);
    assert.match(api, /if \(!\/: 404 \|PGRST205\/\.test\(err\.message\)\) throw err;/);
    assert.match(pagina, /<button type=button id=btMetas class=btIcone title="Metas" aria-label="Metas" hidden>/);
    assert.match(pagina, /<dialog id=modalMetas tabindex=-1>/);
    assert.match(interacoes, /el\('btMetas'\)\.hidden = !Estado\.temMetas;/);
    assert.match(interacoes, /if \(!confirm\(`Excluir "\$\{meta\.nome\}"\?/);
    assert.match(visoes, /function htmlModalMetas\(planos\) \{/);
    assert.doesNotMatch(visoes + interacoes + ler('js/finance.js'), /ancora_meta_id|deslocamento|novaAncora|ICONE_ANCORA|mesDaMeta|Mês próprio/);
    // Comprar: cadastro preenchido; depois da última etapa, a meta vira comprada.
    assert.match(formulario, /if \(Estado\._compraDaMeta\) await avancarCompraDaMeta\(\);/);
    assert.match(formulario, /await gravarMudancaDaMeta\('atualizar', compra\.metaId, \{ status: 'comprada' \}\);/);
});

test('migration 36: tabela com RLS do dono, histórico e DataGrip-safe', () => {
    assert.match(migration, /create table if not exists public\.fin_meta \(/);
    assert.match(migration, /ancora_meta_id integer references public\.fin_meta\(id\) on delete set null/);
    assert.match(migration, /forma text not null default 'auto' check \(forma in \('auto', 'avista', 'cartao', 'financiamento'\)\)/);
    assert.match(migration, /revoke all on table public\.fin_meta from anon;/);
    assert.equal((migration.match(/'2f9bc201-9966-4f37-9963-2f4b9ddab849'::uuid/g) || []).length, 4);
    assert.match(migration, /create trigger fin_meta_historico/);
    const codigo = migration.split('\n').filter(l => !l.trim().startsWith('--')).join('\n');
    assert.doesNotMatch(codigo, /\$\$/);
    assert.ok(migration.split('\n').filter(l => l.trim().startsWith('--')).every(l => !l.includes(';')));
    assert.match(migration, /^begin;$/m);
    assert.match(migration, /^commit;$/m);
});

test('REGRAS.md documenta metas', () => {
    assert.match(regras, /## Metas/);
    assert.doesNotMatch(regras, /\*\*Âncora\*\* é uma data com nome/);
    assert.match(regras, /Não há âncora \(data com nome que outras metas seguiam\): saiu a pedido do mantenedor \(migration 38\)\./);
    assert.match(regras, /Sem caber, a meta fica no mês pedido mesmo/);
    assert.match(regras, /\*\*Cabe\*\* quando, em cada mês de pagamento \(entrada, parcelas ou faturas\)/);
    assert.match(regras, /O Comprometido aparece no plano só como informação/);
    assert.match(regras, /o valor é o \*\*total\*\*; o mês da meta é o da \*\*1ª parcela\*\* no débito e o da \*\*compra\*\* no cartão/);
    assert.match(regras, /Sem juros por enquanto: a parcela é o resto dividido pelas vezes/);
    assert.doesNotMatch(regras, /3% a\.m\./);
    assert.match(regras, /As metas podem usar o guardado abaixo da meta da Reserva/);
});

test('juros fora por enquanto e só três formas (À vista, Parcelado Crédito, Parcelado Débito)', () => {
    const financas = ler('js/finance.js');
    assert.doesNotMatch(financas + visoes, /juros_mensal|custo_mensal|Custo\/mês|JUROS_PADRAO|prestacao\(/);
    // Só três formas, sempre a escolhida; "auto" (padrão antigo da tabela) vale como À vista.
    assert.match(visoes, /const FORMAS_DA_META = \{ avista: 'À vista', cartao: 'Parcelado Crédito', financiamento: 'Parcelado Débito' \};/);
    assert.match(ler('js/finance.js'), /const formaDaMeta = meta => \(\['cartao', 'financiamento'\]\.includes\(meta\.forma\) \? meta\.forma : 'avista'\);/);
    assert.doesNotMatch(visoes + ler('js/finance.js'), /Automático/);
    assert.match(interacoes, /\{ nome: 'Nova meta', valor: 1000, mes: proximoMesISO\(\), forma: 'avista' \}/);
    assert.match(regras, /sempre na forma escolhida — \*\*À vista\*\*, \*\*Parcelado Crédito\*\* ou \*\*Parcelado Débito\*\*/);
    // Comprar com entrada: primeiro a entrada (débito), depois o resto parcelado.
    assert.match(formulario, /const resto = -\(meta\.valor - \(plano\.entrada \|\| 0\)\);/);
});

test('mês da entrada: campo embaixo, gravado como meses antes do mês da meta (migration 37)', () => {
    const migration37 = ler('migrations/37-metas-primeira-parcela.sql');
    assert.match(migration37, /add column if not exists meses_ate_parcela integer\s*\n\s*check \(meses_ate_parcela is null or meses_ate_parcela between 0 and 120\)/);
    assert.match(migration37, /drop column if exists juros_mensal;/);
    assert.match(migration37, /drop column if exists custo_mensal;/);
    assert.match(migration37, /select 'public\.fin_meta'::regclass;/);
    const codigo = migration37.split('\n').filter(l => !l.trim().startsWith('--')).join('\n');
    assert.doesNotMatch(codigo, /\$\$/);
    assert.ok(migration37.split('\n').filter(l => l.trim().startsWith('--')).every(l => !l.includes(';')));
    assert.match(interacoes, /campo = 'meses_ate_parcela';/);
    assert.match(interacoes, /A entrada não pode vir depois \$\{formaDaMeta\(meta\) === 'cartao' \? 'da compra' : 'da 1ª parcela'\}\./);
    // Comprar no débito: a série começa no mês da meta (o da 1ª parcela).
    assert.match(formulario, /data: Estado\.ciclos\[plano\.ciclo\] \? dataISO\(Estado\.ciclos\[plano\.ciclo\]\.ini\) : plano\.mes/);
    assert.match(regras, /O mês da entrada fica guardado como meses antes do mês da meta \(`meses_ate_parcela`, migration 37\)/);
});

test('modal: todo campo com rótulo em cima, numa grade de colunas fixas', () => {
    assert.match(visoes, /const campo = \(classe, rotulo, controle, dica = ''\) => `<label class="metaCampo \$\{classe\}"/);
    for (const [classe, rotulo] of [['mcNome', "'Nome'"], ['mcValor', "'Valor total'"], ['mcVezes', "'Vezes'"], ['mcMes', 'rotuloDoMesDaMeta\\(m\\)'], ['mcForma', "'Forma'"], ['mcEntrada', "'Entrada'"], ['mcMesEntrada', "'Mês da entrada'"]]) {
        assert.match(visoes, new RegExp(`campo\\('${classe}', ${rotulo}, `), classe);
    }
    assert.match(visoes, /return \{ avista: 'Pagamento', cartao: 'Compra', financiamento: '1ª parcela' \}\[formaDaMeta\(m\)\];/);
    const css = ler('css/forms.css');
    assert.match(css, /grid-template-columns: minmax\(0, 1fr\) 7\.5rem 6\.5rem 10rem 10\.5rem auto;/);
    assert.match(css, /\.mcEntrada \{ grid-column: 2; grid-row: 2; \}/);
    assert.match(css, /\.mcMesEntrada \{ grid-column: 4; grid-row: 2; \}/);
    assert.match(ler('css/mobile.css'), /\.metaGrade \{ grid-template-columns: minmax\(0, 1fr\) minmax\(0, 1fr\); \}/);
    // Valor é obrigatório (migration 38): apagar não grava null.
    assert.match(interacoes, /if \(!t\) return campo === 'valor' \? undefined : null;/);
    assert.match(regras, /\*\*todos com rótulo em cima\*\*, numa grade de colunas fixas igual em todas as metas/);
});

test('migration 38: tira a âncora (colunas e valor nulo), abortando se houver alguma; DataGrip-safe', () => {
    const m38 = ler('migrations/38-metas-sem-ancora.sql');
    assert.match(m38, /select 'public\.fin_meta'::regclass;/);
    assert.match(m38, /select 1 \/ \(case when count\(\*\) = 0 then 1 else 0 end\) as sem_ancora\s*\n\s*from public\.fin_meta\s*\n\s*where valor is null\s*\n\s*or to_jsonb\(fin_meta\) ->> 'ancora_meta_id' is not null;/);
    assert.match(m38, /alter table public\.fin_meta drop column if exists ancora_meta_id;/);
    assert.match(m38, /alter table public\.fin_meta drop column if exists deslocamento;/);
    assert.match(m38, /alter table public\.fin_meta alter column valor set not null;/);
    assert.ok(m38.indexOf('sem_ancora') < m38.indexOf('drop column'), 'checa antes de remover');
    const codigo = m38.split('\n').filter(l => !l.trim().startsWith('--')).join('\n');
    assert.doesNotMatch(codigo, /\$\$|\bdo\b\s/);
    assert.ok(m38.split('\n').filter(l => l.trim().startsWith('--')).every(l => !l.includes(';')));
    assert.match(m38, /^begin;$/m);
    assert.match(m38, /^commit;$/m);
    assert.doesNotMatch(m38, /grant|policy|disable row level security/i);   // RLS da 36 intacto
});

test('entrada sem mês escolhido: 1 mês antes do mês da meta, no débito e no cartão', () => {
    const r = carrega([
        meta(1, 'Mesa', 1000, '2027-03-01', { forma: 'financiamento', entrada: 400, parcelas: 2 }),
        meta(2, 'Fogão', 1000, '2027-05-01', { forma: 'cartao', entrada: 400, parcelas: 2 }),
    ]);
    assert.equal(doPlano(r, 1).cicloEntrada, 4);   // 1ª parcela Mar/27 (5), entrada Fev/27
    assert.equal(doPlano(r, 2).cicloEntrada, 6);   // compra Mai/27 (7), entrada Abr/27
});

test('"Cabe começando em": conta com a entrada 1 mês antes, como fica ao mudar o mês da meta', () => {
    // Guardado 2.000 × (ciclo + 1). Entrada 5.000 dois meses antes da 1ª parcela (Dez/26, 2):
    // Out/26 só tem 2.000. Mudando o mês, a entrada vai pra 1 mês antes: em Jan/27 (3), a
    // entrada em Dez/26 (6.000) e a parcela de 1.000 em Jan/27 (8.000 − 6.000) cabem. Com a
    // distância antiga (2 meses), só caberia em Fev/27 (4).
    const p = doPlano(carrega([meta(1, 'Sofá', 6000, '2026-12-01', { forma: 'financiamento', entrada: 5000, parcelas: 1, meses_ate_parcela: 2 })]), 1);
    assert.deepEqual([p.cabe, p.cicloEntrada, p.cabeEm], [false, 0, 3]);
    assert.match(ler('js/finance.js'), /const movida = \{ \.\.\.meta, meses_ate_parcela: 1 \};/);
});

test('mês a mês: o que sai, sobra/falta e Comprometido contando a meta em cada mês', () => {
    // Móveis 40.000: entrada 10.000 em Mar/27 (5), 10x de 3.000 de Abr/27 (6). Guardado
    // 2.000 × (ciclo + 1): Mar 12.000 − 10.000 = 2.000; Abr 14.000 − 13.000 = 1.000; Mai 0;
    // Jun −1.000 … Set/27 −4.000. Faturamento 3.000/mês: a parcela de 3.000 é 100% do mês.
    const p = doPlano(carrega([meta(1, 'Móveis', 40000, '2027-04-01', { forma: 'financiamento', entrada: 10000 })]), 1);
    const porMes = JSON.parse(JSON.stringify(p.porMes));
    assert.deepEqual(porMes.map(m => [m.ciclo, m.sai, m.sobra]), [[5, 10000, 2000], [6, 3000, 1000], [7, 3000, 0], [8, 3000, -1000], [9, 3000, -2000], [10, 3000, -3000], [11, 3000, -4000]]);
    assert.deepEqual(porMes[0].itens, [{ rotulo: 'Entrada', valor: 10000 }]);
    assert.deepEqual(porMes[1].itens, [{ rotulo: 'Parcela 1/10', valor: 3000 }]);
    assert.ok(porMes.slice(1).every(m => m.comprometido >= 100 - 1e-9));   // parcela = faturamento
    assert.equal(porMes[0].comprometido, 0);                                // entrada não é compromisso
    // A pior falta do mês a mês é a mesma do plano.
    assert.equal(Math.max(...porMes.map(m => -m.sobra)), p.falta);
});

test('mês a mês: botão em cada meta, modal próprio e refeito a cada desenho', () => {
    assert.match(visoes, /botao\('mesAMes', ICONE_MES_A_MES, 'Mês a mês'\)/);
    assert.match(pagina, /<dialog id=modalPlanoMeta tabindex=-1>\s*<div id=corpoPlanoMeta><\/div>\s*<\/dialog>/);
    assert.match(interacoes, /if \(acao === 'mesAMes'\) \{/);
    assert.match(interacoes, /if \(el\('modalPlanoMeta'\)\.open\) \{/);
    assert.match(ler('js/finance.js'), /plano\.porMes = detalheDoPlano\(plano, anteriores, ctx\);/);
    assert.match(visoes, /<th class=n title="Comprometido do mês contando esta meta \(teto \$\{teto\}%\)">Comprometido<\/th>/);
    assert.match(regras, /\*\*Mês a mês\*\* \(botão-ícone de calendário em cada meta\) abre um modal/);
    // No celular, cada mês vira um cartão com o rótulo em cima de cada número (sem rolar de lado).
    assert.match(visoes, /data-rotulo="Disponível"/);
    assert.match(ler('css/mobile.css'), /\.pmTabela td\[data-rotulo\]::before \{\s*content: attr\(data-rotulo\);/);
});

test('campo de mês das metas não grava ano pela metade nem o mês da meta apagado', () => {
    assert.match(interacoes, /if \(\(campo === 'mes' \|\| campo === 'mes_entrada'\) && \(input\.value \? \+input\.value\.slice\(0, 4\) < 2000 : campo === 'mes'\)\) return;/);
    // A guarda vem antes de qualquer gravação ou aviso.
    assert.ok(interacoes.indexOf("campo === 'mes_entrada') && (input.value") < interacoes.indexOf("let valor = valorDoCampoDaMeta(campo, input.value);"));
    assert.match(regras, /Campo de mês só grava mês completo, de 2000 em diante/);
});

test('pra caber: receita gulosa cobre cada mês só com cortes de ciclos até ele', () => {
    const r = carrega([]);
    // Faltas acumuladas: 1.000 em Jun/27 (8) e 4.000 em Set/27 (11). Corte depois do buraco
    // (ciclo 12) não ajuda; teto corta só o que falta; lançamento sai inteiro.
    const A = { tipo: 'pular', id: 1, ciclo: 7, ganho: 600 };
    const B = { tipo: 'pular', id: 2, ciclo: 9, ganho: 2000 };
    const C = { tipo: 'pular', id: 3, ciclo: 12, ganho: 5000 };
    const D = { tipo: 'teto', chave: 'besteira', cicloTeto: 7, ciclo: 8, ganho: 800, parcial: true };
    const receita = JSON.parse(JSON.stringify(r.receitaPraCaber([{ ciclo: 8, falta: 1000 }, { ciclo: 11, falta: 4000 }], [A, B, C, D])));
    // Jun/27: D (mais perto do buraco) dá 800, A dá 600 → 1.400. Set/27: B dá 2.000 → 3.400 de 4.000.
    assert.deepEqual(receita.cortes.map(c => [c.id ?? c.chave, c.valor]), [['besteira', 800], [1, 600], [2, 2000]]);
    assert.deepEqual([receita.ganho, receita.resta, receita.cobre], [3400, 600, false]);
});

test('pra caber: só entra o que dá pra cortar de verdade', () => {
    const linha = (id, extra) => ({ id, nome: `L${id}`, categ: 'Presente', data: '2027-05-10', v: -200, valor: -200, cred: false, pago: false, periodoIdx: 7, ...extra });
    const r = carrega([], { tetoBesteira: 300, extras: [
        linha(901),                                        // cortável
        linha(902, { comprometido: true }),                // intocável
        linha(903, { reserva: true }),
        linha(904, { categ: 'Investimento', nome: 'Aporte' }),
        linha(905, { pago: true }),
        linha(906, { categ: 'Besteira' }),                 // conta no teto: a alavanca é o teto
        linha(907, { v: 500, valor: 500 }),                // entrada
        linha(908, { nome: 'Antecipação Fatura', categ: 'Antecipação Fatura' }),
        linha(909, { periodoIdx: -1 }),                    // antes do ciclo atual (idxHoje 0)
    ] });
    const { tetos, lancamentos } = JSON.parse(JSON.stringify(r.candidatosPraCaber()));
    assert.deepEqual(lancamentos.map(c => c.id), [901]);
    // Teto de Besteira de 300 em todo ciclo com ciclo seguinte; no ciclo 7, a Besteira de 200
    // já lançada deixa 100 de prevista. A prevista cai na fatura do ciclo seguinte.
    assert.equal(tetos.length, 11);
    assert.deepEqual(tetos.filter(t => t.cicloTeto === 7).map(t => [t.chave, t.ciclo, t.ganho]), [['besteira', 8, 100]]);
});

test('pra caber: receitas da meta que não cabe e "Em Nx" sem cortar', () => {
    // Mesa 12.000: entrada 2.000 em Jan/27 (3) e 2x de 5.000 (Fev e Mar/27). Sem os presentes
    // cabe no limite (Mar/27 fecha em 0). Presentes de 1.000 em Jan, Fev e Mar/27 fazem faltar
    // 3.000 em Mar/27, e pular os três cobre.
    const presentes = [3, 4, 5].map(i => ({ id: 950 + i, nome: 'Presente', categ: 'Presente', data: CICLOS[i].ini, v: -1000, valor: -1000, cred: false, pago: false, periodoIdx: i, recorrencia_id: 77 }));
    const r = carrega([meta(1, 'Mesa', 12000, '2027-02-01', { forma: 'financiamento', entrada: 2000, parcelas: 2 })], { extras: presentes });
    const plano = r.plano.find(p => p.meta.id === 1);
    assert.deepEqual([plano.cabe, plano.falta], [false, 3000]);
    const receitas = JSON.parse(JSON.stringify(r.receitasPraCaber(plano)));
    assert.deepEqual(receitas.map(x => [x.titulo, x.cobre, x.ganho]), [['Pular lançamentos', true, 3000]]);
    assert.ok(receitas[0].cortes.every(c => c.tipo === 'pular' && c.grupo === 77));
    // Parcelado sem caber: o menor número de vezes que cabe, sem passar dos ciclos carregados.
    const r2 = carrega([meta(1, 'Mesa', 12000, '2027-02-01', { forma: 'financiamento', entrada: 2000, parcelas: 1 })]);
    const mesa = r2.plano.find(p => p.meta.id === 1);
    assert.deepEqual([mesa.cabe, mesa.vezesQueCabe], [false, 2]);
});

test('pra caber: modal, Simular só na memória e regra documentada', () => {
    assert.match(visoes, /function htmlPraCaber\(p\) \{\s*\n\s*receitasDoModal = receitasPraCaber\(p\);/);
    assert.match(visoes, /data-acao=simularReceita data-receita=\$\{i\} title="Simular \(não salva\)"/);
    const simular = interacoes.slice(interacoes.indexOf('function simularReceitaPraCaber('), interacoes.indexOf('\n}\n', interacoes.indexOf('function simularReceitaPraCaber(')));
    // Liga a simulação e guarda o retrato ANTES de mexer; nada de gravar no banco.
    assert.ok(simular.indexOf('guardarRetratoAntesDaSimulacao()') < simular.indexOf('receita.cortes.forEach'));
    assert.doesNotMatch(simular, /excluirLancamento|salvarLimiteDoCiclo|atualizarLancamento/);
    assert.match(regras, /\*\*Pra caber\*\* \(no Mês a mês de uma meta que não cabe por falta de dinheiro\)/);
    assert.match(regras, /Investimento fica de fora/);
});

test('pra caber: quando não dá, lista o que já está comprometido até a falta', () => {
    // Mesa sem caber: a parcela única de 10.000 em Fev/27 (ciclo 4) é a falta. Comprometidos:
    // Senac 500 em 3..6 (Mar e Abr/27 passam da falta), uma parcela no cartão e uma linha paga (fora).
    const senac = [3, 4, 5, 6].map(i => ({ id: 960 + i, nome: 'Senac', categ: 'Educação', data: CICLOS[i].ini, v: -500, valor: -500, cred: false, pago: false, comprometido: true, periodoIdx: i, recorrencia_id: 88 }));
    const parcela = { id: 970, nome: 'Iphone', categ: 'Eletrônico', data: CICLOS[2].ini, v: -300, valor: -300, cred: true, pago: false, recorrencia_id: 89, freq: null, fatura: '2027-02-12', periodoIdx: 4 };
    const pago = { id: 971, nome: 'Pago', categ: 'X', data: CICLOS[4].ini, v: -900, valor: -900, cred: false, pago: true, comprometido: true, periodoIdx: 4 };
    const r = carrega([meta(1, 'Mesa', 12000, '2027-02-01', { forma: 'financiamento', entrada: 2000, parcelas: 1 })], { extras: [...senac, parcela, pago] });
    const plano = r.plano.find(p => p.meta.id === 1);
    assert.equal(plano.cabe, false);
    const dados = JSON.parse(JSON.stringify(r.comprometidosAteAFalta(plano)));
    assert.equal(dados.ate, 4);
    assert.deepEqual(dados.grupos.map(g => [g.nome, g.total, g.ciclos]), [['Senac', 1000, [3, 4]], ['Iphone', 300, [4]]]);
    assert.equal(dados.total, 1300);
    // Tela: aviso só sem receita que cubra (e com falta de dinheiro), botão abre o modal.
    assert.match(visoes, /\(p\.falta <= TOLERANCIA_FINANCEIRA \|\| receitasDoModal\.some\(r => r\.cobre\) \? '' :/);
    assert.match(visoes, /Nem cortando tudo cabe: muito já está Comprometido\./);
    assert.match(pagina, /<dialog id=modalComprometidos tabindex=-1>\s*<div id=corpoComprometidos><\/div>\s*<\/dialog>/);
    assert.match(interacoes, /el\('corpoComprometidos'\)\.innerHTML = htmlComprometidos\(plano\);/);
    assert.match(regras, /abre o modal \*\*Comprometido até Mmm\/aa\*\*/);
});

test('opções de vezes: mínimo que cabe e ideal que completa a Reserva até a última parcela', () => {
    // Cada mês deixa 2.000 (guardado 2.000 × (ciclo + 1)). Aluguel de 1.000 marcado Reserva: a
    // meta dela é 9.000 (nove ciclos), com 2.000 guardados hoje faltam 7.000. Mesa 6.000 sem
    // entrada, 1ª parcela em Fev/27 (4). Ideal = o mês típico sobra a falta da Reserva ÷ meses
    // de hoje até a última parcela: 4x de 1.500 sobra 500 < 7.000/8; 5x de 1.200 (até Jun/27,
    // 8) sobra 800 ≥ 7.000/9 = 777,78.
    const r = carrega([meta(1, 'Mesa', 6000, '2027-02-01', { forma: 'financiamento', parcelas: 3 })], { reservaAluguel: true });
    const o = JSON.parse(JSON.stringify(r.plano.find(p => p.meta.id === 1).opcoesVezes));
    assert.deepEqual(o.alvo, { tipo: 'reserva', restante: 7000 });
    assert.deepEqual([o.atual.vezes, o.atual.tipica, o.atual.pior], [3, 0, 0]);
    assert.deepEqual([o.minimo.vezes, o.minimo.parcela, o.minimo.tipica, o.minimo.ini, o.minimo.fim], [1, 6000, -4000, 4, 4]);
    assert.deepEqual([o.ideal.vezes, o.ideal.parcela, o.ideal.tipica, o.ideal.fim, o.ideal.alvo], [5, 1200, 800, 8, 777.78]);
    // Nenhum número de vezes cobre a Reserva dentro dos ciclos carregados: sem ideal.
    const grande = JSON.parse(JSON.stringify(carrega([meta(1, 'Carro', 30000, '2027-02-01', { forma: 'financiamento', parcelas: 10 })], { reservaAluguel: true }).plano[0].opcoesVezes));
    assert.equal(grande.ideal, null);
    // À vista não tem opções.
    assert.equal(carrega([meta(1, 'Cadeira', 900, '2027-02-01')]).plano[0].opcoesVezes, undefined);
});

test('opções de vezes: com a Reserva completa (ou sem meta), o ideal mantém o ritmo da Liberdade', () => {
    // Sem nada marcado Reserva: o alvo é o que o mês típico deixou nos últimos 12 ciclos até
    // hoje (só o ciclo 0 aqui: 2.000). Qualquer parcela tira disso, então não há ideal.
    const o = JSON.parse(JSON.stringify(carrega([meta(1, 'Mesa', 6000, '2027-02-01', { forma: 'financiamento', parcelas: 3 })]).plano[0].opcoesVezes));
    assert.deepEqual(o.alvo, { tipo: 'liberdade', ritmo: 2000 });
    assert.equal(o.ideal, null);
    assert.equal(o.minimo.vezes, 1);
    assert.match(visoes, /mantém o aporte de hoje pra Liberdade/);
    assert.match(visoes, /a Reserva completa até \$\{ate\(x\.fim\)\}/);
    assert.match(regras, /Ideal\*\* \(o menor que cabe com o mês típico sobrando o que a Reserva ou a Liberdade pedem\)/);
});

test('opções de vezes: linha embaixo do plano, clique usa o número de vezes', () => {
    assert.match(visoes, /htmlDoPlanoDaMeta\(p\) \+ htmlOpcoesDeVezes\(p\) \+/);
    assert.match(visoes, /data-acao=usarVezes data-vezes=\$\{x\.vezes\} title="Usar \$\{x\.vezes\}x\$\{dica\}\$\{sobra\(x\)\}"/);
    // A sobra fica só no hover: a pílula mostra vezes, parcela e até quando; sem "Agora".
    assert.match(visoes, /<i>\$\{rotulo\}<\/i> <b>\$\{x\.vezes\}x \$\{brl\(x\.parcela\)\}<\/b> <span class=mpDetalhe>até \$\{ate\(x\.fim\)\}<\/span><\/button>/);
    assert.doesNotMatch(visoes, /<i>Agora<\/i>|pior mês sobra/);
    assert.match(interacoes, /if \(acao === 'usarVezes' \|\| acao === 'usarMes'\) return ajustarMeta\(id, botao\);/);
    assert.match(interacoes, /if \(botao\.dataset\.acao === 'usarVezes'\) return gravarMudancaDaMeta\('atualizar', id, \{ parcelas: \+botao\.dataset\.vezes \}\);/);
    assert.match(regras, /\*\*Opções de vezes\*\* \(só parcelado\)/);
});

test('sobra/mês: o típico decide o ideal; o pior mês aparece com o nome, e o Mês a mês mostra o que cada mês deixa', () => {
    // Um gasto avulso de 6.000 em Jun/27 (8) deixa esse mês negativo sem a meta. Mesa 6.000 em
    // 6x de 1.000 (Fev a Jul/27): o típico sobra 1.000, o pior é Jun/27 com −5.000. O ideal
    // olha o típico: 5x de 1.200 (até Jun/27) sobra 800 no típico ≥ 7.000/9 da Reserva.
    const avulso = { id: 990, nome: 'IPVA', categ: 'Carro', data: CICLOS[8].ini, v: -6000, valor: -6000, cred: false, pago: false, periodoIdx: 8 };
    const r = carrega([meta(1, 'Mesa', 6000, '2027-02-01', { forma: 'financiamento', parcelas: 6 })], { extras: [avulso], reservaAluguel: true });
    const p = r.plano.find(x => x.meta.id === 1);
    const o = JSON.parse(JSON.stringify(p.opcoesVezes));
    assert.deepEqual([o.atual.tipica, o.atual.pior, o.atual.cicloPior], [1000, -5000, 8]);
    assert.equal(o.ideal.vezes, 5);
    // Mês a mês: "No mês" (deixa) negativo em Jun/27 com o guardado depois ainda positivo.
    const jun = JSON.parse(JSON.stringify(p.porMes)).find(m => m.ciclo === 8);
    assert.deepEqual([jun.deixa, jun.sobra > 0], [-5000, true]);
    assert.match(visoes, /<th class=n title="O que o mês deixa: entradas − saídas, com as metas \(pode ser negativo com o guardado ainda positivo\)">No mês<\/th>/);
    assert.match(regras, /O ideal olha o típico porque um mês já negativo sem a meta/);
});

test('"Cabe começando em …" é um botão que muda o mês da meta (a entrada vai pra 1 mês antes)', () => {
    const trecho = visoes.slice(visoes.indexOf('const mesAbrev'), visoes.indexOf('function htmlModalMetas('));
    const contexto = vm.createContext({ MESES: ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'] });
    ['js/domain.js', 'js/shared.js'].forEach(arquivo => vm.runInContext(ler(arquivo), contexto));
    contexto.Estado = { ciclos: CICLOS.map(c => ({ ...c })) };
    vm.runInContext(`const pct1 = n => n.toFixed(1).replace('.', ',') + '%';
        const LIMITES_COMPROMISSOS = [{ percentual: 50 }];
        ${trecho} globalThis.t = { htmlDoPlanoDaMeta };`, contexto);
    const html = contexto.t.htmlDoPlanoDaMeta({ mes: '2026-11-01', ciclo: 1, cicloEntrada: 1, disponivel: 0, forma: 'financiamento', entrada: 0,
        parcelas: 2, parcela: 500, meta: { valor: 1000 }, cabe: false, falta: 100, cicloFalta: 1, cabeEm: 5 });
    assert.match(html.replace(/\u00a0/g, ' '), /<button type=button data-acao=usarMes data-mes=2027-03-01 title="Mudar o mês da meta pra Mar\/27" class="mpParte mpOpcao am"><i>Cabe começando em<\/i> <b>Mar\/27<\/b><\/button>/);
    // Sem cortar, no Pra caber: os dois também são botões.
    assert.match(visoes, /<button type=button class="mpParte mpOpcao" data-acao=usarVezes data-vezes=\$\{p\.vezesQueCabe\}/);
    assert.match(visoes, /p\.cabeEm != null \? `<button \$\{atributosUsarMes\(mesDoCiclo\(p\.cabeEm\)/);
    // Mudar o mês por aqui faz o mesmo que pelo campo: com entrada, ela volta pra 1 mês antes.
    const ajustar = interacoes.slice(interacoes.indexOf('function ajustarMeta('), interacoes.indexOf('const proximoMesISO'));
    assert.match(ajustar, /const campos = \{ mes: botao\.dataset\.mes \};\s*\n\s*if \(meta\.entrada > 0 && meta\.meses_ate_parcela !== 1\) campos\.meses_ate_parcela = 1;/);
    assert.match(interacoes, /const ajuste = e\.target\.closest\('\[data-acao=usarMes\], \[data-acao=usarVezes\]'\);\s*\n\s*if \(ajuste\) return ajustarMeta\(\+el\('modalPlanoMeta'\)\.dataset\.meta, ajuste\);/);
    assert.match(regras, /\*\*Cabe começando em\*\* \(e "Cabe comprando em", "Cabe em"\) é um botão/);
});

test('Vezes mostra até quando vão as parcelas, na própria caixa, já enquanto digita', () => {
    const trecho = visoes.slice(visoes.indexOf('const mesAbrev'), visoes.indexOf('function htmlModalMetas('));
    const contexto = vm.createContext({ MESES: ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'] });
    ['js/domain.js', 'js/shared.js'].forEach(arquivo => vm.runInContext(ler(arquivo), contexto));
    contexto.Estado = { ciclos: CICLOS.map(c => ({ ...c })) };
    vm.runInContext(`const PARCELAS_PADRAO_METAS = 10;
        const formaDaMeta = meta => (['cartao', 'financiamento'].includes(meta.forma) ? meta.forma : 'avista');
        ${trecho} globalThis.t = { fimDasVezes };`, contexto);
    const { fimDasVezes } = contexto.t;
    // Débito: 1ª parcela no mês da meta. 24x de Mar/27 → Fev/29.
    assert.equal(fimDasVezes({ mes: '2027-03-01', forma: 'financiamento' }, 24), 'até Fev/29');
    // Cartão: faturas a partir do mês seguinte à compra. 10x comprando em Jan/27 → Nov/27.
    assert.equal(fimDasVezes({ mes: '2027-01-01', forma: 'cartao' }, 10), 'até Nov/27');
    // Vazio usa o padrão (10x); sem mês, nada.
    assert.equal(fimDasVezes({ mes: '2027-03-01', forma: 'financiamento' }, null), 'até Dez/27');
    assert.equal(fimDasVezes({ mes: null, forma: 'financiamento' }, 24), '');
    assert.match(visoes, /<span class=vezesFim>\$\{fimDasVezes\(m, m\.parcelas\)\}<\/span><\/span>/);
    assert.match(interacoes, /if \(meta && fim\) fim\.textContent = fimDasVezes\(meta, vezes\.value\.trim\(\) \|\| null\);/);
    assert.match(regras, /a caixa de \*\*Vezes\*\* mostra até quando vão as parcelas/);
});
