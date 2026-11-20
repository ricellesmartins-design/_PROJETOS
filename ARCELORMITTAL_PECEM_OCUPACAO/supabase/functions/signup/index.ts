// Contas de acesso: cadastro restrito por domínio corporativo, convites do coordenador,
// "Esqueci minha senha" e redefinição de senha pelo coordenador.
// Convites e recuperação usam um link próprio (?acesso=<id>.<token>): o token fica só como hash
// SHA-256 em app_metadata (que o usuário não consegue alterar) e o e-mail sai pelo Resend.
import { createClient, type SupabaseClient, type User } from 'npm:@supabase/supabase-js@2';

const ALLOWED = ['arcelormittal.com', 'idg-eng.com', 'idg.global', 'idg.global.com'];
const COORDINATORS = ['ricelles@idg.global.com', 'ricelles@idg-eng.com', 'ricelles@idg.global'];
const OWNER_EMAIL = 'ricellesmartins@gmail.com'; // cópia da recuperação de senha do coordenador
const APP_URL = 'https://idg-amp-gestao.netlify.app';
const ROLES = ['coordenador', 'colaborador', 'cliente'];
const INVITE_DAYS = 7;
const RESET_MINUTES = 60;

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
const norm = (s: string) => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').replace(/\(FICT[IÍ]CIO\)/i, '').trim().toUpperCase();
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const isEmail = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
const domainMsg = () => `Acesso restrito a e-mails corporativos (${ALLOWED.map((d) => '@' + d).join(', ')}).`;

type Admin = SupabaseClient;
type Token = { hash: string; exp: string; tipo: 'convite' | 'senha'; enviadoEm: string };
type Convite = { nome?: string; role: string; collaboratorId?: string; por: string; em: string; aceitoEm?: string };

async function sha256(s: string) {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
const randomToken = () => [...crypto.getRandomValues(new Uint8Array(32))].map((b) => b.toString(16).padStart(2, '0')).join('');

// Só aceita origens do próprio app (evita que alguém peça um link apontando para outro site).
function appUrl(req: Request) {
  const o = req.headers.get('origin') ?? '';
  if (/^https:\/\/([a-z0-9-]+--)?idg-amp-gestao\.netlify\.app$/.test(o) || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(o)) return o;
  return APP_URL;
}

async function findUserByEmail(admin: Admin, email: string): Promise<User | undefined> {
  for (let page = 1; page < 50; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const u = data.users.find((x) => x.email?.toLowerCase() === email);
    if (u || data.users.length < 200) return u;
  }
}

async function listAllUsers(admin: Admin) {
  const all: User[] = [];
  for (let page = 1; page < 50; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    all.push(...data.users);
    if (data.users.length < 200) break;
  }
  return all;
}

async function sendEmail(admin: Admin, to: string, subject: string, html: string) {
  const { data: secrets } = await admin.from('app_secrets').select('name, value').in('name', ['resend_api_key', 'email_from']);
  const s = Object.fromEntries((secrets ?? []).map((r) => [r.name, r.value]));
  const key = Deno.env.get('RESEND_API_KEY') || s.resend_api_key;
  if (!key) return { ok: false, erro: 'Envio de e-mail não configurado.' };
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: Deno.env.get('EMAIL_FROM') || s.email_from || 'Gestão AMP <onboarding@resend.dev>', to: [to], subject, html }),
  });
  const out = await res.json().catch(() => ({}));
  return res.ok ? { ok: true } : { ok: false, erro: String(out?.message ?? JSON.stringify(out)) };
}

const emailHtml = (titulo: string, texto: string, link: string, botao: string, rodape: string) => `
<div style="font-family:Arial,sans-serif;max-width:520px;margin:auto;color:#1e293b">
  <h2 style="color:#1F3864">${esc(titulo)}</h2>
  <p>${texto}</p>
  <p style="margin:28px 0"><a href="${link}" style="background:#1d4ed8;color:#fff;padding:12px 22px;border-radius:6px;text-decoration:none;font-weight:bold">${esc(botao)}</a></p>
  <p style="font-size:12px;color:#64748b">Se o botão não funcionar, copie e cole no navegador:<br>${esc(link)}</p>
  <p style="font-size:12px;color:#64748b">${rodape}</p>
  <p style="font-size:12px;color:#94a3b8">Gestão de Atividades e Férias · Contrato AMP · IDG Engenharia</p>
</div>`;

