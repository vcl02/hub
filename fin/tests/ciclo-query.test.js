// Contrato da URL do ciclo: ciclos únicos usam um mês estável e restaurável; Backlog usa a
// palavra fixa "backlog" (De sozinho, sem par no combo Até).
const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');
const vm = require('node:vm');

const fonte = fs.readFileSync('js/data-ui.js', 'utf8');
const inicio = fonte.indexOf('function chaveCicloNaUrl(');
const fim = fonte.indexOf('\n// Fluxo completo de carga', inicio);
const regrasMd = fs.readFileSync('docs/REGRAS.md', 'utf8');

function criarContexto(href, valores = { compDe: '', compAte: '' }, compDeOptions = [{ value: '0' }, { value: '1' }]) {
    const elementos = {
        compDe: { value: valores.compDe, options: compDeOptions },
        compAte: { value: valores.compAte, options: [{ value: '0' }, { value: '1' }] }
    };
    const url = new URL(href);
    const chamadas = [];
    // metodos[i] registra se chamadas[i] veio de pushState ou replaceState, sem mudar o
    // formato de chamadas[i] (os testes antigos indexam chamadas[0][2] = destino da URL).
    const metodos = [];
    const janela = {
        location: { href: url.href, pathname: url.pathname, search: url.search, hash: url.hash },
        history: {
            state: null,
            replaceState: (...args) => { metodos.push('replace'); chamadas.push(args); },
            pushState: (...args) => { metodos.push('push'); chamadas.push(args); },
        }
    };
    const contexto = {
        Estado: { ciclos: [{ ini: '2026-09-08' }, { ini: '2026-10-08' }] },
        URL,
        URLSearchParams,
        window: janela,
        el: id => elementos[id],
        dataISO: valor => valor
    };
    vm.createContext(contexto);
    vm.runInContext(`${fonte.slice(inicio, fim)}; globalThis.regras = { aplicarCicloDaUrl, sincronizarCicloNaUrl };`, contexto);
    return { contexto, elementos, chamadas, metodos };
}

test('URL restaura somente um ciclo único pelo mês de início', () => {
    const { contexto, elementos } = criarContexto('https://exemplo.test/?ciclo=2026-10');
    contexto.regras.aplicarCicloDaUrl();
    assert.equal(elementos.compDe.value, 1);
    assert.equal(elementos.compAte.value, 1);
});

test('URL inclui ciclo para De igual a Até e remove ao comparar', () => {
    const unico = criarContexto('https://exemplo.test/', { compDe: '0', compAte: '0' });
    unico.contexto.regras.sincronizarCicloNaUrl();
    assert.equal(unico.chamadas[0][2], '/?ciclo=2026-09');

    const comparar = criarContexto('https://exemplo.test/?ciclo=2026-09', { compDe: '0', compAte: '1' });
    comparar.contexto.regras.sincronizarCicloNaUrl();
    assert.equal(comparar.chamadas[0][2], '/');
});

test('?ciclo=backlog restaura o Backlog (De=-1), quando a opção existe no combo', () => {
    const { contexto, elementos } = criarContexto('https://exemplo.test/?ciclo=backlog',
        { compDe: '', compAte: '' }, [{ value: '-1' }, { value: '0' }, { value: '1' }]);
    contexto.regras.aplicarCicloDaUrl();
    assert.equal(elementos.compDe.value, -1);
});

test('?ciclo=backlog não é imposto quando a opção não existe (sem Backlog no combo)', () => {
    const { contexto, elementos } = criarContexto('https://exemplo.test/?ciclo=backlog', { compDe: '', compAte: '' });
    contexto.regras.aplicarCicloDaUrl();
    assert.equal(elementos.compDe.value, '');   // mantém o padrão seguro, não força nada
});

test('selecionar o Backlog (De=-1) grava ?ciclo=backlog na URL, sem exigir De==Até', () => {
    const { contexto, chamadas } = criarContexto('https://exemplo.test/', { compDe: '-1', compAte: '1' });
    contexto.regras.sincronizarCicloNaUrl();
    assert.equal(chamadas[0][2], '/?ciclo=backlog');
});

test('sair do Backlog pra uma comparação de verdade remove o ?ciclo=backlog da URL', () => {
    const { contexto, chamadas } = criarContexto('https://exemplo.test/?ciclo=backlog', { compDe: '0', compAte: '1' });
    contexto.regras.sincronizarCicloNaUrl();
    assert.equal(chamadas[0][2], '/');
});

test('primeira sincronização da sessão nunca empurra histórico, mesmo gravando ?ciclo', () => {
    const { contexto, metodos } = criarContexto('https://exemplo.test/', { compDe: '0', compAte: '0' });
    contexto.regras.sincronizarCicloNaUrl();
    assert.deepEqual(metodos, ['replace']);
});

