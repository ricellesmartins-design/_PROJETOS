// Autenticação (Supabase Auth) e controle de acesso por perfil.
// A restrição de domínio é aplicada no cliente, na Edge Function de cadastro e por trigger no banco.
import { supabase, errMsg } from './supabase';
import { db, fromRow, type Profile } from './db';
import type { Role } from '../types';

export const ALLOWED_DOMAINS = ['arcelormittal.com', 'idg-eng.com', 'idg.global', 'idg.global.com'];
export const COORDINATOR_EMAILS = ['ricelles@idg.global.com', 'ricelles@idg-eng.com', 'ricelles@idg.global'];

export const normalizeEmail = (email: string) => email.trim().toLowerCase();
export const emailDomain = (email: string) => normalizeEmail(email).split('@')[1] ?? '';
export const isEmailFormat = (email: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizeEmail(email));
export const isAllowedDomain = (email: string) => ALLOWED_DOMAINS.includes(emailDomain(email));

export function roleForEmail(email: string): Role {
  const e = normalizeEmail(email);
  if (COORDINATOR_EMAILS.includes(e)) return 'coordenador';
  return emailDomain(e) === 'arcelormittal.com' ? 'cliente' : 'colaborador';
}

export const ROLE_LABEL: Record<Role, string> = {
  coordenador: 'Coordenador',
  colaborador: 'Colaborador IDG',
  cliente: 'Cliente ArcelorMittal',
};

const domainError = () => `Acesso restrito a e-mails corporativos (${ALLOWED_DOMAINS.map((d) => '@' + d).join(', ')}).`;

export async function fetchProfile(): Promise<Profile | undefined> {
  const { data: s } = await supabase.auth.getSession();
  if (!s.session) return undefined;
  const { data, error } = await supabase.from('profiles').select('*').eq('id', s.session.user.id).maybeSingle();
  if (error) throw new Error(errMsg(error));
  if (!data) return undefined;
  const p = fromRow<Profile>(data);
  if (!p.ativo || !isAllowedDomain(p.email)) return undefined;
  return p;
}

export async function login(email: string, password: string): Promise<Profile> {
  const e = normalizeEmail(email);
  if (!isEmailFormat(e)) throw new Error('Informe um e-mail válido.');
  if (!isAllowedDomain(e)) throw new Error(domainError());
  const { error } = await supabase.auth.signInWithPassword({ email: e, password });
  if (error) throw new Error(/invalid/i.test(error.message) ? 'E-mail ou senha incorretos.' : errMsg(error));
  const p = await fetchProfile();
  if (!p) {
    await supabase.auth.signOut();
    throw new Error('Perfil não encontrado ou desativado. Procure o coordenador.');
  }
  return p;
}

export async function register(params: { email: string; nome: string; password: string; matricula?: string; funcao?: string }): Promise<Profile> {
  const e = normalizeEmail(params.email);
  if (!isEmailFormat(e)) throw new Error('Informe um e-mail válido.');
  if (!isAllowedDomain(e)) throw new Error(domainError());
  if (params.password.length < 8) throw new Error('A senha deve ter pelo menos 8 caracteres.');
  const { data, error } = await supabase.functions.invoke('signup', { body: { ...params, email: e } });
  if (error) {
    // A Edge Function devolve { error } no corpo; o supabase-js encapsula como FunctionsHttpError.
    let msg = errMsg(error);
    try {
      const ctx = (error as { context?: Response }).context;
      if (ctx) msg = (await ctx.json()).error ?? msg;
    } catch {
      /* mantém mensagem padrão */
    }
    throw new Error(msg);
  }
  if (data?.error) throw new Error(data.error);
  return login(e, params.password);
}

export async function logout() {
  await supabase.auth.signOut();
  db.clear();
}

export async function changePassword(nova: string) {
  if (nova.length < 8) throw new Error('A senha deve ter pelo menos 8 caracteres.');
  const { error } = await supabase.auth.updateUser({ password: nova });
  if (error) throw new Error(errMsg(error));
}

export async function adminResetPassword(userId: string, nova: string) {
  const { data, error } = await supabase.functions.invoke('signup', { body: { action: 'reset', userId, password: nova } });
  if (error) {
    let msg = errMsg(error);
    try {
      const ctx = (error as { context?: Response }).context;
      if (ctx) msg = (await ctx.json()).error ?? msg;
    } catch {
      /* noop */
    }
    throw new Error(msg);
  }
  if (data?.error) throw new Error(data.error);
}

// Permissões (a autorização efetiva é garantida pelo RLS no banco) --------------------
export const can = {
  viewAllActivities: (u: Profile) => u.role === 'coordenador' || u.role === 'cliente',
  editActivity: (u: Profile, collaboratorId: string) => u.role === 'coordenador' || (u.role === 'colaborador' && u.collaboratorId === collaboratorId),
  createActivity: (u: Profile) => u.role === 'coordenador' || (u.role === 'colaborador' && !!u.collaboratorId),
  importExcel: (u: Profile) => u.role === 'coordenador',
  vacations: (u: Profile) => u.role !== 'cliente',
  approveVacations: (u: Profile) => u.role === 'coordenador',
  reports: (u: Profile) => u.role === 'coordenador' || u.role === 'cliente',
  settings: (u: Profile) => u.role === 'coordenador',
};
