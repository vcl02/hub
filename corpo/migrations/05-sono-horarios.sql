-- Corpo: o sono passa a ser a hora em que dormi e a em que acordei ("HH:MM", a noite que terminou no dia). Aplicar no DataGrip.
-- As horas (sono) continuam gravadas, calculadas dos dois horários pelo app: o hábito do hub e os outros apps seguem lendo igual.
-- Sono já lançado só em horas: dormiu às 23:00 e acordou 23:00 + as horas (pedido do mantenedor em 27/10/2026). Nada é apagado
-- e sono_em (quando foi lançado) não muda. Rodar de novo não muda nada.
-- Formato DataGrip: sem bloco anônimo, sem ponto e vírgula em comentário, tudo entre begin e commit.
begin;

alter table public.corpo_dia add column if not exists dormiu text check (dormiu ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$');
alter table public.corpo_dia add column if not exists acordou text check (acordou ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$');
update public.corpo_dia
  set dormiu = '23:00', acordou = to_char(time '23:00' + make_interval(mins => round(sono * 60)::int), 'HH24:MI')
  where sono is not null and dormiu is null and acordou is null;
comment on column public.corpo_dia.dormiu is 'Corpo: hora em que dormiu (HH:MM) na noite que terminou neste dia.';
comment on column public.corpo_dia.acordou is 'Corpo: hora em que acordou (HH:MM) neste dia. sono = horas entre dormiu e acordou.';

commit;
