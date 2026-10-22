-- Observação (texto livre) e Canal (de onde a conta é paga/consultada, ex.: link do site
-- da concessionária) em cada lançamento; nenhum dos dois entra em cálculo financeiro.
alter table public.fin
add column obs varchar(255);

alter table public.fin
add column canal varchar(255);

notify pgrst, 'reload schema';
