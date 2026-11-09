// Contrato da URL do ciclo: ciclos únicos usam um mês estável e restaurável; Backlog usa a
// palavra fixa "backlog" (De sozinho, sem par no combo Até).
const assert = require('./helpers/assert-tolerante');
const fs = require('node:fs');
const test = require('node:test');
const vm = require('node:vm');
const { parse } = require('espree');
const { etiquetas, textosDasEtiquetas } = require('./helpers/html');

const fonte = fs.readFileSync('js/data-ui.js', 'utf8');
const inicio = fonte.indexOf('function chaveCicloNaUrl(');
const fim = fonte.indexOf('\n// Fluxo completo de carga', inicio);
const regrasMd = fs.readFileSync('docs/REGRAS.md', 'utf8');

function criarContexto(
  href,
  valores = { compDe: '', compAte: '' },
  compDeOptions = [{ value: '0' }, { value: '1' }]
) {
  const elementos = {
    compDe: { value: valores.compDe, options: compDeOptions },
    compAte: { value: valores.compAte, options: [{ value: '0' }, { value: '1' }] },
  };

  const url = new URL(href);
  const chamadas = [];
  // metodos[i] registra se chamadas[i] veio de pushState ou replaceState, sem mudar o
  // formato de chamadas[i] (os testes antigos indexam chamadas[0][2] = destino da URL).
  const metodos = [];

  const janela = {
    location: {
      href: url.href,
      pathname: url.pathname,
      search: url.search,
      hash: url.hash,
    },
    history: {
      state: null,
      replaceState: (...args) => {
        metodos.push('replace');
        chamadas.push(args);
      },
      pushState: (...args) => {
        metodos.push('push');
        chamadas.push(args);
      },
    },
  };

  const contexto = {
    Estado: { ciclos: [{ ini: '2026-09-08' }, { ini: '2026-10-08' }] },
    URL,
    URLSearchParams,
    window: janela,
    el: (id) => elementos[id],
    dataISO: (valor) => valor,
  };

  vm.createContext(contexto);
  vm.runInContext(
    `${fonte.slice(inicio, fim)}; globalThis.regras = { aplicarCicloDaUrl, sincronizarCicloNaUrl };`,
    contexto
  );

  return { contexto, elementos, chamadas, metodos };
}

test('URL restaura somente um ciclo único pelo mês de início', () => {
  const { contexto, elementos } = criarContexto('https://exemplo.test/?ciclo=2026-10');

  contexto.regras.aplicarCicloDaUrl();
  assert.equal(elementos.compDe.value, 1);
  assert.equal(elementos.compAte.value, 1);
});

test('?dia= (Besteira de um dia anterior, na página inicial) abre no ciclo daquele dia, e a URL fica só com o ?ciclo', () => {
  const { contexto, elementos, chamadas } = criarContexto(
    'https://exemplo.test/?dia=2026-10-02'
  );

  contexto.periodoDoDebito = (dia) =>
    dia >= '2026-10-08' ? 1 : dia >= '2026-09-08' ? 0 : -1; // 2/10 ainda é do ciclo de setembro
  contexto.regras.aplicarCicloDaUrl();
  assert.deepEqual([elementos.compDe.value, elementos.compAte.value], [0, 0]);
  elementos.compDe.value = elementos.compAte.value = '0'; // o select do navegador guarda texto
  contexto.regras.sincronizarCicloNaUrl();
  assert.equal(chamadas[0][2], '/?ciclo=2026-09');
  // ?ciclo vence o ?dia; dia sem ciclo (antes do primeiro) mantém o padrão
  const comCiclo = criarContexto('https://exemplo.test/?ciclo=2026-10&dia=2026-10-02');

  comCiclo.contexto.periodoDoDebito = () => 0;
  comCiclo.contexto.regras.aplicarCicloDaUrl();
  assert.equal(comCiclo.elementos.compDe.value, 1);
  const antes = criarContexto('https://exemplo.test/?dia=2020-01-01');

  antes.contexto.periodoDoDebito = () => -1;
  antes.contexto.regras.aplicarCicloDaUrl();
  assert.equal(antes.elementos.compDe.value, '');
  assert.match(regrasMd, /`\?dia=AAAA-MM-DD`/);
});

test('URL inclui ciclo para De igual a Até e remove ao comparar', () => {
  const unico = criarContexto('https://exemplo.test/', { compDe: '0', compAte: '0' });

  unico.contexto.regras.sincronizarCicloNaUrl();
  assert.equal(unico.chamadas[0][2], '/?ciclo=2026-09');

  const comparar = criarContexto('https://exemplo.test/?ciclo=2026-09', {
    compDe: '0',
    compAte: '1',
  });

  comparar.contexto.regras.sincronizarCicloNaUrl();
  assert.equal(comparar.chamadas[0][2], '/');
});

