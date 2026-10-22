// Contrato de sugestões do Nome: lista distinta, categoria recente e texto livre no formulário.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');
const vm = require('node:vm');

const html = fs.readFileSync('index.html', 'utf8');
const fonte = fs.readFileSync('js/form.js', 'utf8');
const inicio = fonte.indexOf('function sugestoesDeNome(');
const fim = fonte.indexOf('\nfunction popularNomesNoForm()', inicio);
if (inicio < 0 || fim < 0) throw Error('Não encontrou a regra de sugestões de nome.');

const contexto = {
    semAcento: valor => String(valor ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase(),
    valorValido: valor => typeof valor === 'string' && valor.trim().length > 0,
    dataISO: valor => valor ? String(valor).slice(0, 10) : '',
};
vm.createContext(contexto);
vm.runInContext(`${fonte.slice(inicio, fim)}; globalThis.sugestoesDeNome = sugestoesDeNome;`, contexto);

test('nome aceita texto livre e oferece combo próprio filtrado', () => {
    assert.match(html, /<input type=text id=fNome required/);
    assert.match(html, /<div class=nomesExistentes id=nomesExistentes role=listbox/);
    assert.match(fonte, /semAcento\(nome\)\.includes\(filtro\)/);
    assert.match(fonte, /categoria\.textContent = categ;/);
    assert.match(fonte, /atualizarFaturasDoFormulario\(\);/);
});

test('lista nomes distintos e conserva a categoria da ocorrência mais recente', () => {
    const sugestoes = contexto.sugestoesDeNome([
        { nome: 'Mercado', categ: 'Casa', data: '2026-01-10' },
        { nome: 'mercádo ', categ: 'Alimentação', data: '2026-02-10' },
        { nome: 'Aluguel', categ: 'Casa', data: '2026-01-01' },
        { nome: '', categ: 'Ignorar', data: '2026-03-01' },
    ]);
    assert.deepEqual(Array.from(sugestoes, item => ({ ...item })), [
        { nome: 'Aluguel', categ: 'Casa', data: '2026-01-01' },
        { nome: 'mercádo', categ: 'Alimentação', data: '2026-02-10' },
    ]);
});
