import { useMemo, useState } from 'react';
import { AlertTriangle, Calculator, Save } from 'lucide-react';
import { useDb, useSession } from '../lib/store';
import { can } from '../lib/auth';
import { fmtBR, networkDays } from '../lib/dates';
import { activityWarnings, computeEstHours, computeRealHours, detectDateChanges, saveActivity, validateActivity } from '../services/activities';
import { ACTIVITY_STATUSES, DATE_FIELD_LABEL, PLANT_AREAS, type Activity } from '../types';
import { Alert, Button, Field, Modal, useAction } from './ui';

export default function ActivityForm({ initial, isNew, onClose }: { initial: Activity; isNew: boolean; onClose: () => void }) {
  const db = useDb();
  const { user } = useSession();
  const [a, setA] = useState<Activity>(initial);
  const [justOpen, setJustOpen] = useState(false);
  const [just, setJust] = useState('');
  const { busy, run } = useAction();
  const readOnly = !can.editActivity(user, a.collaboratorId) && !isNew;
  const set = <K extends keyof Activity>(k: K, v: Activity[K]) => setA((x) => ({ ...x, [k]: v }));
  const before = isNew ? undefined : db.all('activities').find((x) => x.id === initial.id);
  const changes = detectDateChanges(before, a);
  const errors = validateActivity(a, db.all('activities'));
  const warnings = activityWarnings(a);
  const est = computeEstHours(a);
  const real = computeRealHours(a);
  const ccs = db.all('costCenters');
  const cc = ccs.find((c) => c.codigo === a.centroCusto);
  const collabs = user.role === 'coordenador' ? db.all('collaborators') : db.all('collaborators').filter((c) => c.id === user.collaboratorId);
  const solicitantes = useMemo(() => [...new Set(db.all('activities').map((x) => x.solicitante).filter(Boolean))].sort(), [db]);
  const areas = useMemo(() => [...new Set([...PLANT_AREAS, ...db.all('activities').map((x) => x.area).filter(Boolean)])].sort(), [db]);

  async function save() {
    if (changes.length && !justOpen) {
      setJustOpen(true);
      return;
    }
    const r = await run(() => saveActivity(a, user, just), isNew ? 'Atividade cadastrada.' : changes.length ? 'Atividade salva e alteração de datas registrada na auditoria.' : 'Atividade atualizada.');
    if (r) onClose();
  }

  const dateInput = (k: 'dataSolicitacao' | 'estInicio' | 'estTermino' | 'inicioReal' | 'terminoReal') => (
    <input type="date" className="input" disabled={readOnly} value={a[k] ?? ''} onChange={(e) => set(k, e.target.value || undefined)} />
  );

  return (
    <>
      <Modal
        open
        onClose={onClose}
        size="xl"
        title={isNew ? 'Nova atividade / serviço' : `${readOnly ? 'Detalhes' : 'Editar'} · ${initial.codigo}`}
        footer={
          <>
            <Button variant="secondary" onClick={onClose}>
              {readOnly ? 'Fechar' : 'Cancelar'}
            </Button>
            {!readOnly && (
              <Button onClick={save} loading={busy} disabled={errors.length > 0} icon={<Save className="h-4 w-4" />}>
                Salvar
              </Button>
            )}
          </>
        }
      >
        <div className="space-y-5">
          <fieldset className="grid gap-3 rounded-lg border border-slate-200 p-3 md:grid-cols-4">
            <legend className="px-1 text-xs font-semibold uppercase text-slate-500">Colaborador</legend>
            <Field label="Colaborador" className="md:col-span-2">
              <select className="input" disabled={readOnly || user.role !== 'coordenador'} value={a.collaboratorId} onChange={(e) => set('collaboratorId', e.target.value)}>
                <option value="">Selecione…</option>
                {collabs.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nome}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Matrícula">
              <input className="input" disabled value={db.all('collaborators').find((c) => c.id === a.collaboratorId)?.matricula ?? ''} />
            </Field>
            <Field label="Função">
              <input className="input" disabled value={db.all('collaborators').find((c) => c.id === a.collaboratorId)?.funcao ?? ''} />
            </Field>
          </fieldset>

          <div className="grid gap-3 md:grid-cols-4">
            <Field label="ID da atividade">
              <input className="input font-mono uppercase" disabled={readOnly} value={a.codigo} onChange={(e) => set('codigo', e.target.value.toUpperCase())} placeholder="T2IDEA0017524" />
            </Field>
            <Field label="Solicitante">
              <input className="input" list="dl-solic" disabled={readOnly} value={a.solicitante} onChange={(e) => set('solicitante', e.target.value)} placeholder="Felipe S." />
              <datalist id="dl-solic">{solicitantes.map((s) => <option key={s} value={s} />)}</datalist>
            </Field>
            <Field label="Área usina">
              <input className="input" list="dl-area" disabled={readOnly} value={a.area} onChange={(e) => set('area', e.target.value)} placeholder="Alto Forno" />
              <datalist id="dl-area">{areas.map((s) => <option key={s} value={s} />)}</datalist>
            </Field>
            <Field label="Data solicitação">{dateInput('dataSolicitacao')}</Field>
            <Field label="Descrição da atividade" className="md:col-span-4">
              <textarea className="input min-h-[60px]" disabled={readOnly} value={a.descricao} onChange={(e) => set('descricao', e.target.value)} />
            </Field>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <fieldset className="space-y-3 rounded-lg border border-amber-200 bg-amber-50/40 p-3">
              <legend className="px-1 text-xs font-semibold uppercase text-amber-700">Estimativa</legend>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Estimativa de início">{dateInput('estInicio')}</Field>
                <Field label="Estimativa de término">{dateInput('estTermino')}</Field>
              </div>
              <HoursBlock
                readOnly={readOnly}
                mode={a.estModo}
                setMode={(m) => set('estModo', m)}
                perDay={a.horasDia}
                setPerDay={(v) => set('horasDia', v)}
                manual={a.estHoras}
                setManual={(v) => set('estHoras', v)}
                days={networkDays(a.estInicio, a.estTermino)}
                total={est}
                label="Estimativa de horas"
              />
            </fieldset>
            <fieldset className="space-y-3 rounded-lg border border-emerald-200 bg-emerald-50/40 p-3">
              <legend className="px-1 text-xs font-semibold uppercase text-emerald-700">Realizado</legend>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Início real">{dateInput('inicioReal')}</Field>
                <Field label="Término real">{dateInput('terminoReal')}</Field>
              </div>
              <HoursBlock
                readOnly={readOnly}
                mode={a.realModo}
                setMode={(m) => set('realModo', m)}
                perDay={a.horasDiaReal}
                setPerDay={(v) => set('horasDiaReal', v)}
                manual={a.horasRealizadas}
                setManual={(v) => set('horasRealizadas', v)}
                days={networkDays(a.inicioReal, a.terminoReal)}
                total={real}
                label="Horas realizadas"
              />
            </fieldset>
          </div>

          <div className="grid gap-3 md:grid-cols-4">
            <Field label="Número do documento AMP (um por linha)" className="md:col-span-2">
              <textarea
                className="input min-h-[84px] font-mono text-xs"
                disabled={readOnly}
                value={a.documentosAMP}
                onChange={(e) => set('documentosAMP', e.target.value.toUpperCase())}
                placeholder={'AMP-1-AD-596-EM130-300001P\nAMP-1-AD-596-EP144-300011P'}
              />
            </Field>
            <div className="space-y-3">
              <Field label="Centro de custo" hint={cc ? `${cc.denominacao} · resp. ${cc.responsavel}` : a.centroCusto ? 'Fora da base de centros de custo' : 'Digite para buscar (SP00-…)'}>
                <input className="input font-mono uppercase" list="dl-cc" disabled={readOnly} value={a.centroCusto} onChange={(e) => set('centroCusto', e.target.value.toUpperCase().trim())} />
                <datalist id="dl-cc">
                  {ccs.map((c) => (
                    <option key={c.codigo} value={c.codigo}>
                      {c.denominacao} · {c.responsavel}
                    </option>
                  ))}
                </datalist>
              </Field>
              <Field label="Status">
                <select className="input" disabled={readOnly} value={a.status} onChange={(e) => set('status', e.target.value as Activity['status'])}>
                  {ACTIVITY_STATUSES.map((s) => (
                    <option key={s}>{s}</option>
                  ))}
                </select>
              </Field>
            </div>
            <Field label="Observação">
              <textarea className="input min-h-[84px]" disabled={readOnly} value={a.observacao} onChange={(e) => set('observacao', e.target.value)} placeholder="SEP: 0343/2025" />
            </Field>
          </div>

          {errors.length > 0 && <Alert kind="error" title="Corrija antes de salvar">{errors.join('\n')}</Alert>}
          {warnings.length > 0 && <Alert kind="warning">{warnings.join('\n')}</Alert>}
          {changes.length > 0 && (
            <Alert kind="warning" title="Alteração de datas de execução — justificativa obrigatória ao salvar">
              {changes.map((c) => `${DATE_FIELD_LABEL[c.campo]}: ${fmtBR(c.anterior) || '(vazio)'} → ${fmtBR(c.nova) || '(vazio)'}`).join('\n')}
            </Alert>
          )}
        </div>
      </Modal>

      <Modal
        open={justOpen}
        onClose={() => setJustOpen(false)}
        size="md"
        title={
          <span className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-500" /> Justificativa obrigatória
          </span>
        }
        footer={
          <>
            <Button variant="secondary" onClick={() => setJustOpen(false)}>
              Voltar
            </Button>
            <Button onClick={save} loading={busy} disabled={just.trim().length < 10}>
              Confirmar e salvar
            </Button>
          </>
        }
      >
        <p className="mb-2 text-sm text-slate-600">As seguintes datas foram alteradas e serão registradas no histórico de auditoria com seu usuário, data e hora:</p>
        <ul className="mb-3 list-disc pl-5 text-sm">
          {changes.map((c) => (
            <li key={c.campo}>
              <b>{DATE_FIELD_LABEL[c.campo]}</b>: {fmtBR(c.anterior) || '(vazio)'} → {fmtBR(c.nova) || '(vazio)'}
            </li>
          ))}
        </ul>
        <Field label="Justificativa (mínimo 10 caracteres)">
          <textarea className="input min-h-[90px]" autoFocus value={just} onChange={(e) => setJust(e.target.value)} placeholder="Ex.: Liberação de área adiada pela operação do Alto Forno." />
        </Field>
      </Modal>
    </>
  );
}