test('?ciclo=backlog restaura o Backlog (De=-1), quando a opção existe no combo', () => {
  const { contexto, elementos } = criarContexto(
    'https://exemplo.test/?ciclo=backlog',
    { compDe: '', compAte: '' },
    [{ value: '-1' }, { value: '0' }, { value: '1' }]
  );

  contexto.regras.aplicarCicloDaUrl();
  assert.equal(elementos.compDe.value, -1);
});

test('?ciclo=backlog não é imposto quando a opção não existe (sem Backlog no combo)', () => {
  const { contexto, elementos } = criarContexto('https://exemplo.test/?ciclo=backlog', {
    compDe: '',
    compAte: '',
  });

  contexto.regras.aplicarCicloDaUrl();
  assert.equal(elementos.compDe.value, ''); // mantém o padrão seguro, não força nada
});

test('selecionar o Backlog (De=-1) grava ?ciclo=backlog na URL, sem exigir De==Até', () => {
  const { contexto, chamadas } = criarContexto('https://exemplo.test/', {
    compDe: '-1',
    compAte: '1',
  });

  contexto.regras.sincronizarCicloNaUrl();
  assert.equal(chamadas[0][2], '/?ciclo=backlog');
});

test('sair do Backlog pra uma comparação de verdade remove o ?ciclo=backlog da URL', () => {
  const { contexto, chamadas } = criarContexto('https://exemplo.test/?ciclo=backlog', {
    compDe: '0',
    compAte: '1',
  });

  contexto.regras.sincronizarCicloNaUrl();
  assert.equal(chamadas[0][2], '/');
});

test('primeira sincronização da sessão nunca empurra histórico, mesmo gravando ?ciclo', () => {
  const { contexto, metodos } = criarContexto('https://exemplo.test/', {
    compDe: '0',
    compAte: '0',
  });

  contexto.regras.sincronizarCicloNaUrl();
  assert.deepEqual(metodos, ['replace']);
});

test('trocar de ciclo de verdade empurra uma entrada de histórico', () => {
  const { contexto, elementos, chamadas, metodos } = criarContexto(
    'https://exemplo.test/',
    { compDe: '0', compAte: '0' }
  );

  contexto.regras.sincronizarCicloNaUrl(); // 1a sincronização: sempre replace
  elementos.compDe.value = '1';
  elementos.compAte.value = '1'; // usuário navegou pro próximo ciclo
  contexto.regras.sincronizarCicloNaUrl();
  assert.deepEqual(metodos, ['replace', 'push']);
  assert.equal(chamadas[1][2], '/?ciclo=2026-10');
});

test('redesenho que mantém o mesmo ciclo nunca empurra, só substitui (sem acumular histórico)', () => {
  const { contexto, metodos } = criarContexto('https://exemplo.test/', {
    compDe: '0',
    compAte: '0',
  });

  contexto.regras.sincronizarCicloNaUrl();
  contexto.regras.sincronizarCicloNaUrl(); // ex.: digitar num filtro de coluna, sem mudar o ciclo
  assert.deepEqual(metodos, ['replace', 'replace']);
});

test('voltar do Backlog pra um ciclo único também conta como troca de ciclo (push)', () => {
  const { contexto, elementos, metodos } = criarContexto(
    'https://exemplo.test/',
    { compDe: '-1', compAte: '1' },
    [{ value: '-1' }, { value: '0' }, { value: '1' }]
  );

  contexto.regras.sincronizarCicloNaUrl(); // Backlog: 1a sincronização, replace
  elementos.compDe.value = '0';
  elementos.compAte.value = '0';
  contexto.regras.sincronizarCicloNaUrl();
  assert.deepEqual(metodos, ['replace', 'push']);
});

// O listener de popstate (js/bootstrap.js) é o único trecho do bootstrap que não roda sozinho no teste: aqui ele roda com
// `window.addEventListener` capturando-o, e as funções que ele chama anotam a ordem.
function popstate({ ciclos }) {
  const bootstrap = fs.readFileSync('js/bootstrap.js', 'utf8');
  const inicio = bootstrap.indexOf("window.addEventListener('popstate'");
  const eventos = [];
  let ouvinte;

  const contexto = {
    window: {
      addEventListener: (_, f) => {
        ouvinte = f;
      },
    },
    Estado: { ciclos },
    aplicarCicloDaUrl: () => eventos.push('aplicarCicloDaUrl'),
    desenhar: () => eventos.push('desenhar'),
    carregarDados: () => eventos.push('carregarDados'),
    load: () => eventos.push('load'),
  };

  const fim = bootstrap.indexOf('\n});', inicio) + 4;

  vm.runInNewContext(bootstrap.slice(inicio, fim), contexto);
  ouvinte();

  return eventos;
}

