-- Segurança de acesso à tabela fin: somente o mantenedor (victor.cabrera0209@gmail.com)
-- grava; qualquer outra conta logada (ex.: Isabella) apenas lê; visitante anônimo não
-- acessa nada. Antes, a policy de UPDATE valia para o papel public com USING true e o
-- papel anon tinha grant de escrita, então a chave publicável exposta no site bastava
-- para alterar lançamentos sem login.
-- A conexão do DataGrip usa o papel dono do banco (postgres), que ignora RLS, e continua
-- com acesso total. O id abaixo é o auth.users.id do mantenedor — preferido ao e-mail,
-- que é um atributo mutável da conta.
begin;

-- Policies antigas: leitura/inserção/exclusão para qualquer autenticado e UPDATE para public.
drop policy if exists "leitura logada" on public.fin;
drop policy if exists "usuarios autenticados podem inserir" on public.fin;
drop policy if exists "usuarios podem atualizar seus lancamentos" on public.fin;
drop policy if exists "usuarios autenticados podem excluir lancamentos" on public.fin;

alter table public.fin enable row level security;

-- Anônimo não tem nenhum privilégio; o RLS fica como segunda barreira, não a única.
revoke all on table public.fin from anon;
revoke all on all sequences in schema public from anon;

create policy fin_leitura_autenticada on public.fin
  for select to authenticated
  using (true);

-- (select auth.uid()) é avaliado uma vez por consulta, não por linha.
create policy fin_insercao_somente_dono on public.fin
  for insert to authenticated
  with check ((select auth.uid()) = '2f9bc201-9966-4f37-9963-2f4b9ddab849'::uuid);

create policy fin_atualizacao_somente_dono on public.fin
  for update to authenticated
  using ((select auth.uid()) = '2f9bc201-9966-4f37-9963-2f4b9ddab849'::uuid)
  with check ((select auth.uid()) = '2f9bc201-9966-4f37-9963-2f4b9ddab849'::uuid);

create policy fin_exclusao_somente_dono on public.fin
  for delete to authenticated
  using ((select auth.uid()) = '2f9bc201-9966-4f37-9963-2f4b9ddab849'::uuid);

-- rls_auto_enable continua servindo ao event trigger ensure_rls (roda como dono), mas não
-- pode ser chamada pela API como RPC SECURITY DEFINER.
revoke execute on function public.rls_auto_enable() from public, anon, authenticated;

-- Resto do modelo antigo: consulta a tabela lancamentos/is_ativo, que não existem mais,
-- e tinha search_path mutável.
drop function if exists public.fn_diferenca_ciclos(text, text);

-- Extensão sem nenhum dependente desde a remoção da tabela faturas (migration 11).
drop extension if exists btree_gist;

commit;
