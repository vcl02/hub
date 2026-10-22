// Contrato da notificacao: um e-mail Resend só sai depois de um build nativo do Pages bem-sucedido.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');

const workflow = fs.readFileSync('.github/workflows/avisar-pages-publicado.yml', 'utf8');

test('avisa somente o build publicado pelo Pages, identificando o commit e sem expor credenciais', () => {
    assert.match(workflow, /^on:\n  page_build:/m);
    assert.match(workflow, /github\.event\.build\.status == 'built'/);
    assert.match(workflow, /PAGES_COMMIT: \$\{\{ github\.event\.build\.commit \}\}/);
    assert.match(workflow, /RESEND_API_KEY: \$\{\{ secrets\.RESEND_API_KEY \}\}/);
    assert.match(workflow, /RESEND_FROM: \$\{\{ vars\.RESEND_FROM \}\}/);
    assert.match(workflow, /RESEND_TO: \$\{\{ vars\.RESEND_TO \}\}/);
    assert.match(workflow, /https:\/\/api\.resend\.com\/emails/);
    assert.match(workflow, /Idempotency-Key/);
    assert.doesNotMatch(workflow, /actions\/setup-node/);
    assert.doesNotMatch(workflow, /re_[A-Za-z0-9]/);
    const script = workflow.match(/node <<'NODE'\n([\s\S]*?)\n          NODE/)[1];
    assert.doesNotThrow(() => new Function(script));
});

test('páginas estáticas não passam pelo processamento Jekyll do Pages', () => {
    assert.ok(fs.existsSync('.nojekyll'));
});