test('Voltar/Avançar do navegador: popstate relê a URL e redesenha sem rebuscar o Supabase', () => {
  assert.deepEqual(popstate({ ciclos: [{ ini: '2026-09-08' }] }), [
    'aplicarCicloDaUrl',
    'desenhar',
  ]);
  assert.deepEqual(popstate({ ciclos: [] }), []); // antes da 1ª carga ou deslogado: nada a redesenhar
});

test('regra documentada em REGRAS.md', () => {
  assert.match(
    regrasMd,
    /`\?ciclo=backlog` para o Backlog \(De sozinho, Até fica desabilitado nesse modo\)/
  );
  assert.match(
    regrasMd,
    /Um `ciclo=backlog` não imposto quando a opção não existe no combo De mantém o ciclo padrão seguro/
  );
  assert.match(
    regrasMd,
    /Trocar de ciclo único ou entrar\/sair do Backlog empurra uma entrada no histórico do navegador/
  );
});

test('tela de login tira ?ciclo da URL e aplica o ciclo pedido depois de entrar', () => {
  const { contexto, elementos, chamadas, metodos } = criarContexto(
    'https://exemplo.test/?ciclo=2026-10&x=1'
  );

  vm.runInContext('globalThis.tirar = tirarCicloDaUrl;', contexto);
  contexto.tirar();
  assert.equal(chamadas[0][2], '/?x=1');
  assert.equal(metodos[0], 'replace');
  // Depois do login a URL já não tem ciclo, mas o pedido guardado vale uma vez.
  contexto.window.location.search = '?x=1';
  contexto.regras.aplicarCicloDaUrl();
  assert.equal(elementos.compDe.value, 1);
  elementos.compDe.value = 0;
  elementos.compAte.value = 0;
  contexto.regras.aplicarCicloDaUrl();
  assert.equal(elementos.compDe.value, 0);
});

test('sem Sair no fin: a tela de login sempre guarda o ciclo pedido', () => {
  const boot = fs.readFileSync('js/bootstrap.js', 'utf8');
  const inicio = boot.indexOf('const mostraTela = (logado) => {');
  const telas = { login: { style: {} }, app: { style: {} } };
  const tirou = [];

  const fim = boot.indexOf('\n};', inicio) + 3;

  const mostrar = vm.runInNewContext(`${boot.slice(inicio, fim)}\nmostraTela`, {
    el: (id) => telas[id],
    tirarCicloDaUrl: () => tirou.push(true),
  });

  mostrar(0);
  assert.deepEqual(
    [telas.login.style.display, telas.app.style.display],
    ['flex', 'none']
  );
  assert.equal(tirou.length, 1); // sem sessão, o ?ciclo sai da URL (o contexto guarda o pedido)
  mostrar(1);
  assert.deepEqual(
    [telas.login.style.display, telas.app.style.display],
    ['none', 'block']
  );
  assert.equal(tirou.length, 1);
  assert.match(regrasMd, /Na tela de login a URL nunca mostra `\?ciclo`/);
  assert.match(
    regrasMd,
    /Não há botão de sair no fin: o login e o Sair ficam só na página inicial do hub/
  );
});

// Sem botão de sair: nenhum script nem a página do Fin sabe encerrar a sessão (só o hub).
// Os scripts são lidos pela árvore (espree), não por texto; a página, pelas etiquetas.
function achaSignOut(codigo) {
  const achados = [];

  const visita = (no) => {
    if (!no || typeof no.type !== 'string') return;

    if (no.type === 'Identifier' && no.name === 'signOut') achados.push(no.type);

    if (no.type === 'Literal' && no.value === 'signOut') achados.push(no.type);

    if (no.type === 'TemplateElement' && no.value.cooked === 'signOut')
      achados.push(no.type);

    for (const filho of Object.values(no)) {
      if (Array.isArray(filho)) filho.forEach(visita);
      else if (filho && typeof filho === 'object') visita(filho);
    }
  };

  visita(parse(codigo, { ecmaVersion: 'latest', sourceType: 'script' }));

  return achados;
}

const PALAVRAS_DE_SAIR = ['sair', 'logout', 'signout'];

