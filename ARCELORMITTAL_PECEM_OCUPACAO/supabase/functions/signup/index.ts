// Cadastro restrito por domínio corporativo. Cria o usuário já confirmado (sem e-mail de
// confirmação), vincula ao colaborador pelo e-mail (ou cria um novo) e grava o perfil.
import { createClient } from 'npm:@supabase/supabase-js@2';

const ALLOWED = ['arcelormittal.com', 'idg-eng.com', 'idg.global', 'idg.global.com'];
const COORDINATORS = ['ricelles@idg.global.com', 'ricelles@idg-eng.com', 'ricelles@idg.global'];
const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
const norm = (s: string) => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').replace(/\(FICT[IÍ]CIO\)/i, '').trim().toUpperCase();

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Método não permitido.' }, 405);
  try {
    const body = await req.json();
    if (body.action === 'reset') {
      // Redefinição de senha de um usuário pelo coordenador (JWT obrigatório).
      const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
      const token = (req.headers.get('authorization') ?? '').replace('Bearer ', '');
      const { data: u } = await admin.auth.getUser(token);
      if (!u.user) return json({ error: 'Não autorizado.' }, 401);
      const { data: me } = await admin.from('profiles').select('role, ativo').eq('id', u.user.id).single();
      if (me?.role !== 'coordenador' || !me.ativo) return json({ error: 'Apenas o coordenador pode redefinir senhas.' }, 403);
      const nova = String(body.password ?? '');
      if (nova.length < 8) return json({ error: 'A senha deve ter pelo menos 8 caracteres.' }, 400);
      const { error } = await admin.auth.admin.updateUserById(String(body.userId), { password: nova });
      if (error) return json({ error: error.message }, 400);
      return json({ ok: true });
    }
    const email = String(body.email ?? '').trim().toLowerCase();
    const password = String(body.password ?? '');
    const nome = String(body.nome ?? '').trim();
    const matricula = String(body.matricula ?? '').trim();
    const funcao = String(body.funcao ?? '').trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ error: 'Informe um e-mail válido.' }, 400);
    const domain = email.split('@')[1];
    if (!ALLOWED.includes(domain)) return json({ error: `Acesso restrito a e-mails corporativos (${ALLOWED.map((d) => '@' + d).join(', ')}).` }, 400);
    if (password.length < 8) return json({ error: 'A senha deve ter pelo menos 8 caracteres.' }, 400);
    if (nome.length < 3) return json({ error: 'Informe o nome completo.' }, 400);
    if (COORDINATORS.includes(email)) return json({ error: 'Esta conta de coordenador já existe. Use "Esqueci a senha" ou fale com o administrador.' }, 400);

    const role = domain === 'arcelormittal.com' ? 'cliente' : 'colaborador';
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });

    const { data: created, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { nome } });
    if (error || !created.user) {
      const msg = /already|registered|exists/i.test(error?.message ?? '') ? 'E-mail já cadastrado.' : error?.message ?? 'Falha ao criar usuário.';
      return json({ error: msg }, 400);
    }

    let collaboratorId: string | null = null;
    if (role === 'colaborador') {
      const { data: collabs } = await admin.from('collaborators').select('id, nome, matricula, email');
      const list = collabs ?? [];
      // Vincula automaticamente somente pelo e-mail cadastrado pelo coordenador no colaborador.
      // Se o nome/matrícula coincidir com um colaborador existente sem esse e-mail, o vínculo fica
      // pendente para o coordenador confirmar (evita alguém se cadastrar como outra pessoa).
      const byEmail = list.find((c) => c.email && c.email.toLowerCase() === email);
      const lookalike = list.find(
        (c) => (matricula && c.matricula && c.matricula.toUpperCase() === matricula.toUpperCase()) || norm(c.nome) === norm(nome),
      );
      if (byEmail) collaboratorId = byEmail.id;
      else if (!lookalike) {
        collaboratorId = 'c_' + crypto.randomUUID();
        const { error: e2 } = await admin.from('collaborators').insert({ id: collaboratorId, nome: nome.toUpperCase(), matricula, funcao: funcao.toUpperCase(), email });
        if (e2) {
          await admin.auth.admin.deleteUser(created.user.id);
          throw e2;
        }
      }
    }
    const { error: e3 } = await admin.from('profiles').insert({ id: created.user.id, email, nome, role, collaborator_id: collaboratorId });
    if (e3) {
      await admin.auth.admin.deleteUser(created.user.id);
      throw e3;
    }
    return json({ ok: true, role, vinculoPendente: role === 'colaborador' && !collaboratorId });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
