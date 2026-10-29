-- Atalhos da captura do Nubank: o estabelecimento da notificação (ex.: NAQUELE CAFE COMERCIO) ligado ao
-- lançamento de sempre (Café, Besteira, 1 parcela). Com o atalho, a Edge Function captura-nubank lança sozinha,
-- sem os diálogos do Tasker. Entra na lista quando o mantenedor responde Sim em "Sempre assim?" no Tasker.
-- chave = estabelecimento sem acento, em minúsculas e com espaços simples (a função calcula).
-- A função grava com a chave de serviço (como em fin), e pelo app só o dono lê e escreve. Histórico em fin_historico.
-- Cria só a tabela nova, não altera nenhuma linha de fin. Aplicar no DataGrip, depois da 27 e da 40.
-- Rodar de novo não muda nada (tabela e policies se não existirem, gatilho recriado).
-- Formato DataGrip: sem bloco anônimo, sem ponto e vírgula em comentário, tudo entre begin e commit.
begin;

select 'public.fin_historico'::regclass;
select 'public.registrar_historico()'::regprocedure;

create table if not exists public.fin_atalho (
  id integer generated always as identity primary key,
  chave text not null unique check (btrim(chave) <> ''),
  estab text not null,
  nome text not null check (btrim(nome) <> ''),
  categ text not null check (btrim(categ) <> ''),
  parcelas integer not null default 1 check (parcelas between 1 and 24),
  atualizado_em timestamptz not null default now()
);

comment on table public.fin_atalho is
  'Atalhos da captura do Nubank: estabelecimento (chave normalizada) -> nome, categoria e parcelas de sempre. Gravado pela Edge Function captura-nubank.';

alter table public.fin_atalho enable row level security;
revoke all on table public.fin_atalho from anon;
grant select, insert, update, delete on table public.fin_atalho to authenticated;

drop policy if exists fin_atalho_leitura_somente_dono on public.fin_atalho;
create policy fin_atalho_leitura_somente_dono on public.fin_atalho for select to authenticated
  using ((select auth.uid()) = '32f70255-30a0-4e2b-ad76-31d7a1bf54f7'::uuid);

drop policy if exists fin_atalho_insercao_somente_dono on public.fin_atalho;
create policy fin_atalho_insercao_somente_dono on public.fin_atalho for insert to authenticated
  with check ((select auth.uid()) = '32f70255-30a0-4e2b-ad76-31d7a1bf54f7'::uuid);

drop policy if exists fin_atalho_atualizacao_somente_dono on public.fin_atalho;
create policy fin_atalho_atualizacao_somente_dono on public.fin_atalho for update to authenticated
  using ((select auth.uid()) = '32f70255-30a0-4e2b-ad76-31d7a1bf54f7'::uuid)
  with check ((select auth.uid()) = '32f70255-30a0-4e2b-ad76-31d7a1bf54f7'::uuid);

drop policy if exists fin_atalho_exclusao_somente_dono on public.fin_atalho;
create policy fin_atalho_exclusao_somente_dono on public.fin_atalho for delete to authenticated
  using ((select auth.uid()) = '32f70255-30a0-4e2b-ad76-31d7a1bf54f7'::uuid);

drop trigger if exists fin_atalho_historico on public.fin_atalho;
create trigger fin_atalho_historico
  after insert or update or delete on public.fin_atalho
  for each row execute function public.registrar_historico();

commit;
