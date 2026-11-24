-- Ordem das notas definida pelo Victor (arrastar pela alça na lista): coluna ordem em notas_nota.
-- Aplicar no DataGrip, depois da 01 (e da 02 da raiz, que liga notas_nota ao hub_historico e já guarda a coluna nova).
-- ordem é double precision: a lista vai da menor para a maior, nota nova entra com a menor - 1 e mover dá a média das vizinhas.
-- As notas que já existem ganham a ordem de hoje (editada mais recente primeiro, 1, 2, 3... por conta, empate pelo id).
-- Rodar de novo não muda nada (só preenche onde ordem ainda é nula, e a coluna já existe).
-- Formato DataGrip: sem bloco anônimo, sem ponto e vírgula em comentário, tudo entre begin e commit.
begin;

alter table public.notas_nota
  add column if not exists ordem double precision;

with numeradas as (
  select user_id, id, row_number() over (partition by user_id order by editada_em desc, id) as n
  from public.notas_nota
  where ordem is null
)
update public.notas_nota t
set ordem = numeradas.n
from numeradas
where t.user_id = numeradas.user_id
  and t.id = numeradas.id;

alter table public.notas_nota
  alter column ordem set default 0,
  alter column ordem set not null;

comment on column public.notas_nota.ordem is 'Posição da nota na lista (crescente), definida arrastando. Fracionária: mover muda só a nota movida.';

commit;
