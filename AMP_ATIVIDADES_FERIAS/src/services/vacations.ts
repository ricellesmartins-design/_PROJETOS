// Regras de negócio de Férias: cálculo de períodos, validações CLT/formulário,
// motor de conflitos entre colaboradores e fluxo de aprovação.
import { db } from '../lib/db';
import { uid } from '../lib/id';
import { addDays, diffDays, findHoliday, fmtBR, rangesOverlapDays, todayISO, weekday, WEEKDAY_NAMES } from '../lib/dates';
import {
  MODALITY_DAYS,
  MODALITY_LABEL,
  type User,
  type VacationModality,
  type VacationPeriod,
  type VacationRequest,
  type VacationStatus,
} from '../types';

export const MIN_ADVANCE_DAYS = 40;
export const OVERLAP_TOLERANCE_DAYS = 7;
export const MAX_SIMULTANEOUS = 2;

export function buildPeriods(modalidade: VacationModality, starts: (string | undefined)[]): VacationPeriod[] {
  return MODALITY_DAYS[modalidade].flatMap((dias, i) => {
    const inicio = starts[i];
    if (!inicio) return [];
    return [{ inicio, fim: addDays(inicio, dias - 1), dias }];
  });
}

export type Severity = 'erro' | 'alerta' | 'info';
export interface Finding {
  severity: Severity;
  message: string;
}

/** Valida dia de início (segunda/terça), feriados nos 2 dias seguintes, antecedência e ordem dos períodos. */
export function validatePeriods(modalidade: VacationModality, periodos: VacationPeriod[], dataSolicitacao = todayISO()): Finding[] {
  const out: Finding[] = [];
  const extras = db.settings.feriadosExtras;
  const expected = MODALITY_DAYS[modalidade].length;
  if (periodos.length < expected) out.push({ severity: 'erro', message: `Informe a data de início de ${expected === 1 ? 'o período' : 'todos os ' + expected + ' períodos'}.` });
  periodos.forEach((p, i) => {
    const n = `Período ${i + 1}`;
    const wd = weekday(p.inicio);
    if (wd !== 1 && wd !== 2) out.push({ severity: 'erro', message: `${n}: início em ${WEEKDAY_NAMES[wd]} (${fmtBR(p.inicio)}). As férias só podem iniciar na segunda ou terça-feira.` });
    const hStart = findHoliday(p.inicio, extras);
    if (hStart) out.push({ severity: 'erro', message: `${n}: ${fmtBR(p.inicio)} é feriado (${hStart.nome}).` });
    for (const k of [1, 2]) {
      const d = addDays(p.inicio, k);
      const h = findHoliday(d, extras);
      if (h) out.push({ severity: 'erro', message: `${n}: feriado em ${fmtBR(d)} (${h.nome}) nos 2 dias seguintes ao início. É vedado iniciar férias nos dois dias que antecedem feriado (CLT art. 134 §3º).` });
    }
    const adv = diffDays(dataSolicitacao, p.inicio);
    if (adv < MIN_ADVANCE_DAYS) out.push({ severity: 'alerta', message: `${n}: antecedência de ${adv} dias (mínimo recomendado: ${MIN_ADVANCE_DAYS} dias).` });
  });
  if (periodos.length === 2 && periodos[1].inicio <= periodos[0].fim) out.push({ severity: 'erro', message: 'O 2º período deve começar após o término do 1º período.' });
  return out;
}

export interface Conflict {
  severity: 'alerta' | 'critico';
  outroId: string;
  outroNome: string;
  outroStatus: VacationStatus;
  dias: number;
  inicio: string;
  fim: string;
  message: string;
}

export interface ConflictReport {
  conflitos: Conflict[];
  simultaneos: { data: string; nomes: string[] }[];
  nivel: 'ok' | 'alerta' | 'critico';
}

/** Solicitações que ocupam a agenda da equipe (pendentes, em ajuste, aprovadas ou com cancelamento em análise). */
export function activeRequests(all = db.all('vacations')): VacationRequest[] {
  return all.filter((v) => v.status === 'Aprovada' || v.status === 'Pendente' || v.status === 'Ajuste Solicitado' || v.status === 'Cancelamento Solicitado');
}

