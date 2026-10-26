-- Corpo: registro do dia que não é medida (por enquanto, evacuou sim ou não). Aplicar no DataGrip.
-- 1 linha por dia, só quando foi marcado. Sem linha = não respondido.
-- Só o app Corpo grava. Só a conta do Victor (mesmo padrão de corpo_medida), anon sem acesso. Rodar de novo não muda nada.
-- Formato DataGrip: sem bloco anônimo, sem ponto e vírgula em comentário, tudo entre begin e commit.
begin;

create table if not exists public.corpo_dia (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  data date not null,
  evacuou boolean not null,
  primary key (user_id, data)
);
comment on table public.corpo_dia is 'Corpo: registro do dia (evacuou sim ou não). Sem linha = não respondido. Só o app Corpo grava.';

alter table public.corpo_dia enable row level security;
revoke all on public.corpo_dia from anon;
grant select, insert, update, delete on public.corpo_dia to authenticated;
drop policy if exists corpo_dia_somente_dono on public.corpo_dia;
create policy corpo_dia_somente_dono on public.corpo_dia for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
drop policy if exists corpo_dia_somente_victor on public.corpo_dia;
create policy corpo_dia_somente_victor on public.corpo_dia as restrictive for all to authenticated
  using ((select auth.uid()) = '32f70255-30a0-4e2b-ad76-31d7a1bf54f7'::uuid)
  with check ((select auth.uid()) = '32f70255-30a0-4e2b-ad76-31d7a1bf54f7'::uuid);

commit;
