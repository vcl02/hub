-- Caminhada do dia com tempo (min) e/ou distância (km), no total do dia (rua aos poucos ou esteira, tanto faz).
-- Sem nenhum dos dois vale o padrão do app (20 min). Colunas vazias = não informado. Aplicar no DataGrip.
-- Rodar de novo não muda nada (if not exists).
begin;

alter table public.al_dia add column if not exists minutos numeric check (minutos > 0 and minutos <= 600);
alter table public.al_dia add column if not exists km numeric check (km > 0 and km <= 60);
comment on column public.al_dia.minutos is 'Alimentação: minutos de caminhada no dia (total), vazio = não informado.';
comment on column public.al_dia.km is 'Alimentação: km de caminhada no dia (total), vazio = não informado.';

commit;
