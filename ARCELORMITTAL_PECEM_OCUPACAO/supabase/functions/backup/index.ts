// Backup completo por e-mail (JSON + Excel com uma aba por tabela).
// Vai para o e-mail das configurações e sempre também para ricellesmartins@gmail.com.
// Disparado diariamente pelo pg_cron (x-cron-secret) ou manualmente pelo coordenador (JWT).
// Envio pelo Gmail (SMTP com senha de app em app_secrets.gmail_app_password) ou, sem ela, pelo Resend
// (segredo RESEND_API_KEY ou app_secrets.resend_api_key).
import { createClient } from 'npm:@supabase/supabase-js@2';
import * as XLSX from 'npm:xlsx@0.18.5';
import nodemailer from 'npm:nodemailer@6.9.16';

const FIXED_TO = 'ricellesmartins@gmail.com';
const SHEETS: [string, string][] = [
  ['activities', 'Atividades'],
  ['date_change_logs', 'Alterações de data'],
  ['vacations', 'Férias'],
  ['collaborators', 'Colaboradores'],
  ['cost_centers', 'Centros de custo'],
  ['profiles', 'Usuários'],
  ['hr_imports', 'Importações RH'],
  ['app_settings', 'Configurações'],
];

// deno-lint-ignore no-explicit-any
function xlsxB64(dump: Record<string, any>) {
  const wb = XLSX.utils.book_new();
  for (const [t, name] of SHEETS) {
    // deno-lint-ignore no-explicit-any
    const rows = ((dump[t] ?? []) as any[]).map((r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, v != null && typeof v === 'object' ? JSON.stringify(v).slice(0, 32000) : v])));
    XLSX.utils.book_append_sheet(wb, rows.length ? XLSX.utils.json_to_sheet(rows) : XLSX.utils.aoa_to_sheet([['Sem registros']]), name);
  }
  return XLSX.write(wb, { type: 'base64', bookType: 'xlsx' }) as string;
}

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
  const to = [...new Set([String(settings.backupEmail || FIXED_TO).trim().toLowerCase(), FIXED_TO])];
  const stamp = new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 16).replace('T', '_').replace(':', 'h');
  // deno-lint-ignore no-explicit-any
  const acts = dump.activities as any[];
  // deno-lint-ignore no-explicit-any
  const vacs = dump.vacations as any[];
  const subject = `Backup · Gestão de Atividades e Férias AMP · ${stamp}`;
  const html = `<p>Backup automático (${origem}) do sistema de Gestão de Atividades e Férias — Contrato AMP.</p>
        <ul><li>Atividades: ${acts.length}</li><li>Solicitações de férias: ${vacs.length}</li>
        <li>Justificativas de datas: ${(dump.date_change_logs as unknown[]).length}</li>
        <li>Colaboradores: ${(dump.collaborators as unknown[]).length}</li></ul>
        <p>Em anexo: backup completo em JSON e em Excel (uma aba por tabela).</p>`;
  const files = [
    { filename: `backup_amp_${stamp}.json`, content: b64(JSON.stringify(dump, null, 1)) },
    { filename: `backup_amp_${stamp}.xlsx`, content: xlsxB64(dump) },
  ];
  const gmailPass = String(s.gmail_app_password ?? '').replace(/\s+/g, '');
  let ok = false;
  let resposta: unknown;
  let via = '';
  if (gmailPass) {
    via = 'gmail';
    try {
      const user = s.gmail_user || FIXED_TO;
      const t = nodemailer.createTransport({ host: 'smtp.gmail.com', port: 465, secure: true, auth: { user, pass: gmailPass } });
      const info = await t.sendMail({ from: `Backup AMP · IDG <${user}>`, to: to.join(', '), subject, html, attachments: files.map((f) => ({ filename: f.filename, content: f.content, encoding: 'base64' })) });
      ok = true;
      resposta = { messageId: info.messageId };
    } catch (e) {
      resposta = { erro: e instanceof Error ? e.message : String(e) };
    }
  } else {
    via = 'resend';
    const key = Deno.env.get('RESEND_API_KEY') || s.resend_api_key;
    if (!key) {
      await admin.from('job_runs').insert({ job: 'backup', detail: { ok: false, erro: 'Envio de e-mail não configurado', origem } });
      return json({ error: 'Envio de e-mail não configurado: cadastre a senha de app do Gmail (gmail_app_password) em app_secrets.' }, 500);
    }
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: Deno.env.get('BACKUP_FROM') ?? 'Backup AMP <onboarding@resend.dev>', to, subject, html, attachments: files }),
    });
    ok = res.ok;
    resposta = await res.json().catch(() => ({}));
  }
  await admin.from('job_runs').insert({ job: 'backup', detail: { ok, via, para: to, origem, resposta } });
  if (!ok) return json({ error: 'Falha no envio: ' + JSON.stringify(resposta) }, 502);
  return json({ ok: true, para: to, via });
});
