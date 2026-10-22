-- Antecipação/pagamento de fatura e Ajuste nunca são série: são pagamentos avulsos, cada um
-- no próprio dia (as migrations 29, 31 e 32 e o botão de recorrência duplicada já os deixam
-- de fora). Cinco "Antecipação Fatura (Final)" de ago a out/2026 estavam com Frequência
-- Mensal e sem lote, herdada do padrão da coluna: fin.freq tinha default 'Mensal', então
-- toda linha inserida pelo DataGrip sem preencher freq virava Mensal sem ninguém pedir.
-- 1. Tira a Frequência dessas linhas (só as sem recorrencia_id: lote é escolha explícita).
-- 2. Tira o default 'Mensal' de fin.freq: linha nova sem freq fica sem Frequência. O app
--    sempre manda freq no cadastro (vazio vira null), então nada muda na tela.
-- Rodar de novo não muda nada. O histórico (migration 27) guarda o antes de cada linha.
-- Sem bloco DO/$$ e sem ponto e vírgula em comentário (o DataGrip parte o script neles).
begin;

update public.fin
set freq = null
where freq is not null
  and recorrencia_id is null
  and (coalesce(categ, '') ~* '(antecipa|pagamento fatura|ajuste)' or coalesce(nome, '') ~* 'antecipa');

alter table public.fin alter column freq drop default;

select id, data, nome, categ, freq from public.fin
where coalesce(categ, '') ~* '(antecipa|pagamento fatura|ajuste)' or coalesce(nome, '') ~* 'antecipa'
order by data desc limit 10;

commit;

notify pgrst, 'reload schema';
