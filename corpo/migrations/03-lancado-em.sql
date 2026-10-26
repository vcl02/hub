-- Corpo: quando o peso e o sono foram lançados no app (relógio do celular). Aplicar no DataGrip.
-- A página inicial do hub (hábitos) só conta pesagem e sono lançados no próprio dia: lançar depois é falha.
-- Linhas antigas ficam sem valor (contam como lançadas no dia). Rodar de novo não muda nada.
-- Formato DataGrip: sem bloco anônimo, sem ponto e vírgula em comentário, tudo entre begin e commit.
begin;

alter table public.corpo_medida add column if not exists peso_em timestamptz;
alter table public.corpo_dia add column if not exists sono_em timestamptz;
comment on column public.corpo_medida.peso_em is 'Corpo: quando o peso foi lançado no app (o primeiro lançamento, relógio do celular).';
comment on column public.corpo_dia.sono_em is 'Corpo: quando o sono foi lançado no app (o primeiro lançamento, relógio do celular).';

commit;
