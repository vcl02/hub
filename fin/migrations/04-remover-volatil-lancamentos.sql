-- Remove a flag Volatil e encerra o historico iniciado pelas migrations 01 e 02.
alter table public.lancamentos
    drop column if exists volatil;
