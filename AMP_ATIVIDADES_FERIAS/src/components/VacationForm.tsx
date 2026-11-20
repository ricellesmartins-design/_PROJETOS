// Formulário de solicitação/alteração de férias com calendário que só libera
// segundas e terças-feiras sem feriado no dia ou nos 2 dias seguintes.
import { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { db } from '../lib/db';
import { useSession, collaboratorName } from '../lib/store';
import { addDays, addMonths, findHoliday, fmtBR, monthEnd, monthKey, monthLabel, monthStart, todayISO, weekday } from '../lib/dates';
import { analyzeConflicts, buildPeriods, describeConflicts, submitVacation, validatePeriods } from '../services/vacations';
import { MODALITY_DAYS, MODALITY_LABEL, type VacationModality, type VacationRequest } from '../types';
import { Alert, Badge, Button, Field, Modal, cx, useAction } from './ui';

const MODALITIES: VacationModality[] = ['30', '15+15', '10+20', '20+10', '19+11', '20+10abono'];

/** Motivo de bloqueio de um dia para início de férias (undefined = permitido). */
export function startBlockReason(iso: string): string | undefined {
  const extras = db.settings.feriadosExtras;
  const wd = weekday(iso);
  if (wd !== 1 && wd !== 2) return 'Início permitido somente na segunda ou terça-feira';
  const h = findHoliday(iso, extras);
  if (h) return `Feriado: ${h.nome}`;
  for (const k of [1, 2]) {
    const hh = findHoliday(addDays(iso, k), extras);
    if (hh) return `Feriado em ${fmtBR(addDays(iso, k))} (${hh.nome}) nos 2 dias seguintes`;
  }
  return undefined;
}

export function StartDatePicker({ value, onChange, min, highlight = [] }: { value?: string; onChange: (v: string) => void; min?: string; highlight?: { inicio: string; fim: string }[] }) {
  const [month, setMonth] = useState(monthKey(value ?? addDays(todayISO(), 45)));
  const first = monthStart(month);
  const last = monthEnd(month);
  const lead = weekday(first);
  const days: (string | null)[] = [...Array(lead).fill(null)];
  for (let d = first; d <= last; d = addDays(d, 1)) days.push(d);
  const extras = db.settings.feriadosExtras;
  return (
    <div className="w-full max-w-xs select-none rounded-lg border border-slate-200 bg-white p-2">
      <div className="mb-1 flex items-center justify-between">
        <button type="button" className="rounded p-1 hover:bg-slate-100" onClick={() => setMonth(addMonths(month, -1))} aria-label="Mês anterior">
          <ChevronLeft className="h-4 w-4" />
        </button>
        <span className="text-sm font-semibold capitalize">{monthLabel(month)}</span>
        <button type="button" className="rounded p-1 hover:bg-slate-100" onClick={() => setMonth(addMonths(month, 1))} aria-label="Próximo mês">
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
      <div className="grid grid-cols-7 gap-0.5 text-center text-[11px]">
        {['D', 'S', 'T', 'Q', 'Q', 'S', 'S'].map((d, i) => (
          <div key={i} className="py-1 font-semibold text-slate-400">
            {d}
          </div>
        ))}
        {days.map((d, i) => {
          if (!d) return <div key={i} />;
          const block = startBlockReason(d) ?? (min && d < min ? 'Data no passado' : undefined);
          const hol = findHoliday(d, extras);
          const inRange = highlight.some((p) => p.inicio <= d && p.fim >= d);
          const selected = d === value;
          return (
            <button
              type="button"
              key={d}
              disabled={!!block}
              title={hol ? hol.nome : block ?? 'Disponível para início'}
              onClick={() => onChange(d)}
              className={cx(
                'h-8 rounded text-xs',
                selected ? 'bg-idg-blue font-bold text-white' : inRange ? 'bg-blue-100 text-blue-900' : '',
                !selected && !block && 'bg-emerald-50 font-semibold text-emerald-800 ring-1 ring-emerald-300 hover:bg-emerald-100',
                !selected && block && !inRange && 'text-slate-300',
                hol && !selected && 'text-red-400 underline decoration-dotted',
              )}
            >
              {Number(d.slice(8))}
            </button>
          );
        })}
      </div>
      <div className="mt-1 text-[10px] text-slate-500">Verde: dias liberados (seg/ter sem feriado nos 2 dias seguintes).</div>
    </div>
  );
}

export default function VacationForm({ request, collaboratorId, onClose }: { request?: VacationRequest; collaboratorId: string; onClose: () => void }) {
  const { user } = useSession();
  const { busy, run } = useAction();
  const [modalidade, setModalidade] = useState<VacationModality>(request?.modalidade ?? '30');
  const [starts, setStarts] = useState<(string | undefined)[]>(request?.periodos.map((p) => p.inicio) ?? []);
  const [chamadoRH, setChamado] = useState(request?.chamadoRH ?? '');
  const [observacao, setObs] = useState(request?.observacao ?? '');
  const periodos = useMemo(() => buildPeriods(modalidade, starts), [modalidade, starts]);
  const findings = useMemo(() => (periodos.length ? validatePeriods(modalidade, periodos, todayISO()) : []), [modalidade, periodos]);
  const conflicts = useMemo(() => (periodos.length ? analyzeConflicts(collaboratorId, periodos, request?.id) : undefined), [collaboratorId, periodos, request?.id]);
  const nPer = MODALITY_DAYS[modalidade].length;
  const erros = findings.filter((f) => f.severity === 'erro');
  const willReset = !!request && user.role !== 'coordenador';

  const save = () =>
    run(async () => {
      await submitVacation({ id: request?.id, collaboratorId, modalidade, starts: starts.slice(0, nPer), chamadoRH, observacao }, user);
      onClose();
    }, request ? 'Solicitação alterada e enviada para aprovação.' : 'Solicitação de férias enviada para aprovação.');

  return (
    <Modal
      open
      size="xl"
      onClose={onClose}
      title={`${request ? 'Alterar' : 'Solicitar'} férias · ${collaboratorName(collaboratorId)}`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={save} loading={busy} disabled={periodos.length < nPer || erros.length > 0}>
            {request ? 'Salvar e reenviar para aprovação' : 'Enviar para aprovação'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {willReset && (
          <Alert kind="warning" title="Toda alteração retorna para aprovação">
            {request!.status === 'Aprovada'
              ? 'Estas férias já foram aprovadas. Ao salvar qualquer alteração (datas, modalidade ou observação), a solicitação volta para "Pendente" e precisa ser aprovada novamente pelo coordenador. A versão aprovada anterior fica registrada no histórico.'
              : 'Ao salvar, a solicitação volta para "Pendente" na fila do coordenador.'}
          </Alert>
        )}
        {request?.status === 'Ajuste Solicitado' && request.parecer && (
          <Alert kind="info" title="Ajuste solicitado pelo coordenador">
            {request.parecer}
          </Alert>
        )}
        <Field label="Modalidade">
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {MODALITIES.map((m) => (
              <label key={m} className={cx('flex cursor-pointer items-start gap-2 rounded-lg border p-2 text-sm', modalidade === m ? 'border-idg-blue bg-blue-50' : 'border-slate-200 hover:bg-slate-50')}>
                <input
                  type="radio"
                  className="mt-0.5"
                  checked={modalidade === m}
                  onChange={() => {
                    setModalidade(m);
                    setStarts((s) => s.slice(0, MODALITY_DAYS[m].length));
                  }}
                />
                <span>{MODALITY_LABEL[m]}</span>
              </label>
            ))}
          </div>
        </Field>
        <div className="grid gap-4 md:grid-cols-2">
          {MODALITY_DAYS[modalidade].map((dias, i) => {
            const p = periodos[i];
            return (
              <div key={i} className="space-y-2">
                <div className="text-sm font-semibold text-slate-700">
                  {nPer > 1 ? `${i + 1}º período` : 'Período'} · {dias} dias{modalidade === '20+10abono' && ' de descanso (+10 dias de abono pecuniário)'}
                </div>
                <StartDatePicker
                  value={starts[i]}
                  min={i > 0 && periodos[i - 1] ? addDays(periodos[i - 1].fim, 1) : todayISO()}
                  highlight={periodos}
                  onChange={(d) => setStarts((s) => {
                    const n = [...s];
                    n[i] = d;
                    return n;
                  })}
                />
                <div className="text-sm">
                  {p ? (
                    <>
                      Início <b>{fmtBR(p.inicio)}</b> ({['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'][weekday(p.inicio)]}) · Fim <b>{fmtBR(p.fim)}</b> · Retorno <b>{fmtBR(addDays(p.fim, 1))}</b>
                    </>
                  ) : (
                    <span className="text-slate-400">Escolha o dia de início no calendário.</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
        {findings.map((f, i) => (
          <Alert key={i} kind={f.severity === 'erro' ? 'error' : f.severity === 'alerta' ? 'warning' : 'info'}>
            {f.message}
          </Alert>
        ))}
        {conflicts && conflicts.nivel !== 'ok' && (
          <Alert kind={conflicts.nivel === 'critico' ? 'error' : 'warning'} title={conflicts.nivel === 'critico' ? 'Conflito crítico com a equipe (vermelho)' : 'Alerta de sobreposição (amarelo)'}>
            {describeConflicts(conflicts).join('\n')}
            {conflicts.nivel === 'critico' && user.role !== 'coordenador' && '\nAjuste as datas para enviar a solicitação.'}
          </Alert>
        )}
        {conflicts && conflicts.nivel === 'ok' && periodos.length === nPer && <Alert kind="success">Sem conflitos com a escala da equipe.</Alert>}
        <div className="grid gap-3 md:grid-cols-2">
          <Field label="Nº do chamado RH" hint="Pode ser informado depois. Alterar só o chamado não reinicia a aprovação.">
            <input className="input" value={chamadoRH} onChange={(e) => setChamado(e.target.value)} placeholder="Ex.: RITM0012345" />
          </Field>
          <Field label="Observação">
            <input className="input" value={observacao} onChange={(e) => setObs(e.target.value)} />
          </Field>
        </div>
        {request && (
          <div className="text-xs text-slate-500">
            Revisão atual: <Badge>{request.revisao}</Badge>
          </div>
        )}
      </div>
    </Modal>
  );
}
