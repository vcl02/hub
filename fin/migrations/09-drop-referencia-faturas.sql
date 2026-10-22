-- Remove a coluna 'referencia' da tabela faturas.
-- O app passou a usar somente 'vencimento' para identificar e nomear a fatura.
-- Aplique no DataGrip APOS confirmar que nao ha queries/views/funcoes no banco
-- que ainda referenciem esta coluna.

alter table public.faturas
  drop constraint if exists faturas_referencia_primeiro_dia;

alter table public.faturas
  drop column if exists referencia;
