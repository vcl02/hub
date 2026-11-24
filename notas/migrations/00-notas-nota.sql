-- Notas: as anotações (várias notas, cada uma um texto Markdown inteiro). Aplicar no DataGrip, antes da 02 da raiz.
-- 1 linha por nota: id (gerado no aparelho), texto (a nota inteira, gravada inteira a cada mudança), criada_em e editada_em.
-- Título não é coluna: é a 1ª linha não vazia do texto. Quem salva por último vale (sem mescla entre aparelhos).
-- Só a conta do Victor (mesmo padrão das tabelas do hub), anon sem acesso. Rodar de novo não muda nada.
-- Formato DataGrip: sem bloco anônimo, sem ponto e vírgula em comentário, tudo entre begin e commit.
begin;

create table if not exists public.notas_nota (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  id text not null check (id ~ '^[A-Za-z0-9_-]{1,64}$'),
  texto text not null default '',
  criada_em timestamptz not null default now(),
  editada_em timestamptz not null default now(),
  primary key (user_id, id)
);
comment on table public.notas_nota is 'Notas: anotações (texto Markdown inteiro de cada nota).';

alter table public.notas_nota enable row level security;
revoke all on public.notas_nota from anon;
grant select, insert, update, delete on public.notas_nota to authenticated;
drop policy if exists notas_nota_somente_dono on public.notas_nota;
create policy notas_nota_somente_dono on public.notas_nota for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
drop policy if exists notas_nota_somente_victor on public.notas_nota;
create policy notas_nota_somente_victor on public.notas_nota as restrictive for all to authenticated
  using ((select auth.uid()) = '32f70255-30a0-4e2b-ad76-31d7a1bf54f7'::uuid)
  with check ((select auth.uid()) = '32f70255-30a0-4e2b-ad76-31d7a1bf54f7'::uuid);

commit;
