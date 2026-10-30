-- Vínculos da captura de pagamentos (Pix, boleto e Pix recebido): quem recebe ou paga (trecho do nome
-- na notificação do Nubank) ligado a uma conta prevista em fin, identificada por nome e categoria.
-- Uma pessoa pode ter vários vínculos (o iPhone e outra conta pagos pra mesma pessoa), por isso a
-- chave única é o par trecho + conta, e não só o trecho como em fin_atalho.
-- chave = trecho sem acento, em minúsculas, pontuação e espaços viram um espaço só (a função calcula).
-- nome = nome da conta sem o número de parcela do fim, ex.: Iphone e não Iphone (3/12).
-- A Edge Function captura-nubank grava com a chave de serviço (como em fin), e pelo app só o dono lê e
-- escreve. Histórico em fin_historico. Cria só a tabela nova, não altera nenhuma linha de fin.
-- Aplicar depois da 27 e da 40. Rodar de novo não muda nada (tabela e policies se não existirem, gatilho recriado).
-- Formato DataGrip: sem bloco anônimo, sem ponto e vírgula em comentário, tudo entre begin e commit.
begin;

select 'public.fin_historico'::regclass;
select 'public.registrar_historico()'::regprocedure;

create table if not exists public.fin_vinculo (
  id integer generated always as identity primary key,
  chave text not null check (btrim(chave) <> ''),
  nome text not null check (btrim(nome) <> ''),
  categ text not null check (btrim(categ) <> ''),
  atualizado_em timestamptz not null default now(),
  unique (chave, nome, categ)
);

comment on table public.fin_vinculo is
  'Vínculos da captura de pagamentos: trecho de quem recebe ou paga (chave normalizada) -> conta prevista em fin (nome e categoria). Gravado pela Edge Function captura-nubank.';

alter table public.fin_vinculo enable row level security;
revoke all on table public.fin_vinculo from anon;
grant select, insert, update, delete on table public.fin_vinculo to authenticated;

drop policy if exists fin_vinculo_leitura_somente_dono on public.fin_vinculo;
create policy fin_vinculo_leitura_somente_dono on public.fin_vinculo for select to authenticated
  using ((select auth.uid()) = '32f70255-30a0-4e2b-ad76-31d7a1bf54f7'::uuid);

drop policy if exists fin_vinculo_insercao_somente_dono on public.fin_vinculo;
create policy fin_vinculo_insercao_somente_dono on public.fin_vinculo for insert to authenticated
  with check ((select auth.uid()) = '32f70255-30a0-4e2b-ad76-31d7a1bf54f7'::uuid);

drop policy if exists fin_vinculo_atualizacao_somente_dono on public.fin_vinculo;
create policy fin_vinculo_atualizacao_somente_dono on public.fin_vinculo for update to authenticated
  using ((select auth.uid()) = '32f70255-30a0-4e2b-ad76-31d7a1bf54f7'::uuid)
  with check ((select auth.uid()) = '32f70255-30a0-4e2b-ad76-31d7a1bf54f7'::uuid);

drop policy if exists fin_vinculo_exclusao_somente_dono on public.fin_vinculo;
create policy fin_vinculo_exclusao_somente_dono on public.fin_vinculo for delete to authenticated
  using ((select auth.uid()) = '32f70255-30a0-4e2b-ad76-31d7a1bf54f7'::uuid);

drop trigger if exists fin_vinculo_historico on public.fin_vinculo;
create trigger fin_vinculo_historico
  after insert or update or delete on public.fin_vinculo
  for each row execute function public.registrar_historico();

commit;
