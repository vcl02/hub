// Clique duplo e rede lenta: Nova meta/Excluir meta gravam uma vez só, os selos (Pago, Reserva,
// Comprometido, Pra sempre) ignoram o clique com o PATCH no ar e a carga volta sozinha com a conexão.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');
const vm = require('node:vm');
const { extrairTrecho } = require('./helpers/carregar-funcoes');

const interacoes = fs.readFileSync('js/interactions.js', 'utf8');
const inicializacao = fs.readFileSync('js/bootstrap.js', 'utf8');
const regras = fs.readFileSync('docs/REGRAS.md', 'utf8');

function carregaMetas() {
    const chamadas = [];
    const pendentes = [];
    const contexto = {
        Estado: { simulando: false, metas: [{ id: 7, nome: 'Mesa' }] },
        normalizarMeta: m => m,
        desenhar: () => {},
        mostrarToast: () => {},
        // Cada gravação fica no ar até o teste liberar (rede lenta).
        inserirMeta: campos => { chamadas.push(['inserir', campos.nome]); return new Promise(r => pendentes.push(() => r({ id: 8, ...campos }))); },
        excluirMeta: id => { chamadas.push(['excluir', id]); return new Promise(r => pendentes.push(() => r({ id }))); },
        atualizarMeta: async (id, campos) => { chamadas.push(['atualizar', id]); return { id, ...campos }; },
    };
    vm.createContext(contexto);
    vm.runInContext(`${extrairTrecho(interacoes, 'const metasNoAr', '// Botões de sugestão da meta')}\nglobalThis.gravar = gravarMudancaDaMeta;`, contexto);
    return { gravar: contexto.gravar, chamadas, liberar: () => pendentes.splice(0).forEach(r => r()), Estado: contexto.Estado };
}

test('Nova meta com clique duplo cria uma meta só; depois de gravada, o próximo clique cria outra', async () => {
    const { gravar, chamadas, liberar, Estado } = carregaMetas();
    const primeiro = gravar('inserir', null, { nome: 'Nova meta' });
    const segundo = gravar('inserir', null, { nome: 'Nova meta' });   // 2º clique com o 1º no ar
    liberar();
    await Promise.all([primeiro, segundo]);
    assert.deepEqual(chamadas, [['inserir', 'Nova meta']]);
    assert.equal(Estado.metas.length, 2);
    const terceiro = gravar('inserir', null, { nome: 'Nova meta' });
    liberar();
    await terceiro;
    assert.equal(chamadas.length, 2);
});

test('Excluir meta com o pedido no ar não manda outro DELETE; atualizar segue livre', async () => {
    const { gravar, chamadas, liberar } = carregaMetas();
    const um = gravar('excluir', 7);
    const dois = gravar('excluir', 7);
    await gravar('atualizar', 7, { nome: 'Mesa nova' });
    liberar();
    await Promise.all([um, dois]);
    assert.deepEqual(chamadas, [['excluir', 7], ['atualizar', 7]]);
});

test('selos ignoram o clique com o PATCH daquele selo no ar, e liberam no fim (deu certo ou não)', () => {
    assert.match(interacoes, /const togglesNoAr = new Set\(\);/);
    assert.match(interacoes, /if \(!r \|\| togglesNoAr\.has\(`pago:\$\{id\}`\)\) return;/);
    assert.match(interacoes, /if \(!r \|\| togglesNoAr\.has\(`\$\{campo\}:\$\{id\}`\)\) return;/);
    assert.match(interacoes, /\} finally \{\n        togglesNoAr\.delete\(`pago:\$\{id\}`\);/);
    assert.match(interacoes, /\} finally \{\n        togglesNoAr\.delete\(`\$\{campo\}:\$\{id\}`\);/);
});

test('voltou a conexão: carga que falhou é refeita sozinha; já carregada, recarrega em silêncio com a tela livre', () => {
    assert.match(inicializacao, /addEventListener\('online', \(\) => \{\n    if \(el\('app'\)\.style\.display === 'none' \|\| Estado\.cargasEmAndamento\) return;\n    if \(!Estado\.ultimaCarga\) load\(\);\n    else if \(telaLivreParaRecarregar\(\)\) recarregarDados\(\);/);
    assert.match(regras, /Voltou a conexão/);
    assert.match(regras, /Clique duplo/);
});
