-- Cardio na esteira depois do treino (pedido do mantenedor em 26/10/2026): uma coluna no treino do dia.
-- cardio = { inicio (ms), ms (tempo feito, em ms), vel (km/h), incl (%) } e null = sem cardio.
-- O RLS da tabela (só o dono) já vale para a coluna nova. Idempotente: rodar de novo não muda nada.
begin;

alter table public.tr_treino add column if not exists cardio jsonb;
alter table public.tr_treino drop constraint if exists tr_treino_cardio_objeto;
alter table public.tr_treino add constraint tr_treino_cardio_objeto check (cardio is null or jsonb_typeof(cardio) = 'object');
comment on column public.tr_treino.cardio is 'Cardio na esteira depois do treino: inicio (ms), ms (tempo feito), vel (km/h), incl (%). Null = sem cardio.';

commit;