function HoursBlock(p: {
  readOnly: boolean;
  mode: 'auto' | 'manual';
  setMode: (m: 'auto' | 'manual') => void;
  perDay?: number;
  setPerDay: (v?: number) => void;
  manual?: number;
  setManual: (v?: number) => void;
  days: number;
  total?: number;
  label: string;
}) {
  const num = (v: string) => (v === '' ? undefined : Number(v.replace(',', '.')));
  return (
    <div className="grid grid-cols-3 items-end gap-3">
      <Field label="Cálculo">
        <select className="input" disabled={p.readOnly} value={p.mode} onChange={(e) => p.setMode(e.target.value as 'auto' | 'manual')}>
          <option value="auto">Dias úteis × h/dia</option>
          <option value="manual">Manual</option>
        </select>
      </Field>
      {p.mode === 'auto' ? (
        <Field label="Horas por dia">
          <input className="input" type="number" min={0} max={24} step={0.5} disabled={p.readOnly} value={p.perDay ?? ''} onChange={(e) => p.setPerDay(num(e.target.value))} />
        </Field>
      ) : (
        <Field label={p.label}>
          <input className="input" type="number" min={0} step={0.1} disabled={p.readOnly} value={p.manual ?? ''} onChange={(e) => p.setManual(num(e.target.value))} />
        </Field>
      )}
      <div className="rounded-md bg-white px-3 py-1.5 text-sm ring-1 ring-slate-200">
        <div className="flex items-center gap-1 text-xs text-slate-500">
          <Calculator className="h-3 w-3" /> {p.days} dias úteis
        </div>
        <div className="font-semibold">{p.total !== undefined ? `${p.total.toFixed(1)} h` : '—'}</div>
      </div>
    </div>
  );
}
