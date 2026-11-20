// Testes das regras de negócio críticas (férias, conflitos, horas, auditoria de datas).
import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { Activity, VacationRequest } from '../src/types';

const state = vi.hoisted(() => ({
  vacations: [] as VacationRequest[],
  collaborators: [
    { id: 'a', nome: 'ANA', matricula: '1', funcao: '', ativo: true },
    { id: 'b', nome: 'BRUNO', matricula: '2', funcao: '', ativo: true },
    { id: 'c', nome: 'CARLA', matricula: '3', funcao: '', ativo: true },
    { id: 'd', nome: 'DIEGO', matricula: '4', funcao: '', ativo: true },
  ],
}));

vi.mock('../src/lib/db', () => ({
  db: {
    all: (t: string) => (t === 'vacations' ? state.vacations : t === 'collaborators' ? state.collaborators : []),
    settings: { feriadosExtras: [], horasDiaPadrao: 8 },
    insert: vi.fn(async (_t: string, row: unknown) => row),
    update: vi.fn(async (_t: string, row: unknown) => row),
  },
}));

import { analyzeConflicts, buildPeriods, submitVacation, validatePeriods } from '../src/services/vacations';
import { computeEstHours, detectDateChanges, isLate } from '../src/services/activities';
import { findHoliday, networkDays } from '../src/lib/dates';

const req = (id: string, collaboratorId: string, inicio: string, dias: number, status: VacationRequest['status'] = 'Aprovada'): VacationRequest => ({
  id,
  collaboratorId,
  modalidade: '30',
  periodos: buildPeriods('30', [inicio]).map((p) => ({ ...p, dias, fim: new Date(Date.parse(inicio) + (dias - 1) * 864e5).toISOString().slice(0, 10) })),
  dataSolicitacao: '2026-10-01',
  secao: '',
  chamadoRH: '',
  statusChamadoRH: 'Não aberto',
  status,
  observacao: '',
  revisao: 1,
  historico: [],
});

const coord = { id: 'u0', email: 'ricelles@idg-eng.com', nome: 'Coord', role: 'coordenador' as const, ativo: true, createdAt: '' };
const colab = { id: 'u1', email: 'ana@idg-eng.com', nome: 'Ana', role: 'colaborador' as const, collaboratorId: 'a', ativo: true, createdAt: '' };

beforeEach(() => {
  state.vacations = [];
});

describe('férias: cálculo e validação', () => {
  it('calcula fim automaticamente por modalidade', () => {
    expect(buildPeriods('30', ['2027-03-01'])).toEqual([{ inicio: '2027-03-01', fim: '2027-03-30', dias: 30 }]);
    expect(buildPeriods('20+10abono', ['2027-03-01'])).toEqual([{ inicio: '2027-03-01', fim: '2027-03-20', dias: 20 }]);
    const p = buildPeriods('10+20', ['2027-03-01', '2027-08-03']);
    expect(p.map((x) => x.fim)).toEqual(['2027-03-10', '2027-08-22']);
  });

  it('só permite início na segunda ou terça', () => {
    const qua = validatePeriods('30', buildPeriods('30', ['2027-03-03']), '2026-11-20');
    expect(qua.some((f) => f.severity === 'erro' && /segunda ou terça/.test(f.message))).toBe(true);
    const seg = validatePeriods('30', buildPeriods('30', ['2027-03-01']), '2026-11-20');
    expect(seg.filter((f) => f.severity === 'erro')).toEqual([]);
  });

  it('bloqueia início com feriado nos 2 dias seguintes', () => {
    // 19/03/2027 (sex) é São José (CE). 2027-03-16 é terça: dia+2 = 18/03, ok. Testa com Tiradentes 21/04/2027 (qua): início 19/04 (seg).
    expect(findHoliday('2027-04-21')?.nome).toMatch(/Tiradentes/);
    const f = validatePeriods('30', buildPeriods('30', ['2027-04-19']), '2026-11-20');
    expect(f.some((x) => x.severity === 'erro' && /feriado/i.test(x.message))).toBe(true);
  });

  it('alerta antecedência menor que 40 dias', () => {
    const f = validatePeriods('30', buildPeriods('30', ['2026-12-14']), '2026-11-20');
    expect(f.some((x) => x.severity === 'alerta' && /antecedência/.test(x.message))).toBe(true);
  });
});

