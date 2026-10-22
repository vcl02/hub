-- Metas: compras futuras que o mantenedor sabe que vai precisar (carro, móveis, geladeira),
-- com valor médio e mês. Só guarda o que ele decide: o app calcula o plano (à vista, cartão
-- parcelado ou entrada + financiamento) e projeta cada meta como linhas previstas nos ciclos.
-- Uma linha sem valor é uma âncora: uma data com nome (ex.: Chaves do AP) que outras metas
-- seguem com deslocamento em meses (ancora_meta_id + deslocamento), pra mudar uma data só e todas
-- andarem juntas. Excluir a âncora deixa as metas dela sem data (ancora_meta_id vira nulo).
-- Mesmo acesso de public.fin (migration 20): só o mantenedor grava, contas logadas leem,
-- anônimo nada. O histórico da migration 27 registra toda inserção, alteração e exclusão.
-- Não altera nenhuma linha de fin nem de fin_ciclo.
-- Pode rodar de novo: tabela, policies e trigger são recriados sem mudar nada.
-- Sem bloco DO/$$ e sem ponto e vírgula em comentário (o DataGrip parte o script neles).
begin;

-- Pré-requisitos: falham sozinhos, sem mudar nada, se a migration 27 não estiver aplicada.
select 'public.fin_historico'::regclass;
select 'public.registrar_historico()'::regprocedure;

create table if not exists public.fin_meta (
  id integer generated always as identity primary key,
  nome text not null check (btrim(nome) <> ''),
  -- Nulo = âncora (só data). Meta tem valor positivo.
  valor numeric(12, 2) check (valor is null or valor > 0),
  -- Mês da meta (sempre o dia 1). Nulo quando segue uma âncora.
  mes date check (mes is null or extract(day from mes) = 1),
  ancora_meta_id integer references public.fin_meta(id) on delete set null,
  -- Meses depois (positivo) ou antes (negativo) da âncora.
  deslocamento integer not null default 0 check (deslocamento between -120 and 120),
  -- auto = o app escolhe. Os demais forçam a forma.
  forma text not null default 'auto' check (forma in ('auto', 'avista', 'cartao', 'financiamento')),
  parcelas integer check (parcelas is null or parcelas between 1 and 120),
  entrada numeric(12, 2) check (entrada is null or entrada >= 0),
  -- Juros do financiamento em % ao mês. Nulo = padrão do app.
  juros_mensal numeric(5, 2) check (juros_mensal is null or juros_mensal >= 0),
  -- Custo que começa depois da compra (seguro, IPVA rateado), por mês.
  custo_mensal numeric(12, 2) check (custo_mensal is null or custo_mensal >= 0),
  status text not null default 'aberta' check (status in ('aberta', 'comprada', 'desistida')),
  criado_em timestamptz not null default now(),
  constraint fin_meta_ancora_nao_e_ela_mesma check (ancora_meta_id is null or ancora_meta_id <> id)
);

comment on table public.fin_meta is
  'Metas de compra (valor médio + mês ou âncora). Sem valor = âncora (data com nome). O plano é calculado pelo app.';

-- Mesmo acesso de public.fin (migration 20).
alter table public.fin_meta enable row level security;

revoke all on table public.fin_meta from anon;
grant select, insert, update, delete on table public.fin_meta to authenticated;

drop policy if exists fin_meta_leitura_autenticada on public.fin_meta;
drop policy if exists fin_meta_insercao_somente_dono on public.fin_meta;
drop policy if exists fin_meta_atualizacao_somente_dono on public.fin_meta;
drop policy if exists fin_meta_exclusao_somente_dono on public.fin_meta;

create policy fin_meta_leitura_autenticada on public.fin_meta
  for select to authenticated
  using (true);

create policy fin_meta_insercao_somente_dono on public.fin_meta
  for insert to authenticated
  with check ((select auth.uid()) = '2f9bc201-9966-4f37-9963-2f4b9ddab849'::uuid);

create policy fin_meta_atualizacao_somente_dono on public.fin_meta
  for update to authenticated
  using ((select auth.uid()) = '2f9bc201-9966-4f37-9963-2f4b9ddab849'::uuid)
  with check ((select auth.uid()) = '2f9bc201-9966-4f37-9963-2f4b9ddab849'::uuid);

create policy fin_meta_exclusao_somente_dono on public.fin_meta
  for delete to authenticated
  using ((select auth.uid()) = '2f9bc201-9966-4f37-9963-2f4b9ddab849'::uuid);

-- Histórico (migration 27): mesma função dos triggers de fin e fin_ciclo.
drop trigger if exists fin_meta_historico on public.fin_meta;
create trigger fin_meta_historico
  after insert or update or delete on public.fin_meta
  for each row execute function public.registrar_historico();

commit;

notify pgrst, 'reload schema';
