-- Regras de férias para colaboradores (substitui a versão do 001).
-- Coordenador e processos de servidor (sem usuário) não sofrem restrição.
-- Toda alteração de modalidade, datas ou observação feita pelo colaborador retorna para aprovação.
create or replace function public.vacations_rules() returns trigger
language plpgsql security definer set search_path = public as $$
declare r text := public.app_role();
begin
  if r = 'coordenador' or auth.uid() is null then return new; end if;
  if r is distinct from 'colaborador' then raise exception 'Perfil sem permissão para férias.'; end if;
  if tg_op = 'INSERT' then
    new.status := 'Pendente';
    new.aprovado_por := null; new.aprovado_em := null; new.parecer := null; new.conflito_justificado := null;
    return new;
  end if;
  if new.collaborator_id <> old.collaborator_id then raise exception 'Não é permitido transferir a solicitação.'; end if;
  if old.status in ('Reprovada','Cancelada') then raise exception 'Solicitação encerrada não pode ser alterada.'; end if;
  -- (Atualizar só o número/status do chamado RH não altera as férias.)
  if new.modalidade is distinct from old.modalidade or new.periodos is distinct from old.periodos
     or new.observacao is distinct from old.observacao then
    if old.status = 'Aprovada' then
      new.versao_anterior_aprovada := jsonb_build_object('modalidade', old.modalidade, 'periodos', old.periodos, 'aprovadoEm', old.aprovado_em);
    end if;
    new.status := 'Pendente';
    new.aprovado_por := null; new.aprovado_em := null; new.parecer := null; new.conflito_justificado := null;
    new.revisao := old.revisao + 1;
  elsif new.status = 'Cancelada' and old.status in ('Aprovada','Cancelamento Solicitado') then
    new.status := 'Cancelamento Solicitado';
  elsif new.status is distinct from old.status and new.status not in ('Pendente','Cancelamento Solicitado','Cancelada') then
    raise exception 'Somente o coordenador pode aprovar, reprovar ou solicitar ajuste.';
  else
    new.aprovado_por := old.aprovado_por; new.aprovado_em := old.aprovado_em; new.parecer := old.parecer;
    new.conflito_justificado := old.conflito_justificado; new.versao_anterior_aprovada := old.versao_anterior_aprovada;
  end if;
  return new;
end $$;
revoke execute on function public.vacations_rules() from public, anon, authenticated;
