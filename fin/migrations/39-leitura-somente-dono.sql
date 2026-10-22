-- Leitura de fin, fin_ciclo e fin_meta passa a ser só do mantenedor (antes: qualquer conta logada).
-- A leitura aberta existia por causa da conta restrita da Isabella, que saiu. Sem isto, uma conta
-- nova no Auth (cadastro aberto) leria todas as finanças. A escrita já era só do mantenedor.
-- A captura do Nubank usa a chave de serviço e não passa pelo RLS: não muda nada para ela.
-- Formato do DataGrip (ver docs/DECISOES.md, "Migrations no DataGrip"). Idempotente.
-- JÁ APLICADA em 22/10/2026 pelo mantenedor (DataGrip). Conferida por SELECT: as três policies de leitura
-- são as do dono, e numa transação só leitura o dono lê 2483/77/4 linhas e outra conta 0.
begin;

select 'public.fin'::regclass, 'public.fin_ciclo'::regclass, 'public.fin_meta'::regclass;

drop policy if exists fin_leitura_autenticada on public.fin;
drop policy if exists fin_leitura_somente_dono on public.fin;
create policy fin_leitura_somente_dono on public.fin
  for select to authenticated
  using ((select auth.uid()) = '2f9bc201-9966-4f37-9963-2f4b9ddab849'::uuid);

drop policy if exists fin_ciclo_leitura_autenticada on public.fin_ciclo;
drop policy if exists fin_ciclo_leitura_somente_dono on public.fin_ciclo;
create policy fin_ciclo_leitura_somente_dono on public.fin_ciclo
  for select to authenticated
  using ((select auth.uid()) = '2f9bc201-9966-4f37-9963-2f4b9ddab849'::uuid);

drop policy if exists fin_meta_leitura_autenticada on public.fin_meta;
drop policy if exists fin_meta_leitura_somente_dono on public.fin_meta;
create policy fin_meta_leitura_somente_dono on public.fin_meta
  for select to authenticated
  using ((select auth.uid()) = '2f9bc201-9966-4f37-9963-2f4b9ddab849'::uuid);

commit;