/**
 * Motor de conflitos: cruza os períodos da solicitação com os de todos os demais
 * colaboradores da equipe AMP.
 *  - sobreposição de até 7 dias corridos com um colega: alerta (transição saída/retorno);
 *  - sobreposição > 7 dias, ou mais de 2 colaboradores ausentes no mesmo dia: crítico.
 */
export function analyzeConflicts(collaboratorId: string, periodos: VacationPeriod[], ignoreRequestId?: string): ConflictReport {
  const collabs = new Map(db.all('collaborators').map((c) => [c.id, c.nome]));
  const others = activeRequests().filter((v) => v.collaboratorId !== collaboratorId && v.id !== ignoreRequestId);
  const conflitos: Conflict[] = [];
  for (const p of periodos) {
    for (const o of others) {
      for (const op of o.periodos) {
        const dias = rangesOverlapDays(p.inicio, p.fim, op.inicio, op.fim);
        if (dias <= 0) continue;
        const inicio = p.inicio > op.inicio ? p.inicio : op.inicio;
        const fim = p.fim < op.fim ? p.fim : op.fim;
        const nome = collabs.get(o.collaboratorId) ?? '—';
        const severity = dias > OVERLAP_TOLERANCE_DAYS ? 'critico' : 'alerta';
        conflitos.push({
          severity,
          outroId: o.id,
          outroNome: nome,
          outroStatus: o.status,
          dias,
          inicio,
          fim,
          message:
            severity === 'critico'
              ? `Sobreposição de ${dias} dias com ${nome} (${fmtBR(inicio)} a ${fmtBR(fim)}) — acima do limite de ${OVERLAP_TOLERANCE_DAYS} dias.`
              : `Sobreposição de ${dias} dia(s) com ${nome} (${fmtBR(inicio)} a ${fmtBR(fim)}) — permitida como transição (até ${OVERLAP_TOLERANCE_DAYS} dias).`,
        });
      }
    }
  }
  // Ausências simultâneas (incluindo a própria solicitação).
  const simultaneos: { data: string; nomes: string[] }[] = [];
  for (const p of periodos) {
    for (let d = p.inicio; d <= p.fim; d = addDays(d, 1)) {
      const nomes = others.filter((o) => o.periodos.some((op) => op.inicio <= d && op.fim >= d)).map((o) => collabs.get(o.collaboratorId) ?? '—');
      if (nomes.length + 1 > MAX_SIMULTANEOUS) simultaneos.push({ data: d, nomes: [...new Set(nomes)] });
    }
  }
  const nivel = conflitos.some((c) => c.severity === 'critico') || simultaneos.length ? 'critico' : conflitos.length ? 'alerta' : 'ok';
  return { conflitos, simultaneos, nivel };
}

function event(user: User, acao: string, texto?: string) {
  return { dataHora: new Date().toISOString(), usuario: `${user.nome} <${user.email}>`, acao, texto };
}

export function canCollaboratorEdit(v: VacationRequest): boolean {
  return v.status === 'Pendente' || v.status === 'Ajuste Solicitado' || v.status === 'Aprovada';
}

export interface SubmitInput {
  id?: string;
  collaboratorId: string;
  modalidade: VacationModality;
  starts: (string | undefined)[];
  chamadoRH: string;
  observacao: string;
}

/**
 * Cria ou altera uma solicitação. Qualquer alteração feita pelo colaborador
 * (inclusive em férias já aprovadas) devolve a solicitação para a fila de aprovação.
 */
