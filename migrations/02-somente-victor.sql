-- Só a conta do Victor acessa as tabelas tr_ (a da Isabella existe no projeto por causa do fin).
-- Policy restritiva soma (E) com a de dono: assim nenhuma policy existente precisa ser apagada.
-- JÁ APLICADA em 2026-10-21.
begin;

create policy tr_exercicio_somente_victor on public.tr_exercicio as restrictive for all to authenticated
  using ((select auth.uid()) = '2f9bc201-9966-4f37-9963-2f4b9ddab849'::uuid)
  with check ((select auth.uid()) = '2f9bc201-9966-4f37-9963-2f4b9ddab849'::uuid);

create policy tr_variacao_somente_victor on public.tr_variacao as restrictive for all to authenticated
  using ((select auth.uid()) = '2f9bc201-9966-4f37-9963-2f4b9ddab849'::uuid)
  with check ((select auth.uid()) = '2f9bc201-9966-4f37-9963-2f4b9ddab849'::uuid);

create policy tr_registro_somente_victor on public.tr_registro as restrictive for all to authenticated
  using ((select auth.uid()) = '2f9bc201-9966-4f37-9963-2f4b9ddab849'::uuid)
  with check ((select auth.uid()) = '2f9bc201-9966-4f37-9963-2f4b9ddab849'::uuid);

create policy tr_treino_somente_victor on public.tr_treino as restrictive for all to authenticated
  using ((select auth.uid()) = '2f9bc201-9966-4f37-9963-2f4b9ddab849'::uuid)
  with check ((select auth.uid()) = '2f9bc201-9966-4f37-9963-2f4b9ddab849'::uuid);

create policy tr_medida_somente_victor on public.tr_medida as restrictive for all to authenticated
  using ((select auth.uid()) = '2f9bc201-9966-4f37-9963-2f4b9ddab849'::uuid)
  with check ((select auth.uid()) = '2f9bc201-9966-4f37-9963-2f4b9ddab849'::uuid);

commit;
