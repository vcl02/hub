-- Registro do esquema que ja existia antes das migrations deste repositorio.
-- Nao execute este arquivo no projeto fin existente: as tabelas ja estao criadas.
-- Para um banco novo, confira tambem as policies RLS do projeto antes de expor a API.

create sequence public.ciclos_id_seq;

create table public.lancamentos (
    data date default current_date,
    valor numeric(10, 2) default 0.00,
    nome varchar(255) not null,
    categ varchar(500) not null,
    freq varchar default 'Mensal'::varchar,
    cred boolean default true not null,
    isa boolean default false not null,
    pago boolean default false not null,
    ativo boolean default true not null,
    id integer generated always as identity constraint lancamentos_2_pkey primary key
);

create table public.periodos (
    id integer default nextval('public.ciclos_id_seq'::regclass) not null
        constraint ciclos_pkey primary key,
    fat date not null,
    fecha date not null,
    fecha_isa date not null,
    venc_isa date,
    venc date
);

alter sequence public.ciclos_id_seq owned by public.periodos.id;
alter table public.lancamentos owner to postgres;
alter table public.periodos owner to postgres;
alter table public.lancamentos enable row level security;
alter table public.periodos enable row level security;

grant delete, insert, references, select, trigger, truncate, update on public.lancamentos to anon;
grant delete, insert, references, select, trigger, truncate, update on public.lancamentos to authenticated;
grant delete, insert, references, select, trigger, truncate, update on public.lancamentos to service_role;
grant delete, insert, references, select, trigger, truncate, update on public.periodos to anon;
grant delete, insert, references, select, trigger, truncate, update on public.periodos to authenticated;
grant delete, insert, references, select, trigger, truncate, update on public.periodos to service_role;

-- As policies RLS existentes nao foram enviadas no DDL inicial e nao sao alteradas aqui.