async function setToken(admin: Admin, user: User, tipo: Token['tipo'], extra: Record<string, unknown> = {}) {
  const token = randomToken();
  const ms = tipo === 'convite' ? INVITE_DAYS * 86400_000 : RESET_MINUTES * 60_000;
  const t: Token = { hash: await sha256(token), exp: new Date(Date.now() + ms).toISOString(), tipo, enviadoEm: new Date().toISOString() };
  const { error } = await admin.auth.admin.updateUserById(user.id, { app_metadata: { ...user.app_metadata, ...extra, acesso: t } });
  if (error) throw error;
  return `${user.id}.${token}`;
}

/** Valida o link ?acesso=<id>.<token>; devolve o usuário ou uma mensagem de erro. */
async function checkToken(admin: Admin, raw: string): Promise<{ user: User; t: Token } | { error: string }> {
  const [id, token] = String(raw ?? '').split('.');
  if (!id || !token) return { error: 'Link inválido.' };
  const { data, error } = await admin.auth.admin.getUserById(id);
  const t = data?.user?.app_metadata?.acesso as Token | undefined;
  if (error || !data.user || !t || t.hash !== (await sha256(token))) return { error: 'Link inválido ou já utilizado. Peça um novo.' };
  if (new Date(t.exp).getTime() < Date.now()) return { error: 'Link expirado. Peça um novo.' };
  return { user: data.user, t };
}

async function hasProfile(admin: Admin, id: string) {
  const { data } = await admin.from('profiles').select('id').eq('id', id).maybeSingle();
  return !!data;
}

/** Cria o perfil (e, para colaboradores, o vínculo com o cadastro de colaborador). */
async function createProfile(admin: Admin, p: { id: string; email: string; nome: string; role: string; matricula: string; funcao: string; collaboratorId?: string; confiavel: boolean }) {
  let collaboratorId: string | null = null;
  if (p.role === 'colaborador') {
    const { data: collabs } = await admin.from('collaborators').select('id, nome, matricula, email');
    const list = collabs ?? [];
    const invited = p.collaboratorId && list.find((c) => c.id === p.collaboratorId);
    const byEmail = list.find((c) => c.email && c.email.toLowerCase() === p.email);
    // Sem convite, nome/matrícula iguais a um colaborador existente deixam o vínculo pendente
    // para o coordenador confirmar (evita alguém se cadastrar como outra pessoa).
    const lookalike = !p.confiavel && list.find((c) => (p.matricula && c.matricula && c.matricula.toUpperCase() === p.matricula.toUpperCase()) || norm(c.nome) === norm(p.nome));
    if (invited) {
      collaboratorId = invited.id;
      const patch: Record<string, string> = {};
      if (!invited.email) patch.email = p.email;
      if (p.matricula && !invited.matricula) patch.matricula = p.matricula;
      if (Object.keys(patch).length) await admin.from('collaborators').update(patch).eq('id', invited.id);
    } else if (byEmail) collaboratorId = byEmail.id;
    else if (!lookalike) {
      collaboratorId = 'c_' + crypto.randomUUID();
      const { error } = await admin.from('collaborators').insert({ id: collaboratorId, nome: p.nome.toUpperCase(), matricula: p.matricula, funcao: p.funcao.toUpperCase(), email: p.email });
      if (error) throw error;
    }
  }
  const { error } = await admin.from('profiles').insert({ id: p.id, email: p.email, nome: p.nome, role: p.role, collaborator_id: collaboratorId });
  if (error) throw error;
  return { role: p.role, vinculoPendente: p.role === 'colaborador' && !collaboratorId };
}

