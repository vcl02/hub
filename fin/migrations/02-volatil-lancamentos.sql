-- Execute no SQL Editor do projeto fin depois da migration 01.
-- Preserva a classificacao de cada lancamento ao inverter a leitura da flag.
begin;

alter table public.lancamentos
    rename column nao_volatil to volatil;

alter table public.lancamentos
    alter column volatil set default true;

update public.lancamentos
set volatil = not volatil;

comment on column public.lancamentos.volatil is
    'Flag manual Volátil. true indica volátil; false indica não volátil. Não altera valores, saldos ou recorrência.';

commit;
