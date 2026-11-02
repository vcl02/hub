// Contrato PWA: instalação com manifest e cache limitado à interface, sem dados financeiros offline.
const assert = require('./helpers/assert-tolerante');
const fs = require('node:fs');
const test = require('node:test');
const vm = require('node:vm');
const { etiquetas, textoDaEtiqueta } = require('./helpers/html');

const html = fs.readFileSync('index.html', 'utf8');
const manifest = JSON.parse(fs.readFileSync('manifest.webmanifest', 'utf8'));
const bootstrap = fs.readFileSync('js/bootstrap.js', 'utf8');
const serviceWorker = fs.readFileSync('service-worker.js', 'utf8');

// Roda o service-worker.js de verdade com o navegador simulado: guarda os ouvintes dos eventos e o que foi ao cache.
function carregarServiceWorker({
  rede = async (url) => ({ ok: true, url, clone: () => ({ copia: url }) }),
} = {}) {
  const ouvintes = {};
  const cache = new Map();
  const chamadas = { fetch: [], skipWaiting: 0, claim: 0 };

  const ctx = {
    URL,
    Promise,
    self: {
      location: { origin: 'https://site.test' },
      addEventListener: (tipo, fn) => (ouvintes[tipo] = fn),
      skipWaiting: () => chamadas.skipWaiting++,
      clients: { claim: () => chamadas.claim++ },
    },
    caches: {
      open: async (nome) => ({
        put: async (chave, resposta) =>
          cache.set(`${nome}|${chave.url ?? chave}`, resposta),
      }),
      match: async (pedido) => `do-cache:${pedido.url}`,
    },
    fetch: async (pedido, opcoes) => {
      chamadas.fetch.push([pedido.url ?? pedido, opcoes]);

      return rede(pedido.url ?? pedido);
    },
  };

  vm.createContext(ctx);
  vm.runInContext(`${serviceWorker}\nthis.ARQUIVOS = ARQUIVOS_ESTATICOS;`, ctx);

  // O evento: guarda o que foi passado a waitUntil/respondWith para o teste aguardar
  const evento = (extra = {}) => {
    const e = { ...extra };

    e.waitUntil = (p) => (e.espera = p);
    e.respondWith = (p) => (e.resposta = p);

    return e;
  };

  return { ouvintes, cache, chamadas, evento, arquivos: [...ctx.ARQUIVOS] };
}

test('declara manifest instalável e cores coerentes com a interface', () => {
  const cabeca = etiquetas(html);

  // Aba discreta: título "." (vazio faria o navegador mostrar a URL no lugar).
  assert.equal(textoDaEtiqueta(html, 'title'), '.');
  assert.match(
    fs.readFileSync('docs/REGRAS.md', 'utf8'),
    /O título da página \(aba do navegador\) é só `\.`/
  );
  assert.deepEqual(
    cabeca.filter((t) => t.tag === 'link' && t.attrs.rel === 'manifest'),
    [{ tag: 'link', attrs: { rel: 'manifest', href: './manifest.webmanifest' } }]
  );
  assert.deepEqual(
    cabeca.filter((t) => t.tag === 'link' && t.attrs.rel === 'icon'),
    [
      {
        tag: 'link',
        attrs: { rel: 'icon', type: 'image/svg+xml', href: './icons/fin-192.svg' },
      },
    ]
  );
  assert.deepEqual(
    cabeca.filter((t) => t.tag === 'meta' && t.attrs.name === 'theme-color'),
    [{ tag: 'meta', attrs: { name: 'theme-color', content: '#1B1E21' } }]
  );
  assert.equal(manifest.display, 'standalone');
  assert.equal(manifest.name, 'fin');
  assert.equal(manifest.short_name, 'fin');
  assert.equal(manifest.start_url, './');
  assert.equal(manifest.theme_color, '#1B1E21');
  assert.deepEqual(
    manifest.icons.map((icone) => icone.sizes),
    ['192x192', '512x512']
  );
  assert.deepEqual(
    manifest.icons.map((icone) => icone.type),
    ['image/png', 'image/png']
  );
  manifest.icons.forEach((icone) =>
    assert.ok(fs.existsSync(icone.src.replace('./', '')))
  );
});

