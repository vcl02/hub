-- A conta do Victor foi recriada em 24/10/2026 (id novo 32f70255-30a0-4e2b-ad76-31d7a1bf54f7). A antiga foi apagada.
-- Os dados de fin não dependem da conta e continuam intactos. Troca o id em todas as policies
-- de dono (migrations 20, 25, 27, 36 e 39) e na função proxima_recorrencia (migration 28).
-- Não altera nenhuma linha. Aplicar no DataGrip.
begin;

drop policy if exists fin_leitura_somente_dono on public.fin;
create policy fin_leitura_somente_dono on public.fin for select to authenticated
  using ((select auth.uid()) = '32f70255-30a0-4e2b-ad76-31d7a1bf54f7'::uuid);

drop policy if exists fin_insercao_somente_dono on public.fin;
create policy fin_insercao_somente_dono on public.fin for insert to authenticated
  with check ((select auth.uid()) = '32f70255-30a0-4e2b-ad76-31d7a1bf54f7'::uuid);

drop policy if exists fin_atualizacao_somente_dono on public.fin;
create policy fin_atualizacao_somente_dono on public.fin for update to authenticated
  using ((select auth.uid()) = '32f70255-30a0-4e2b-ad76-31d7a1bf54f7'::uuid)
  with check ((select auth.uid()) = '32f70255-30a0-4e2b-ad76-31d7a1bf54f7'::uuid);

drop policy if exists fin_exclusao_somente_dono on public.fin;
create policy fin_exclusao_somente_dono on public.fin for delete to authenticated
  using ((select auth.uid()) = '32f70255-30a0-4e2b-ad76-31d7a1bf54f7'::uuid);

drop policy if exists fin_ciclo_leitura_somente_dono on public.fin_ciclo;
create policy fin_ciclo_leitura_somente_dono on public.fin_ciclo for select to authenticated
  using ((select auth.uid()) = '32f70255-30a0-4e2b-ad76-31d7a1bf54f7'::uuid);

drop policy if exists fin_ciclo_insercao_somente_dono on public.fin_ciclo;
create policy fin_ciclo_insercao_somente_dono on public.fin_ciclo for insert to authenticated
  with check ((select auth.uid()) = '32f70255-30a0-4e2b-ad76-31d7a1bf54f7'::uuid);

drop policy if exists fin_ciclo_atualizacao_somente_dono on public.fin_ciclo;
create policy fin_ciclo_atualizacao_somente_dono on public.fin_ciclo for update to authenticated
  using ((select auth.uid()) = '32f70255-30a0-4e2b-ad76-31d7a1bf54f7'::uuid)
  with check ((select auth.uid()) = '32f70255-30a0-4e2b-ad76-31d7a1bf54f7'::uuid);

drop policy if exists fin_ciclo_exclusao_somente_dono on public.fin_ciclo;
create policy fin_ciclo_exclusao_somente_dono on public.fin_ciclo for delete to authenticated
  using ((select auth.uid()) = '32f70255-30a0-4e2b-ad76-31d7a1bf54f7'::uuid);

drop policy if exists fin_meta_leitura_somente_dono on public.fin_meta;
create policy fin_meta_leitura_somente_dono on public.fin_meta for select to authenticated
  using ((select auth.uid()) = '32f70255-30a0-4e2b-ad76-31d7a1bf54f7'::uuid);

drop policy if exists fin_meta_insercao_somente_dono on public.fin_meta;
create policy fin_meta_insercao_somente_dono on public.fin_meta for insert to authenticated
  with check ((select auth.uid()) = '32f70255-30a0-4e2b-ad76-31d7a1bf54f7'::uuid);

drop policy if exists fin_meta_atualizacao_somente_dono on public.fin_meta;
create policy fin_meta_atualizacao_somente_dono on public.fin_meta for update to authenticated
  using ((select auth.uid()) = '32f70255-30a0-4e2b-ad76-31d7a1bf54f7'::uuid)
  with check ((select auth.uid()) = '32f70255-30a0-4e2b-ad76-31d7a1bf54f7'::uuid);

drop policy if exists fin_meta_exclusao_somente_dono on public.fin_meta;
create policy fin_meta_exclusao_somente_dono on public.fin_meta for delete to authenticated
  using ((select auth.uid()) = '32f70255-30a0-4e2b-ad76-31d7a1bf54f7'::uuid);

drop policy if exists fin_historico_leitura_somente_dono on public.fin_historico;
create policy fin_historico_leitura_somente_dono on public.fin_historico for select to authenticated
  using ((select auth.uid()) = '32f70255-30a0-4e2b-ad76-31d7a1bf54f7'::uuid);

create or replace function public.proxima_recorrencia() returns integer
language sql
volatile
security definer
set search_path = ''
as $$
  select case when (select auth.uid()) = '32f70255-30a0-4e2b-ad76-31d7a1bf54f7'::uuid
              then nextval('public.fin_recorrencia_seq')::integer
         end
$$;

revoke all on function public.proxima_recorrencia() from public, anon;
grant execute on function public.proxima_recorrencia() to authenticated;

commit;

notify pgrst, 'reload schema';
