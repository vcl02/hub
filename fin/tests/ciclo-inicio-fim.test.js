// Regressão: ciclos com início e fim próprios em public.fin_ciclo (migration 26). Nada no
// código ou no banco procura mais o lançamento "Faturamento PJ"; a migration converte os
// ciclos que o app calculava a partir dele, um a um, sem perder os limites já salvos.
const assert = require('./helpers/assert-tolerante');
const fs = require('node:fs');
const test = require('node:test');

const migracao = fs.readFileSync('migrations/26-ciclo-com-inicio-e-fim.sql', 'utf8');
const regras = fs.readFileSync('docs/REGRAS.md', 'utf8');

const { carregarTela } = require('./helpers/tela-sem-navegador');

test('os ciclos vêm só de fin_ciclo: um "Faturamento PJ" nos lançamentos não cria nem muda ciclo', async () => {
  const faturamento = (id, data) => ({
    id: String(id),
    nome: 'Faturamento PJ',
    data,
    valor: 5000,
    categ: 'Salário',
    cred: false,
    pago: true,
    fatura: null,
    freq: null,
  });

  const tela = carregarTela({
    hoje: '2026-10-20',
    dados: {
      fin_ciclo: [
        { id: 1, inicio: '2026-09-20', fim: '2026-10-14' },
        { id: 2, inicio: '2026-10-15', fim: null },
      ],
      fin: [faturamento(1, '2026-08-05'), faturamento(2, '2026-10-03')],
      fin_meta: [],
    },
  });

  await tela.bruto('carregarDados()');
  // início e fim vêm das linhas de fin_ciclo (fim vazio = aberto), nunca da data dos "Faturamento PJ"
  assert.deepEqual(
    tela.rodar('Estado.ciclos').map((c) => [c.ini, c.fat]),
    [
      ['2026-09-20', '2026-10-14'],
      ['2026-10-15', '9999-12-31'],
    ]
  );
});

test('migração: um ciclo por "Faturamento PJ", início = data, fim = véspera do próximo, último aberto', () => {
  assert.match(
    migracao,
    /insert into public\.fin_ciclo \(ancora_id\)[\s\S]*?where trim\(coalesce\(nome, ''\)\) = 'Faturamento PJ' and data is not null and cred is not true[\s\S]*?on conflict \(ancora_id\) do nothing/
  );
  assert.match(migracao, /lead\(f\.data\) over \(order by f\.data\) - 1 as fim/);
  assert.match(migracao, /set inicio = o\.inicio, fim = o\.fim/);
  // Só depois das datas preenchidas o vínculo sai e id vira a chave.
  assert.ok(
    migracao.indexOf('set inicio = o.inicio') <
      migracao.indexOf('drop column if exists ancora_id')
  );
  assert.match(
    migracao,
    /add column if not exists id integer generated always as identity;/
  );
  assert.match(migracao, /add constraint fin_ciclo_pkey primary key \(id\);/);
});

test('aborta antes de alterar se os dados não permitem uma conversão exata', () => {
  assert.match(
    migracao,
    /raise exception 'public\.fin_ciclo não encontrada no formato da migration 25; aplique a 25 antes desta\.'/
  );
  assert.match(
    migracao,
    /group by data having count\(\*\) > 1[\s\S]*?raise exception 'Há dois ou mais "Faturamento PJ" na mesma data/
  );
  assert.match(
    migracao,
    /raise exception 'fin_ciclo tem linha ligada a lançamento que não é um "Faturamento PJ" com data/
  );
  assert.match(migracao, /^begin;$/m);
  assert.match(migracao, /^commit;$/m);
});

test('integridade dos ciclos no banco: início obrigatório e único, fim >= início, sem sobreposição', () => {
  assert.match(migracao, /alter column inicio set not null;/);
  assert.match(migracao, /add constraint fin_ciclo_inicio_unico unique \(inicio\);/);
  assert.match(migracao, /check \(fim is null or fim >= inicio\)/);
  assert.match(
    migracao,
    /exclude using gist \(daterange\(inicio, fim, '\[\]'\) with &&\)/
  );
});

test('regra documentada em REGRAS.md', () => {
  assert.match(regras, /Os ciclos são as linhas de `fin_ciclo`/);
  assert.match(regras, /`migrations\/26-ciclo-com-inicio-e-fim\.sql`/);
  assert.match(regras, /Comprometido(?:.|\n {2})*?toda entrada positiva do ciclo/);
});
