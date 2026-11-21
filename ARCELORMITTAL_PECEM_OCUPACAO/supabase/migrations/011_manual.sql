-- Aba "Manual": textos editáveis, capturas de tela e parâmetros do ganho de tempo.
-- Todos os usuários leem; só o coordenador grava.

-- Textos do manual. O texto padrão fica no código; uma linha aqui substitui o capítulo de mesmo id.
create table if not exists public.manual_secoes (
  id text primary key,
  titulo text not null,
  ordem int not null default 0,
  conteudo text not null default '',
  rota_relacionada text,
  atualizado_em timestamptz not null default now(),
  atualizado_por text
);

-- Capturas reais das telas (imagem em data URL JPEG) e marcações numeradas.
create table if not exists public.manual_capturas (
  pagina text primary key,
  rota text not null,
  imagem_url text not null,
  legenda text not null default '',
  marcadores jsonb not null default '[]'::jsonb,
  data_captura timestamptz not null default now(),
  origem text not null default 'automatica'
);

-- Parâmetros do slide "Ganho de tempo" (linha única).
create table if not exists public.manual_config (
  id int primary key default 1 check (id = 1),
  data jsonb not null default '{}'::jsonb,
  atualizado_em timestamptz not null default now()
);
insert into public.manual_config (id, data) values (1, '{}'::jsonb) on conflict (id) do nothing;

alter table public.manual_secoes enable row level security;
alter table public.manual_capturas enable row level security;
alter table public.manual_config enable row level security;

drop policy if exists manual_secoes_select on public.manual_secoes;
drop policy if exists manual_secoes_write on public.manual_secoes;
drop policy if exists manual_capturas_select on public.manual_capturas;
drop policy if exists manual_capturas_write on public.manual_capturas;
drop policy if exists manual_config_select on public.manual_config;
drop policy if exists manual_config_write on public.manual_config;

create policy manual_secoes_select on public.manual_secoes for select to authenticated using (public.app_role() is not null);
create policy manual_secoes_write on public.manual_secoes for all to authenticated using (public.app_role() = 'coordenador') with check (public.app_role() = 'coordenador');
create policy manual_capturas_select on public.manual_capturas for select to authenticated using (public.app_role() is not null);
create policy manual_capturas_write on public.manual_capturas for all to authenticated using (public.app_role() = 'coordenador') with check (public.app_role() = 'coordenador');
create policy manual_config_select on public.manual_config for select to authenticated using (public.app_role() is not null);
create policy manual_config_write on public.manual_config for all to authenticated using (public.app_role() = 'coordenador') with check (public.app_role() = 'coordenador');

grant select, insert, update, delete on public.manual_secoes, public.manual_capturas, public.manual_config to authenticated;
revoke all on public.manual_secoes, public.manual_capturas, public.manual_config from anon;
