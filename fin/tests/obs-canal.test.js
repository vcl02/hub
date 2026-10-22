// Regressão: colunas Obs (texto livre) e Canal (de onde a conta é paga/consultada), com
// edição inline igual às demais colunas livres. Canal ganha um ícone de abrir link quando o
// valor é uma URL http(s), sem entrar em edição nem selecionar a linha ao clicar nele.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');
const vm = require('node:vm');

const estado = fs.readFileSync('js/app-state.js', 'utf8');
const tabelas = fs.readFileSync('js/tables.js', 'utf8');
const interacoes = fs.readFileSync('js/interactions.js', 'utf8');
const estilos = fs.readFileSync('css/dashboard.css', 'utf8');
const estilosForm = fs.readFileSync('css/forms.css', 'utf8');
const regras = fs.readFileSync('docs/REGRAS.md', 'utf8');
const migracao = fs.readFileSync('migrations/19-obs-canal-lancamentos.sql', 'utf8');

test('colunas obs e canal existem em COLS, como texto', () => {
    assert.match(estado, /\['obs', 'Obs', 't'\]/);
    assert.match(estado, /\['canal', 'Canal', 't'\]/);
});

test('célula Obs só é clicável pra linha real fora da conta restrita', () => {
    assert.match(tabelas, /const celObs = r => ehLinhaReal\(r\) && !modoRestrito\(\)\s*\n\s*\? `<span class="togObs" data-tog-obs=/);
    assert.match(tabelas, /chave == 'obs' \? celObs\(r\)/);
});

test('célula Canal é clicável igual às demais, ganha ícone de copiar sempre que houver valor, e ícone de link extra quando o valor é http(s)', () => {
    assert.match(tabelas, /const ehUrlHttp = texto => \/\^https\?:\\\/\\\/\/i\.test/);
    assert.match(tabelas, /class="togCanal" data-tog-canal=/);
    assert.match(tabelas, /class=copiarCanal data-copiar-canal="\$\{escapeHtml\(String\(r\.id\)\)\}" title="Copiar" aria-label="Copiar">/);
    // SEM stopPropagation no botão de copiar: o clique precisa borbulhar até #out pro
    // handler delegado (data-copiar-canal, em interactions.js) rodar — ele mesmo chama
    // stopImmediatePropagation depois de copiar, pra não cair na seleção de linha.
    assert.doesNotMatch(tabelas, /class=copiarCanal[^>]*onclick/);
    assert.match(tabelas, /class=linkCanal href="\$\{escapeHtml\(bruto\)\}" target=_blank rel="noopener noreferrer"/);
    assert.match(tabelas, /onclick="event\.stopPropagation\(\)"/);   // continua só no <a> de abrir link
    assert.match(tabelas, /chave == 'canal' \? celCanal\(r\)/);
});

// Extrai celCanal (e sua dependência ehUrlHttp) do arquivo real e roda isolada, com
// ehLinhaReal/modoRestrito/escapeHtml/textoOuTraco simulados.
function carregaCelCanal({ linhaReal = true, restrito = false } = {}) {
    const inicio = tabelas.indexOf('const ehUrlHttp = texto =>');
    const fim = tabelas.indexOf('\n};', tabelas.indexOf('const celCanal = r =>')) + 3;
    if (inicio < 0 || fim < 3) throw Error('Não encontrou celCanal em tables.js.');
    const contexto = {
        ehLinhaReal: () => linhaReal,
        modoRestrito: () => restrito,
        escapeHtml: v => String(v),
        textoOuTraco: v => (v == null || v === '' ? '—' : v),
    };
    vm.createContext(contexto);
    vm.runInContext(`${tabelas.slice(inicio, fim)}\nglobalThis.celCanal = celCanal;`, contexto);
    return contexto.celCanal;
}

test('Canal com URL http(s) mostra os ícones de copiar e de link; texto comum (chave Pix) mostra só o de copiar; vazio não mostra nenhum', () => {
    const celCanal = carregaCelCanal();
    const comLink = celCanal({ id: 9, canal: 'https://www.enel.com.br/minha-conta' });
    assert.match(comLink, /class=copiarCanal/);
    assert.match(comLink, /class=linkCanal/);
    assert.match(comLink, /href="https:\/\/www\.enel\.com\.br\/minha-conta"/);

    const semLink = celCanal({ id: 9, canal: 'chave-pix@banco.com' });
    assert.match(semLink, /class=copiarCanal/);
    assert.doesNotMatch(semLink, /class=linkCanal/);

    const vazio = celCanal({ id: 9, canal: null });
    assert.doesNotMatch(vazio, /class=copiarCanal/);
    assert.doesNotMatch(vazio, /class=linkCanal/);
});

test('conta restrita/linha não-real também trunca o texto do Canal (celCanalTexto), só sem o clique de edição — mas copiar/abrir continuam disponíveis', () => {
    const celCanal = carregaCelCanal({ restrito: true });
    const html = celCanal({ id: 9, canal: 'https://www.enel.com.br/minha-conta' });
    assert.match(html, /class=celCanalTexto/);
    assert.doesNotMatch(html, /data-tog-canal/);
    assert.match(html, /class=copiarCanal/);   // copiar continua disponível (não altera dado)
    assert.match(html, /class=linkCanal/);     // o ícone de link continua aparecendo
});

test('estilos: Canal tem largura fixa com reticências; os ícones de copiar/link ficam em evidência, sem serem cortados', () => {
    assert.match(estilos, /\.togCanal, \.celCanalTexto \{/);
    assert.match(estilos, /max-width: 9rem;\s*\n\s*overflow: hidden;\s*\n\s*text-overflow: ellipsis;\s*\n\s*white-space: nowrap;/);
    assert.match(estilos, /\.linkCanal, \.copiarCanal \{[\s\S]*?flex: none;/);
    assert.match(estilos, /\.linkCanal, \.copiarCanal \{[\s\S]*?border-radius: 50%;/);
    // o <button> de copiar não herda a mãozinha do <a> por padrão — precisa do cursor
    // explícito, senão parece não-clicável.
    assert.match(estilos, /\.linkCanal, \.copiarCanal \{[\s\S]*?cursor: pointer;/);
});

test('clique em Obs abre input de texto livre; clique em Canal idem, com placeholder de URL', async () => {
    const { editar } = require('./helpers/editor-inline');
    let r = await editar('data-tog-obs', { obs: null }, '  ligar antes  ');
    assert.match(r.html, /<input type=text class=inpObs value="">/);
    assert.deepEqual(r.gravado, { obs: 'ligar antes' });
    r = await editar('data-tog-obs', { obs: 'x' }, '');
    assert.deepEqual(r.gravado, { obs: null });

    r = await editar('data-tog-canal', { canal: 'https://a.test' }, 'https://b.test');
    assert.match(r.html, /<input type=text class=inpCanal value="https:\/\/a\.test" placeholder="Ex\.: https:\/\/\.\.\.">/);
    assert.deepEqual(r.gravado, { canal: 'https://b.test' });
    r = await editar('data-tog-canal', { canal: 'https://a.test' }, '');
    assert.deepEqual(r.gravado, { canal: null });
});

test('clique no ícone de copiar do Canal usa a Clipboard API e nunca entra em edição', () => {
    assert.match(interacoes, /const botao = e\.target\.closest\('\[data-copiar-canal\]'\);\s*\n\s*if \(!botao\) return;\s*\n\s*e\.stopImmediatePropagation\(\);/);
    assert.match(interacoes, /navigator\.clipboard\.writeText\(String\(r\.canal\)\)\.then\(/);
    assert.match(interacoes, /mostrarToast\('Copiado', String\(r\.canal\)\)/);
    assert.match(interacoes, /mostrarToast\('Falhou ao copiar'/);
});

test('toast quebra texto sem espaço (chave Pix) em vez de estourar a largura fixa', () => {
    assert.match(estilosForm, /\.toast p \{[\s\S]*?overflow-wrap: break-word;/);
});

test('migration já aplicada pelo mantenedor, documentada no repo', () => {
    assert.match(migracao, /^-- /);
    assert.match(migracao, /add column obs varchar\(255\);/);
    assert.match(migracao, /add column canal varchar\(255\);/);
});

test('regra documentada em REGRAS.md', () => {
    assert.match(regras, /`fin\.obs` \(observação livre\) e `fin\.canal`/);
    assert.match(regras, /A coluna Canal tem largura fixa: texto que não couber vira "…"/);
    assert.match(regras, /Sempre que Canal tiver algum valor, a célula ganha um ícone redondo de copiar o texto pra área de transferência/);
    assert.match(regras, /serve pra chave Pix, que não é um link pra abrir/);
    assert.match(regras, /Quando o valor também é uma URL `http\(s\)`, aparece um segundo ícone redondo de abrir link numa aba nova/);
    assert.match(regras, /Os dois ícones ficam sempre em evidência, nunca cortados pelo texto truncado/);
    assert.match(regras, /funcionam mesmo na conta restrita\/mobile, já que copiar ou abrir não altera dado nenhum/);
    assert.match(regras, /Nenhum dos dois campos participa de cálculo financeiro/);
});
