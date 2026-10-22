// Regressão da carga paginada: o limite por resposta do Supabase não pode truncar a base.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');
const vm = require('node:vm');

const fonte = fs.readFileSync('js/supabase-api.js', 'utf8');
const inicio = fonte.indexOf('const LIMITE_REQUISICAO_MS');
const fim = fonte.indexOf('const normalizarCategoriasNoPayload', inicio);
const codigo = fonte.slice(inicio, fim);

function carregarBusca(fetch) {
    const contexto = {
        API: 'https://fin.supabase.test',
        KEY: 'chave-publica',
        TAMANHO_LOTE_SUPABASE: 1000,
        encodeURIComponent,
        fetch,
        setTimeout, clearTimeout, AbortController,
        sb: { auth: {
            getSession: async () => ({ data: { session: { access_token: 'sessao' } } }),
            refreshSession: async () => {},
        } },
    };
    vm.runInNewContext(`${codigo}; this.buscarTestada = buscar;`, contexto);
    return contexto.buscarTestada;
}

test('busca todos os lotes em ordem de id até receber um lote incompleto', async () => {
    const registros = Array.from({ length: 1491 }, (_, indice) => ({ id: indice * 3 + 1 }));
    const urls = [];
    const buscar = carregarBusca(async url => {
        urls.push(url);
        const ultimo = new URL(url).searchParams.get('id');
        const depoisDe = ultimo ? Number(ultimo.replace('gt.', '')) : -Infinity;
        const lote = registros.filter(r => r.id > depoisDe).slice(0, 1000);
        return { ok: true, status: 200, text: async () => JSON.stringify(lote) };
    });

    const resultado = await buscar('fin');

    assert.equal(resultado.length, 1491);
    assert.equal(resultado[0].id, 1);
    assert.equal(resultado.at(-1).id, 4471);
    assert.equal(urls.length, 2);
    assert.match(urls[0], /order=id\.asc&limit=1000$/);
    assert.match(urls[1], /id=gt\.2998$/);
});

test('reinicia a carga após 401 entre lotes sem duplicar registros', async () => {
    const chamadas = [];
    let falhou = false;
    const buscar = carregarBusca(async url => {
        chamadas.push(url);
        const segundoLote = url.includes('id=gt.1000');
        if (segundoLote && !falhou) {
            falhou = true;
            return { ok: false, status: 401, text: async () => 'expirou' };
        }
        const lote = segundoLote ? [{ id: 1001 }] : Array.from({ length: 1000 }, (_, i) => ({ id: i + 1 }));
        return { ok: true, status: 200, text: async () => JSON.stringify(lote) };
    });

    const resultado = await buscar('fin');

    assert.equal(resultado.length, 1001);
    assert.equal(new Set(resultado.map(r => r.id)).size, 1001);
    assert.equal(chamadas.filter(url => !url.includes('id=gt.')).length, 2);
});
