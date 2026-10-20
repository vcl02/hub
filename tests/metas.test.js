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

const meta = (id, nome, valor, mes, extra = {}) => ({ id, nome, valor, mes, ancora_meta_id: null, deslocamento: 0, forma: 'auto', parcelas: null, entrada: null, juros_mensal: null, custo_mensal: null, status: 'aberta', ...extra });
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

test('cascata: à vista; a seguinte no mesmo mês não cabe e diz quando cabe; cartão; financiado; entrada embutida', () => {
    const r = carrega([
        meta(1, 'Cadeira', 1500, '2026-11-01'),
        meta(2, 'Geladeira', 4000, '2026-11-01'),
        meta(3, 'TV', 2000, '2027-01-01', { forma: 'cartao' }),
        meta(4, 'Carro', 30000, '2027-03-01', { forma: 'financiamento', entrada: 5000 }),
        meta(5, 'Fogão', 3000, '2027-05-01', { forma: 'cartao', entrada: 1000 }),
    ]);
    const cadeira = doPlano(r, 1), geladeira = doPlano(r, 2), tv = doPlano(r, 3), carro = doPlano(r, 4), fogao = doPlano(r, 5);
    assert.equal(cadeira.forma, 'avista');
    assert.equal(cadeira.cabe, true);
    assert.equal(cadeira.disponivel, 4000);
    // 4.000 − 1.500 da Cadeira = 2.500 < 4.000; Nubank (3.350) e MP (1.100) não comportam.
    assert.equal(geladeira.cabe, false);
    assert.equal(geladeira.falta, 1500);
    assert.equal(geladeira.cabeEm, 2);
    assert.equal(geladeira.forma, 'avista');                 // fica no mês pedido, à vista
    assert.equal(tv.forma, 'cartao');
    assert.equal(tv.cartao, 'nubank');
    assert.equal(tv.parcelas, 10);
    assert.equal(tv.parcela, 200);
    assert.ok(tv.linhas.every(l => l.cred && l.recorrencia_id === 'meta-3' && l.fatura.endsWith('-12')));
    // Carro: entrada 5.000 (parte do total) e 25.000 financiados sem juros. 18x (R$ 1.388,89)
    // passaria do teto com a TV (200): o menor prazo que cabe em 50% de 3.000 é 24x (R$ 1.041,67).
    assert.equal(carro.forma, 'financiamento');
    assert.equal(carro.entrada, 5000);
    assert.equal(carro.parcelas, 24);
    assert.equal(carro.parcela, 1041.67);
    assert.ok(carro.comprometidoMax <= 50);
    const entradaCarro = carro.linhas.filter(l => l.nome === 'Entrada · Carro');
    assert.deepEqual(JSON.parse(JSON.stringify(entradaCarro.map(l => [l.periodoIdx, l.v, l.cred]))), [[5, -5000, false]]);
    assert.ok(carro.linhas.filter(l => l.comprometido).every(l => !l.cred && l.periodoIdx > 5));
    // Fogão: entrada 1.000 à vista e só o resto (2.000) no cartão: Nubank tem 3.350 menos 4
    // parcelas da TV ainda não cobradas (800) = 2.550, que comporta os 2.000.
    assert.equal(fogao.forma, 'cartao');
    assert.equal(fogao.entrada, 1000);
    assert.equal(fogao.parcela, 200);
    assert.equal(fogao.linhas.filter(l => l.cred).reduce((s, l) => s - l.v, 0), 800);   // 4 de 10 no horizonte (jun a set/27)
    assert.equal(fogao.linhas.filter(l => !l.cred).reduce((s, l) => s - l.v, 0), 1000);
    assert.equal(new Set(fogao.linhas.map(l => l.id)).size, fogao.linhas.length);
});

test('linhas do plano entram na base como previstas (id negativo, _meta) e só no horizonte', () => {
    const r = carrega([meta(3, 'TV', 2000, '2027-01-01', { forma: 'cartao' }), meta(5, 'Seguro', 500, '2027-08-01', { custo_mensal: 150 })]);
    const linhas = r.base.filter(l => l._meta != null);
    assert.ok(linhas.length > 0);
    assert.ok(linhas.every(l => l.id < 0 && l._prev === 1 && l.periodoIdx != null && l.pago === false));
    assert.equal(new Set(linhas.map(l => l.id)).size, linhas.length);   // ids distintos
    // TV comprada em jan/27 (ciclo 3): parcelas de fev/27 (ciclo 4) até set/27 (11) → 8 no horizonte.
    assert.equal(linhas.filter(l => l._meta === 3).length, 8);
    // Custo/mês: Comprometido em todo ciclo depois da compra (ago/27 = 10 → só set/27).
    assert.deepEqual(JSON.parse(JSON.stringify(linhas.filter(l => l.nome === 'Custo · Seguro').map(l => [l.periodoIdx, l.v, l.comprometido]))), [[11, -150, true]]);
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
    assert.match(regras, /Se nada cabe no mês pedido, a meta fica nele, à vista/);
    assert.match(regras, /\*\*Entrada\*\* é parte do total \(móveis de R\$ 40\.000 = R\$ 10\.000 de entrada \+ R\$ 30\.000 parcelados\)/);
    assert.match(regras, /Sem juros por enquanto: a parcela é o resto dividido pelas vezes/);
    assert.doesNotMatch(regras, /3% a\.m\./);
    assert.match(regras, /As metas podem usar o guardado abaixo da meta da Reserva/);
});

test('juros fora por enquanto e só três formas (À vista, Parcelado no meu cartão, Parcelado no débito)', () => {
    const financas = ler('js/finance.js');
    assert.doesNotMatch(financas + visoes, /juros_mensal|JUROS_PADRAO|prestacao\(/);
    // Só três formas, sempre a escolhida; "auto" (padrão antigo da tabela) vale como À vista.
    assert.match(visoes, /const FORMAS_DA_META = \{ avista: 'À vista', cartao: 'Parcelado no meu cartão', financiamento: 'Parcelado no débito' \};/);
    assert.match(ler('js/finance.js'), /const formaDaMeta = meta => \(\['cartao', 'financiamento'\]\.includes\(meta\.forma\) \? meta\.forma : 'avista'\);/);
    assert.doesNotMatch(visoes + ler('js/finance.js'), /Automático/);
    assert.match(interacoes, /\{ nome: 'Nova meta', valor: 1000, mes: proximoMesISO\(\), forma: 'avista' \}/);
    assert.match(regras, /A forma é sempre a escolhida \(\*\*À vista\*\*, \*\*Parcelado no meu cartão\*\* ou \*\*Parcelado no débito\*\*\)/);
    // Comprar com entrada: primeiro a entrada (débito), depois o resto parcelado.
    assert.match(formulario, /const resto = -\(meta\.valor - \(plano\.entrada \|\| 0\)\);/);
});
