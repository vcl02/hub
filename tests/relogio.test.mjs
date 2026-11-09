// Relógio falso compartilhado (tests/relogio.mjs): início seguro (sem trocar de dia) e relógio realmente pausado.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';
import {
  inicioDoRelogio,
  iniciarRelogio,
  pausarRelogio,
  estaPausado,
  MARGEM,
  FOLGA_MS,
} from './relogio.mjs';

const RAIZ = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const { chromium } = createRequire(path.join(RAIZ, 'package.json'))('playwright');

const SP = (hhmmss) => new Date(`2026-10-22T${hhmmss}-03:00`); // o horário na parede de São Paulo (sem horário de verão em 2026)

// Roda inicioDoRelogio num processo com o fuso TZ dado e devolve o início (ISO) e a hora de parede em São Paulo
function emFuso(tz, pedidoIso) {
  const codigo = `
    import('${pathToFileURL(path.join(path.dirname(fileURLToPath(import.meta.url)), 'relogio.mjs')).href}').then((m) => {
      const i = m.inicioDoRelogio(new Date('${pedidoIso}'));
      console.log(JSON.stringify({
        iso: i.toISOString(),
        sp: new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'medium', hourCycle: 'h23' }).format(i),
      }));
    });`;

  return JSON.parse(
    execFileSync(process.execPath, ['-e', codigo], {
      env: { ...process.env, TZ: tz },
      encoding: 'utf8',
    })
  );
}

test('inicioDoRelogio: 5 min antes do horário pedido', () => {
  const pedido = SP('15:30:00');

  assert.equal(pedido.getTime() - inicioDoRelogio(pedido).getTime(), MARGEM);
  assert.equal(MARGEM, 5 * 60 * 1000);
});

test('inicioDoRelogio: perto da meia-noite de São Paulo a margem encolhe e o dia não troca (00:00, 00:02, 00:05, 23:59)', () => {
  const margem = (hhmmss) => SP(hhmmss).getTime() - inicioDoRelogio(SP(hhmmss)).getTime();

  assert.equal(margem('00:00:00'), 0); // exatamente 00:00: nada cabe
  assert.equal(margem('00:02:00'), 2 * 60 * 1000);
  assert.equal(margem('00:05:00'), MARGEM);
  assert.equal(margem('00:00:30.250'), 30250);
  assert.equal(margem('23:59:00'), MARGEM);
});

test('inicioDoRelogio: o mesmo resultado com o processo em UTC e em São Paulo (o fuso do processo não conta)', () => {
  for (const [pedido, esperado] of [
    ['2026-10-22T03:00:00Z', '2026-10-22T03:00:00.000Z'], // 00:00 em SP: margem 0
    ['2026-10-22T03:02:00Z', '2026-10-22T03:00:00.000Z'], // 00:02 -> 00:00
    ['2026-10-22T03:05:00Z', '2026-10-22T03:00:00.000Z'], // 00:05 -> 00:00
    ['2026-10-23T02:59:00Z', '2026-10-23T02:54:00.000Z'], // 23:59 -> 23:54
  ]) {
    for (const tz of ['UTC', 'America/Sao_Paulo', 'Asia/Tokyo']) {
      const r = emFuso(tz, pedido);

      assert.equal(r.iso, esperado, `${pedido} com TZ=${tz}`);
    }
  }
});

test('inicioDoRelogio: aceita Date, número e texto', () => {
  const pedido = SP('12:00:00');

  assert.equal(
    inicioDoRelogio(pedido.getTime()).getTime(),
    inicioDoRelogio(pedido).getTime()
  );
  assert.equal(
    inicioDoRelogio(pedido.toISOString()).getTime(),
    inicioDoRelogio(pedido).getTime()
  );
});

test('pausar às 00:00 em ponto (margem 0) não estoura: pausa no presente da página e o tempo não anda sozinho', async () => {
  const navegador = await chromium.launch();

  try {
    const pg = await (await navegador.newContext()).newPage();
    const pedido = SP('00:00:00');

    await iniciarRelogio(pg, pedido);
    await pg.goto('about:blank');
    await pausarRelogio(pg, pedido); // o relógio já passou do horário: sem pauseAt para o passado

    assert.equal(estaPausado(pg), true);
    const antes = await pg.evaluate(() => Date.now());

    assert.ok(antes >= pedido.getTime() && antes <= pedido.getTime() + FOLGA_MS + 1000);
    assert.equal(new Date(antes).toISOString().slice(0, 10), '2026-10-22'); // mesmo dia
    await new Promise((ok) => setTimeout(ok, 800));
    assert.equal(await pg.evaluate(() => Date.now()), antes);
  } finally {
    await navegador.close();
  }
});

test('pausado, o tempo do app não anda sozinho (só com runFor)', async () => {
  const navegador = await chromium.launch();

  try {
    const pg = await (await navegador.newContext()).newPage();
    const pedido = new Date('2026-10-22T15:30:00-03:00');

    await iniciarRelogio(pg, pedido);
    await pg.goto('about:blank');
    await pausarRelogio(pg, pedido);

    const antes = await pg.evaluate(() => Date.now());

    assert.equal(antes, pedido.getTime());
    await new Promise((ok) => setTimeout(ok, 1500)); // 1,5 s reais
    assert.equal(await pg.evaluate(() => Date.now()), antes);

    await pg.clock.runFor(800); // só anda quando o teste manda
    assert.equal(await pg.evaluate(() => Date.now()), antes + 800);
  } finally {
    await navegador.close();
  }
});
