-- Corpo: pesagens e medidas num lugar só (tabela corpo_medida), fora do Treino. Aplicar no DataGrip.
-- 1 linha por dia: peso (kg) e/ou barriga (cm, linha do umbigo, coluna cintura), com o horário.
-- Só o app Corpo grava. Treino e Alimentação só leem. Só a conta do Victor (mesmo padrão das tr_* e al_*), anon sem acesso.
-- Copia o que já estava em tr_medida (o Treino gravava lá), sem apagar nada de tr_medida. Rodar de novo não muda nada.
-- Formato DataGrip: sem bloco anônimo, sem ponto e vírgula em comentário, tudo entre begin e commit.
begin;

create table if not exists public.corpo_medida (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  data date not null,
  hora text not null default '',
  peso numeric check (peso > 0 and peso <= 400),
  cintura numeric check (cintura > 0 and cintura <= 400),
  primary key (user_id, data),
  check (peso is not null or cintura is not null)
);
comment on table public.corpo_medida is 'Corpo: pesagem (kg) e barriga (cm, linha do umbigo, coluna cintura) do dia, com o horário. Só o app Corpo grava.';

alter table public.corpo_medida enable row level security;
revoke all on public.corpo_medida from anon;
grant select, insert, update, delete on public.corpo_medida to authenticated;
drop policy if exists corpo_medida_somente_dono on public.corpo_medida;
create policy corpo_medida_somente_dono on public.corpo_medida for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
drop policy if exists corpo_medida_somente_victor on public.corpo_medida;
create policy corpo_medida_somente_victor on public.corpo_medida as restrictive for all to authenticated
  using ((select auth.uid()) = '32f70255-30a0-4e2b-ad76-31d7a1bf54f7'::uuid)
  with check ((select auth.uid()) = '32f70255-30a0-4e2b-ad76-31d7a1bf54f7'::uuid);

insert into public.corpo_medida (user_id, data, hora, peso, cintura)
  select user_id, data, hora, peso, cintura from public.tr_medida
  on conflict (user_id, data) do nothing;

commit;
