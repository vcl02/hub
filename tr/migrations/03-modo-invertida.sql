-- Passa os exercícios para a pirâmide invertida (pedido do mantenedor em 22/10/2026), já valendo para os próximos treinos.
-- Registros já feitos não mudam: cada um guarda o peso e as reps de cada série, não o modo.
-- Idempotente: rodar de novo não muda nada.
-- JÁ APLICADA em 22/10/2026 (conferida por SELECT: 6 exercícios em invertida, os 6 registros de hoje sem mudança).
begin;

update public.tr_exercicio set modo = 'invertida' where modo <> 'invertida';

commit;
