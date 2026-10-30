-- Histórico das marmitas do al: al_marmita entra no hub_historico (antes e depois de cada linha), com a função de gatilho que
-- a 00 criou (registrar_historico_hub), sem função nova. Aplicar no DataGrip, depois da al/03 e da 00 daqui.
-- Rodar de novo não muda nada (o gatilho é recriado). Falha sozinha, sem mudar nada, se faltar a tabela ou a função.
-- Formato DataGrip: sem bloco anônimo, sem ponto e vírgula em comentário, tudo entre begin e commit.
begin;

select 'public.al_marmita'::regclass;
select 'public.registrar_historico_hub()'::regprocedure;
drop trigger if exists hub_historico on public.al_marmita;
create trigger hub_historico after insert or update or delete on public.al_marmita for each row execute function public.registrar_historico_hub();

commit;
