// Regressão: com sinal ruim (metrô), um fetch sem teto ficava pendente pra sempre e o
// cadastro/edição travava em "Salvando…". Roda as funções reais de js/supabase-api.js com
// fetch simulado e limites encurtados: teto por tentativa, repetição só do que é idempotente
// (carga/UPDATE/DELETE) e INSERT nunca repetido sozinho.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');
const vm = require('node:vm');

const fonte = fs.readFileSync('js/supabase-api.js', 'utf8');
const regras = fs.readFileSync('docs/REGRAS.md', 'utf8');

// fetch que nunca responde, mas respeita o AbortController como o navegador.
const pendurado = (url, opcoes) => new Promise((_, rejeita) => {
    opcoes.signal.addEventListener('abort', () => rejeita(Object.assign(Error('aborted'), { name: 'AbortError' })));
});
const resposta = (corpo, status = 200) => ({ ok: status < 400, status, text: async () => JSON.stringify(corpo) });

function carregaApi(fetch, { sessaoTrava = false } = {}) {
    const inicio = fonte.indexOf('const LIMITE_REQUISICAO_MS');
    const fim = fonte.indexOf('async function carregarDados()');
    const codigo = fonte.slice(inicio, fim)
        .replace('const LIMITE_REQUISICAO_MS = 12000;', 'const LIMITE_REQUISICAO_MS = 30;')
        .replace('const ESPERA_ENTRE_TENTATIVAS_MS = [1000, 2000];', 'const ESPERA_ENTRE_TENTATIVAS_MS = [1, 1];');
    const chamadas = [];
    const contexto = {
        API: 'https://fin.supabase.test', KEY: 'chave', TABELA_FIN: 'fin', TAMANHO_LOTE_SUPABASE: 1000,
        encodeURIComponent, setTimeout, clearTimeout, AbortController,
        normalizaCategorias: c => c,
        fetch: (url, opcoes) => { chamadas.push({ url, metodo: opcoes.method || 'GET', corpo: opcoes.body }); return fetch(url, opcoes, chamadas.length); },
        sb: { auth: {
            getSession: async () => sessaoTrava ? new Promise(() => {}) : ({ data: { session: { access_token: 't' } } }),
            refreshSession: async () => {},
        } },
    };
    vm.createContext(contexto);
    vm.runInContext(`${codigo}\nglobalThis.api = { inserirLancamentos, inserirLancamento, atualizarLancamento, atualizarLancamentos, excluirLancamento, buscar, LIMITE_REQUISICAO_MS };`, contexto);
    return { api: contexto.api, chamadas };
}

test('limite real: 12 s por tentativa', () => {
    assert.match(fonte, /const LIMITE_REQUISICAO_MS = 12000;/);
    assert.match(fonte, /const TENTATIVAS_IDEMPOTENTES = 3;/);
});

test('UPDATE sem resposta: tenta 3 vezes e falha com erro marcado, sem ficar pendente', async () => {
    const { api, chamadas } = carregaApi(pendurado);
    await assert.rejects(api.atualizarLancamento(7, { valor: 1 }), err => {
        assert.equal(err.semResposta, true);
        assert.match(err.message, /^atualizar: sem resposta em 0\.03 s \(3 tentativas\) — pode tentar de novo/);
        return true;
    });
    assert.equal(chamadas.length, 3);
});

test('UPDATE volta ao normal se a 2ª tentativa responde', async () => {
    const { api, chamadas } = carregaApi((url, opcoes, n) => n === 1 ? pendurado(url, opcoes) : resposta([{ id: 7, valor: 1 }]));
    const linha = await api.atualizarLancamento(7, { valor: 1 });
    assert.equal(linha.id, 7);
    assert.equal(chamadas.length, 2);
});

test('erro HTTP é resposta de verdade: nunca repete', async () => {
    const { api, chamadas } = carregaApi(() => resposta({ message: 'RLS' }, 403));
    await assert.rejects(api.atualizarLancamento(7, { valor: 1 }), /atualizar: 403/);
    assert.equal(chamadas.length, 1);
});

