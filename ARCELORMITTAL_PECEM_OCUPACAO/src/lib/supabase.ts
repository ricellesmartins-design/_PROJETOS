import { createClient } from '@supabase/supabase-js';

export const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
export const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_KEY as string;
export const VAPID_PUBLIC = import.meta.env.VITE_VAPID_PUBLIC as string;

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, storageKey: 'amp-idg-auth' },
});

/** Mensagem de erro amigável a partir de erros do PostgREST / Edge Functions. */
export function errMsg(e: unknown): string {
  if (!e) return 'Erro desconhecido.';
  if (typeof e === 'string') return e;
  const any = e as { message?: string; details?: string; hint?: string };
  return [any.message, any.details].filter(Boolean).join(' — ') || String(e);
}

/** Chama uma Edge Function e converte erros HTTP no texto { error } devolvido pela função. */
export async function invokeFunction<T = unknown>(name: string, body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke(name, { body });
  if (error) {
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
  return data as T;
}
