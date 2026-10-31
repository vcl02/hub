// Regressão: Frequência no cadastro gera a série da 1ª ocorrência até 31/12/2032 (Vezes
// fica desativado mostrando a contagem) e, no Crédito, só pede a 1ª fatura — as seguintes
// avançam mês a mês a partir dela. Sem Frequência, Vezes volta a ser editável e cada
// parcela escolhe sua fatura. Na tela (Vezes desativado e só a 1ª fatura, data exigida, a série até dez/2032 e o cadastro
// voltando ao normal): navegador-marcas.test.js.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');
const vm = require('node:vm');

const compartilhado = fs.readFileSync('js/shared.js', 'utf8');
const dominio = fs.readFileSync('js/domain.js', 'utf8');
const formulario = fs.readFileSync('js/form.js', 'utf8');
const pagina = fs.readFileSync('index.html', 'utf8');
const estilos = fs.readFileSync('css/forms.css', 'utf8');
const regras = fs.readFileSync('docs/REGRAS.md', 'utf8');

function regrasDaSerie() {
    const contexto = {
        Estado: { ciclos: [], faturas: [] },
        MESES: [],
        document: { getElementById: () => ({}) },
        setTimeout, clearTimeout,
    };
    vm.createContext(contexto);
    vm.runInContext(`${compartilhado}\nglobalThis.r = { ocorrenciasAteLimite, faturaDaOcorrencia, dataDaOcorrencia };`, contexto);
    return contexto.r;
}

test('a data-limite da série fica fixa em código: 31/12/2032', () => {
    assert.match(dominio, /const DATA_LIMITE_RECORRENCIA = '2032-12-31';/);
});

test('conta as ocorrências da 1ª data até o limite, inclusive, conforme a Frequência', () => {
    const r = regrasDaSerie();
    assert.equal(r.ocorrenciasAteLimite('2026-10-15', 'Mensal', '2032-12-31'), 75);   // out/2026..dez/2032
    assert.equal(r.ocorrenciasAteLimite('2029-12-31', 'Mensal', '2029-12-31'), 1);    // o próprio limite conta
    assert.equal(r.ocorrenciasAteLimite('2029-12-01', 'Semanal', '2029-12-31'), 5);   // 01, 08, 15, 22, 29
    assert.equal(r.ocorrenciasAteLimite('2029-01-31', 'Semestral', '2029-12-31'), 2); // jan e jul
    assert.equal(r.ocorrenciasAteLimite('2027-03-10', 'Anual', '2029-12-31'), 3);     // 2027, 2028, 2029
});

test('a 1ª ocorrência sempre é gravada, mesmo se já passar do limite', () => {
    const r = regrasDaSerie();
    assert.equal(r.ocorrenciasAteLimite('2030-02-01', 'Mensal', '2029-12-31'), 1);
});

test('fatura de cada ocorrência = 1ª fatura avançada pelos meses de calendário entre as datas', () => {
    const r = regrasDaSerie();
    const dataInicial = '2026-10-15';
    const faturas = [0, 1, 2, 3].map(p => r.faturaDaOcorrencia('2026-11-12', dataInicial, r.dataDaOcorrencia(dataInicial, p, 'Mensal')));
    assert.deepEqual(Array.from(faturas), ['2026-11-12', '2026-12-12', '2027-01-12', '2027-02-12']);
    // Semanal: só troca de fatura quando a data da ocorrência vira o mês.
    assert.equal(r.faturaDaOcorrencia('2026-11-12', '2026-10-25', '2026-10-31'), '2026-11-12');
    assert.equal(r.faturaDaOcorrencia('2026-11-12', '2026-10-25', '2026-11-01'), '2026-12-12');
    // Sempre a partir da 1ª: vencimento dia 31 não vai encurtando depois de passar por fevereiro.
    assert.equal(r.faturaDaOcorrencia('2027-01-31', '2026-12-05', '2027-01-05'), '2027-02-28');
    assert.equal(r.faturaDaOcorrencia('2027-01-31', '2026-12-05', '2027-02-05'), '2027-03-31');
});