function elementosDeSair(html) {
  return etiquetas(html).filter(
    (e) =>
      ['button', 'a', 'input'].includes(e.tag) &&
      Object.entries(e.attrs).some(
        ([nome, valor]) =>
          PALAVRAS_DE_SAIR.includes(nome.toLowerCase()) ||
          String(valor)
            .toLowerCase()
            .split(' ')
            .some(
              (p) =>
                PALAVRAS_DE_SAIR.includes(p) ||
                p.endsWith('-sair') ||
                p.startsWith('sair-')
            )
      )
  );
}

// Texto visível: nenhum button, a, label ou summary diz "Sair", "Logout" ou "Sign out" (comparação por palavra).
function textosDeSair(html) {
  const achados = [];

  for (const tag of ['button', 'a', 'label', 'summary']) {
    for (const texto of textosDasEtiquetas(html, tag)) {
      const palavras = texto.toLowerCase().split(' ');

      const diz =
        palavras.some((p) => ['sair', 'logout'].includes(p.split('.').join(''))) ||
        palavras.some((p, i) => p === 'sign' && palavras[i + 1] === 'out');

      if (diz) achados.push(`${tag}: ${texto}`);
    }
  }

  return achados;
}

// Texto "Sair" solto (botão montado pelo JS) em Literal/TemplateElement: pela árvore, só a palavra, por varredura.
function achaTextoSair(codigo) {
  const achados = [];

  const confere = (texto) => {
    if (typeof texto !== 'string') return;

    // Só o que fica fora das etiquetas (<b>Sair</b> vira 'sair')
    const fora = texto
      .toLowerCase()
      .split('<')
      .map((p, i) => (i === 0 ? p : p.slice(p.indexOf('>') + 1)))
      .join(' ');

    const palavras = fora.split(' ');

    if (palavras.filter(Boolean).join(' ') === 'sair') achados.push(texto);
  };

  const visita = (no) => {
    if (!no || typeof no.type !== 'string') return;

    if (no.type === 'Literal') confere(no.value);

    if (no.type === 'TemplateElement') confere(no.value.cooked);

    for (const filho of Object.values(no)) {
      if (Array.isArray(filho)) filho.forEach(visita);
      else if (filho && typeof filho === 'object') visita(filho);
    }
  };

  visita(parse(codigo, { ecmaVersion: 'latest', sourceType: 'script' }));

  return achados;
}

test('controle positivo: o analisador acha signOut em código sintético e botão de sair em HTML', () => {
  assert.equal(textosDeSair('<button><svg></svg> Sair</button>').length, 1);
  assert.equal(textosDeSair('<a href="x">Sign out</a>').length, 1);
  assert.equal(textosDeSair('<summary>Logout</summary>').length, 1);
  assert.equal(textosDeSair('<button>Sairemos <!-- Sair --></button>').length, 0);
  assert.equal(achaTextoSair("el.innerHTML = '<button>Sair</button>';").length, 1);
  assert.equal(achaTextoSair('const x = `<b>ok</b>`;').length, 0);
  assert.ok(achaSignOut('sb.auth.signOut();').length > 0);
  assert.ok(achaSignOut('const { signOut } = sb.auth;').length > 0);
  assert.ok(achaSignOut("sb.auth['signOut']();").length > 0);
  assert.equal(achaSignOut('const x = 1; sb.auth.getSession();').length, 0);
  assert.equal(elementosDeSair('<button id="sair">Sair</button>').length, 1);
  assert.equal(elementosDeSair('<a href="x" class="btn sair">x</a>').length, 1);
  assert.equal(elementosDeSair('<button id="entrar">Entrar</button>').length, 0);
});

test('o Fin não tem como encerrar a sessão: sem signOut nos scripts e sem botão de sair na página', () => {
  const dirJs = process.env.FIN_JS_DIR || 'js';
  const scripts = fs.readdirSync(dirJs).filter((f) => f.endsWith('.js'));

  assert.ok(scripts.length > 5);
  scripts.forEach((f) =>
    assert.deepEqual(achaSignOut(fs.readFileSync(`${dirJs}/${f}`, 'utf8')), [], f)
  );
  assert.deepEqual(elementosDeSair(fs.readFileSync('index.html', 'utf8')), []);
  assert.deepEqual(textosDeSair(fs.readFileSync('index.html', 'utf8')), []);
});

test('os textos que o JS monta não trazem "Sair" como texto de botão', () => {
  const dirJs = process.env.FIN_JS_DIR || 'js';
  const scripts = fs.readdirSync(dirJs).filter((f) => f.endsWith('.js'));

  scripts.forEach((f) =>
    assert.deepEqual(achaTextoSair(fs.readFileSync(`${dirJs}/${f}`, 'utf8')), [], f)
  );
});
