revoke execute on function public.activities_audit(), public.vacations_rules(), public.enforce_email_domain(), public.activities_insert_clean() from public, anon, authenticated;
revoke execute on function public.app_role(), public.my_collaborator(), public.my_profile(), public.team_absences() from public, anon;
grant execute on function public.app_role(), public.my_collaborator(), public.my_profile(), public.team_absences() to authenticated;
