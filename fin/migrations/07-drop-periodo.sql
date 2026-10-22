-- Migration histórica e destrutiva: remove a tabela legada quando os ciclos já são
-- derivados dos lançamentos Faturamento PJ. Não reaplicar sem backup/auditoria prévia.
drop table public.periodos;
