-- Normaliza a categoria criada pela migration anterior para o nome já adotado no banco.
update public.fin as f
set categ = (
    select nullif(string_agg(categoria, ', ' order by primeira_posicao), '')
    from (
        select min(categoria) as categoria, min(posicao) as primeira_posicao
        from (
            select
                case
                    when lower(trim(valor)) = lower('Reserva emergência') then 'Reserva'
                    else trim(valor)
                end as categoria,
                posicao
            from regexp_split_to_table(coalesce(f.categ, ''), ',') with ordinality as partes(valor, posicao)
            where nullif(trim(valor), '') is not null
        ) as normalizadas
        group by lower(categoria)
    ) as unicas
)
where exists (
    select 1
    from regexp_split_to_table(coalesce(f.categ, ''), ',') as categoria
    where lower(trim(categoria)) = lower('Reserva emergência')
);