test('conexão que cai na hora (Failed to fetch) também é repetida', async () => {
    const { api, chamadas } = carregaApi((url, opcoes, n) => n === 1 ? Promise.reject(TypeError('Failed to fetch')) : resposta([{ id: 7 }]));
    await api.atualizarLancamento(7, { pago: true });
    assert.equal(chamadas.length, 2);
});

test('INSERT sem resposta não repete e avisa que pode ter salvado', async () => {
    const { api, chamadas } = carregaApi(pendurado);
    await assert.rejects(api.inserirLancamento({ nome: 'X' }), err => {
        assert.equal(err.semResposta, true);
        assert.match(err.message, /sem confirmação: pode ter salvado\. Recarregue e confira antes de repetir/);
        return true;
    });
    assert.equal(chamadas.length, 1);
});

test('lote de INSERT vai num único POST com todas as linhas', async () => {
    const { api, chamadas } = carregaApi((url, opcoes) => resposta(JSON.parse(opcoes.body).map((p, i) => ({ ...p, id: i + 1 }))));
    const criadas = await api.inserirLancamentos([{ nome: 'A' }, { nome: 'B' }, { nome: 'C' }]);
    assert.equal(criadas.length, 3);
    assert.equal(chamadas.length, 1);
    assert.equal(chamadas[0].metodo, 'POST');
    assert.equal(JSON.parse(chamadas[0].corpo).length, 3);
});

test('UPDATE em lote usa id=in.(...) e exige todas as linhas de volta', async () => {
    const { api, chamadas } = carregaApi(() => resposta([{ id: 1 }, { id: 2 }]));
    await assert.rejects(api.atualizarLancamentos([1, 2, 3], { recorrencia_id: 1 }), /nenhuma linha atualizada/);
    assert.match(chamadas[0].url, /\?id=in\.\(1,2,3\)$/);
});

test('DELETE repetido: zero linhas só é sucesso se a linha não existe mais', async () => {
    // 1ª tentativa sem resposta (mas excluiu), 2ª devolve [], conferência confirma que sumiu.
    const sumiu = carregaApi((url, opcoes, n) => n === 1 ? pendurado(url, opcoes) : resposta([]));
    await sumiu.api.excluirLancamento(9);
    assert.match(sumiu.chamadas.at(-1).url, /\?select=id&id=eq\.9$/);
    // Ainda existe: é bloqueio de verdade (RLS), não pode fingir sucesso.
    const bloqueado = carregaApi((url, opcoes, n) => n === 1 ? pendurado(url, opcoes)
        : resposta(url.includes('select=id') ? [{ id: 9 }] : []));
    await assert.rejects(bloqueado.api.excluirLancamento(9), /nenhuma linha excluída/);
});

test('DELETE na 1ª tentativa com zero linhas continua sendo erro de RLS', async () => {
    const { api, chamadas } = carregaApi(() => resposta([]));
    await assert.rejects(api.excluirLancamento(9), /nenhuma linha excluída/);
    assert.equal(chamadas.length, 1);
});

test('sessão que não responde também estoura o limite', async () => {
    const { api } = carregaApi(() => resposta([]), { sessaoTrava: true });
    await assert.rejects(api.inserirLancamento({ nome: 'X' }), err => {
        assert.match(err.message, /^sessão: sem resposta em 0\.03 s$/);   // nada foi enviado: sem "pode ter salvado"
        return true;
    });
});

test('regra documentada em REGRAS.md', () => {
    assert.match(regras, /Rede instável \(ex\.: metrô\): toda chamada ao Supabase — inclusive a renovação da sessão — tem limite de 12 s/);
    assert.match(regras, /Carga, `UPDATE` e `DELETE` são idempotentes e tentam sozinhos até 3 vezes/);
    assert.match(regras, /`INSERT` nunca é repetido sozinho/);
    assert.match(regras, /O lote inteiro entra num único `INSERT`/);
});
