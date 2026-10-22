// Toda gravação real (INSERT, UPDATE, DELETE, limites do ciclo) confirmada pelo banco
// recarrega a tela sozinha, sem atropelar edição em curso nem repetir carga já feita.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');
const vm = require('node:vm');

const api = fs.readFileSync('js/supabase-api.js', 'utf8');
const bootstrap = fs.readFileSync('js/bootstrap.js', 'utf8');
const dadosUi = fs.readFileSync('js/data-ui.js', 'utf8');
const regras = fs.readFileSync('docs/REGRAS.md', 'utf8');

const corpo = (fonte, inicio) => fonte.slice(fonte.indexOf(inicio), fonte.indexOf('\n});', fonte.indexOf(inicio)));

test('toda função que grava no banco pede a recarga ao confirmar', () => {
    assert.match(api, /const aposGravar = resultado => \{\s*\n\s*if \(typeof recarregarAposGravacao === 'function'\) recarregarAposGravacao\(\);/);
    assert.match(api, /return aposGravar\(JSON\.parse\(r\.texto\)\);/);   // INSERT
    assert.match(corpo(api, 'const excluirLancamento'), /if \(JSON\.parse\(r\.texto\)\.length\) return aposGravar\(\);/);
    assert.match(corpo(api, 'const excluirLancamento'), /if \(tentativa > 1 && !\(await linhaExiste\(id\)\)\) return aposGravar\(\);/);
    assert.match(corpo(api, 'const atualizarLancamentos'), /return aposGravar\(linhas\);/);
    assert.match(corpo(api, 'const salvarLimiteDoCiclo'), /return aposGravar\(linhas\[0\]\);/);
    // INSERT sem resposta pode ter gravado: recarrega também.
    assert.match(api, /if \(err\.semResposta\) \{ aposGravar\(\); throw erroSemResposta/);
    // Nenhum outro método que muda dados escapa do gatilho. A única exceção é o POST da
    // função proxima_recorrencia: só consome um número da sequência, não muda linha nenhuma.
    const escritas = [...api.matchAll(/method: '(POST|PATCH|DELETE)'/g)].length;
    assert.equal(escritas, 5);
    assert.equal((api.match(/rest\/v1\/rpc\//g) || []).length, 1);
    assert.match(api, /rpc\/proxima_recorrencia/);
});

test('load marca quando a carga começou e quantas estão em andamento', () => {
    assert.match(dadosUi, /const gravacoesAteAqui = Estado\.gravacoes;\s*\n\s*Estado\.cargasEmAndamento\+\+;/);
    assert.match(dadosUi, /Estado\.gravacoesNaUltimaCarga = Math\.max\(Estado\.gravacoesNaUltimaCarga, gravacoesAteAqui\);/);
    assert.match(dadosUi, /\} finally \{\s*\n\s*Estado\.cargasEmAndamento--;/);
});

function montar() {
    const inicio = bootstrap.indexOf('const ESPERA_RECARGA_APOS_GRAVACAO_MS');
    const fim = bootstrap.indexOf('\n}\n', bootstrap.indexOf('function recarregarAposGravacao()')) + 3;
    const timers = [];
    const tela = { focado: null, dialogo: null, recarregarDesabilitado: false, app: '' };
    const ctx = {
        Estado: { gravacoes: 0, gravacoesNaUltimaCarga: 0, cargasEmAndamento: 0 },
        recargas: 0,
        recarregarDados() { ctx.recargas++; },
        setTimeout: f => { timers.push(f); return timers.length; },
        clearTimeout: id => { if (id) timers[id - 1] = null; },
        el: id => (id === 'app' ? { style: { display: tela.app } } : { disabled: tela.recarregarDesabilitado }),
        document: { querySelector: () => tela.dialogo, get activeElement() { return tela.focado; } },
    };
    vm.runInNewContext(`${bootstrap.slice(inicio, fim)}\nthis.gravou = recarregarAposGravacao;`, ctx);
    const rodarTimers = () => { const pendentes = timers.splice(0).filter(Boolean); pendentes.forEach(f => f()); };
    return { ctx, tela, rodarTimers, timers };
}

test('grava → recarrega uma vez; várias gravações seguidas viram uma carga só', () => {
    const { ctx, rodarTimers } = montar();
    ctx.gravou(); ctx.gravou(); ctx.gravou();
    rodarTimers();
    assert.equal(ctx.recargas, 1);
});

test('espera campo em edição, modal ou carga em andamento; depois recarrega', () => {
    const { ctx, tela, rodarTimers } = montar();
    tela.focado = { matches: () => true };   // editando uma célula
    ctx.gravou();
    rodarTimers();
    assert.equal(ctx.recargas, 0);
    tela.focado = null; tela.dialogo = {};    // modal aberto
    rodarTimers();
    assert.equal(ctx.recargas, 0);
    tela.dialogo = null; ctx.Estado.cargasEmAndamento = 1;
    rodarTimers();
    assert.equal(ctx.recargas, 0);
    ctx.Estado.cargasEmAndamento = 0;
    rodarTimers();
    assert.equal(ctx.recargas, 1);
});

test('não repete quando uma carga começou depois da gravação (o fluxo já recarregou)', () => {
    const { ctx, rodarTimers } = montar();
    ctx.gravou();
    ctx.Estado.gravacoesNaUltimaCarga = ctx.Estado.gravacoes;   // carga começou depois de gravar
    rodarTimers();
    assert.equal(ctx.recargas, 0);
    // Carga que começou ANTES desta gravação não conta: recarrega.
    ctx.gravou();
    rodarTimers();
    assert.equal(ctx.recargas, 1);
    assert.match(bootstrap, /const gravacao = \+\+Estado\.gravacoes;/);
});

test('regra documentada', () => {
    assert.match(regras, /\*\*Recarga após gravar:\*\* toda mudança real que o banco confirma[^\n]*recarrega os dados da tela do banco automaticamente, em silêncio/);
    assert.match(regras, /Várias gravações seguidas viram uma só carga; se o próprio fluxo já recarregou depois de gravar, não repete/);
});
