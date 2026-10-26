-- Caminhada em trechos: cada "Andei +" do dia (ida, volta, mercado...) vira um trecho com horário e tempo e/ou distância.
-- caminhadas = lista de trechos [{ hora, minutos?, km? }], o gasto do dia soma todos. Sem trecho = não andou (acabou a
-- caminhada automática de quarta e quinta).
-- O total antigo (andou, minutos, km) vira 1 trecho sem horário. Dia sem caminhada (andou falso) sai, e as colunas antigas
-- também. Aplicar no DataGrip. Rodar de novo não muda nada (as colunas antigas voltam vazias só para sair de novo).
-- Formato DataGrip: sem bloco anônimo, sem ponto e vírgula em comentário, tudo entre begin e commit.
begin;

alter table public.al_dia add column if not exists caminhadas jsonb not null default '[]'::jsonb
  check (jsonb_typeof(caminhadas) = 'array' and jsonb_array_length(caminhadas) <= 30);
comment on column public.al_dia.caminhadas is 'Alimentação: trechos de caminhada do dia [{ hora, minutos?, km? }], vazios = 20 min.';

alter table public.al_dia add column if not exists andou boolean not null default false;
alter table public.al_dia add column if not exists minutos numeric;
alter table public.al_dia add column if not exists km numeric;
update public.al_dia set caminhadas = jsonb_build_array(jsonb_strip_nulls(jsonb_build_object('hora', '', 'minutos', minutos, 'km', km)))
  where andou and caminhadas = '[]'::jsonb;
delete from public.al_dia where caminhadas = '[]'::jsonb;
alter table public.al_dia drop column andou;
alter table public.al_dia drop column minutos;
alter table public.al_dia drop column km;
comment on table public.al_dia is 'Alimentação: trechos de caminhada do dia (soma no gasto).';

commit;
