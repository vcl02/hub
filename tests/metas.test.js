// Metas (fin_meta, migration 36): o plano em cascata (à vista, cartão, financiamento, não
// cabe), a âncora, as linhas previstas na base e no Comprometido. Roda o código real de
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

function carrega(metas) {
    const lancamentos = CICLOS.flatMap((c, i) => [
        { id: 100 + i, nome: 'Faturamento PJ', categ: 'Renda', data: c.ini, v: 3000, valor: 3000, cred: false, pago: true, periodoIdx: i },
        { id: 200 + i, nome: 'Aluguel', categ: 'Casa', data: c.ini, v: -1000, valor: -1000, cred: false, pago: true, periodoIdx: i },
    ]);
    const estado = {
        idxHoje: 0, ciclos: CICLOS.map(c => ({ ...c })), faturas: [], lancamentos, metas,
        limitesPorCiclo: new Map(CICLOS.map(c => [c.cicloId, { id: c.cicloId, limite_besteira: 0, limite_isabella: 0 }])),
    };
    const contexto = { Estado: estado, SALDO_DESDE: '2026-01-01', MESES: [], document: { getElementById: () => ({}) }, setTimeout, clearTimeout };
    vm.createContext(contexto);
    ['js/domain.js', 'js/shared.js', 'js/finance.js'].forEach(arquivo => vm.runInContext(ler(arquivo), contexto));
    vm.runInContext('const filtrarLancamentos = () => lancamentosComPrevistas();', contexto);   // tables.js
    const limites = graficos.slice(graficos.indexOf('const LIMITES_COMPROMISSOS'), graficos.indexOf('\n];\n', graficos.indexOf('const LIMITES_COMPROMISSOS')) + 4);
    vm.runInContext(limites + graficos.slice(graficos.indexOf('const ehParcelaDeCompra'), graficos.indexOf('function dadosCompromissosCiclo(')), contexto);
    vm.runInContext(`limparCachesFinanceiros();
        globalThis.r = { plano: planoDasMetas(), base: lancamentosComPrevistas(), mesDaMeta, cicloDoMes, guardadoAte };`, contexto);
    return contexto.r;
}

const meta = (id, nome, valor, mes, extra = {}) => ({ id, nome, valor, mes, ancora_meta_id: null, deslocamento: 0, forma: 'auto', parcelas: null, entrada: null, meses_ate_parcela: null, status: 'aberta', ...extra });
const doPlano = (r, id) => r.plano.find(p => p.meta.id === id);

test('cenário: guardado projetado cresce 2.000 por ciclo (sem metas)', () => {
    const r = carrega([]);
    assert.equal(r.guardadoAte(0), 2000);
    assert.equal(r.guardadoAte(1), 4000);
    assert.deepEqual(JSON.parse(JSON.stringify(r.plano)), []);
});

test('âncora: meta segue a data dela com deslocamento; ciclo é o que começa no mês', () => {
    const r = carrega([]);
    const chaves = meta(1, 'Chaves do AP', null, '2027-03-01');
    const porId = new Map([[1, chaves]]);
    assert.equal(r.mesDaMeta(meta(2, 'Vistoria', 800, null, { ancora_meta_id: 1, deslocamento: -1 }), porId), '2027-02-01');
    assert.equal(r.mesDaMeta(meta(3, 'Planejados', 9000, '2026-12-01', { ancora_meta_id: 1, deslocamento: 1 }), porId), '2027-04-01');
    assert.equal(r.mesDaMeta(meta(4, 'Mesa', 900, '2026-12-01'), porId), '2026-12-01');
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
        ${trecho} globalThis.t = { partesDoPlanoDaMeta, htmlDoPlanoDaMeta, tituloDoMesDaMeta };`, contexto);
    const { partesDoPlanoDaMeta, htmlDoPlanoDaMeta, tituloDoMesDaMeta } = contexto.t;
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
    assert.match(regras, /cada meta mostra o plano ao lado em \*\*pílulas\*\*, com o rótulo em itálico, o valor em negrito e o mês apagado/);
    assert.match(ler('css/forms.css'), /\.mpParte\.am \{ color: #F0A83A; background: var\(--orange-soft\); border-color: #6A5330; \}/);
    assert.equal(tituloDoMesDaMeta({ forma: 'financiamento', entrada: 500 }), 'Mês da 1ª parcela');
    assert.equal(tituloDoMesDaMeta({ forma: 'cartao', entrada: 500 }), 'Mês da compra (1ª fatura no seguinte)');
    assert.equal(tituloDoMesDaMeta({ forma: 'auto' }), 'Mês do pagamento');
    // Embaixo, o mês da entrada ao lado dela, só com entrada.
    assert.match(visoes, /\(m\.entrada > 0 \? campo\(m, 'mes_entrada', mesEntrada, 'type=month title="Mês da entrada" aria-label="Mês da entrada"'\) : ''\)/);
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
    assert.match(interacoes, /el\('btMetas'\)\.hidden = !Estado\.temMetas \|\| modoRestrito\(\);/);
    assert.match(interacoes, /if \(!confirm\(`Excluir "\$\{meta\.nome\}"\?/);
    assert.match(visoes, /function htmlModalMetas\(planos\) \{/);
    assert.match(visoes, /<option value="">Mês próprio<\/option>/);
    assert.match(regras, /quando \(\*\*Mês próprio\*\*, com o campo de mês ao lado, ou uma âncora ± meses\)/);
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
    assert.match(regras, /\*\*Âncora\*\* é uma data com nome/);
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
