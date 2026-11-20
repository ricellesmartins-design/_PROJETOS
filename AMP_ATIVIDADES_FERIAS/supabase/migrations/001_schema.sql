-- Schema do app Gestão de Atividades e Férias · Contrato AMP (IDG Engenharia)
-- Regras de negócio críticas são garantidas no servidor (RLS + triggers).

create table public.collaborators (
  id text primary key,
  nome text not null,
  matricula text not null default '',
  funcao text not null default '',
  email text,
  ativo boolean not null default true
);

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique,
  nome text not null,
  role text not null check (role in ('coordenador','colaborador','cliente')),
  collaborator_id text references public.collaborators(id) on delete set null,
  ativo boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.cost_centers (
  codigo text primary key,
  denominacao text not null default '',
  responsavel text not null default ''
);

create table public.activities (
  id text primary key,
  codigo text not null,
  collaborator_id text not null references public.collaborators(id) on delete cascade,
  descricao text not null,
  solicitante text not null default '',
  area text not null default '',
  data_solicitacao date,
  est_inicio date,
  est_termino date,
  est_modo text not null default 'manual' check (est_modo in ('auto','manual')),
  horas_dia numeric,
  est_horas numeric,
  inicio_real date,
  termino_real date,
  real_modo text not null default 'manual' check (real_modo in ('auto','manual')),
  horas_dia_real numeric,
  horas_realizadas numeric,
  documentos_amp text not null default '',
  centro_custo text not null default '',
  status text not null default 'Não Iniciado' check (status in ('Não Iniciado','Em andamento','Aguardando Cliente','Finalizado','Cancelado')),
  observacao text not null default '',
  created_at timestamptz not null default now(),
  created_by text not null default '',
  updated_at timestamptz not null default now(),
  updated_by text not null default '',
  justificativa_alteracao text -- campo transitório, consumido pelo trigger de auditoria
);
create unique index activities_codigo_collab on public.activities (upper(codigo), collaborator_id);

create table public.date_change_logs (
  id text primary key default gen_random_uuid()::text,
  activity_id text not null,
  activity_codigo text not null,
  collaborator_id text not null,
  campo text not null,
  anterior date,
  nova date,
  justificativa text not null,
  usuario_email text not null,
  usuario_nome text not null,
  data_hora timestamptz not null default now()
);

create table public.vacations (
  id text primary key,
  collaborator_id text not null references public.collaborators(id) on delete cascade,
  modalidade text not null check (modalidade in ('30','15+15','10+20','20+10','19+11','20+10abono')),
  periodos jsonb not null,
  data_solicitacao date not null default current_date,
  secao text not null default 'Contrato AMP - ArcelorMittal Pecém',
  chamado_rh text not null default '',
  status_chamado_rh text not null default 'Não aberto',
  status text not null default 'Pendente' check (status in ('Pendente','Ajuste Solicitado','Aprovada','Reprovada','Cancelamento Solicitado','Cancelada')),
  observacao text not null default '',
  parecer text,
  aprovado_por text,
  aprovado_em timestamptz,
  conflito_justificado text,
  versao_anterior_aprovada jsonb,
  revisao int not null default 1,
  historico jsonb not null default '[]'::jsonb
);

create table public.hr_imports (
  id text primary key,
  arquivo text not null,
  importado_em timestamptz not null default now(),
  importado_por text not null,
  linhas jsonb not null
);

create table public.app_settings (
  id int primary key default 1 check (id = 1),
  data jsonb not null default '{}'::jsonb
);
insert into public.app_settings (id, data) values (1, '{}'::jsonb);

-- Funções auxiliares de perfil ----------------------------------------------
create or replace function public.app_role() returns text
language sql stable security definer set search_path = public as $$
  select role from public.profiles where id = auth.uid() and ativo
$$;

create or replace function public.my_collaborator() returns text
language sql stable security definer set search_path = public as $$
  select collaborator_id from public.profiles where id = auth.uid() and ativo
$$;

create or replace function public.my_profile() returns public.profiles
language sql stable security definer set search_path = public as $$
  select * from public.profiles where id = auth.uid()
$$;

