-- A conta do Victor foi recriada em 24/10/2026 (id novo 32f70255-30a0-4e2b-ad76-31d7a1bf54f7).
-- A antiga foi apagada e levou junto as linhas tr_* (on delete cascade). O app reenvia a cópia do aparelho.
-- Troca o id nas policies restritivas da migration 02. Aplicar no DataGrip.
begin;

drop policy if exists tr_exercicio_somente_victor on public.tr_exercicio;
create policy tr_exercicio_somente_victor on public.tr_exercicio as restrictive for all to authenticated
  using ((select auth.uid()) = '32f70255-30a0-4e2b-ad76-31d7a1bf54f7'::uuid)
  with check ((select auth.uid()) = '32f70255-30a0-4e2b-ad76-31d7a1bf54f7'::uuid);

drop policy if exists tr_variacao_somente_victor on public.tr_variacao;
create policy tr_variacao_somente_victor on public.tr_variacao as restrictive for all to authenticated
  using ((select auth.uid()) = '32f70255-30a0-4e2b-ad76-31d7a1bf54f7'::uuid)
  with check ((select auth.uid()) = '32f70255-30a0-4e2b-ad76-31d7a1bf54f7'::uuid);

drop policy if exists tr_registro_somente_victor on public.tr_registro;
create policy tr_registro_somente_victor on public.tr_registro as restrictive for all to authenticated
  using ((select auth.uid()) = '32f70255-30a0-4e2b-ad76-31d7a1bf54f7'::uuid)
  with check ((select auth.uid()) = '32f70255-30a0-4e2b-ad76-31d7a1bf54f7'::uuid);

drop policy if exists tr_treino_somente_victor on public.tr_treino;
create policy tr_treino_somente_victor on public.tr_treino as restrictive for all to authenticated
  using ((select auth.uid()) = '32f70255-30a0-4e2b-ad76-31d7a1bf54f7'::uuid)
  with check ((select auth.uid()) = '32f70255-30a0-4e2b-ad76-31d7a1bf54f7'::uuid);

drop policy if exists tr_medida_somente_victor on public.tr_medida;
create policy tr_medida_somente_victor on public.tr_medida as restrictive for all to authenticated
  using ((select auth.uid()) = '32f70255-30a0-4e2b-ad76-31d7a1bf54f7'::uuid)
  with check ((select auth.uid()) = '32f70255-30a0-4e2b-ad76-31d7a1bf54f7'::uuid);

commit;
