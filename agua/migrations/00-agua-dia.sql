-- Água: o que bebi e as idas ao banheiro (xixi) de cada dia. Aplicar no DataGrip.
-- 1 linha por dia: aguas = [{ hora "HH:MM", ml }], xixis = ["HH:MM"]. Dia sem nada não fica guardado.
-- Só a conta do Victor (mesmo padrão das tabelas do hub), anon sem acesso. Rodar de novo não muda nada.
-- Formato DataGrip: sem bloco anônimo, sem ponto e vírgula em comentário, tudo entre begin e commit.
begin;

create table if not exists public.agua_dia (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  data date not null,
  aguas jsonb not null default '[]'::jsonb check (jsonb_typeof(aguas) = 'array' and jsonb_array_length(aguas) <= 100),
  xixis jsonb not null default '[]'::jsonb check (jsonb_typeof(xixis) = 'array' and jsonb_array_length(xixis) <= 50),
  primary key (user_id, data)
);
comment on table public.agua_dia is 'Água: água bebida (horário e ml) e xixis (horários) do dia.';

alter table public.agua_dia enable row level security;
revoke all on public.agua_dia from anon;
grant select, insert, update, delete on public.agua_dia to authenticated;
drop policy if exists agua_dia_somente_dono on public.agua_dia;
create policy agua_dia_somente_dono on public.agua_dia for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
drop policy if exists agua_dia_somente_victor on public.agua_dia;
create policy agua_dia_somente_victor on public.agua_dia as restrictive for all to authenticated
  using ((select auth.uid()) = '32f70255-30a0-4e2b-ad76-31d7a1bf54f7'::uuid)
  with check ((select auth.uid()) = '32f70255-30a0-4e2b-ad76-31d7a1bf54f7'::uuid);

commit;