-- Ausências da equipe (para o motor de conflitos) sem expor pareceres/observações.
create or replace function public.team_absences()
returns table (id text, collaborator_id text, status text, modalidade text, periodos jsonb)
language sql stable security definer set search_path = public as $$
  select v.id, v.collaborator_id, v.status, v.modalidade, v.periodos
  from public.vacations v
  where public.app_role() in ('coordenador','colaborador')
    and v.status in ('Pendente','Ajuste Solicitado','Aprovada','Cancelamento Solicitado')
$$;

-- RLS ------------------------------------------------------------------------
alter table public.collaborators enable row level security;
alter table public.profiles enable row level security;
alter table public.cost_centers enable row level security;
alter table public.activities enable row level security;
alter table public.date_change_logs enable row level security;
alter table public.vacations enable row level security;
alter table public.hr_imports enable row level security;
alter table public.app_settings enable row level security;

create policy collab_select on public.collaborators for select to authenticated using (public.app_role() is not null);
create policy collab_write on public.collaborators for all to authenticated using (public.app_role() = 'coordenador') with check (public.app_role() = 'coordenador');

create policy profiles_select on public.profiles for select to authenticated using (id = auth.uid() or public.app_role() = 'coordenador');
create policy profiles_update on public.profiles for update to authenticated using (public.app_role() = 'coordenador') with check (public.app_role() = 'coordenador');

create policy cc_select on public.cost_centers for select to authenticated using (public.app_role() is not null);
create policy cc_write on public.cost_centers for all to authenticated using (public.app_role() = 'coordenador') with check (public.app_role() = 'coordenador');

create policy act_select on public.activities for select to authenticated using (
  public.app_role() in ('coordenador','cliente') or (public.app_role() = 'colaborador' and collaborator_id = public.my_collaborator()));
create policy act_insert on public.activities for insert to authenticated with check (
  public.app_role() = 'coordenador' or (public.app_role() = 'colaborador' and collaborator_id = public.my_collaborator()));
create policy act_update on public.activities for update to authenticated using (
  public.app_role() = 'coordenador' or (public.app_role() = 'colaborador' and collaborator_id = public.my_collaborator()))
  with check (public.app_role() = 'coordenador' or (public.app_role() = 'colaborador' and collaborator_id = public.my_collaborator()));
create policy act_delete on public.activities for delete to authenticated using (
  public.app_role() = 'coordenador' or (public.app_role() = 'colaborador' and collaborator_id = public.my_collaborator()));

create policy log_select on public.date_change_logs for select to authenticated using (
  public.app_role() in ('coordenador','cliente') or (public.app_role() = 'colaborador' and collaborator_id = public.my_collaborator()));
-- Inserção somente via trigger (security definer); sem política de insert/update/delete.

create policy vac_select on public.vacations for select to authenticated using (
  public.app_role() = 'coordenador' or (public.app_role() = 'colaborador' and collaborator_id = public.my_collaborator()));
create policy vac_insert on public.vacations for insert to authenticated with check (
  public.app_role() = 'coordenador' or (public.app_role() = 'colaborador' and collaborator_id = public.my_collaborator()));
create policy vac_update on public.vacations for update to authenticated using (
  public.app_role() = 'coordenador' or (public.app_role() = 'colaborador' and collaborator_id = public.my_collaborator()))
  with check (public.app_role() = 'coordenador' or (public.app_role() = 'colaborador' and collaborator_id = public.my_collaborator()));
create policy vac_delete on public.vacations for delete to authenticated using (public.app_role() = 'coordenador');

create policy hr_all on public.hr_imports for all to authenticated using (public.app_role() = 'coordenador') with check (public.app_role() = 'coordenador');

create policy settings_select on public.app_settings for select to authenticated using (public.app_role() is not null);
create policy settings_update on public.app_settings for update to authenticated using (public.app_role() = 'coordenador') with check (public.app_role() = 'coordenador');

-- Trigger: auditoria obrigatória de alteração de datas -----------------------
create or replace function public.activities_audit() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  p public.profiles;
  just text := btrim(coalesce(new.justificativa_alteracao, ''));
  changed text[] := array[]::text[];
  f text;
  o date; n date;
