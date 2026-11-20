-- Afastamento / atestado médico usa sempre o ID 0510-0000 e pode ter vários lançamentos
-- (um por período) para o mesmo colaborador. Os demais IDs continuam únicos por colaborador.
drop index if exists public.activities_codigo_collab;
create unique index activities_codigo_collab on public.activities (upper(codigo), collaborator_id)
  where upper(codigo) <> '0510-0000';
