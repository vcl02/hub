// Organização documental: regras financeiras em docs e nenhuma dependência do diretório legado.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');

test('mantém regras em docs e remove referências ao diretório legado', () => {
    assert.equal(fs.existsSync('docs/REGRAS.md'), true);
    assert.equal(fs.existsSync('REGRAS.md'), false);

    const diretorioLegado = `.${'claude'}`;
    const arquivos = ['AGENTS.md', 'docs/CHECKLIST-PUBLICACAO.md', 'scripts/check-style.mjs'];
    arquivos.forEach(arquivo => {
        const texto = fs.readFileSync(arquivo, 'utf8');
        assert.equal(texto.includes(diretorioLegado), false);
    });
});

test('recomenda apenas extensões opcionais alinhadas ao projeto', () => {
    const recomendacoes = JSON.parse(fs.readFileSync('.vscode/extensions.json', 'utf8')).recommendations;
    assert.deepEqual(recomendacoes, ['editorconfig.editorconfig']);
});

test('limita o MCP do Supabase ao projeto fin e a consultas', () => {
    const configuracao = JSON.parse(fs.readFileSync('.mcp.json', 'utf8'));
    const servidor = configuracao.mcpServers.supabase;
    const url = new URL(servidor.url);

    assert.equal(servidor.type, 'http');
    assert.equal(url.hostname, 'mcp.supabase.com');
    assert.equal(url.searchParams.get('project_ref'), 'yzmyncxoskvqzdczaill');
    assert.equal(url.searchParams.get('read_only'), 'true');
    assert.equal(url.searchParams.get('features'), 'database,docs');
});

test('exige confirmação antes de ações remotas que não sejam de leitura', () => {
    const agentes = fs.readFileSync('AGENTS.md', 'utf8');
    const decisoes = fs.readFileSync('docs/DECISOES.md', 'utf8');
    const checklist = fs.readFileSync('docs/CHECKLIST-PUBLICACAO.md', 'utf8');

    assert.match(agentes, /Consultas somente de leitura ao Supabase, como `SELECT`/);
    assert.match(agentes, /Antes de qualquer operação remota que possa mudar estado/);
    assert.match(decisoes, /qualquer ação remota que altere estado exige confirmação explícita prévia/);
    assert.match(checklist, /obtenha confirmação explícita antes de aplicá-la/);
});
