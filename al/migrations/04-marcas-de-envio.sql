-- Marcas de envio nas tabelas com contador (al_item.usos e al_marmita.restam): envios = as marcas dos últimos 20 envios que
-- gravaram a linha (lista jsonb de textos), só para o app saber, depois de um envio sem resposta (metrô), se ele chegou.
-- Sem isso, outro aparelho que mexe no contador antes do reenvio deixa a linha igual nos dois casos (chegou e o outro somou
-- depois, ou não chegou e o outro somou mais), e a mudança daqui somaria de novo (al/docs/DECISOES.md, "Contador no metrô").
-- O app não mostra nem guarda a coluna: só a lê e a grava junto. Antes de aplicar, o app grava sem ela (como antes).
-- Aplicar no DataGrip, depois da 03. Rodar de novo não muda nada (if not exists).
begin;

alter table public.al_item add column if not exists envios jsonb not null default '[]'::jsonb check (jsonb_typeof(envios) = 'array' and jsonb_array_length(envios) <= 20);
alter table public.al_marmita add column if not exists envios jsonb not null default '[]'::jsonb check (jsonb_typeof(envios) = 'array' and jsonb_array_length(envios) <= 20);
comment on column public.al_item.envios is 'Alimentação: marcas dos últimos envios que gravaram a linha (o app reconhece o envio sem resposta que chegou).';
comment on column public.al_marmita.envios is 'Alimentação: marcas dos últimos envios que gravaram a linha (o app reconhece o envio sem resposta que chegou).';

commit;
