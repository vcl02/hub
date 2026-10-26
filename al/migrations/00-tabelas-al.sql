-- Tabelas da Alimentação (prefixo al_) no projeto fin. Aplicar no DataGrip.
-- al_item = comidas salvas (o cache do que a IA estimou ou do que foi digitado à mão), al_registro = o que foi comido em cada dia,
-- al_dia = o toque "andei hoje" (caminhada), al_uso = chamadas à IA por dia (limite diário, gravado pela Edge Function al-estimar).
-- Só a conta do Victor lê e grava (mesmo padrão das tr_*), anon não tem acesso.
-- Formato DataGrip: sem bloco anônimo, sem ponto e vírgula em comentário, tudo entre begin e commit.
begin;

create table public.al_item (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  id text not null,
  nome text not null check (length(nome) between 1 and 60),
  porcao text not null default '' check (length(porcao) <= 60),
  kcal numeric not null check (kcal >= 0 and kcal <= 5000),
  prot numeric not null check (prot >= 0 and prot <= 500),
  carb numeric not null check (carb >= 0 and carb <= 500),
  gord numeric not null check (gord >= 0 and gord <= 500),
  usos int not null default 0 check (usos >= 0),
  primary key (user_id, id)
);
create table public.al_registro (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  id text not null,
  data date not null,
  hora text not null default '',
  item_id text,
  nome text not null check (length(nome) between 1 and 60),
  porcao text not null default '' check (length(porcao) <= 60),
  qtd numeric not null default 1 check (qtd > 0 and qtd <= 20),
  kcal numeric not null check (kcal >= 0 and kcal <= 5000),
  prot numeric not null check (prot >= 0 and prot <= 500),
  carb numeric not null check (carb >= 0 and carb <= 500),
  gord numeric not null check (gord >= 0 and gord <= 500),
  primary key (user_id, id)
);
create index al_registro_data on public.al_registro (user_id, data);
create table public.al_dia (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  data date not null,
  andou boolean not null default false,
  primary key (user_id, data)
);
create table public.al_uso (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  data date not null,
  chamadas int not null default 0 check (chamadas >= 0),
  primary key (user_id, data)
);
comment on table public.al_item is 'Alimentação: comidas salvas (cache da IA ou digitadas), valores da porção descrita, usos = vezes adicionada.';
comment on table public.al_registro is 'Alimentação: o que foi comido no dia, cópia dos valores da porção (kcal e gramas de proteína, carboidrato e gordura) vezes qtd.';
comment on table public.al_dia is 'Alimentação: andou = caminhada do dia (soma no gasto).';
comment on table public.al_uso is 'Alimentação: chamadas à IA por dia (Edge Function al-estimar), para o limite diário.';

alter table public.al_item enable row level security;
revoke all on public.al_item from anon;
grant select, insert, update, delete on public.al_item to authenticated;
create policy al_item_somente_dono on public.al_item for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy al_item_somente_victor on public.al_item as restrictive for all to authenticated
  using ((select auth.uid()) = '32f70255-30a0-4e2b-ad76-31d7a1bf54f7'::uuid)
  with check ((select auth.uid()) = '32f70255-30a0-4e2b-ad76-31d7a1bf54f7'::uuid);

alter table public.al_registro enable row level security;
revoke all on public.al_registro from anon;
grant select, insert, update, delete on public.al_registro to authenticated;
create policy al_registro_somente_dono on public.al_registro for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy al_registro_somente_victor on public.al_registro as restrictive for all to authenticated
  using ((select auth.uid()) = '32f70255-30a0-4e2b-ad76-31d7a1bf54f7'::uuid)
  with check ((select auth.uid()) = '32f70255-30a0-4e2b-ad76-31d7a1bf54f7'::uuid);

alter table public.al_dia enable row level security;
revoke all on public.al_dia from anon;
grant select, insert, update, delete on public.al_dia to authenticated;
create policy al_dia_somente_dono on public.al_dia for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy al_dia_somente_victor on public.al_dia as restrictive for all to authenticated
  using ((select auth.uid()) = '32f70255-30a0-4e2b-ad76-31d7a1bf54f7'::uuid)
  with check ((select auth.uid()) = '32f70255-30a0-4e2b-ad76-31d7a1bf54f7'::uuid);

alter table public.al_uso enable row level security;
revoke all on public.al_uso from anon;
grant select, insert, update on public.al_uso to authenticated;
create policy al_uso_somente_dono on public.al_uso for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy al_uso_somente_victor on public.al_uso as restrictive for all to authenticated
  using ((select auth.uid()) = '32f70255-30a0-4e2b-ad76-31d7a1bf54f7'::uuid)
  with check ((select auth.uid()) = '32f70255-30a0-4e2b-ad76-31d7a1bf54f7'::uuid);

commit;
