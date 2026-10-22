-- Tabelas do Diário de Carga (prefixo tr_) no projeto fin. JÁ APLICADA em 2026-10-21 (via MCP).
-- Cada usuário só vê e altera as próprias linhas (user_id = auth.uid()), anon não tem acesso.
-- Formato DataGrip: sem bloco anônimo, sem ponto e vírgula em comentário, tudo entre begin e commit.
begin;

create table public.tr_exercicio (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  id text not null,
  ordem int not null,
  grupo text not null,
  regiao text not null check (regiao in ('Pernas','Superior')),
  series int not null check (series between 1 and 10),
  reps int not null check (reps between 1 and 50),
  descanso int not null check (descanso between 10 and 600),
  modo text not null check (modo in ('crescente','reta','invertida')),
  ativo int not null default 0 check (ativo between 0 and 2),
  primary key (user_id, id)
);
create table public.tr_variacao (
  user_id uuid not null default auth.uid(),
  id text not null,
  exercicio_id text not null,
  ordem int not null check (ordem between 0 and 2),
  nome text not null default '',
  unidade text not null check (unidade in ('kg','lb','nível')),
  passo numeric not null check (passo > 0 and passo <= 50),
  lados int not null default 1 check (lados in (1,2)),
  equip text,
  nota text,
  primary key (user_id, id),
  foreign key (user_id, exercicio_id) references public.tr_exercicio(user_id, id) on delete cascade
);
create table public.tr_registro (
  user_id uuid not null default auth.uid(),
  variacao_id text not null,
  data date not null,
  series jsonb not null,
  primary key (user_id, variacao_id, data),
  foreign key (user_id, variacao_id) references public.tr_variacao(user_id, id) on delete cascade
);
create table public.tr_treino (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  inicio timestamptz not null,
  fim timestamptz not null check (fim >= inicio),
  fechado boolean not null default false,
  primary key (user_id, inicio)
);
create table public.tr_medida (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  data date not null,
  hora text not null default '',
  peso numeric not null check (peso > 0),
  cintura numeric check (cintura > 0),
  primary key (user_id, data)
);
comment on table public.tr_exercicio is 'Diário de Carga: exercícios do treino (ordem = posição na lista, ativo = variação em uso 0..2).';
comment on table public.tr_variacao is 'Diário de Carga: principal (0), substituto (1) e halter (2) de cada exercício.';
comment on table public.tr_registro is 'Diário de Carga: 1 registro por variação por dia, series = [{kg, reps}].';
comment on table public.tr_treino is 'Diário de Carga: horário de cada treino (1 por dia).';
comment on table public.tr_medida is 'Diário de Carga: peso corporal (kg), horário e cintura (cm).';

alter table public.tr_exercicio enable row level security;
revoke all on public.tr_exercicio from anon;
grant select, insert, update, delete on public.tr_exercicio to authenticated;
create policy tr_exercicio_somente_dono on public.tr_exercicio for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

alter table public.tr_variacao enable row level security;
revoke all on public.tr_variacao from anon;
grant select, insert, update, delete on public.tr_variacao to authenticated;
create policy tr_variacao_somente_dono on public.tr_variacao for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

alter table public.tr_registro enable row level security;
revoke all on public.tr_registro from anon;
grant select, insert, update, delete on public.tr_registro to authenticated;
create policy tr_registro_somente_dono on public.tr_registro for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

alter table public.tr_treino enable row level security;
revoke all on public.tr_treino from anon;
grant select, insert, update, delete on public.tr_treino to authenticated;
create policy tr_treino_somente_dono on public.tr_treino for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

alter table public.tr_medida enable row level security;
revoke all on public.tr_medida from anon;
grant select, insert, update, delete on public.tr_medida to authenticated;
create policy tr_medida_somente_dono on public.tr_medida for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

commit;
