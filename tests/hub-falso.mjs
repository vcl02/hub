// Ajuda dos testes da página inicial (sem navegador): roda o hub.js publicado num contexto com a página simulada. Os links dos
// hábitos e atalhos saem do index.html de verdade (lido como elementos por tests/leitores.mjs); o Supabase é um falso sem
// sessão, então o hub.js abre no login. Cada ouvinte de evento que ele registra fica guardado para o teste disparar.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { etiquetas } from './leitores.mjs';

const RAIZ = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

// Elemento falso: classes, atributos e os ouvintes registrados (por tipo de evento)
function elemento(attrs = {}, ouvintes = {}) {
  const classes = new Set((attrs.class || '').split(/\s+/).filter(Boolean));

  const el = {
    attrs: { ...attrs },
    dataset: {},
    hidden: false,
    textContent: '',
    value: '',
    focado: false,
    foiBlur: false,
    ouvintes,
    classList: {
      add: (c) => classes.add(c),
      remove: (c) => classes.delete(c),
      toggle: (c, ligar) => {
        const ligado = ligar === undefined ? !classes.has(c) : ligar;

        if (ligado) classes.add(c);
        else classes.delete(c);

        return ligado;
      },
      contains: (c) => classes.has(c),
    },
    classes,
    getAttribute: (n) => el.attrs[n] ?? null,
    setAttribute: (n, v) => {
      el.attrs[n] = String(v);
    },
    addEventListener: (tipo, f) => {
      (ouvintes[tipo] ||= []).push(f);
    },
    focus: () => {
      el.focado = true;
    },
    blur: () => {
      el.foiBlur = true;
    },
    closest: () => null,
    querySelector: () => null,
    querySelectorAll: () => [],
  };

  if (attrs.href !== undefined) el.href = attrs.href;

  return el;
}

// entrar: o que o signInWithPassword do Supabase falso responde (ou lança); o padrão é senha inválida.
export function iniciarHub({
  userAgent = 'Mozilla/5.0 (X11; Linux)',
  search = '',
  linksExtras = [],
  entrar = async () => ({ data: null, error: { message: 'Invalid login credentials' } }),
} = {}) {
  const arquivoHtml = readFileSync(path.join(RAIZ, 'index.html'), 'utf8'),
    arquivo = path.join(RAIZ, 'hub.js');

  // Os links .app do index.html, na ordem do documento (hábitos e atalhos)
  const anchors = etiquetas(arquivoHtml)
    .filter((e) => e.tag === 'a' && (e.attrs.class || '').split(/\s+/).includes('app'))
    .map((e) => {
      const a = elemento(e.attrs);

      if (e.attrs['data-habito']) a.dataset.habito = e.attrs['data-habito'];

      return a;
    });

  // links a mais na lista (por exemplo, um atalho externo com pasta própria), na mesma forma dos de index.html
  for (const attrs of linksExtras) anchors.push(elemento(attrs));

  const agenda = anchors.find((a) => a.attrs.id === 'agenda');
  const porId = { agenda };

  const janela = {},
    documento = {},
    timers = [],
    registros = [],
    entradas = [],
    saidas = [];

  const el = (id) => (porId[id] ||= elemento({ id }));

  const que = (seletor) => {
    const tem = (a, c) => a.classes.has(c);

    const mapa = {
      '.app': anchors,
      '.app:not(.externo)': anchors.filter((a) => !tem(a, 'externo')),
      '.app.tocado': anchors.filter((a) => tem(a, 'tocado')),
      '[data-habito]': anchors.filter((a) => a.dataset.habito),
    };

    // Seletor que o falso não conhece é erro do teste, não lista vazia: o hub.js passaria a ler de nada sem ninguém notar.
    if (!(seletor in mapa))
      throw new Error(`hub-falso: seletor desconhecido em querySelectorAll: ${seletor}`);

    return mapa[seletor];
  };

  const location = {
    search,
    pathname: '/hub/',
    hash: '',
    href: 'https://vcl02.github.io/hub/' + search,
    trocados: [],
    replace(destino) {
      this.trocados.push(destino);
    },
  };

  const contexto = {
    URL,
    URLSearchParams,
    Response,
    AbortController,
    TypeError,
    Date,
    Promise,
    console,
    location,
    history: { state: null, pushState() {}, replaceState() {} },
    localStorage: { getItem: () => null, setItem() {} },
    navigator: {
      userAgent,
      serviceWorker: {
        register: (...argumentos) => {
          registros.push(argumentos);

          return Promise.resolve();
        },
      },
    },
    supabase: {
      createClient: () => ({
        auth: {
          getSession: async () => ({ data: { session: null } }),
          signOut: async (opcoes) => {
            saidas.push(opcoes);

            return {};
          },
          signInWithPassword: async (credenciais) => {
            entradas.push(credenciais);

            return entrar(credenciais);
          },
        },
      }),
    },
    document: {
      getElementById: el,
      querySelectorAll: que,
      addEventListener: (tipo, f) => {
        (documento[tipo] ||= []).push(f);
      },
      visibilityState: 'visible',
      activeElement: null,
    },
    addEventListener: (tipo, f) => {
      (janela[tipo] ||= []).push(f);
    },
    setInterval: () => 0,
    setTimeout: (f, ms) => {
      timers.push({ f, ms, ativo: true });

      return timers.length;
    },
    clearTimeout: (id) => {
      if (timers[id - 1]) timers[id - 1].ativo = false;
    },
  };

  // Como a página: o núcleo comum (base/nucleo.js, com o fetchComTeto) antes do hub.js, no mesmo escopo global
  const nucleo = path.join(RAIZ, 'base', 'nucleo.js');

  vm.createContext(contexto);
  vm.runInContext(readFileSync(nucleo, 'utf8'), contexto, { filename: nucleo });
  vm.runInContext(readFileSync(arquivo, 'utf8'), contexto, { filename: arquivo });

  // dispara os temporizadores pendentes (do mais antigo ao mais novo), uma vez cada
  const passarTempo = () => {
    for (const t of timers)
      if (t.ativo) {
        t.ativo = false;
        t.f();
      }
  };

  const ligado = (a) => a.classes.has('tocado');

  // Preenche o formulário de login e envia (espera o hub terminar de responder)
  const login = async (usuario, senha) => {
    el('l-usuario').value = usuario;
    el('l-senha').value = senha;
    await el('l-form').ouvintes.submit[0]({ preventDefault() {} });
  };

  // deixa o hub terminar de abrir (a sessão é lida de forma assíncrona)
  const aberto = () => new Promise((resolve) => setImmediate(resolve));

  return {
    contexto,
    location,
    anchors,
    registros,
    janela,
    documento,
    timers,
    el,
    passarTempo,
    ligado,
    login,
    aberto,
    entradas,
    saidas,
    link: (pasta) => anchors.find((a) => a.attrs.href === pasta),
  };
}
