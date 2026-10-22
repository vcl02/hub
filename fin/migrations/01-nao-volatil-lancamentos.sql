-- Execute este arquivo uma vez no SQL Editor do projeto fin.
-- Lancamentos antigos recebem false; novos lancamentos sem a flag tambem.
alter table public.lancamentos
    add column nao_volatil boolean not null default false;

comment on column public.lancamentos.nao_volatil is
    'Flag manual Não Volátil. Não altera valores, saldos ou recorrência.';
