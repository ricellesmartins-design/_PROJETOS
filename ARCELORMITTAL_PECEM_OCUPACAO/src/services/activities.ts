// Regras de negócio de Atividades: cálculo de horas, auditoria de datas e consultas.
import { db } from '../lib/db';
import { uid } from '../lib/id';
import { addDays, monthEnd, monthStart, networkDays, todayISO } from '../lib/dates';
import { DATE_FIELDS, DATE_FIELD_LABEL, type Activity, type DateField, type User } from '../types';

export function computeEstHours(a: Pick<Activity, 'estModo' | 'horasDia' | 'estHoras' | 'estInicio' | 'estTermino'>): number | undefined {
  if (a.estModo === 'auto') {
    if (!a.estInicio || !a.estTermino || !a.horasDia) return undefined;
    return Math.max(0, networkDays(a.estInicio, a.estTermino)) * a.horasDia;
  }
  return a.estHoras;
}

export function computeRealHours(a: Pick<Activity, 'realModo' | 'horasDiaReal' | 'horasRealizadas' | 'inicioReal' | 'terminoReal'>): number | undefined {
  if (a.realModo === 'auto') {
    if (!a.inicioReal || !a.terminoReal || !a.horasDiaReal) return undefined;
    return Math.max(0, networkDays(a.inicioReal, a.terminoReal)) * a.horasDiaReal;
  }
  return a.horasRealizadas;
}

export function isClosed(a: Activity): boolean {
  return a.status === 'Finalizado' || a.status === 'Cancelado';
}

/** Atrasada: aberta com estimativa de término vencida, ou finalizada após a estimativa. */
export function isLate(a: Activity, today = todayISO()): boolean {
  if (a.status === 'Cancelado') return false;
  if (!a.estTermino) return false;
  if (a.status === 'Finalizado') return !!a.terminoReal && a.terminoReal > a.estTermino;
  return a.estTermino < today;
}

export function isRunningToday(a: Activity, today = todayISO()): boolean {
  if (isClosed(a)) return false;
  const w = executionWindow(a, today);
  return !!w && w.start <= today && w.end >= today;
}

/** Janela de execução usada no Gantt / mapa de carga. */
export function executionWindow(a: Activity, today = todayISO()): { start: string; end: string; previsto: boolean } | undefined {
  const start = a.inicioReal ?? a.estInicio;
  if (!start) return undefined;
  let end = a.terminoReal ?? a.estTermino;
  if (!a.terminoReal && !isClosed(a)) {
    // Em aberto: se a estimativa já venceu, a barra se estende até hoje.
    if (!end || end < today) end = today > start ? today : start;
  }
  if (!end) end = start;
  if (end < start) end = start;
  return { start, end, previsto: !a.terminoReal };
}

/** Horas/dia alocadas para o mapa de carga. */
/** Afastamento / atestado médico: lançado com ID fixo, não conta como carga de trabalho. */
export const ABSENCE_CODE = '0510-0000';
export const ABSENCE_DESC = 'Afastado | Atestado';
export const isAbsence = (a: Pick<Activity, 'codigo'>) => a.codigo.trim().toUpperCase() === ABSENCE_CODE;

export function dailyLoad(a: Activity): number {
  if (isAbsence(a)) return 0;
  if (a.status === 'Cancelado' || a.status === 'Aguardando Cliente') return 0;
  if (a.estModo === 'auto' && a.horasDia) return a.horasDia;
  const h = computeEstHours(a);
  const days = networkDays(a.estInicio, a.estTermino);
  if (h && days > 0) return Math.round((h / days) * 10) / 10;
  return db.settings.horasDiaPadrao;
}

/** Atividades de um colaborador que tocam o mês (YYYY-MM). */
export function activitiesInMonth(list: Activity[], key: string, today = todayISO()): Activity[] {
  const ms = monthStart(key);
  const me = monthEnd(key);
  return list.filter((a) => {
    const w = executionWindow(a, today);
    if (w) return w.start <= me && w.end >= ms;
    const ref = a.dataSolicitacao ?? a.createdAt.slice(0, 10);
    return ref >= ms && ref <= me;
  });
}

