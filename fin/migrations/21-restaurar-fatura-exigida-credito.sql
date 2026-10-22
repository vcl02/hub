-- A migration 06 exigia fatura_id em todo crédito; a coluna fatura_id foi removida na
-- migration 10 (substituída por fatura_venc, depois renomeada para fatura na 14) e a
-- constraint caiu junto, como efeito colateral do DROP COLUMN — nunca foi recriada na
-- coluna atual. Restaura a mesma garantia, agora sobre fin.fatura (date).
--
-- A regra não é simétrica como na 06: a migration 08 passou a permitir um DÉBITO
-- (cred = false) com fatura preenchida quando ele é uma antecipação de fatura — a
-- categoria identifica esse caso (ehAntecipacaoFatura em js/shared.js). Fatura em
-- qualquer outro débito seria dado inconsistente, pois nada no app lê esse campo fora
-- de crédito/antecipação. Verificado contra os dados atuais: 0 violações.
alter table public.fin
  add constraint fin_credito_exige_fatura
  check (
    (cred and fatura is not null)
    or
    (not cred and (fatura is null or (categ ilike '%antecipa%' and categ ilike '%fatura%')))
  );