begin
  select * into p from public.profiles where id = auth.uid();
  foreach f in array array['est_inicio','est_termino','inicio_real','termino_real'] loop
    execute format('select ($1).%I, ($2).%I', f, f) into o, n using old, new;
    if o is not null and o is distinct from n then
      changed := changed || f;
      if length(just) < 10 then
        raise exception 'Justificativa obrigatória (mínimo 10 caracteres) para alteração de datas (%).', f using errcode = 'P0001';
      end if;
      insert into public.date_change_logs (activity_id, activity_codigo, collaborator_id, campo, anterior, nova, justificativa, usuario_email, usuario_nome)
      values (new.id, new.codigo, new.collaborator_id,
        case f when 'est_inicio' then 'estInicio' when 'est_termino' then 'estTermino' when 'inicio_real' then 'inicioReal' else 'terminoReal' end,
        o, n, just, coalesce(p.email, 'sistema'), coalesce(p.nome, 'Sistema'));
    end if;
  end loop;
  new.justificativa_alteracao := null;
  new.updated_at := now();
  if p.email is not null then new.updated_by := p.email; end if;
  return new;
end $$;
create trigger trg_activities_audit before update on public.activities for each row execute function public.activities_audit();

create or replace function public.activities_insert_clean() returns trigger
language plpgsql as $$ begin new.justificativa_alteracao := null; return new; end $$;
create trigger trg_activities_insert before insert on public.activities for each row execute function public.activities_insert_clean();

-- Trigger: regras de férias para colaboradores -------------------------------
-- Toda alteração feita pelo colaborador retorna a solicitação para aprovação.
create or replace function public.vacations_rules() returns trigger
language plpgsql security definer set search_path = public as $$
declare r text := public.app_role();
begin
  if r = 'coordenador' then return new; end if;
  if tg_op = 'INSERT' then
    new.status := 'Pendente';
    new.aprovado_por := null; new.aprovado_em := null; new.parecer := null; new.conflito_justificado := null;
    return new;
  end if;
  if new.collaborator_id <> old.collaborator_id then raise exception 'Não é permitido transferir a solicitação.'; end if;
  if old.status in ('Reprovada','Cancelada') then raise exception 'Solicitação encerrada não pode ser alterada.'; end if;
  if new.modalidade is distinct from old.modalidade or new.periodos is distinct from old.periodos
     or new.chamado_rh is distinct from old.chamado_rh or new.observacao is distinct from old.observacao then
    if old.status = 'Aprovada' then
      new.versao_anterior_aprovada := jsonb_build_object('modalidade', old.modalidade, 'periodos', old.periodos, 'aprovadoEm', old.aprovado_em);
    end if;
    new.status := 'Pendente';
    new.aprovado_por := null; new.aprovado_em := null; new.parecer := null; new.conflito_justificado := null;
    new.revisao := old.revisao + 1;
  elsif new.status = 'Cancelada' and old.status in ('Aprovada','Cancelamento Solicitado') then
    new.status := 'Cancelamento Solicitado';
  elsif new.status not in ('Pendente','Cancelamento Solicitado','Cancelada') then
    raise exception 'Somente o coordenador pode aprovar, reprovar ou solicitar ajuste.';
  else
    new.aprovado_por := old.aprovado_por; new.aprovado_em := old.aprovado_em; new.parecer := old.parecer;
  end if;
  return new;
end $$;
create trigger trg_vacations_rules before insert or update on public.vacations for each row execute function public.vacations_rules();

-- Restrição de domínio também no auth.users (bloqueia signUp direto pela API).
create or replace function public.enforce_email_domain() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if split_part(lower(new.email), '@', 2) not in ('arcelormittal.com','idg-eng.com','idg.global','idg.global.com') then
    raise exception 'Domínio de e-mail não autorizado.';
  end if;
  return new;
end $$;
create trigger trg_enforce_email_domain before insert or update of email on auth.users for each row execute function public.enforce_email_domain();

-- Realtime
alter publication supabase_realtime add table public.activities, public.vacations, public.date_change_logs, public.collaborators, public.cost_centers, public.app_settings;
