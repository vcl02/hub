-- Separa o título do corpo: migra a primeira linha não vazia para a nova coluna.
begin;

alter table public.notas_nota
  add column if not exists titulo text;

with primeira as (
  select n.user_id, n.id, l.linha, l.ordem
  from public.notas_nota n
  left join lateral (
    select linha, ordem
    from regexp_split_to_table(n.texto, E'\n') with ordinality as l(linha, ordem)
    where btrim(linha) <> ''
    order by ordem
    limit 1
  ) l on true
  where n.titulo is null
)
update public.notas_nota n
set titulo = coalesce(btrim(regexp_replace(p.linha, '^[[:space:]#]+', '')), ''),
    texto = case
      when p.ordem is null then n.texto
      else coalesce(
        regexp_replace(
          (
            select string_agg(l.linha, E'\n' order by l.ordem)
            from regexp_split_to_table(n.texto, E'\n') with ordinality as l(linha, ordem)
            where l.ordem > p.ordem
          ),
          E'^(?:[ \t]*\n)+',
          ''
        ),
        ''
      )
    end
from primeira p
where n.user_id = p.user_id
  and n.id = p.id;

alter table public.notas_nota
  alter column titulo set default '',
  alter column titulo set not null;

comment on column public.notas_nota.titulo is 'Título independente do texto Markdown da nota.';

commit;
