// Guardrail de documentação: cada camada deve declarar intenção antes da implementação.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

function primeiraLinhaSignificativa(arquivo) {
    return (fs.readFileSync(arquivo, 'utf8').split(/\r?\n/).find(linha => linha.trim() !== '') || '').trimStart();
}

function arquivosDaPasta(pasta, extensao) {
    return fs.readdirSync(pasta)
        .filter(nome => nome.endsWith(extensao))
        .map(nome => path.join(pasta, nome));
}

test('código, estilos, migrations e testes começam explicando sua responsabilidade', () => {
    arquivosDaPasta('js', '.js').forEach(arquivo =>
        assert.match(primeiraLinhaSignificativa(arquivo), /^\/\//, `${arquivo} precisa de cabeçalho`));
    arquivosDaPasta('css', '.css').forEach(arquivo =>
        assert.match(primeiraLinhaSignificativa(arquivo), /^\/\*/, `${arquivo} precisa de cabeçalho`));
    arquivosDaPasta('migrations', '.sql').forEach(arquivo =>
        assert.match(primeiraLinhaSignificativa(arquivo), /^--/, `${arquivo} precisa de cabeçalho`));
    arquivosDaPasta('tests', '.test.js').forEach(arquivo =>
        assert.match(primeiraLinhaSignificativa(arquivo), /^\/\//, `${arquivo} precisa de cabeçalho`));
});

test('HTML explica as regiões que o JavaScript altera dinamicamente', () => {
    const html = fs.readFileSync('index.html', 'utf8');
    assert.match(html, /<!-- Casca de autenticação:/);
    assert.match(html, /<!-- Painel único estático:/);
    assert.match(html, /<!-- Cadastro único para lançamento real e simulado;/);
});

test('REGRAS.md legível: uma frase por linha nos itens e subtítulos nas seções longas', () => {
    const regras = fs.readFileSync('docs/REGRAS.md', 'utf8');
    const linhas = regras.split('\n');
    // Itens longos ficam quebrados em frases (linhas de continuação recuadas, mesmo item no
    // Markdown renderizado); nenhuma linha volta a ter milhares de caracteres.
    assert.ok(Math.max(...linhas.map(l => l.length)) <= 700);
    assert.ok(linhas.filter(l => /^  \S/.test(l)).length > 300);
    // Continuação nunca começa com "-", "#" ou número seguido de ponto (viraria lista/título).
    assert.ok(!linhas.some(l => /^  (- |#|\d+\. )/.test(l)));
    for (const titulo of ['## Convenções gerais', '### Valores, linhas reais e edição na tabela', '### Diagnóstico da carga',
        '## Faturas', '### Dois cartões e limites', '## Aportes e resgates', '### Recargas e consolidação automática',
        '## Mobile', '### Cabeçalho e controles', '## Conta restrita (Isabella)']) {
        assert.ok(linhas.includes(titulo), titulo);
    }
});

test('REGRAS.md: compra no cartão da Isabella é Débito "Isabella, Fatura", sem cartão novo', () => {
    const regras = fs.readFileSync('docs/REGRAS.md', 'utf8');
    assert.match(regras, /Compra que vai sair no \*\*cartão dela\*\* \(Natal, Ano Novo, parcelados\) não é Crédito do mantenedor nem cartão novo no app: é um \*\*Débito\*\* comum com categoria `Isabella, Fatura`/);
    assert.match(regras, /quando a fatura real fechar, ela recebe o total da fatura \*\*menos\*\* os itens já lançados naquele mês/);
    // As regras que sustentam a convenção continuam no código: "Fatura" tira do teto Isabella e
    // só "Antecipação" + "Fatura" é transferência.
    const graficos = fs.readFileSync('js/charts.js', 'utf8');
    const shared = fs.readFileSync('js/shared.js', 'utf8');
    assert.match(graficos, /return categorias\.includes\('isabella'\) && !categorias\.includes\('fatura'\) && !semAcento\(r\.nome\)\.includes\('fatura'\) && !r\.comprometido;/);
    assert.match(shared, /return c\.includes\('antecipacao'\) && c\.includes\('fatura'\);/);
});
