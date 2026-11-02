// Ajustes e inicialização: a atualização automática (a regra roda como função; um teste no navegador confere a busca de verdade),
// o login do hub, o topo da tela inicial, o editor de exercícios e o Esc.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { carregar } from '../../tests/funcoes.mjs';
import { prepararApp, app, abrirApp } from './helpers/app.mjs';
import { carregarTr, arquivo } from './helpers/js.mjs';

prepararApp();

// ===== Funções de js/bootstrap.js, sem navegador =====
function iniciar({ pilha = ['inicio'], arquivos, online = true } = {}) {
  const f = carregarTr('2026-10-21T19:00:00');

  const toasts = [],
    agendados = [],
    pedidos = [];

  const estado = {
    arquivos: { 'index.html': 'a', 'js/x.js': 'b', ...arquivos },
    online,
    sessoes: 0,
    recargas: 0,
  };

  const b = carregar(
    arquivo('js/bootstrap.js'),
    ['TELAS_SEGURAS', 'versaoAtual', 'hash', 'checarAtualizacao', 'aplicarAtualizacao'],
    {
      Date: f.Date,
      ARQUIVOS_APP: ['index.html', 'js/x.js'],
      navigator: {
        get onLine() {
          return estado.online;
        },
      },
      fetch: async (url) => {
        const nome = url.split('?')[0];

        pedidos.push(nome);

        return {
          ok: nome in estado.arquivos,
          status: 404,
          text: async () => estado.arquivos[nome],
        };
      },
      pilha,
      db: f.db,
      T: f.T,
      emAndamento: f.emAndamento,
      ultimoTreino: f.ultimoTreino,
      salvarSessao: () => estado.sessoes++,
      toast: (msg) => toasts.push(msg),
      setTimeout: (fn, ms) => agendados.push([fn, ms]),
      location: { reload: () => estado.recargas++ },
    }
  );

  return { ...b, f, estado, toasts, agendados, pedidos, pilha };
}

test('versão nova publicada: avisa, espera 0,9 s e recarrega; a 1ª checagem só registra a versão que roda', async () => {
  const a = iniciar();

  await a.checarAtualizacao(true); // versão que está rodando
  assert.deepEqual([a.toasts, a.agendados.length], [[], 0]);
  await a.checarAtualizacao(true); // nada mudou
  assert.equal(a.toasts.length, 0);

  a.estado.arquivos['js/x.js'] = 'mudou';
  await a.checarAtualizacao(true);
  assert.deepEqual(a.toasts, ['Atualizando para a versão nova…']);
  assert.equal(a.estado.sessoes, 1); // a sessão do dia é salva antes
  assert.equal(a.agendados[0][1], 900);
  assert.equal(a.estado.recargas, 0);
  a.agendados[0][0]();
  assert.equal(a.estado.recargas, 1);
});

test('nunca recarrega no meio do treino (cronômetro rodando ou treino em andamento): fica pendente e aplica depois', async () => {
  const a = iniciar();

  await a.checarAtualizacao(true);
  a.f.T.fim = Date.now() + 60000; // descanso rodando
  a.estado.arquivos['js/x.js'] = 'mudou';
  await a.checarAtualizacao(true);
  assert.deepEqual([a.toasts.length, a.agendados.length], [0, 0]);

  a.f.T.fim = 0;
  a.f.db.treinos.push({ inicio: a.f.Date.now() - 600000, fim: a.f.Date.now() - 60000 }); // treino em andamento
  a.aplicarAtualizacao();
  assert.equal(a.toasts.length, 0);

  a.f.db.treinos[0].fechado = true; // finalizou
  a.aplicarAtualizacao();
  assert.deepEqual(a.toasts, ['Atualizando para a versão nova…']); // a pendência não se perdeu
  assert.equal(a.agendados.length, 1);

  a.aplicarAtualizacao(); // já aplicada: não repete
  assert.equal(a.agendados.length, 1);
});

test('nunca recarrega numa tela com formulário (só início, exercício, conquistas e resumo): atualiza ao sair dela', async () => {
  const a = iniciar({ pilha: ['inicio', 'editar'] });

  assert.deepEqual([...a.TELAS_SEGURAS], ['inicio', 'exercicio', 'conquistas', 'fim']);
  await a.checarAtualizacao(true);
  a.estado.arquivos['js/x.js'] = 'mudou';
  await a.checarAtualizacao(true);
  assert.equal(a.toasts.length, 0);
  a.pilha.pop(); // saiu do formulário
  a.aplicarAtualizacao();
  assert.equal(a.toasts.length, 1);
});

test('sem internet, dentro de 1 min (sem forçar) ou com arquivo fora do ar: não pede nada ou fica na versão atual', async () => {
  const off = iniciar({ online: false });

  await off.checarAtualizacao(true);
  assert.equal(off.pedidos.length, 0);

  const a = iniciar();

  await a.checarAtualizacao(true);
  assert.equal(a.pedidos.length, 2); // index.html e js/x.js
  await a.checarAtualizacao(); // menos de 1 min depois
  assert.equal(a.pedidos.length, 2);

  delete a.estado.arquivos['js/x.js']; // fora do ar no meio do deploy
  a.estado.arquivos['index.html'] = 'novo';
  await a.checarAtualizacao(true);
  assert.equal(a.toasts.length, 0);

  a.estado.arquivos['js/x.js'] = 'b'; // voltou, mas a versão é outra
  await a.checarAtualizacao(true);
  assert.equal(a.toasts.length, 1);
  assert.equal(a.hash('abc'), a.hash('abc'));
  assert.notEqual(a.hash('abc'), a.hash('abd'));
});