test('trocar de ciclo de verdade empurra uma entrada de histórico', () => {
    const { contexto, elementos, chamadas, metodos } = criarContexto('https://exemplo.test/', { compDe: '0', compAte: '0' });
    contexto.regras.sincronizarCicloNaUrl();   // 1a sincronização: sempre replace
    elementos.compDe.value = '1'; elementos.compAte.value = '1';   // usuário navegou pro próximo ciclo
    contexto.regras.sincronizarCicloNaUrl();
    assert.deepEqual(metodos, ['replace', 'push']);
    assert.equal(chamadas[1][2], '/?ciclo=2026-10');
});

test('redesenho que mantém o mesmo ciclo nunca empurra, só substitui (sem acumular histórico)', () => {
    const { contexto, metodos } = criarContexto('https://exemplo.test/', { compDe: '0', compAte: '0' });
    contexto.regras.sincronizarCicloNaUrl();
    contexto.regras.sincronizarCicloNaUrl();   // ex.: digitar num filtro de coluna, sem mudar o ciclo
    assert.deepEqual(metodos, ['replace', 'replace']);
});

test('voltar do Backlog pra um ciclo único também conta como troca de ciclo (push)', () => {
    const { contexto, elementos, metodos } = criarContexto('https://exemplo.test/',
        { compDe: '-1', compAte: '1' }, [{ value: '-1' }, { value: '0' }, { value: '1' }]);
    contexto.regras.sincronizarCicloNaUrl();   // Backlog: 1a sincronização, replace
    elementos.compDe.value = '0'; elementos.compAte.value = '0';
    contexto.regras.sincronizarCicloNaUrl();
    assert.deepEqual(metodos, ['replace', 'push']);
});

test('Voltar/Avançar do navegador: popstate relê a URL e redesenha sem rebuscar o Supabase', () => {
    const interacoes = fs.readFileSync('js/interactions.js', 'utf8');
    const bootstrap = fs.readFileSync('js/bootstrap.js', 'utf8');
    const inicioPopstate = bootstrap.indexOf("window.addEventListener('popstate'");
    assert.ok(inicioPopstate >= 0, 'não achou o listener de popstate');
    const trechoPopstate = bootstrap.slice(inicioPopstate, bootstrap.indexOf('\n});', inicioPopstate) + 4);
    assert.match(trechoPopstate, /if \(!Estado\.ciclos\.length\) return;/);
    assert.match(trechoPopstate, /aplicarCicloDaUrl\(\);\s*\n\s*desenhar\(\);/);
    assert.doesNotMatch(trechoPopstate, /carregarDados|await load/);   // nunca rebusca o Supabase
    assert.match(interacoes, /function desenhar\(\) \{/);   // desenhar() precisa existir antes do bootstrap.js carregar
});

test('regra documentada em REGRAS.md', () => {
    assert.match(regrasMd, /`\?ciclo=backlog` para o Backlog \(De sozinho, Até fica desabilitado nesse modo\)/);
    assert.match(regrasMd, /Um `ciclo=backlog` não imposto quando a opção não existe no combo De mantém o ciclo padrão seguro/);
    assert.match(regrasMd, /Trocar de ciclo único ou entrar\/sair do Backlog empurra uma entrada no histórico do navegador/);
});

test('tela de login tira ?ciclo da URL e aplica o ciclo pedido depois de entrar', () => {
    const { contexto, elementos, chamadas, metodos } = criarContexto('https://exemplo.test/?ciclo=2026-10&x=1');
    vm.runInContext('globalThis.tirar = tirarCicloDaUrl;', contexto);
    contexto.tirar();
    assert.equal(chamadas[0][2], '/?x=1');
    assert.equal(metodos[0], 'replace');
    // Depois do login a URL já não tem ciclo, mas o pedido guardado vale uma vez.
    contexto.window.location.search = '?x=1';
    contexto.regras.aplicarCicloDaUrl();
    assert.equal(elementos.compDe.value, 1);
    elementos.compDe.value = 0; elementos.compAte.value = 0;
    contexto.regras.aplicarCicloDaUrl();
    assert.equal(elementos.compDe.value, 0);
});

test('sem Sair no fin: a tela de login sempre guarda o ciclo pedido', () => {
    const boot = fs.readFileSync('js/bootstrap.js', 'utf8');
    assert.match(boot, /if \(!logado\) tirarCicloDaUrl\(\);/);
    assert.doesNotMatch(boot, /el\('sair'\)|signOut/);
    assert.match(regrasMd, /Na tela de login a URL nunca mostra `\?ciclo`/);
    assert.match(regrasMd, /Não há botão de sair no fin: o login e o Sair ficam só na página inicial do hub/);
});
