-- Corpo: o registro do dia passa a ter as evacuações com horário (+1 a cada uma) e as horas de sono. Aplicar no DataGrip.
-- evacuacoes = lista de horários do dia ("HH:MM"), vazio "" quando o horário não é conhecido. sono = horas dormidas.
-- A coluna evacuou (sim ou não, migration 01) fica sem uso e passa a aceitar vazio. Nada é apagado.
-- O sim já gravado vira 1 evacuação sem horário. Rodar de novo não muda nada.
-- Formato DataGrip: sem bloco anônimo, sem ponto e vírgula em comentário, tudo entre begin e commit.
begin;

alter table public.corpo_dia add column if not exists evacuacoes jsonb not null default '[]'::jsonb check (jsonb_typeof(evacuacoes) = 'array' and jsonb_array_length(evacuacoes) <= 20);
alter table public.corpo_dia add column if not exists sono numeric check (sono >= 0 and sono <= 24);
alter table public.corpo_dia alter column evacuou drop not null;
update public.corpo_dia set evacuacoes = '[""]'::jsonb, evacuou = null where evacuou = true and evacuacoes = '[]'::jsonb;
update public.corpo_dia set evacuou = null where evacuou = false;
comment on column public.corpo_dia.evacuacoes is 'Corpo: horários das evacuações do dia ("HH:MM", vazio = horário não conhecido).';
comment on column public.corpo_dia.sono is 'Corpo: horas de sono (a noite que terminou neste dia).';
comment on column public.corpo_dia.evacuou is 'Corpo: sem uso desde a migration 02 (era sim ou não).';

commit;