describe('motor de conflitos', () => {
  it('sobreposição de até 7 dias é alerta (amarelo)', () => {
    state.vacations = [req('v1', 'b', '2027-03-01', 30)];
    const r = analyzeConflicts('a', [{ inicio: '2027-03-24', fim: '2027-04-22', dias: 30 }]);
    expect(r.nivel).toBe('alerta');
    expect(r.conflitos[0].dias).toBe(7);
  });
  it('sobreposição acima de 7 dias é crítica (vermelho)', () => {
    state.vacations = [req('v1', 'b', '2027-03-01', 30)];
    const r = analyzeConflicts('a', [{ inicio: '2027-03-22', fim: '2027-04-20', dias: 30 }]);
    expect(r.nivel).toBe('critico');
  });
  it('mais de 2 pessoas ausentes ao mesmo tempo é crítico', () => {
    state.vacations = [req('v1', 'b', '2027-03-01', 30), req('v2', 'c', '2027-03-29', 30)];
    const r = analyzeConflicts('a', [{ inicio: '2027-03-29', fim: '2027-03-30', dias: 2 }]);
    expect(r.simultaneos.length).toBeGreaterThan(0);
    expect(r.nivel).toBe('critico');
  });
  it('ignora reprovadas e canceladas', () => {
    state.vacations = [req('v1', 'b', '2027-03-01', 30, 'Reprovada'), req('v2', 'c', '2027-03-01', 30, 'Cancelada')];
    expect(analyzeConflicts('a', [{ inicio: '2027-03-01', fim: '2027-03-30', dias: 30 }]).nivel).toBe('ok');
  });
});

describe('alteração pelo colaborador retorna para aprovação', () => {
  it('férias aprovadas alteradas voltam para Pendente e guardam a versão anterior', async () => {
    const v = { ...req('v1', 'a', '2027-03-01', 30), aprovadoPor: 'Coord', aprovadoEm: '2026-11-01T10:00:00Z' };
    state.vacations = [v];
    const out = await submitVacation({ id: 'v1', collaboratorId: 'a', modalidade: '30', starts: ['2027-03-02'], chamadoRH: '', observacao: '' }, colab);
    expect(out.status).toBe('Pendente');
    expect(out.revisao).toBe(2);
    expect(out.aprovadoPor).toBeUndefined();
    expect(out.versaoAnteriorAprovada?.periodos[0].inicio).toBe('2027-03-01');
  });
  it('alterar só o chamado RH não reinicia a aprovação', async () => {
    state.vacations = [req('v1', 'a', '2027-03-01', 30)];
    const out = await submitVacation({ id: 'v1', collaboratorId: 'a', modalidade: '30', starts: ['2027-03-01'], chamadoRH: 'RITM001', observacao: '' }, colab);
    expect(out.status).toBe('Aprovada');
    expect(out.chamadoRH).toBe('RITM001');
  });
  it('colaborador não consegue enviar com conflito crítico; coordenador consegue', async () => {
    state.vacations = [req('v9', 'b', '2027-03-01', 30)];
    const input = { collaboratorId: 'a', modalidade: '30' as const, starts: ['2027-03-01'], chamadoRH: '', observacao: '' };
    await expect(submitVacation(input, colab)).rejects.toThrow(/Conflito crítico/);
    await expect(submitVacation(input, coord)).resolves.toMatchObject({ status: 'Pendente' });
  });
});

describe('atividades', () => {
  const base = { estModo: 'auto', horasDia: 8, estInicio: '2026-11-02', estTermino: '2026-11-06' } as Activity;
  it('horas estimadas = NETWORKDAYS × horas/dia', () => {
    expect(networkDays('2026-11-02', '2026-11-08')).toBe(5);
    expect(computeEstHours(base)).toBe(40);
  });
  it('detecta alteração de datas (exige justificativa) mas não o primeiro preenchimento', () => {
    const before = { ...base, inicioReal: undefined } as Activity;
    expect(detectDateChanges(before, { ...before, inicioReal: '2026-11-03' })).toEqual([]);
    expect(detectDateChanges(before, { ...before, estTermino: '2026-11-10' }).map((c) => c.campo)).toEqual(['estTermino']);
  });
  it('atraso', () => {
    expect(isLate({ ...base, status: 'Em andamento' } as Activity, '2026-11-20')).toBe(true);
    expect(isLate({ ...base, status: 'Finalizado', terminoReal: '2026-11-06' } as Activity, '2026-11-20')).toBe(false);
  });
});
