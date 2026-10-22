// Contrato PWA: instalação com manifest e cache limitado à interface, sem dados financeiros offline.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');

const html = fs.readFileSync('index.html', 'utf8');
const manifest = JSON.parse(fs.readFileSync('manifest.webmanifest', 'utf8'));
const bootstrap = fs.readFileSync('js/bootstrap.js', 'utf8');
const serviceWorker = fs.readFileSync('service-worker.js', 'utf8');

test('declara manifest instalável e cores coerentes com a interface', () => {
    // Aba discreta: título "." (vazio faria o navegador mostrar a URL no lugar).
    assert.match(html, /<title>\.<\/title>/);
    assert.match(fs.readFileSync('docs/REGRAS.md', 'utf8'), /O título da página \(aba do navegador\) é só `\.`/);
    assert.match(html, /<link rel=manifest href="\.\/manifest\.webmanifest">/);
    assert.match(html, /<link rel=icon type="image\/svg\+xml" href="\.\/icons\/fin-192\.svg">/);
    assert.match(html, /<meta name=theme-color content="#1B1E21">/);
    assert.equal(manifest.display, 'standalone');
    assert.equal(manifest.name, 'fin');
    assert.equal(manifest.short_name, 'fin');
    assert.equal(manifest.start_url, './');
    assert.equal(manifest.theme_color, '#1B1E21');
    assert.deepEqual(manifest.icons.map(icone => icone.sizes), ['192x192', '512x512']);
    assert.deepEqual(manifest.icons.map(icone => icone.type), ['image/png', 'image/png']);
    manifest.icons.forEach(icone => assert.ok(fs.existsSync(icone.src.replace('./', ''))));
});

test('ícones instaláveis são PNGs nos tamanhos declarados e mantêm a arte vetorial centralizada', () => {
    manifest.icons.forEach(icone => {
        const png = fs.readFileSync(icone.src.replace('./', ''));
        const tamanho = Number(icone.sizes.split('x')[0]);
        assert.deepEqual(png.subarray(0, 8), Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
        assert.equal(png.readUInt32BE(16), tamanho);
        assert.equal(png.readUInt32BE(20), tamanho);
    });
    // Um SVG só, o do favicon: o app instalado usa os PNGs do manifest.
    const svg = fs.readFileSync('icons/fin-192.svg', 'utf8');
    assert.match(svg, /viewBox="0 0 192 192"/);
    // Caixa total: x 41–151 e y 50–142; ambos os centros são exatamente 96.
    assert.match(svg, /M41 142V58h63/);
    assert.match(svg, /M115 112h8v30h-8zm14-22h8v52h-8zm14-40h8v92h-8z/);
    assert.deepEqual(fs.readdirSync('icons').sort(), ['fin-192.png', 'fin-192.svg', 'fin-512.png']);
});

test('registra service worker que atualiza a interface pela rede e cacheia só arquivos próprios', () => {
    assert.match(bootstrap, /navigator\.serviceWorker\.register\('\.\/service-worker\.js', \{ updateViaCache: 'none' \}\)/);
    assert.match(serviceWorker, /const ARQUIVOS_ESTATICOS = \[/);
    assert.match(serviceWorker, /if \(url\.origin !== self\.location\.origin\) return;/);
    assert.match(serviceWorker, /fetch\(evento\.request\)\.then/);
    assert.match(serviceWorker, /fetch\(arquivo, \{ cache: 'reload' \}\)/);
    assert.match(serviceWorker, /self\.skipWaiting\(\)/);
    assert.match(serviceWorker, /self\.clients\.claim\(\)/);
    assert.doesNotMatch(serviceWorker, /supabase\.co|rest\/v1|Authorization/);
});

test('dependências externas com versão exata e integrity (sha384)', () => {
    const scripts = [...html.matchAll(/<script src="(https:[^"]+)"\s*\n?\s*integrity="(sha384-[A-Za-z0-9+/=]+)" crossorigin=anonymous><\/script>/g)];
    assert.deepEqual(scripts.map(([, url]) => url), [
        'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.2/dist/umd/supabase.js',
        'https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.js',
    ]);
    // Nenhum script externo sem integrity nem com faixa de versão (ex.: "@2").
    const externos = [...html.matchAll(/<script src="(https:[^"]+)"/g)].map(([, url]) => url);
    assert.equal(externos.length, scripts.length);
    assert.ok(externos.every(url => /@\d+\.\d+\.\d+\//.test(url)));
    const decisoes = fs.readFileSync('docs/DECISOES.md', 'utf8');
    assert.match(decisoes, /## Dependências externas fixadas/);
    assert.match(decisoes, /Leaked Password Protection[\s\S]*só está disponível no plano Pro/);
});
