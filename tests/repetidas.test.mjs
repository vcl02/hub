// Funções repetidas entre os apps (sem navegador): cada cópia é tirada do próprio arquivo do app (tests/funcoes.mjs) e passa
// pelos mesmos casos. Garante que as cópias se comportam igual até irem para a base comum (base/nucleo.js, passo 4 de
// docs/DIRETRIZES.md, seção 8): mescla das listas do dia entre aparelhos, diferença para enviar, o dia no endereço e o toque
// repetido.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { carregar } from './funcoes.mjs';

const json = x => JSON.parse(JSON.stringify(x));

// ---------- mesclar(nuvem, base, local): a lista da nuvem + o que entrou aqui desde a base − o que saiu daqui ----------
// Água e al mesclam objetos (copos, trechos de caminhada); o Corpo, horários ("10:00")
const MESCLAS = {
  agua: { f: carregar('agua/js/banco.js', ['mesclar']).mesclar, x: h => ({ hora: h, ml: 150 }) },
  al: { f: carregar('al/js/banco.js', ['mesclar']).mesclar, x: h => ({ hora: h, minutos: 10 }) },
  corpo: { f: carregar('corpo/js/banco.js', ['mesclar']).mesclar, x: h => h }
};
for (const [app, { f, x }] of Object.entries(MESCLAS)) {
  test(`${app}: mesclar não perde o que outro aparelho lançou e aplica só o que mudou aqui`, () => {
    const [a, b, c, d] = ['08:00', '09:00', '10:00', '11:00'].map(x);
    assert.deepEqual(json(f([a, b], [a], [a, c])), json([a, b, c]));           // outro aparelho pôs b, este pôs c: os dois ficam
    assert.deepEqual(json(f([a, b], [a, b], [a])), json([a]));                 // este tirou b: sai da nuvem
    assert.deepEqual(json(f([a, b, d], [a], [a])), json([a, b, d]));          // cópia velha (nada mudou aqui): a nuvem fica como está
    assert.deepEqual(json(f([], [], [a, a])), json([a, a]));                   // dois iguais (dois copos no mesmo minuto) são dois
    assert.deepEqual(json(f([a, a, b], [a, a], [a])), json([a, b]));           // tirou um dos dois iguais: sai um só
    assert.deepEqual(json(f([b], [a], [])), json([b]));                        // tirou aqui o que outro aparelho já tinha tirado: nada quebra
  });
}

// ---------- diferenca(base, agora): o que enviar; null = nada ----------
test('água: diferenca por dia (sobe o que mudou, sai o que não existe mais; nada = null)', () => {
  const { diferenca } = carregar('agua/js/banco.js', ['diferenca']);
  const A = { '2026-10-01': { data: '2026-10-01', aguas: [1] }, '2026-10-02': { data: '2026-10-02', aguas: [2] } };
  assert.equal(diferenca(A, json(A)), null);
  assert.deepEqual(json(diferenca(A, { '2026-10-01': { data: '2026-10-01', aguas: [1, 3] } })), { up: [{ data: '2026-10-01', aguas: [1, 3] }], del: ['2026-10-02'] });
  assert.deepEqual(json(diferenca(null, { x: 1 })), { up: [1], del: [] });     // sem base (1º envio): sobe tudo
});
// Corpo, al e tr: a mesma diferença, por tabela (o Corpo devolve a chave do que sai; al e tr, a linha inteira)
const DIF = {
  corpo: { f: carregar('corpo/js/banco.js', ['diferenca'], { TABELAS: { t1: 'data', t2: 'data' } }).diferenca, sai: k => k },
  al: { f: carregar('al/js/banco.js', ['diferenca'], { ORDEM: ['t1', 't2'] }).diferenca, sai: (k, l) => l },
  tr: { f: carregar('tr/js/banco.js', ['diferenca'], { ORDEM: ['t1', 't2'] }).diferenca, sai: (k, l) => l }
};
for (const [app, { f, sai }] of Object.entries(DIF)) {
  test(`${app}: diferenca por tabela (sobe o que mudou, sai o que não existe mais; nada = null)`, () => {
    const l1 = { id: 1, v: 'a' }, l2 = { id: 2, v: 'b' }, base = { t1: { 1: l1, 2: l2 }, t2: {} };
    assert.equal(f(base, json(base)), null);
    const r = json(f(base, { t1: { 1: { id: 1, v: 'A' } }, t2: { 9: { id: 9 } } }));
    assert.deepEqual(r.up, { t1: [{ id: 1, v: 'A' }], t2: [{ id: 9 }] });
    assert.deepEqual(r.del, { t1: [sai('2', l2)], t2: [] });
  });
}

// ---------- diaDaUrl(): ?dia=AAAA-MM-DD só se for um dia anterior a hoje; hoje, futuro ou texto inválido = null ----------
for (const app of ['agua', 'al', 'corpo', 'tr']) {
  test(`${app}: diaDaUrl aceita só um dia anterior a hoje`, () => {
    const dia = busca => carregar(`${app}/js/util.js`, ['diaDaUrl'], { URLSearchParams, location: { search: busca }, hoje: () => '2026-10-30' }).diaDaUrl();
    assert.equal(dia('?dia=2026-10-29'), '2026-10-29');
    assert.equal(dia('?dia=2026-10-30'), null);                                  // hoje: sem ?dia
    assert.equal(dia('?dia=2026-11-02'), null);                                  // futuro
    for (const ruim of ['?dia=29/10/2026', '?dia=2026-10-29x', '?dia=', '', '?ciclo=2026-10']) assert.equal(dia(ruim), null, ruim);
  });
}

// ---------- repetido(acao): a mesma ação em menos de 0,5 s é ignorada (toque repetido sem querer) ----------
for (const app of ['agua', 'al', 'corpo']) {
  test(`${app}: repetido ignora a mesma ação em menos de 0,5 s`, () => {
    let agora = 1000;
    const { repetido } = carregar(`${app}/js/util.js`, ['REPETIDO_MS', 'ultimaAcao', 'repetido'], { Date: { now: () => agora } });
    assert.equal(repetido('+150'), false);
    agora += 300; assert.equal(repetido('+150'), true);                         // 0,3 s depois: repetido
    agora += 10; assert.equal(repetido('+300'), false);                         // outra ação: vale
    agora += 600; assert.equal(repetido('+300'), false);                        // 0,6 s depois: vale de novo
  });
}