export function activityMonths(list: Activity[], today = todayISO()): string[] {
  const set = new Set<string>();
  list.forEach((a) => {
    const w = executionWindow(a, today);
    if (w) {
      for (let d = monthStart(w.start.slice(0, 7)); d <= w.end; d = addDays(monthEnd(d.slice(0, 7)), 1)) set.add(d.slice(0, 7));
    } else set.add((a.dataSolicitacao ?? a.createdAt).slice(0, 7));
  });
  return [...set].sort();
}

export interface DateChange {
  campo: DateField;
  anterior?: string;
  nova?: string;
}

/**
 * Regra crítica de auditoria: alterações de datas de execução após o cadastro
 * exigem justificativa. Preencher pela primeira vez uma data vazia não é alteração.
 */
export function detectDateChanges(before: Activity | undefined, after: Activity): DateChange[] {
  if (!before) return [];
  return DATE_FIELDS.filter((f) => before[f] && (before[f] ?? '') !== (after[f] ?? '')).map((f) => ({ campo: f, anterior: before[f], nova: after[f] }));
}

export function validateActivity(a: Activity, all: Activity[]): string[] {
  const errs: string[] = [];
  if (!a.codigo.trim()) errs.push('Informe o ID da atividade.');
  if (!a.descricao.trim()) errs.push('Informe a descrição da atividade.');
  if (!a.collaboratorId) errs.push('Selecione o colaborador.');
  if (a.estInicio && a.estTermino && a.estTermino < a.estInicio) errs.push('Estimativa de término anterior à estimativa de início.');
  if (a.inicioReal && a.terminoReal && a.terminoReal < a.inicioReal) errs.push('Término real anterior ao início real.');
  if (a.status === 'Finalizado' && !a.terminoReal) errs.push('Atividade finalizada precisa de Término Real.');
  // O ID de afastamento pode se repetir (um lançamento por período de atestado).
  const dup = !isAbsence(a) && all.find((x) => x.id !== a.id && x.codigo.trim().toUpperCase() === a.codigo.trim().toUpperCase() && x.collaboratorId === a.collaboratorId);
  if (dup) errs.push(`Já existe a atividade ${a.codigo} para este colaborador.`);
  return errs;
}

export function activityWarnings(a: Activity): string[] {
  const w: string[] = [];
  if (a.centroCusto && !db.all('costCenters').some((c) => c.codigo === a.centroCusto)) w.push(`Centro de custo "${a.centroCusto}" não está na base de centros de custo.`);
  if (!a.centroCusto) w.push('Centro de custo não informado.');
  return w;
}

export async function saveActivity(input: Activity, user: User, justificativa?: string): Promise<Activity> {
  const all = db.all('activities');
  const before = all.find((x) => x.id === input.id);
  const now = new Date().toISOString();
  const a: Activity = {
    ...input,
    codigo: input.codigo.trim().toUpperCase(),
    estHoras: computeEstHours(input),
    horasRealizadas: computeRealHours(input),
    updatedAt: now,
    updatedBy: user.email,
  };
  const errs = validateActivity(a, all);
  if (errs.length) throw new Error(errs.join('\n'));
  const changes = detectDateChanges(before, a);
  if (changes.length && !(justificativa && justificativa.trim().length >= 10)) {
    throw new Error(
      'Justificativa obrigatória (mínimo 10 caracteres) para alteração de: ' + changes.map((c) => DATE_FIELD_LABEL[c.campo]).join(', '),
    );
  }
  // A auditoria (log de alteração de datas) é gravada pelo trigger do banco a partir da justificativa.
  if (before) return db.update('activities', a, { justificativa_alteracao: changes.length ? justificativa!.trim() : null });
  return db.insert('activities', { ...a, createdAt: now, createdBy: user.email });
}


export async function deleteActivity(id: string) {
  await db.remove('activities', id);
}

export function emptyActivity(collaboratorId: string, user: User): Activity {
  const now = new Date().toISOString();
  return {
    id: uid('a_'),
    codigo: '',
    collaboratorId,
    descricao: '',
    solicitante: '',
    area: '',
    dataSolicitacao: todayISO(),
    estModo: 'auto',
    horasDia: db.settings.horasDiaPadrao,
    realModo: 'manual',
    documentosAMP: '',
    centroCusto: '',
    status: 'Não Iniciado',
    observacao: '',
    createdAt: now,
    createdBy: user.email,
    updatedAt: now,
    updatedBy: user.email,
  };
}
