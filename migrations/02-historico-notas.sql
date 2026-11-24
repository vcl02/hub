-- Histórico das notas: notas_nota entra no hub_historico (antes e depois de cada gravação da nota inteira), com a função de
-- gatilho que a 00 criou (registrar_historico_hub), sem função nova. A chave no histórico é o id da nota.
-- Aplicar no DataGrip, depois da 00 daqui, da notas/00 e da notas/01, e antes da notas/02. Rodar de novo não muda nada (o gatilho é recriado).
-- Falha sozinha, sem mudar nada, se faltar a tabela ou a função.
-- Formato DataGrip: sem bloco anônimo, sem ponto e vírgula em comentário, tudo entre begin e commit.
begin;

select 'public.notas_nota'::regclass;
select 'public.registrar_historico_hub()'::regprocedure;
drop trigger if exists hub_historico on public.notas_nota;
create trigger hub_historico after insert or update or delete on public.notas_nota for each row execute function public.registrar_historico_hub();

commit;