test('Frequência vem antes de Vezes; a regra fica só num hover do rótulo, sem botão nem modal de ajuda', () => {
    assert.ok(pagina.indexOf('id=fFreq') < pagina.indexOf('id=fParcelas'));
    assert.match(pagina, /<label class=fm id=fParcelasWrap><span>Vezes<\/span>/);
    assert.match(pagina, /<label class=fm id=fFreqWrap for=fFreq><span title="Com Frequência: informe só a 1ª ocorrência; o cadastro gera uma a cada período até 31\/12\/2032[^"]*">Frequência<\/span>/);
    assert.match(pagina, /<label class=fm for=fCateg><span title="Besteira: [^"]*">Categorias <b class=req>\*<\/b><\/span>/);
    assert.doesNotMatch(pagina, /ajudaFrequencia|ajudaCategorias|btAjudaMini|modalAjuda/);
    assert.doesNotMatch(formulario, /ajudaFrequencia|ajudaCategorias|modalAjuda/);
    assert.doesNotMatch(estilos, /modalAjuda|btAjudaMini|\.ajudaCategorias/);
});

test('com Frequência, Vezes fica desativado e só existe o seletor da 1ª fatura; Vezes não muda mais a Frequência', () => {
    assert.doesNotMatch(formulario, /el\('fFreq'\)\.value = 'Mensal'/);
    // Duplicar/Editar herdam a Frequência: a abertura do modal reflete isso no Vezes e nas
    // faturas, sem congelar a sugestão automática como se fosse escolha manual.
    assert.match(formulario, /atualizaModoFrequencia\(\);\s*\n\s*atualizarFaturasDoFormulario\(idsFaturasDoFormulario\(false\)\);/);
});

test('ao salvar com Frequência: exige data, conta a série até o limite e expande a 1ª fatura', () => {
    assert.match(formulario, /const valores = !valorTotal \? Array\(freq \? parcelas : 1\)\.fill\(null\)/);
    assert.match(formulario, /salvaLancamentoParceladoNoBanco\(\{[^}]*faturaIds: faturasDaSerie \}\);/);
});

test('regra documentada em REGRAS.md', () => {
    assert.match(regras, /No cadastro, \*\*Frequência\*\* vem antes de \*\*Vezes\*\*, e as duas são modos excludentes/);
    assert.match(regras, /até `DATA_LIMITE_RECORRENCIA` \(31\/12\/2032, inclusive; em `js\/domain\.js`\)/);
    assert.match(regras, /a fatura de cada ocorrência é a 1ª fatura avançada pelo mesmo número de meses de calendário/);
    assert.match(regras, /Dividir continua valendo/);
    assert.match(regras, /Duplicar herda a Frequência do original — salvar um duplicado de algo Mensal gera a série inteira/);
    assert.match(regras, /Passar o mouse no rótulo Frequência resume essa regra num hover \(`title`\); não há botão nem modal de ajuda/);
});

test('rótulos Frequência e Categorias apontam pro próprio campo (for=), documentado em REGRAS.md', () => {
    assert.match(regras, /Os rótulos Frequência e Categorias apontam explicitamente pro próprio campo \(`for=`\): tocar no texto do rótulo foca o campo\./);
});

test('Frequência é um campo comum; Vezes e Dividir ficam numa linha fixa logo abaixo', () => {
    // Fora do grid, a Frequência recebe o mesmo espaçamento dos demais campos (inclusive
    // quando o mobile reparte a altura que sobra entre eles).
    assert.match(pagina, /<\/select>\s*\n\s*<\/label>\s*\n\s*\n\s*<!-- Vezes e Dividir[\s\S]*?-->\s*\n\s*<div class=parcelasLinha id=parcelasLinha>\s*\n\s*<label class=fm id=fParcelasWrap><span>Vezes<\/span>/);
    assert.match(estilos, /\.parcelasLinha \{\s*\n\s*display: flex;\s*\n\s*gap: \.6rem;\s*\n\s*align-items: end;/);
    assert.doesNotMatch(estilos, /grid-template-areas:\s*\n\s*"freq freq"|\.parcelasLinha:has\(/);
    assert.match(regras, /Frequência, Vezes, Dividir e Fatura têm posição fixa no cadastro \(exceção pontual registrada em `docs\/DECISOES\.md`\)/);
});

test('depois de salvar, a Frequência volta a "sem recorrência" e Vezes volta a ser editável', () => {
    assert.match(regras, /Depois de salvar, a Frequência volta a "sem recorrência" \(e Vezes volta a ser editável, com o valor que tinha antes da Frequência\)/);
    assert.match(regras, /abre marcado no Crédito, desmarcado no Débito, sempre alternável/);
});

test('AGENTS.md: o app é pessoal, sem dicas na tela; no máximo um hover', () => {
    assert.match(fs.readFileSync('AGENTS.md', 'utf8'), /O app é só do mantenedor: nada de dicas, guias, instruções na tela nem botões ou modais de ajuda\. Quando uma explicação for útil, no máximo um hover \(`title`\)\./);
});
