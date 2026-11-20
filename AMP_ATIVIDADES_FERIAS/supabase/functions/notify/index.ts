// Lembretes diários (push no Windows/Edge/Chrome) para o colaborador atualizar os serviços em execução.
// Chamado pelo pg_cron a cada 30 min (seg-sex); envia apenas nos horários configurados (padrão 10:00 e 16:00, Brasília).
// Também aceita POST de um usuário logado com {"teste": true} para enviar uma notificação de teste a ele mesmo.
import { createClient } from 'npm:@supabase/supabase-js@2';
import webpush from 'npm:web-push@3.6.7';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
const OPEN = ['Não Iniciado', 'Em andamento', 'Aguardando Cliente'];

function brNow() {
  const d = new Date(Date.now() - 3 * 3600_000); // Brasília (UTC-3, sem horário de verão)
  return { date: d.toISOString().slice(0, 10), hm: d.toISOString().slice(11, 16), dow: d.getUTCDay(), minutes: d.getUTCHours() * 60 + d.getUTCMinutes() };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
  const { data: secrets } = await admin.from('app_secrets').select('name, value');
  const s = Object.fromEntries((secrets ?? []).map((r) => [r.name, r.value]));
  webpush.setVapidDetails('mailto:ricellesmartins@gmail.com', s.vapid_public, s.vapid_private);
  const body = await req.json().catch(() => ({}));

  // Modo teste: usuário autenticado.
  if (body.teste) {
    const token = (req.headers.get('authorization') ?? '').replace('Bearer ', '');
    const { data: u } = await admin.auth.getUser(token);
    if (!u.user) return json({ error: 'Não autenticado.' }, 401);
    const { data: subs } = await admin.from('push_subscriptions').select('*').eq('user_id', u.user.id);
    const r = await sendAll(admin, subs ?? [], { title: 'IDG · Contrato AMP', body: 'Notificação de teste: os lembretes estão ativos neste computador.', url: './#/atividades' });
    return json({ enviados: r });
  }

  if (req.headers.get('x-cron-secret') !== s.cron_secret) return json({ error: 'Não autorizado.' }, 401);
  const now = brNow();
  if (now.dow === 0 || now.dow === 6) return json({ skip: 'fim de semana' });
  const { data: st } = await admin.from('app_settings').select('data').eq('id', 1).single();
  const slots: string[] = st?.data?.lembretes ?? ['10:00', '16:00'];
  const slot = slots.find((h) => {
    const [hh, mm] = h.split(':').map(Number);
    const m = hh * 60 + mm;
    return now.minutes >= m && now.minutes < m + 30;
  });
  if (!slot) return json({ skip: 'fora do horário', agora: now.hm });
  const jobKey = `lembrete:${now.date} ${slot}`;
  const { data: done } = await admin.from('job_runs').select('id').eq('job', jobKey).limit(1);
  if (done?.length) return json({ skip: 'já enviado' });

  const { data: profiles } = await admin.from('profiles').select('id, nome, collaborator_id, role').eq('ativo', true).eq('role', 'colaborador');
  const { data: acts } = await admin.from('activities').select('collaborator_id, status, est_termino').in('status', OPEN);
  let total = 0;
  for (const p of profiles ?? []) {
    if (!p.collaborator_id) continue;
    const mine = (acts ?? []).filter((a) => a.collaborator_id === p.collaborator_id);
    if (!mine.length) continue;
    const late = mine.filter((a) => a.est_termino && a.est_termino < now.date).length;
    const { data: subs } = await admin.from('push_subscriptions').select('*').eq('user_id', p.id);
    total += await sendAll(admin, subs ?? [], {
      title: `Atualize seus serviços (${slot})`,
      body: `Você tem ${mine.length} serviço(s) em aberto${late ? `, ${late} com prazo vencido` : ''}. Atualize horas, datas e status no sistema.`,
      url: './#/atividades',
    });
  }
  await admin.from('job_runs').insert({ job: jobKey, detail: { enviados: total } });
  return json({ ok: true, enviados: total });
});

// deno-lint-ignore no-explicit-any
async function sendAll(admin: any, subs: any[], payload: Record<string, string>) {
  let n = 0;
  for (const sub of subs) {
    try {
      await webpush.sendNotification(sub.subscription, JSON.stringify(payload));
      n++;
    } catch (e) {
      const code = (e as { statusCode?: number }).statusCode;
      if (code === 404 || code === 410) await admin.from('push_subscriptions').delete().eq('endpoint', sub.endpoint);
    }
  }
  return n;
}