async function coordinator(admin: Admin, req: Request) {
  const token = (req.headers.get('authorization') ?? '').replace('Bearer ', '');
  const { data: u } = await admin.auth.getUser(token);
  if (!u.user) return undefined;
  const { data: me } = await admin.from('profiles').select('role, ativo, nome').eq('id', u.user.id).single();
  return me?.role === 'coordenador' && me.ativo ? { id: u.user.id, nome: me.nome as string } : undefined;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Método não permitido.' }, 405);
  try {
    const body = await req.json();
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
    const action = String(body.action ?? 'signup');

    // ---------- Ações do coordenador ----------
    if (['reset', 'invite', 'invites', 'cancel_invite'].includes(action)) {
      const me = await coordinator(admin, req);
      if (!me) return json({ error: 'Apenas o coordenador pode fazer isso.' }, 403);

      if (action === 'reset') {
        const nova = String(body.password ?? '');
        if (nova.length < 8) return json({ error: 'A senha deve ter pelo menos 8 caracteres.' }, 400);
        const { error } = await admin.auth.admin.updateUserById(String(body.userId), { password: nova });
        if (error) return json({ error: error.message }, 400);
        return json({ ok: true });
      }

      if (action === 'invites') {
        const users = (await listAllUsers(admin)).filter((u) => u.app_metadata?.convite);
        const { data: profs } = await admin.from('profiles').select('id');
        const ids = new Set((profs ?? []).map((p) => p.id));
        return json({
          ok: true,
          convites: users
            .map((u) => {
              const c = u.app_metadata.convite as Convite;
              const t = u.app_metadata.acesso as Token | undefined;
              const aceito = ids.has(u.id);
              return { id: u.id, email: u.email, nome: c.nome ?? '', role: c.role, collaboratorId: c.collaboratorId ?? null, por: c.por, em: c.em, aceitoEm: c.aceitoEm ?? null, status: aceito ? 'Aceito' : t && t.tipo === 'convite' && new Date(t.exp).getTime() < Date.now() ? 'Expirado' : 'Pendente', expira: t?.tipo === 'convite' ? t.exp : null };
            })
            .sort((a, b) => b.em.localeCompare(a.em)),
        });
      }

      if (action === 'cancel_invite') {
        const id = String(body.userId ?? '');
        const { data } = await admin.auth.admin.getUserById(id);
        if (!data?.user?.app_metadata?.convite) return json({ error: 'Convite não encontrado.' }, 404);
        if (await hasProfile(admin, id)) return json({ error: 'Este convite já foi aceito. Bloqueie o acesso em Usuários.' }, 400);
        const { error } = await admin.auth.admin.deleteUser(id);
        if (error) return json({ error: error.message }, 400);
        return json({ ok: true });
      }

      // invite (também reenvia um convite pendente)
      const email = String(body.email ?? '').trim().toLowerCase();
      const role = String(body.role ?? '');
      const nome = String(body.nome ?? '').trim();
      const collaboratorId = body.collaboratorId ? String(body.collaboratorId) : undefined;
      if (!isEmail(email)) return json({ error: 'Informe um e-mail válido.' }, 400);
      if (!ALLOWED.includes(email.split('@')[1])) return json({ error: domainMsg() }, 400);
      if (!ROLES.includes(role)) return json({ error: 'Perfil inválido.' }, 400);
      let user = await findUserByEmail(admin, email);
      if (user && (await hasProfile(admin, user.id))) return json({ error: 'Este e-mail já tem acesso ao sistema.' }, 400);
      const convite: Convite = { nome, role, collaboratorId, por: me.nome, em: new Date().toISOString() };
      if (!user) {
        const { data, error } = await admin.auth.admin.createUser({ email, password: randomToken(), email_confirm: true, user_metadata: { nome }, app_metadata: { convite } });
        if (error || !data.user) return json({ error: error?.message ?? 'Falha ao criar o convite.' }, 400);
        user = data.user;
      }
      const acesso = await setToken(admin, user, 'convite', { convite });
      const link = `${appUrl(req)}/?acesso=${acesso}`;
      const envio = await sendEmail(
        admin,
        email,
        'Convite · Gestão de Atividades e Férias AMP',
        emailHtml(
          'Você foi convidado',
          `${esc(me.nome)} convidou você${nome ? ` (${esc(nome)})` : ''} para o sistema de Gestão de Atividades e Férias do Contrato AMP — ArcelorMittal Pecém. Clique no botão para criar sua senha e completar seu cadastro.`,
          link,
          'Aceitar convite',
          `O link vale por ${INVITE_DAYS} dias.`,
        ),
      );
      await admin.from('job_runs').insert({ job: 'convite', detail: { email, role, por: me.nome, enviado: envio.ok, erro: envio.ok ? undefined : envio.erro } });
      return json({ ok: true, link, enviado: envio.ok, erroEnvio: envio.ok ? undefined : envio.erro });
    }

    // ---------- Esqueci minha senha (resposta sempre igual, para não revelar e-mails) ----------
    if (action === 'forgot') {
      const email = String(body.email ?? '').trim().toLowerCase();
      if (!isEmail(email)) return json({ error: 'Informe um e-mail válido.' }, 400);
      if (!ALLOWED.includes(email.split('@')[1])) return json({ error: domainMsg() }, 400);
      const user = await findUserByEmail(admin, email);
      const prev = user?.app_metadata?.acesso as Token | undefined;
      const recent = prev?.tipo === 'senha' && Date.now() - new Date(prev.enviadoEm).getTime() < 2 * 60_000;
      if (user && !recent) {
        const link = `${appUrl(req)}/?acesso=${await setToken(admin, user, 'senha')}`;
        const html = emailHtml(
          'Redefinir sua senha',
          `Recebemos um pedido para redefinir a senha da conta <b>${esc(email)}</b>. Clique no botão para criar uma nova senha.`,
          link,
          'Criar nova senha',
          `O link vale por ${RESET_MINUTES} minutos e só pode ser usado uma vez. Se você não pediu, ignore este e-mail: sua senha atual continua valendo.`,
        );
        const envios = [await sendEmail(admin, email, 'Redefinir senha · Gestão AMP', html)];
        if (COORDINATORS.includes(email)) envios.push(await sendEmail(admin, OWNER_EMAIL, `Redefinir senha (${email}) · Gestão AMP`, html));
        await admin.from('job_runs').insert({ job: 'esqueci_senha', detail: { email, envios } });
      }
      return json({ ok: true });
    }

    // ---------- Link de acesso (convite ou nova senha) ----------
    if (action === 'token_info' || action === 'complete') {
      const chk = await checkToken(admin, body.acesso);
      if ('error' in chk) return json({ error: chk.error }, 400);
      const { user, t } = chk;
      const email = user.email!.toLowerCase();
      const convite = user.app_metadata?.convite as Convite | undefined;
      const precisaCadastro = !(await hasProfile(admin, user.id));
      const role = convite?.role ?? (COORDINATORS.includes(email) ? 'coordenador' : email.endsWith('@arcelormittal.com') ? 'cliente' : 'colaborador');
      if (action === 'token_info') return json({ ok: true, email, tipo: t.tipo, precisaCadastro, nome: convite?.nome || user.user_metadata?.nome || '', role });

      const password = String(body.password ?? '');
      if (password.length < 8) return json({ error: 'A senha deve ter pelo menos 8 caracteres.' }, 400);
      const nome = String(body.nome ?? '').trim();
      if (precisaCadastro && nome.length < 3) return json({ error: 'Informe o nome completo.' }, 400);
      const meta = { ...user.app_metadata };
      delete meta.acesso; // link de uso único
      if (convite && precisaCadastro) meta.convite = { ...convite, aceitoEm: new Date().toISOString() };
      const { error } = await admin.auth.admin.updateUserById(user.id, { password, app_metadata: meta, ...(precisaCadastro ? { user_metadata: { nome } } : {}) });
      if (error) return json({ error: error.message }, 400);
      let extra = {};
      if (precisaCadastro)
        extra = await createProfile(admin, { id: user.id, email, nome, role, matricula: String(body.matricula ?? '').trim(), funcao: String(body.funcao ?? '').trim(), collaboratorId: convite?.collaboratorId, confiavel: !!convite });
      return json({ ok: true, email, ...extra });
    }

    // ---------- Cadastro livre (e-mail corporativo) ----------
    const email = String(body.email ?? '').trim().toLowerCase();
    const password = String(body.password ?? '');
    const nome = String(body.nome ?? '').trim();
    if (!isEmail(email)) return json({ error: 'Informe um e-mail válido.' }, 400);
    const domain = email.split('@')[1];
    if (!ALLOWED.includes(domain)) return json({ error: domainMsg() }, 400);
    if (password.length < 8) return json({ error: 'A senha deve ter pelo menos 8 caracteres.' }, 400);
    if (nome.length < 3) return json({ error: 'Informe o nome completo.' }, 400);
    if (COORDINATORS.includes(email)) return json({ error: 'Esta conta de coordenador já existe. Use "Esqueci minha senha".' }, 400);

    const { data: created, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { nome } });
    if (error || !created.user) {
      if (/already|registered|exists/i.test(error?.message ?? '')) {
        const u = await findUserByEmail(admin, email);
        if (u?.app_metadata?.convite && !(await hasProfile(admin, u.id))) return json({ error: 'Você tem um convite pendente. Use o link do e-mail de convite ou "Esqueci minha senha".' }, 400);
        return json({ error: 'E-mail já cadastrado. Use "Esqueci minha senha" se não lembrar a senha.' }, 400);
      }
      return json({ error: error?.message ?? 'Falha ao criar usuário.' }, 400);
    }
    try {
      const r = await createProfile(admin, {
        id: created.user.id,
        email,
        nome,
        role: domain === 'arcelormittal.com' ? 'cliente' : 'colaborador',
        matricula: String(body.matricula ?? '').trim(),
        funcao: String(body.funcao ?? '').trim(),
        confiavel: false,
      });
      return json({ ok: true, ...r });
    } catch (e) {
      await admin.auth.admin.deleteUser(created.user.id);
      throw e;
    }
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
