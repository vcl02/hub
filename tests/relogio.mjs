// Relógio falso dos testes de navegador, igual para todos os apps: nasce antes do horário pedido e é PAUSADO nele.
// Por quê: `pg.clock.install({ time })` deixa o relógio falso correndo em tempo real; sob carga (vários Chromium em
// paralelo) os segundos reais entravam no tempo do app (toque repetido de 0,5 s, cronômetros, envio de 800 ms) e os
// testes oscilavam. Pausado, só andam os `fastForward`/`runFor` do próprio teste.

// O relógio nasce MARGEM antes do pedido: cobre o tempo real da carga e do login (o pauseAt só anda para a frente).
export const MARGEM = 5 * 60 * 1000;

// Prazo do envio do app (setTimeout de 800 ms em js/banco.js de cada app; sem constante exposta, produção intocada).
export const ENVIO_MS = 800;

// Folga do pause às 00:00 em ponto (ver pausarRelogio).
export const FOLGA_MS = 5000;

// Fuso dos contextos de navegador dos apps (timezoneId de al, corpo, agua e fin): o dia do relógio é o de lá, não o do processo.
export const FUSO = 'America/Sao_Paulo';

const partes = new Intl.DateTimeFormat('en-GB', {
  timeZone: FUSO,
  hourCycle: 'h23',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
});

// A margem nunca atravessa a meia-noite: entre 00:00 e 00:05 (em São Paulo, qualquer que seja o fuso do processo) o relógio
// nasce no início do mesmo dia (margem = o que o horário pedido permite; 0 às 00:00), senão o app abriria no dia anterior.
export function inicioDoRelogio(horario) {
  const pedido = new Date(horario);

  const p = Object.fromEntries(
    partes.formatToParts(pedido).map((x) => [x.type, +x.value])
  );

  const desdeMeiaNoite =
    ((p.hour * 60 + p.minute) * 60 + p.second) * 1000 +
    (((pedido.getTime() % 1000) + 1000) % 1000);

  return new Date(pedido.getTime() - Math.min(MARGEM, desdeMeiaNoite));
}

const pausados = new WeakSet();

// Instala o relógio falso antes da página abrir (chamar antes do goto).
export async function iniciarRelogio(pg, horario) {
  await pg.clock.install({ time: inicioDoRelogio(horario) });
}

// Pausa no horário pedido, depois que a tela abriu.
export async function pausarRelogio(pg, horario) {
  let alvo = new Date(horario);

  // Margem 0 (00:00 em ponto): o relógio já passou do horário quando a tela abriu e o pauseAt não anda para trás. Pausa no
  // presente da página, com folga para o pedido chegar (ainda no mesmo dia: só acontece às 00:00:00).
  if (inicioDoRelogio(horario).getTime() === alvo.getTime()) {
    const agora = await pg.evaluate(() => Date.now());

    if (agora >= alvo.getTime()) alvo = new Date(agora + FOLGA_MS);
  }

  await pg.clock.pauseAt(alvo);
  pausados.add(pg);
}

export const estaPausado = (pg) => pausados.has(pg);

// Com o relógio pausado, o envio (setTimeout de 800 ms na página) só sai se o teste andar o relógio: faz isso aqui e
// espera acabar. `pendente` roda na página e diz se há envio agendado (temPendente() dos apps com banco).
export async function andarSePendente(pg, pendente) {
  if (pausados.has(pg) && (await pg.evaluate(pendente))) await pg.clock.runFor(ENVIO_MS);
}

// Anda o relógio pausado em passos até a condição (função que roda na página) ser verdadeira: serve quando o que se espera
// passa por mais de um prazo do app (envio de 800 ms e depois a nova tentativa do cliente do Supabase, que espera por timer
// após falha de rede). Estoura (alto) se não chegar em `max` passos.
export async function andarAte(pg, condicao, { passo = ENVIO_MS, max = 40 } = {}) {
  for (let i = 0; i < max; i++) {
    if (await pg.evaluate(condicao)) return;
    await pg.clock.runFor(passo);
    await new Promise((ok) => setTimeout(ok, 50)); // deixa a rede (real) responder
  }

  throw new Error(
    'andarAte: a condição não aconteceu em ' + max + ' passos de ' + passo + ' ms'
  );
}
