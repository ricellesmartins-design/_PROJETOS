// Filtros comuns às exportações Excel e cálculo de alocação mensal de horas.
import { db } from '../lib/db';
import { addDays, addMonths, findHoliday, isWeekend, monthEnd, monthStart, todayISO } from '../lib/dates';
import { computeEstHours, computeRealHours, executionWindow, isClosed, isLate } from './activities';
import type { Activity, ActivityStatus } from '../types';

export interface ExportFilter {
  from: string; // YYYY-MM
  to: string; // YYYY-MM
  collabs: string[]; // vazio = todos
  status: ActivityStatus[];
  areas: string[];
  ccs: string[];
  solicitantes: string[];
  situacao: '' | 'atrasadas' | 'abertas' | 'finalizadas' | 'reprogramadas';
}

export function monthsBetween(from: string, to: string): string[] {
  const out: string[] = [];
  if (!from || !to || from > to) return out;
  for (let k = from; k <= to && out.length < 60; k = addMonths(k, 1)) out.push(k);
  return out;
}

/** Atividade toca o mês (pela janela de execução ou, sem datas, pela data de solicitação). */
export function touchesMonth(a: Activity, key: string, today = todayISO()) {
  const ms = monthStart(key);
  const me = monthEnd(key);
  const w = executionWindow(a, today);
  if (w) return w.start <= me && w.end >= ms;
  const ref = a.dataSolicitacao ?? a.createdAt.slice(0, 10);
  return ref >= ms && ref <= me;
}

export function applyExportFilter(list: Activity[], f: ExportFilter, rescheduledIds: Set<string>, today = todayISO()): Activity[] {
  const months = monthsBetween(f.from, f.to);
  return list.filter((a) => {
    if (f.collabs.length && !f.collabs.includes(a.collaboratorId)) return false;
    if (f.status.length && !f.status.includes(a.status)) return false;
    if (f.areas.length && !f.areas.includes(a.area)) return false;
    if (f.ccs.length && !f.ccs.includes(a.centroCusto)) return false;
    if (f.solicitantes.length && !f.solicitantes.includes(a.solicitante)) return false;
    if (f.situacao === 'atrasadas' && !(isLate(a, today) && !isClosed(a))) return false;
    if (f.situacao === 'abertas' && isClosed(a)) return false;
    if (f.situacao === 'finalizadas' && a.status !== 'Finalizado') return false;
    if (f.situacao === 'reprogramadas' && !rescheduledIds.has(a.id)) return false;
    return months.some((m) => touchesMonth(a, m, today));
  });
}

/** Dias úteis (sem fins de semana e feriados) de um intervalo. */
export function workDays(start: string, end: string): string[] {
  const extras = db.settings.feriadosExtras;
  const out: string[] = [];
  for (let d = start; d <= end; d = addDays(d, 1)) if (!isWeekend(d) && !findHoliday(d, extras)) out.push(d);
  return out;
}

function share(start: string | undefined, end: string | undefined, hours: number | undefined, key: string): number {
  if (!hours || !start) return 0;
  const e = end && end >= start ? end : start;
  const days = workDays(start, e);
  if (!days.length) return start.slice(0, 7) === key ? hours : 0;
  const inMonth = days.filter((d) => d.slice(0, 7) === key).length;
  return (hours * inMonth) / days.length;
}

/** Horas da atividade alocadas no mês, distribuídas proporcionalmente pelos dias úteis. */
export function monthHours(a: Activity, key: string): { est: number; real: number } {
  if (a.status === 'Cancelado') return { est: 0, real: 0 };
  return {
    est: share(a.estInicio, a.estTermino, computeEstHours(a), key),
    real: share(a.inicioReal, a.terminoReal ?? a.inicioReal, computeRealHours(a), key),
  };
}

/** Dias de férias aprovadas do colaborador que caem em dias úteis do mês. */
export function vacationWorkDays(collaboratorId: string, key: string): number {
  const ms = monthStart(key);
  const me = monthEnd(key);
  const set = new Set<string>();
  for (const v of db.all('vacations')) {
    if (v.collaboratorId !== collaboratorId || v.status !== 'Aprovada') continue;
    for (const p of v.periodos) {
      const s = p.inicio > ms ? p.inicio : ms;
      const e = p.fim < me ? p.fim : me;
      if (s <= e) workDays(s, e).forEach((d) => set.add(d));
    }
  }
  return set.size;
}