export async function submitVacation(input: SubmitInput, user: User): Promise<VacationRequest> {
  const periodos = buildPeriods(input.modalidade, input.starts);
  const existing = input.id ? db.all('vacations').find((v) => v.id === input.id) : undefined;
  const dataSolicitacao = existing?.dataSolicitacao ?? todayISO();
  const findings = validatePeriods(input.modalidade, periodos, todayISO());
  const erros = findings.filter((f) => f.severity === 'erro');
  if (erros.length) throw new Error(erros.map((e) => e.message).join('\n'));
  const conf = analyzeConflicts(input.collaboratorId, periodos, existing?.id);
  if (conf.nivel === 'critico' && user.role !== 'coordenador') {
    throw new Error('Conflito crítico com a escala da equipe: ajuste as datas antes de enviar.\n' + describeConflicts(conf).join('\n'));
  }
  const resumo = `${MODALITY_LABEL[input.modalidade]} · ${periodos.map((p) => `${fmtBR(p.inicio)} a ${fmtBR(p.fim)}`).join(' / ')}`;
  if (!existing) {
    const v: VacationRequest = {
      id: uid('v_'),
      collaboratorId: input.collaboratorId,
      modalidade: input.modalidade,
      periodos,
      dataSolicitacao,
      secao: db.settings.secaoPadrao,
      chamadoRH: input.chamadoRH.trim(),
      statusChamadoRH: input.chamadoRH.trim() ? 'Aberto' : 'Não aberto',
      status: 'Pendente',
      observacao: input.observacao.trim(),
      revisao: 1,
      historico: [event(user, 'Solicitação enviada', resumo)],
    };
    return db.insert('vacations', v);
  }
  if (user.role !== 'coordenador' && !canCollaboratorEdit(existing)) throw new Error('Esta solicitação não pode mais ser alterada.');
  const datesChanged = existing.modalidade !== input.modalidade || JSON.stringify(existing.periodos) !== JSON.stringify(periodos);
  const obsChanged = existing.observacao !== input.observacao.trim();
  const ticketChanged = existing.chamadoRH !== input.chamadoRH.trim();
  if (!datesChanged && !obsChanged && !ticketChanged) return existing;
  if (!datesChanged && !obsChanged) {
    // Só o número do chamado RH mudou: não altera as férias nem a aprovação.
    return updateHrTicket(existing.id, input.chamadoRH, input.chamadoRH.trim() && existing.statusChamadoRH === 'Não aberto' ? 'Aberto' : existing.statusChamadoRH, user);
  }
  const wasApproved = existing.status === 'Aprovada';
  const v: VacationRequest = {
    ...existing,
    modalidade: input.modalidade,
    periodos,
    chamadoRH: input.chamadoRH.trim(),
    statusChamadoRH: input.chamadoRH.trim() && existing.statusChamadoRH === 'Não aberto' ? 'Aberto' : existing.statusChamadoRH,
    observacao: input.observacao.trim(),
    // Toda alteração retorna para aprovação do coordenador (também garantido por trigger no banco).
    status: 'Pendente',
    revisao: (existing.revisao ?? 1) + 1,
    versaoAnteriorAprovada: wasApproved ? { modalidade: existing.modalidade, periodos: existing.periodos, aprovadoEm: existing.aprovadoEm } : existing.versaoAnteriorAprovada,
    aprovadoEm: undefined,
    aprovadoPor: undefined,
    parecer: undefined,
    conflitoJustificado: undefined,
    historico: [
      ...existing.historico,
      event(user, wasApproved ? 'Alteração de férias aprovadas — retornou para aprovação' : 'Solicitação alterada — retornou para aprovação', resumo),
    ],
  };
  return db.update('vacations', v);
}

export function describeConflicts(c: ConflictReport): string[] {
  const out = c.conflitos.map((x) => x.message);
  if (c.simultaneos.length) {
    const first = c.simultaneos[0];
    out.push(
      `Mais de ${MAX_SIMULTANEOUS} colaboradores ausentes simultaneamente em ${c.simultaneos.length} dia(s) (ex.: ${fmtBR(first.data)} com ${first.nomes.join(', ')}).`,
    );
  }
  return out;
}

export type Decision = 'Aprovar' | 'Solicitar Ajuste' | 'Reprovar';

