-- Zerar o sistema (só coordenador). O app baixa um backup completo antes de chamar.
-- escopo 'movimento': atividades, alterações de data, férias e importações do RH.
-- escopo 'tudo': também colaboradores e centros de custo.
-- Usuários (logins) e configurações nunca são apagados.
create or replace function public.reset_system(p_scope text, p_confirm text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  n_act int; n_log int; n_vac int; n_hr int; n_col int := 0; n_cc int := 0;
begin
  if public.app_role() is distinct from 'coordenador' then
    raise exception 'Apenas o coordenador pode zerar o sistema.';
  end if;
  if p_confirm is distinct from 'ZERAR' then
    raise exception 'Confirmação inválida.';
  end if;
  if p_scope not in ('movimento', 'tudo') then
    raise exception 'Escopo inválido.';
  end if;

  delete from date_change_logs where true; get diagnostics n_log = row_count;
  delete from activities where true;       get diagnostics n_act = row_count;
  delete from vacations where true;        get diagnostics n_vac = row_count;
  delete from hr_imports where true;       get diagnostics n_hr = row_count;
  if p_scope = 'tudo' then
    delete from collaborators where true;  get diagnostics n_col = row_count;
    delete from cost_centers where true;   get diagnostics n_cc = row_count;
  end if;

  insert into job_runs (job, detail)
  values ('reset_system', jsonb_build_object('por', auth.uid(), 'escopo', p_scope, 'atividades', n_act, 'alteracoes', n_log, 'ferias', n_vac, 'rh', n_hr, 'colaboradores', n_col, 'centros', n_cc));

  return jsonb_build_object('atividades', n_act, 'alteracoes', n_log, 'ferias', n_vac, 'rh', n_hr, 'colaboradores', n_col, 'centros', n_cc);
end;
$$;

revoke all on function public.reset_system(text, text) from public, anon;
grant execute on function public.reset_system(text, text) to authenticated;
