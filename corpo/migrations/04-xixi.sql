-- Xixi passa da Água para o Corpo: corpo_dia.xixis (horários "HH:MM" do dia), ao lado do sono e das evacuações.
-- Copia os xixis de agua_dia (dia que ainda não tem linha no Corpo nasce aqui) e tira a coluna de agua_dia.
-- A bexiga (ml por xixi) fica no Corpo, que lê agua_dia só para somar a água do dia. Aplicar no DataGrip.
-- Rodar de novo não muda nada (a coluna de agua_dia volta vazia só para sair de novo).
-- Formato DataGrip: sem bloco anônimo, sem ponto e vírgula em comentário, tudo entre begin e commit.
begin;

alter table public.corpo_dia add column if not exists xixis jsonb not null default '[]'::jsonb
  check (jsonb_typeof(xixis) = 'array' and jsonb_array_length(xixis) <= 50);
comment on column public.corpo_dia.xixis is 'Corpo: horários dos xixis do dia ("HH:MM"). Veio de agua_dia na migration 04.';

alter table public.agua_dia add column if not exists xixis jsonb not null default '[]'::jsonb;
insert into public.corpo_dia (user_id, data, xixis)
  select user_id, data, xixis from public.agua_dia where jsonb_array_length(xixis) > 0
  on conflict (user_id, data) do update set xixis = excluded.xixis;
alter table public.agua_dia drop column xixis;
comment on table public.agua_dia is 'Água: água bebida no dia (aguas). Xixi foi para corpo_dia.';

commit;
