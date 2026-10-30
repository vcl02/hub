-- Marmitas: uma refeição montada antes (ex.: à noite, para o almoço do dia seguinte), guardada com os itens e as quantidades,
-- para aplicar no dia em que for comida. restam = quantas marmitas iguais foram preparadas (cada "Aplicar" gasta uma, e a
-- última apaga a linha). itens = [{ nome, porcao, qtd, kcal, prot, carb, gord }], valores de 1 porção (como em al_item).
-- Aplicar no DataGrip, depois da 02. Depois, a migration 01 da raiz (histórico das marmitas). Rodar de novo não muda nada.
-- Formato DataGrip: sem bloco anônimo, sem ponto e vírgula em comentário, tudo entre begin e commit.
begin;

create table if not exists public.al_marmita (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  id text not null,
  nome text not null check (length(nome) between 1 and 60),
  itens jsonb not null check (jsonb_typeof(itens) = 'array' and jsonb_array_length(itens) between 1 and 20),
  restam integer not null default 1 check (restam between 1 and 50),
  primary key (user_id, id)
);
comment on table public.al_marmita is 'Alimentação: marmitas montadas antes (itens com quantidades), para aplicar no dia; restam = quantas ainda há.';

alter table public.al_marmita enable row level security;
revoke all on public.al_marmita from anon;
grant select, insert, update, delete on public.al_marmita to authenticated;
drop policy if exists al_marmita_somente_dono on public.al_marmita;
create policy al_marmita_somente_dono on public.al_marmita for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
drop policy if exists al_marmita_somente_victor on public.al_marmita;
create policy al_marmita_somente_victor on public.al_marmita as restrictive for all to authenticated
  using ((select auth.uid()) = '32f70255-30a0-4e2b-ad76-31d7a1bf54f7'::uuid)
  with check ((select auth.uid()) = '32f70255-30a0-4e2b-ad76-31d7a1bf54f7'::uuid);

commit;
