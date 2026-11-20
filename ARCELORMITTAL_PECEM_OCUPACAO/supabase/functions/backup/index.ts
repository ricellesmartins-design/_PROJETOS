// Backup dos dados por e-mail (JSON completo + CSVs de atividades e férias).
// Disparado diariamente pelo pg_cron (x-cron-secret) ou manualmente pelo coordenador (JWT).
// Envio via Resend: requer o segredo RESEND_API_KEY nas Edge Functions do projeto.
import { createClient } from 'npm:@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
const TABLES = ['collaborators', 'profiles', 'cost_centers', 'activities', 'date_change_logs', 'vacations', 'hr_imports', 'app_settings'];

function b64(s: string) {
  const bytes = new TextEncoder().encode(s);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}
// deno-lint-ignore no-explicit-any
function csv(rows: any[]) {
  if (!rows.length) return '';
  const cols = Object.keys(rows[0]);
  const esc = (v: unknown) => {
    const t = v == null ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v);
    return /[;"\n]/.test(t) ? '"' + t.replace(/"/g, '""') + '"' : t;
  };
  return '﻿' + [cols.join(';'), ...rows.map((r) => cols.map((c) => esc(r[c])).join(';'))].join('\r\n');
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
  const { data: secrets } = await admin.from('app_secrets').select('name, value');
  const s = Object.fromEntries((secrets ?? []).map((r) => [r.name, r.value]));
  let origem = 'agendado';
  if (req.headers.get('x-cron-secret') !== s.cron_secret) {
    const token = (req.headers.get('authorization') ?? '').replace('Bearer ', '');
    const { data: u } = await admin.auth.getUser(token);
    if (!u.user) return json({ error: 'Não autorizado.' }, 401);
    const { data: p } = await admin.from('profiles').select('role, nome').eq('id', u.user.id).single();
    if (p?.role !== 'coordenador') return json({ error: 'Apenas o coordenador pode enviar backup.' }, 403);
    origem = 'manual por ' + p.nome;
  }
  const dump: Record<string, unknown> = { geradoEm: new Date().toISOString(), origem };
  for (const t of TABLES) {
    const { data, error } = await admin.from(t).select('*');
    if (error) return json({ error: `${t}: ${error.message}` }, 500);
    dump[t] = data;
  }
  const settings = (dump.app_settings as { data: Record<string, unknown> }[])[0]?.data ?? {};
  const to = String(settings.backupEmail ?? 'ricellesmartins@gmail.com');
  const key = Deno.env.get('RESEND_API_KEY');
  const stamp = new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 16).replace('T', '_').replace(':', 'h');
  if (!key) {
    await admin.from('job_runs').insert({ job: 'backup', detail: { ok: false, erro: 'RESEND_API_KEY não configurada', origem } });
    return json({ error: 'Envio de e-mail não configurado: cadastre o segredo RESEND_API_KEY nas Edge Functions do Supabase.' }, 500);
  }
  // deno-lint-ignore no-explicit-any
  const acts = dump.activities as any[];
  // deno-lint-ignore no-explicit-any
  const vacs = dump.vacations as any[];
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: Deno.env.get('BACKUP_FROM') ?? 'Backup AMP <onboarding@resend.dev>',
      to: [to],
      subject: `Backup · Gestão de Atividades e Férias AMP · ${stamp}`,
      html: `<p>Backup automático (${origem}) do sistema de Gestão de Atividades e Férias — Contrato AMP.</p>
        <ul><li>Atividades: ${acts.length}</li><li>Solicitações de férias: ${vacs.length}</li>
        <li>Justificativas de datas: ${(dump.date_change_logs as unknown[]).length}</li>
        <li>Colaboradores: ${(dump.collaborators as unknown[]).length}</li></ul>
        <p>Para restaurar, use o arquivo JSON em anexo (Configurações › Backup › Restaurar).</p>`,
      attachments: [
        { filename: `backup_amp_${stamp}.json`, content: b64(JSON.stringify(dump, null, 1)) },
        { filename: `atividades_${stamp}.csv`, content: b64(csv(acts)) },
        { filename: `ferias_${stamp}.csv`, content: b64(csv(vacs)) },
      ],
    }),
  });
  const out = await res.json().catch(() => ({}));
  await admin.from('job_runs').insert({ job: 'backup', detail: { ok: res.ok, para: to, origem, resposta: out } });
  if (!res.ok) return json({ error: 'Falha no envio: ' + JSON.stringify(out) }, 502);
  return json({ ok: true, para: to });
});
