-- Lembretes: a cada 30 min, seg-sex, 09h-22h UTC (06h-19h Brasília); a função decide pelos horários configurados.
select cron.schedule('amp-lembretes', '*/30 9-22 * * 1-5', $$
  select net.http_post(
    url := 'https://lkrcgxurzlbrupypurxi.supabase.co/functions/v1/notify',
    headers := jsonb_build_object('Content-Type','application/json','x-cron-secret',(select value from public.app_secrets where name='cron_secret')),
    body := '{}'::jsonb)
$$);
-- Backup diário 06:00 Brasília (09:00 UTC).
select cron.schedule('amp-backup-diario', '0 9 * * *', $$
  select net.http_post(
    url := 'https://lkrcgxurzlbrupypurxi.supabase.co/functions/v1/backup',
    headers := jsonb_build_object('Content-Type','application/json','x-cron-secret',(select value from public.app_secrets where name='cron_secret')),
    body := '{}'::jsonb,
    timeout_milliseconds := 30000)
$$);
