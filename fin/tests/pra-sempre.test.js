// fin.pra_sempre (migration 31): recorrência sem data pra acabar, no mesmo padrão de
// Reserva/Comprometido — checkbox, coluna com toggle propagado, filtro por clique — e
// escondida enquanto o banco não tem a coluna.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');
const vm = require('node:vm');

const pagina = fs.readFileSync('index.html', 'utf8');
const estado = fs.readFileSync('js/app-state.js', 'utf8');
const tabelas = fs.readFileSync('js/tables.js', 'utf8');
const interacoes = fs.readFileSync('js/interactions.js', 'utf8');
const formulario = fs.readFileSync('js/form.js', 'utf8');
const api = fs.readFileSync('js/supabase-api.js', 'utf8');
const estilos = fs.readFileSync('css/dashboard.css', 'utf8');
const regras = fs.readFileSync('docs/REGRAS.md', 'utf8');
const migration = fs.readFileSync('migrations/31-pra-sempre.sql', 'utf8');

function colunas({ temPraSempre, restrito = false }) {
    const inicio = estado.indexOf('const COLS = [');
    const fim = estado.indexOf('\nconst isMobile');
    const ctx = { modoRestrito: () => restrito, Estado: { temPraSempre } };
    vm.runInNewContext(`${estado.slice(inicio, fim)}\nthis.colunasAtivas = colunasAtivas;`, ctx);
    return id => ctx.colunasAtivas(id).map(([chave]) => chave);
}

test('coluna aparece depois de Comprometido só quando o banco já tem fin.pra_sempre', () => {
    const com = colunas({ temPraSempre: true })('db');
    assert.equal(com[com.indexOf('comprometido') + 1], 'pra_sempre');
    assert.ok(colunas({ temPraSempre: true })('bk').includes('pra_sempre'));
    assert.ok(!colunas({ temPraSempre: false })('db').includes('pra_sempre'));
    assert.ok(!colunas({ temPraSempre: true, restrito: true })('db').includes('pra_sempre'));
    assert.match(api, /Estado\.temPraSempre = lancamentosCrus\.some\(r => 'pra_sempre' in r\);/);
});

test('cadastro: checkbox desmarcado, herdado por Editar/Duplicar, escondido sem a coluna', () => {
    assert.match(pagina, /<label class="fmChk fmChkIco" title="Pra sempre" id=fPraSempreRotulo>\s*\n\s*<input type=checkbox id=fPraSempre aria-label="Pra sempre">/);
    assert.doesNotMatch(pagina, /id=fPraSempre checked/);
    assert.match(formulario, /el\('fPraSempre'\)\.checked = !!prefill\.pra_sempre;/);
    assert.match(formulario, /el\('fPraSempreRotulo'\)\.hidden = !Estado\.temPraSempre;/);
    assert.equal((formulario.match(/const praSempre = el\('fPraSempre'\)\.checked;/g) || []).length, 2);   // novo e edição
    // Sem a coluna no banco o campo nem vai no INSERT/PATCH.
    assert.match(formulario, /\.\.\.\(Estado\.temPraSempre \? \{ pra_sempre: praSempre \} : \{\}\),\s*\n\s*nome,/);
    assert.match(formulario, /\.\.\.\(Estado\.temPraSempre \? \{ pra_sempre: praSempre \} : \{\}\),\s*\n\s*valor: valorTotal/);
});

test('lote real grava pra_sempre em todas as parcelas só quando a coluna existe', async () => {
    const inicio = formulario.indexOf('async function salvaLancamentoParceladoNoBanco(');
    const fim = formulario.indexOf('\n}\n', inicio) + 3;
    const rodar = async temPraSempre => {
        const inserts = [];
        const ctx = {
            Estado: { lancamentos: [], ciclos: [], temPraSempre }, ehAntecipacaoFatura: () => false, dataISO: v => v,
            dataDaOcorrencia: (d, p) => `2026-1${p}-15`, periodoDaFatura: () => -1, periodoDoLancamento: () => null, ehCategoriaInvestimento: () => false, periodoDoDebito: () => -1,
            inserirLancamentos: async payloads => { inserts.push(...payloads); return payloads.map((p, i) => ({ ...p, id: 10 + i })); },
            proximaRecorrencia: async () => 80, atualizarLancamentos: async () => {},
        };
        vm.runInNewContext(`${formulario.slice(inicio, fim)}\nthis.salvar = salvaLancamentoParceladoNoBanco;`, ctx);
        await ctx.salvar({ nome: 'Spotify', categ: 'Assinatura', freq: 'Mensal', data: '2026-10-07', cred: true, pago: false, reserva: false, comprometido: false, praSempre: true, parcelas: 2, valores: [-20, -20] });
        return inserts;
    };
    assert.ok((await rodar(true)).every(p => p.pra_sempre === true));
    assert.ok((await rodar(false)).every(p => !('pra_sempre' in p)));
});

test('tabela: rótulo, cor azul, filtro Sempre/Com fim, tooltip e toggle propagado', () => {
    assert.match(tabelas, /const ROTULO_FLAG = \{ reserva: 'Reserva', comprometido: 'Comprometido', pra_sempre: 'Pra sempre' \};/);
    assert.match(tabelas, /pra_sempre: 'flagPraSempre' \};/);
    assert.match(tabelas, /pra_sempre: \[\['S', 'Sempre', 'Só os pra sempre', 'flagPraSempre'\], \['N', 'Com fim', 'Só os que têm fim', ''\]\],/);
    assert.match(tabelas, /pra_sempre: 'Isso se repete sem data pra acabar\?',/);
    assert.match(tabelas, /coluna == 'reserva' \|\| coluna == 'comprometido' \|\| coluna == 'pra_sempre'\) return termo == 'S' \? !!r\[coluna\] : !r\[coluna\];/);
    assert.match(interacoes, /const ROTULO_FLAG_TOGGLE = \{ reserva: 'Reserva', comprometido: 'Comprometido', pra_sempre: 'Pra sempre' \};/);
    assert.match(estilos, /\.flagPraSempre \{\s*\n\s*color: #6CB8F0;/);
    assert.match(estilos, /\.col-pra_sempre \{ width: 7rem; \}/);
    assert.match(estilos, /:not\(\.flagComprometido\):not\(\.flagPraSempre\) \{/);
});

test('migration 31: coluna bool falsa por padrão e marca só séries com Frequência até dez/2029', () => {
    assert.match(migration, /alter table public\.fin add column if not exists pra_sempre boolean not null default false;/);
    assert.match(migration, /having max\(data\) between date '2029-12-01' and date '2029-12-31'\s*\n\s*and count\(freq\) > 0/);
    assert.match(migration, /!~\* '\(investimento\|antecipa\|pagamento fatura\|ajuste\)'/);
    assert.doesNotMatch(migration.replace(/--[^\n]*/g, ''), /\$\$/);
    assert.ok(!migration.split('\n').some(l => /^\s*--.*;/.test(l)));
    assert.match(regras, /\*\*Pra sempre\*\* \(`fin\.pra_sempre`, migration 31\) separa a recorrência \*\*sem data pra acabar\*\*/);
    assert.match(regras, /`migrations\/31-pra-sempre\.sql` cria `fin\.pra_sempre`/);
});
