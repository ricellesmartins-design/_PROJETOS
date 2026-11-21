// Leitura e gravação do Manual no Supabase (manual_secoes, manual_capturas, manual_config).
import { supabase, errMsg } from '../lib/supabase';
import type { Profile } from '../lib/db';
import type { Role } from '../types';
import { DEFAULT_CHAPTERS, DEFAULT_TIME_ROWS, type ManualChapter, type TimeRow } from './content';

export interface Marker {
  n: number;
  x: number; // 0..1 da largura
  y: number; // 0..1 da altura
}
export interface Capture {
  pagina: string;
  rota: string;
  imagem_url: string;
  legenda: string;
  marcadores: Marker[];
  data_captura: string;
  origem: 'automatica' | 'upload';
}
interface SectionRow {
  id: string;
  titulo: string;
  ordem: number;
  conteudo: string;
  rota_relacionada: string | null;
  atualizado_em: string;
  atualizado_por: string | null;
}
export interface Chapter extends ManualChapter {
  editado?: { em: string; por?: string };
  personalizado?: boolean; // capítulo criado pelo coordenador (não existe no padrão)
}
export interface ManualData {
  chapters: Chapter[];
  captures: Record<string, Capture>;
  timeRows: TimeRow[];
  faltaTabela?: string; // tabelas ainda não criadas (SQL 011 não rodado)
}

const missing = (e: { code?: string; message?: string } | null) => !!e && (e.code === '42P01' || e.code === 'PGRST205' || /does not exist|Could not find the table/i.test(e.message ?? ''));

export async function loadManual(): Promise<ManualData> {
  const [s, c, cfg] = await Promise.all([
    supabase.from('manual_secoes').select('*'),
    supabase.from('manual_capturas').select('*'),
    supabase.from('manual_config').select('data').eq('id', 1).maybeSingle(),
  ]);
  const falta = [s, c, cfg].some((r) => missing(r.error));
  for (const r of [s, c, cfg]) if (r.error && !missing(r.error)) throw new Error(errMsg(r.error));
  const rows = ((s.data ?? []) as SectionRow[]).reduce<Record<string, SectionRow>>((m, r) => ((m[r.id] = r), m), {});
  const chapters: Chapter[] = DEFAULT_CHAPTERS.map((d) => {
    const r = rows[d.id];
    return r ? { ...d, titulo: r.titulo, ordem: r.ordem, conteudo: r.conteudo, rota: r.rota_relacionada ?? d.rota, editado: { em: r.atualizado_em, por: r.atualizado_por ?? undefined } } : d;
  });
  for (const r of Object.values(rows))
    if (!DEFAULT_CHAPTERS.some((d) => d.id === r.id))
      chapters.push({ id: r.id, titulo: r.titulo, ordem: r.ordem, conteudo: r.conteudo, rota: r.rota_relacionada ?? undefined, personalizado: true, editado: { em: r.atualizado_em, por: r.atualizado_por ?? undefined } });
  chapters.sort((a, b) => a.ordem - b.ordem || a.titulo.localeCompare(b.titulo));
  const captures: Record<string, Capture> = {};
  for (const r of (c.data ?? []) as Capture[]) captures[r.pagina] = { ...r, marcadores: Array.isArray(r.marcadores) ? r.marcadores : [] };
  const saved = (cfg.data?.data as { linhas?: TimeRow[] } | undefined)?.linhas;
  return { chapters, captures, timeRows: saved?.length ? saved : DEFAULT_TIME_ROWS, faltaTabela: falta ? 'manual' : undefined };
}

const check = (r: { error: { message: string } | null }) => {
  if (r.error) throw new Error(missing(r.error as { message: string }) ? 'As tabelas do Manual ainda não existem no Supabase. Rode o SQL 011_manual.sql.' : errMsg(r.error));
};

export async function saveChapter(ch: Pick<Chapter, 'id' | 'titulo' | 'ordem' | 'conteudo' | 'rota'>, user: Profile) {
  check(
    await supabase.from('manual_secoes').upsert({ id: ch.id, titulo: ch.titulo, ordem: ch.ordem, conteudo: ch.conteudo, rota_relacionada: ch.rota ?? null, atualizado_em: new Date().toISOString(), atualizado_por: user.nome }),
  );
}
export async function resetChapter(id: string) {
  check(await supabase.from('manual_secoes').delete().eq('id', id));
}
export async function saveCapture(c: Capture) {
  check(await supabase.from('manual_capturas').upsert(c));
}
export async function saveTimeRows(linhas: TimeRow[]) {
  check(await supabase.from('manual_config').upsert({ id: 1, data: { linhas }, atualizado_em: new Date().toISOString() }));
}

export const canSee = (perfis: Role[] | undefined, u: Profile) => !perfis?.length || perfis.includes(u.role);

/** Totais do comparativo de tempo. */
export function timeTotals(rows: TimeRow[]) {
  const per = rows.map((r) => {
    const manualH = (r.manualMin * r.volumeMes) / 60;
    const sistemaH = (r.sistemaMin * r.volumeMes) / 60;
    return { ...r, manualH, sistemaH, economiaH: Math.max(0, manualH - sistemaH), pct: r.manualMin ? Math.round((1 - r.sistemaMin / r.manualMin) * 100) : 0 };
  });
  const mes = per.reduce((s, r) => s + r.economiaH, 0);
  const manualMes = per.reduce((s, r) => s + r.manualH, 0);
  return { per, mes, ano: mes * 12, manualMes, sistemaMes: per.reduce((s, r) => s + r.sistemaH, 0), pct: manualMes ? Math.round((mes / manualMes) * 100) : 0 };
}

export const fmtH = (h: number) => (h >= 100 ? Math.round(h).toLocaleString('pt-BR') : h.toLocaleString('pt-BR', { maximumFractionDigits: 1 }));
export const fmtMin = (m: number) => (m >= 60 ? `${(m / 60).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} h` : `${m} min`);