export async function decide(id: string, decision: Decision, parecer: string, user: User, justificativaConflito?: string): Promise<VacationRequest> {
  if (user.role !== 'coordenador') throw new Error('Apenas o coordenador pode aprovar férias.');
  const v = db.all('vacations').find((x) => x.id === id);
  if (!v) throw new Error('Solicitação não encontrada.');
  if (decision !== 'Aprovar' && !parecer.trim()) throw new Error('Informe o parecer para ' + decision.toLowerCase() + '.');
  const conf = analyzeConflicts(v.collaboratorId, v.periodos, v.id);
  if (decision === 'Aprovar' && conf.nivel === 'critico' && !(justificativaConflito && justificativaConflito.trim().length >= 10)) {
    throw new Error('Há conflito crítico na escala. Registre a justificativa (mín. 10 caracteres) para aprovar mesmo assim.');
  }
  const now = new Date().toISOString();
  const status: VacationStatus = decision === 'Aprovar' ? 'Aprovada' : decision === 'Reprovar' ? 'Reprovada' : 'Ajuste Solicitado';
  const next: VacationRequest = {
    ...v,
    status,
    parecer: parecer.trim() || undefined,
    aprovadoPor: decision === 'Aprovar' ? user.nome : undefined,
    aprovadoEm: decision === 'Aprovar' ? now : undefined,
    conflitoJustificado: decision === 'Aprovar' && conf.nivel === 'critico' ? justificativaConflito?.trim() : undefined,
    historico: [...v.historico, event(user, decision === 'Aprovar' ? 'Aprovada' : decision === 'Reprovar' ? 'Reprovada' : 'Ajuste solicitado', parecer.trim() || undefined)],
  };
  return db.update('vacations', next);
}

/** O colaborador pede cancelamento; se já aprovadas, o cancelamento também vai para aprovação. */
export async function requestCancellation(id: string, motivo: string, user: User): Promise<VacationRequest> {
  const v = db.all('vacations').find((x) => x.id === id);
  if (!v) throw new Error('Solicitação não encontrada.');
  if (!motivo.trim()) throw new Error('Informe o motivo do cancelamento.');
  let next: VacationRequest;
  if (v.status === 'Aprovada' && user.role !== 'coordenador') {
    const first = v.periodos[0]?.inicio;
    const aviso = first && diffDays(todayISO(), first) < 30 ? ' (atenção: menos de 30 dias do início — cancelamento deve ser feito via chamado RH)' : '';
    next = { ...v, status: 'Cancelamento Solicitado', historico: [...v.historico, event(user, 'Cancelamento solicitado — aguardando aprovação' + aviso, motivo)] };
  } else {
    next = { ...v, status: 'Cancelada', historico: [...v.historico, event(user, 'Cancelada', motivo)] };
  }
  return db.update('vacations', next);
}

export async function decideCancellation(id: string, aprovar: boolean, parecer: string, user: User): Promise<VacationRequest> {
  if (user.role !== 'coordenador') throw new Error('Apenas o coordenador pode decidir o cancelamento.');
  const v = db.all('vacations').find((x) => x.id === id)!;
  const next: VacationRequest = {
    ...v,
    status: aprovar ? 'Cancelada' : 'Aprovada',
    historico: [...v.historico, event(user, aprovar ? 'Cancelamento aprovado' : 'Cancelamento recusado — férias mantidas', parecer || undefined)],
  };
  return db.update('vacations', next);
}

export async function updateHrTicket(id: string, chamadoRH: string, statusChamadoRH: VacationRequest['statusChamadoRH'], user: User): Promise<VacationRequest> {
  const v = db.all('vacations').find((x) => x.id === id)!;
  const next: VacationRequest = {
    ...v,
    chamadoRH: chamadoRH.trim(),
    statusChamadoRH,
    historico: [...v.historico, event(user, 'Chamado RH atualizado', `${chamadoRH.trim() || '(sem número)'} · ${statusChamadoRH}`)],
  };
  return db.update('vacations', next);
}

export function isOnVacation(collaboratorId: string, date: string, onlyApproved = true): boolean {
  return db
    .all('vacations')
    .some((v) => v.collaboratorId === collaboratorId && (onlyApproved ? v.status === 'Aprovada' : activeRequests([v]).length > 0) && v.periodos.some((p) => p.inicio <= date && p.fim >= date));
}