test('ícones instaláveis são PNGs nos tamanhos declarados e mantêm a arte vetorial centralizada', () => {
  manifest.icons.forEach((icone) => {
    const png = fs.readFileSync(icone.src.replace('./', ''));
    const tamanho = Number(icone.sizes.split('x')[0]);

    assert.deepEqual(png.subarray(0, 8), Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    assert.equal(png.readUInt32BE(16), tamanho);
    assert.equal(png.readUInt32BE(20), tamanho);
  });
  // Um SVG só, o do favicon: o app instalado usa os PNGs do manifest.
  const svg = etiquetas(fs.readFileSync('icons/fin-192.svg', 'utf8'));

  assert.equal(svg.find((t) => t.tag === 'svg').attrs.viewBox, '0 0 192 192');
  // Caixa total: x 41–151 e y 50–142; ambos os centros são exatamente 96.
  assert.deepEqual(
    svg.filter((t) => t.tag === 'path').map((t) => t.attrs.d),
    [
      'M41 142V58h63v16H59v20h39v16H59v32H41Z',
      'M115 112h8v30h-8zm14-22h8v52h-8zm14-40h8v92h-8z',
    ]
  );
  assert.deepEqual(fs.readdirSync('icons').sort(), [
    'fin-192.png',
    'fin-192.svg',
    'fin-512.png',
  ]);
});

test('registra o service worker sem deixar a instalação da PWA quebrar o app', async () => {
  const inicio = bootstrap.indexOf("if ('serviceWorker' in navigator) {");
  const trecho = bootstrap.slice(inicio, bootstrap.indexOf('\n}\n', inicio) + 3);
  const registros = [];
  let aoCarregar;

  const roda = (registrar) =>
    vm.runInNewContext(trecho, {
      navigator: { serviceWorker: { register: registrar } },
      window: { addEventListener: (tipo, fn) => tipo === 'load' && (aoCarregar = fn) },
    });

  roda((...args) => {
    registros.push(args);

    return Promise.reject(new Error('sem suporte')); // falhar não pode virar erro na página
  });
  assert.deepEqual(registros, []); // só registra quando a página termina de carregar
  await aoCarregar();
  assert.deepEqual(JSON.parse(JSON.stringify(registros)), [
    ['./service-worker.js', { updateViaCache: 'none' }],
  ]);

  // Navegador sem service worker: nada é registrado
  let ouviu = false;

  vm.runInNewContext(trecho, {
    navigator: {},
    window: { addEventListener: () => (ouviu = true) },
  });
  assert.equal(ouviu, false);
});

test('service worker: rede primeiro, cache só offline, cópia só de arquivos próprios, sem dados do Supabase', async () => {
  const sw = carregarServiceWorker();

  // Instala guardando a interface (sempre da rede, ignorando o cache do navegador) e assume o controle
  const instalar = sw.evento();

  sw.ouvintes.install(instalar);
  await instalar.espera;
  assert.deepEqual(
    sw.chamadas.fetch.map(([url, opcoes]) => [url, opcoes.cache]),
    sw.arquivos.map((url) => [url, 'reload'])
  );
  assert.deepEqual(
    [...sw.cache.keys()],
    sw.arquivos.map((url) => `fin-estatico|${url}`)
  );
  assert.equal(sw.chamadas.skipWaiting, 1);

  const ativar = sw.evento();

  sw.ouvintes.activate(ativar);
  await ativar.espera;
  assert.equal(sw.chamadas.claim, 1);

  // Só interceptamos GET do próprio site: POST, CDN e Supabase seguem direto para a rede
  const pedido = (url, method = 'GET') => ({ url, method });

  for (const fora of [
    pedido('https://site.test/hub/fin/', 'POST'),
    pedido('https://xyz.supabase.co/rest/v1/fin?select=*'),
    pedido('https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.js'),
  ]) {
    const e = sw.evento({ request: fora });

    sw.ouvintes.fetch(e);
    assert.equal(e.resposta, undefined, fora.url);
  }

  // Arquivo próprio: vem da rede e a última cópia boa fica no cache
  const aberto = sw.evento({ request: pedido('https://site.test/hub/fin/js/form.js') });

  sw.ouvintes.fetch(aberto);
  const resposta = await aberto.resposta;

  assert.equal(resposta.url, 'https://site.test/hub/fin/js/form.js');
  assert.ok(sw.cache.has('fin-estatico|https://site.test/hub/fin/js/form.js'));

  // Rede com erro HTTP: devolve a resposta e não guarda
  const falha = carregarServiceWorker({ rede: async () => ({ ok: false, status: 500 }) });
  const comErro = falha.evento({ request: pedido('https://site.test/hub/fin/') });

  falha.ouvintes.fetch(comErro);
  assert.equal((await comErro.resposta).status, 500);
  assert.equal(falha.cache.size, 0);

  // Sem internet: o cache atende
  const offline = carregarServiceWorker({
    rede: async () => {
      throw new Error('offline');
    },
  });

  const emCasa = offline.evento({ request: pedido('https://site.test/hub/fin/') });

  offline.ouvintes.fetch(emCasa);
  assert.equal(await emCasa.resposta, 'do-cache:https://site.test/hub/fin/');
});

test('o cache offline cobre a página e cada arquivo que ela carrega, e nada de dados', () => {
  const { arquivos } = carregarServiceWorker();

  const noHtml = etiquetas(html)
    .map(
      (t) =>
        t.attrs.src ||
        (t.tag === 'link' && t.attrs.rel === 'stylesheet' ? t.attrs.href : '')
    )
    .filter((url) => url.startsWith('./'))
    .map((url) => url.split('?')[0]);

  assert.ok(noHtml.length > 10);

  for (const url of noHtml)
    assert.ok(arquivos.includes(url), `${url} não está no cache offline`);

  for (const url of arquivos) {
    const caminho = url === './' ? 'index.html' : url;

    assert.ok(fs.existsSync(caminho), `${url} não existe`);
  }

  // O outro sentido: nada órfão no cache. Cada item é a página ('./', index.html), o manifest, um ícone do manifest
  // ou um arquivo que o index.html carrega (script ou folha de estilo).
  const reconhecidos = new Set([
    './',
    './index.html',
    './manifest.webmanifest',
    ...manifest.icons.map((icone) => icone.src),
    ...noHtml,
    ...etiquetas(html)
      .map((t) => (t.tag === 'link' && t.attrs.rel === 'stylesheet' ? t.attrs.href : ''))
      .filter((url) => url.startsWith('../base/')),
  ]);

  for (const url of arquivos)
    assert.ok(reconhecidos.has(url), `${url} está no cache offline mas nada o carrega`);

  // E o manifest e os ícones citados pelo index.html e pelo manifest estão no cache
  const manifestNoHtml = etiquetas(html).find(
    (t) => t.tag === 'link' && t.attrs.rel === 'manifest'
  ).attrs.href;

  for (const url of [manifestNoHtml, ...manifest.icons.map((icone) => icone.src)])
    assert.ok(arquivos.includes(url), `${url} não está no cache offline`);

  // O service worker só conhece arquivos da interface: nada de endereço de dados
  assert.ok(arquivos.every((url) => url.startsWith('./') || url.startsWith('../base/')));
});

test('dependências externas com versão exata e integrity (sha384)', () => {
  const externos = etiquetas(html).filter(
    (t) => t.tag === 'script' && (t.attrs.src || '').startsWith('https:')
  );

  assert.deepEqual(
    externos.map((t) => t.attrs.src),
    [
      'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.118.0/dist/umd/supabase.js',
      'https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.js',
    ]
  );
  // Nenhum script externo sem integrity sha384 e crossorigin anônimo, nem com faixa de versão (ex.: "@2").
  assert.ok(externos.every((t) => t.attrs.integrity.startsWith('sha384-')));
  assert.ok(externos.every((t) => t.attrs.crossorigin === 'anonymous'));
  assert.ok(externos.every((t) => /@\d+\.\d+\.\d+\//.test(t.attrs.src)));
  // Mesmo supabase-js dos outros apps (mesma origem, mesma sessão): o jsDelivr serve o arquivo do
  // pacote byte a byte, igual à cópia da raiz do hub, então o integrity é o hash dessa cópia.
  const copiaDoHub = fs.readFileSync('../supabase.js');

  assert.match(copiaDoHub.toString('utf8'), /supabase-js\/2\.118\.0/);
  const hash = `sha384-${require('node:crypto').createHash('sha384').update(copiaDoHub).digest('base64')}`;

  assert.equal(externos[0].attrs.integrity, hash);

  const decisoes = fs.readFileSync('docs/DECISOES.md', 'utf8');

  assert.match(decisoes, /## Dependências externas fixadas/);
  assert.match(
    decisoes,
    /Leaked Password Protection[\s\S]*só está disponível no plano Pro/
  );
});
