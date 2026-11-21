-- O mesmo ID pode ter vários trechos para o mesmo colaborador (ex.: interrompido por atestado),
-- como no relatório oficial. Só bloqueia o mesmo ID, colaborador e data de início.
drop index if exists public.activities_codigo_collab;
create unique index activities_codigo_collab on public.activities (upper(codigo), collaborator_id, coalesce(inicio_real, est_inicio));