test('dentro do hub (…/tr/) sem sessão vai ao login do hub e volta para o mesmo endereço; fora dele (testes), login próprio', () => {
  const rodar = (pathname, search = '', hash = '') => {
    const chamadas = [];

    const { irParaLoginDoHub } = carregar(
      arquivo('js/bootstrap.js'),
      ['irParaLoginDoHub'],
      {
        location: { pathname, search, hash, replace: (u) => chamadas.push(u) },
      }
    );

    return [irParaLoginDoHub(), chamadas];
  };

  assert.deepEqual(rodar('/hub/tr/'), [true, ['../?volta=tr%2F']]);
  assert.deepEqual(rodar('/hub/tr/index.html', '?dia=2026-10-21', '#x'), [
    true,
    ['../?volta=tr%2F%3Fdia%3D2026-10-21%23x'],
  ]);
  assert.deepEqual(rodar('/'), [false, []]); // servido na raiz, como nos testes
  assert.deepEqual(rodar('/hub/fin/'), [false, []]);
  assert.deepEqual(rodar('/hub/tr/outra.html'), [false, []]);
});

// ===== No navegador =====
test('recarrega sozinho quando sai uma versão nova (fora do treino): busca os arquivos de verdade e entra sem senha', async () => {
  const { ctx, pg } = await abrirApp();

  await pg.waitForFunction(() => versaoAtual); // versão rodando registrada
  app.novaVersao = true;

  try {
    const recarregou = pg.waitForEvent('load');

    await pg.evaluate(() => checarAtualizacao(true));
    await recarregou;
  } finally {
    app.novaVersao = false;
  }

  await pg.waitForSelector('#v-inicio:not([hidden])'); // entra direto, sem senha
  await ctx.close();
});

test('tela inicial e editor: topo só com ícones; reordenar; voltar é só a seta', async () => {
  const { ctx, pg } = await abrirApp();

  for (const sel of ['#v-inicio .topo #i-hub', '#v-inicio .topo [data-ir="editar"]']) {
    assert.ok(await pg.getAttribute(sel, 'title'));
    assert.ok(await pg.getAttribute(sel, 'aria-label'));
    assert.equal((await pg.textContent(sel)).trim(), ''); // só ícone
  }

  await pg.click('[data-ir="editar"]'); // a engrenagem vai direto para editar os exercícios
  await pg.waitForSelector('#v-editar:not([hidden])');
  await pg.click('#ed-lista fieldset >> nth=1 >> .ed-mover[data-mv="-1"]');
  await pg.click('#ed-form button[type=submit]');
  await pg.waitForSelector('#v-inicio:not([hidden])');
  assert.match(await pg.textContent('.slot >> nth=0'), /Cadeira flexora/);

  await pg.tap('.slot >> nth=0');
  const b = '#v-exercicio .back';

  assert.equal((await pg.textContent(b)).trim(), '');
  assert.equal(await pg.getAttribute(b, 'aria-label'), 'Voltar');
  await pg.click(b);
  await pg.waitForSelector('#v-inicio:not([hidden])');
  await ctx.close();
});

test('Esc fecha tela cheia, cancela edição, volta e, na tela inicial, sai do app', async () => {
  const { ctx, pg } = await abrirApp({ agua: true });

  await pg.tap('.slot >> nth=0');
  assert.equal(await pg.isVisible('#agua'), true);
  await pg.keyboard.press('Escape');
  assert.equal(await pg.isVisible('#agua'), false);
  assert.equal(await pg.isVisible('#v-exercicio'), true); // fechou só a tela cheia
  await pg.keyboard.press('Escape');
  await pg.waitForSelector('#v-inicio:not([hidden])'); // voltou
  await pg.tap('.slot >> nth=0');
  await pg.fill('#e-carga', '40');
  await pg.dispatchEvent('#e-carga', 'input');
  await pg.click('#t-feita');
  await pg.click('#e-finalizar');
  await pg.waitForSelector('#parabens:not([hidden])');
  await pg.keyboard.press('Escape'); // parabéns: Esc é "Ver resumo"
  await pg.click('[data-editar-treino]');
  assert.equal(await pg.locator('#f-treino [data-cancelar]').count(), 1);
  await pg.keyboard.press('Escape');
  assert.equal(await pg.locator('#f-treino [data-cancelar]').count(), 0); // cancelou a edição
  assert.equal(await pg.isVisible('#v-fim'), true);
  await pg.evaluate(() => {
    window.saidas = 0;
    sairDoApp = () => {
      saidas++;
    };
  }); // fora do hub ../ é a própria raiz
  await pg.keyboard.press('Escape');
  await pg.waitForSelector('#v-exercicio:not([hidden])'); // do resumo, a tela de antes
  await pg.keyboard.press('Escape');
  await pg.waitForSelector('#v-inicio:not([hidden])');
  assert.equal(await pg.evaluate(() => saidas), 0);
  await pg.keyboard.press('Escape'); // e da tela inicial sai do app
  assert.equal(await pg.evaluate(() => saidas), 1);
  await ctx.close();
});
