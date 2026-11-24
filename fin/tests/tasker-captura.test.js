// Tasker (fin/tasker): a notificação de gasto do Nubank vira um POST cru para a captura-nubank, sem diálogo,
// sem fila e sem atalho no celular; o que não é gasto não faz nada. Roda os JavaScriptlets do XML de verdade.
const assert = require('./helpers/assert-tolerante');
const fs = require('node:fs');
const test = require('node:test');
const vm = require('node:vm');

const ler = (arquivo) => fs.readFileSync(arquivo, 'utf8');

const desfaz = (s) =>
  s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&');

const acoes = (xml) =>
  [...xml.matchAll(/<Action sr="act(\d+)" ve="7">([\s\S]*?)<\/Action>/g)]
    .map((m) => ({ n: +m[1], corpo: m[2], codigo: m[2].match(/<code>(\d+)<\/code>/)[1] }))
    .sort((a, b) => a.n - b.n);

const script = (acao) =>
  desfaz(acao.corpo.match(/<Str sr="arg0" ve="3">([\s\S]*?)<\/Str>/)[1]);

function roda(codigo, locais) {
  const saida = { ...locais };

  vm.runInNewContext(codigo, {
    local: (k) => saida[k],
    setLocal: (k, v) => {
      saida[k] = v;
    },
    JSON,
    Math,
    Date,
    String,
  });

  return saida;
}

const tarefa = (xml) => xml.match(/<Task sr="task3">[\s\S]*?<\/Task>/)[0];

test('o profile Nubank leva a mesma tarefa do arquivo avulso; só há essa tarefa e esse profile', () => {
  assert.equal(
    tarefa(ler('tasker/Nubank.prf.xml')),
    tarefa(ler('tasker/Nubank_A.tsk.xml'))
  );
  assert.deepEqual(fs.readdirSync('tasker').sort(), [
    'Nubank.prf.xml',
    'Nubank_A.tsk.xml',
  ]);
});

test('a tarefa é curta: lê, para se não é gasto, manda o POST, apaga a notificação do Nubank ou avisa a falha', () => {
  const a = acoes(ler('tasker/Nubank_A.tsk.xml'));

  // JavaScriptlet, Stop, JavaScriptlet, HTTP Request, AutoNotification Cancel, Flash
  assert.deepEqual(
    a.map((x) => x.codigo),
    ['129', '137', '129', '339', '2046367074', '548']
  );
  assert.match(a[1].corpo, /<lhs>%tipo<\/lhs>\s*<op>3<\/op>\s*<rhs>despesa\*<\/rhs>/);
  assert.match(a[3].corpo, /captura-nubank<\/Str>/);
  assert.match(a[3].corpo, /x-fin-token:%FINTOKEN/);
  assert.match(a[3].corpo, /<Str sr="arg5" ve="3">%body<\/Str>/);
  // Só com resposta 2xx apaga a notificação do Nubank (app Nubank, compra, NuPay ou boleto); senão avisa e a deixa lá.
  assert.match(a[4].corpo, /_array_InterceptApps0&gt;com\.nu\.production&lt;/);
  assert.match(a[4].corpo, /<Text>\(\?is\)\.\*\(compra\|nupay\|boleto\)\.\*<\/Text>/);
  assert.match(
    a[4].corpo,
    /<lhs>%http_response_code<\/lhs>\s*<op>2<\/op>\s*<rhs>2\*<\/rhs>/
  );
  assert.match(
    a[5].corpo,
    /<lhs>%http_response_code<\/lhs>\s*<op>3<\/op>\s*<rhs>2\*<\/rhs>/
  );
  assert.doesNotMatch(
    ler('tasker/Nubank_A.tsk.xml'),
    /FINPEND|<code>378<\/code>|<code>360<\/code>/
  );
});

test('lê crédito, NuPay em Nx e débito; Pix, boleto, cashback e o resto não são gasto', () => {
  const [parse] = acoes(ler('tasker/Nubank_A.tsk.xml'));
  const le = (titulo, texto) => roda(script(parse), { evtprm2: titulo, evtprm3: texto });
  const campos = (r) => [r.tipo, r.valor, r.estab, r.parcelas];

  assert.deepEqual(
    campos(
      le(
        'Compra aprovada',
        'Compra de R$ 1.234,56 APROVADA em MERCADO BOM D MAIS para o cartão com final 1346.'
      )
    ),
    ['despesa_credito', '1234.56', 'MERCADO BOM D MAIS', '1']
  );
  assert.deepEqual(
    campos(
      le(
        'Pagamento com NuPay aprovado',
        'R$ 11,53 em 3x no crédito sem juros com NuPay APROVADO em Uber.'
      )
    ),
    ['despesa_credito', '11.53', 'Uber', '3']
  );
  assert.deepEqual(
    campos(le('Compra no débito aprovada', 'Compra de R$ 5,90 em EMV CMT*156596385')),
    ['despesa_debito', '5.90', 'EMV CMT*156596385', '1']
  );

  // Boleto pago (texto suposto, sem print): sai da conta como débito; com "para X" leva o X, senão "Boleto".
  assert.deepEqual(
    campos(
      le(
        'Pagamento realizado',
        'O pagamento do boleto de R$ 250,00 para TRYBE foi realizado.'
      )
    ),
    ['despesa_debito', '250.00', 'TRYBE', '1']
  );
  assert.deepEqual(campos(le('Boleto pago', 'Pagamento de R$ 1.250,50 confirmado.')), [
    'despesa_debito',
    '1250.50',
    'Boleto',
    '1',
  ]);

  for (const [titulo, texto] of [
    ['Boleto vence amanhã', 'Seu boleto de R$ 250,00 vence amanhã'],
    ['Pagamento agendado', 'O boleto de R$ 250,00 foi agendado'],
    ['Lembrete', 'Você tem um boleto de R$ 250,00 disponível'],
    ['Transferência realizada', 'Você transferiu R$ 50,00 para Fulano.'],
    ['Transferência recebida', 'Você recebeu R$ 199,90 de Cintia'],
    ['Você ganhou R$ 0,16 de cashback', 'Continue usando seu cartão.'],
    ['Compra aprovada', 'Compra de R$ 5,90 em LOJA'],
  ])
    assert.equal(le(titulo, texto).tipo, 'nenhum', titulo);
});

test('o corpo do POST leva tipo, valor, estabelecimento e parcelas como vieram, sem auto, lembrar nem nome', () => {
  const [, , corpo] = acoes(ler('tasker/Nubank_A.tsk.xml'));

  const saida = roda(script(corpo), {
    tipo: 'despesa_credito',
    valor: '18.98',
    estab: 'MERCADO BOM D MAIS',
    parcelas: '1',
  });

  const enviado = JSON.parse(saida.body);

  assert.deepEqual(
    { ...enviado, ts: typeof enviado.ts },
    {
      tipo: 'despesa_credito',
      valor: '18.98',
      estab: 'MERCADO BOM D MAIS',
      parcelas: '1',
      cartao: 'nubank',
      ts: 'string',
    }
  );
  assert.ok(Math.abs(Number(enviado.ts) - Date.now() / 1000) < 5);
});
