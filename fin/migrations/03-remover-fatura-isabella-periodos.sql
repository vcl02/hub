-- Registra no repositorio a alteracao ja aplicada diretamente no banco.
-- IF EXISTS permite executar a migration mesmo quando as colunas ja foram removidas.
alter table public.periodos
    drop column if exists fecha_isa,
    drop column if exists venc_isa;
