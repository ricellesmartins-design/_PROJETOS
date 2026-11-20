import { useMemo, useState } from 'react';
import { Download, Edit3, Eye, FileSpreadsheet, History, Plus, Search, Trash2 } from 'lucide-react';
import { useDb, useRoute, useSession, collaboratorName } from '../lib/store';
import { can } from '../lib/auth';
import { fmtBR, fmtDateTimeBR, monthLabel, todayISO } from '../lib/dates';
import { activityMonths, activitiesInMonth, computeEstHours, computeRealHours, deleteActivity, emptyActivity, isClosed, isLate, isRunningToday } from '../services/activities';
import { visibleActivities, visibleCollaborators } from '../services/views';
import { exportActivities, planSheets } from '../excel/exportActivities';
import { ACTIVITY_STATUSES, DATE_FIELD_LABEL, type Activity } from '../types';
import ActivityForm from '../components/ActivityForm';
import { Badge, Button, Card, Empty, Field, Modal, StatusBadge, useAction } from '../components/ui';

export default function Activities() {
  const db = useDb();
  const { user } = useSession();
  const [, query] = useRoute();
  const today = todayISO();
  const [f, setF] = useState({
    q: '',
    collab: '',
    status: '',
    area: '',
    cc: '',
    solicitante: '',
    month: '',
    situacao: query.get('filtro') ?? '',
  });
  const [editing, setEditing] = useState<{ a: Activity; isNew: boolean }>();
  const [history, setHistory] = useState<Activity>();
  const [exportOpen, setExportOpen] = useState(false);
  const { run } = useAction();

  const all = visibleActivities(user);
  const collabs = visibleCollaborators(user);
  const months = useMemo(() => activityMonths(all, today).reverse(), [all, today]);
  const areas = [...new Set(all.map((a) => a.area).filter(Boolean))].sort();
  const solicitantes = [...new Set(all.map((a) => a.solicitante).filter(Boolean))].sort();
  const ccsUsed = [...new Set(all.map((a) => a.centroCusto).filter(Boolean))].sort();
  const logs = db.all('dateChangeLogs');

  let list = f.month ? activitiesInMonth(all, f.month, today) : all;
  list = list.filter((a) => {
    if (f.collab && a.collaboratorId !== f.collab) return false;
    if (f.status && a.status !== f.status) return false;
    if (f.area && a.area !== f.area) return false;
    if (f.cc && a.centroCusto !== f.cc) return false;
    if (f.solicitante && a.solicitante !== f.solicitante) return false;
    if (f.situacao === 'atrasadas' && !(isLate(a, today) && !isClosed(a))) return false;
    if (f.situacao === 'hoje' && !isRunningToday(a, today)) return false;
    if (f.situacao === 'abertas' && isClosed(a)) return false;
    if (f.q) {
      const q = f.q.toLowerCase();
      if (![a.codigo, a.descricao, a.solicitante, a.area, a.documentosAMP, a.centroCusto, a.observacao, collaboratorName(a.collaboratorId)].some((x) => x.toLowerCase().includes(q))) return false;
    }
    return true;
  });

  const totEst = list.reduce((s, a) => s + (computeEstHours(a) ?? 0), 0);
  const totReal = list.reduce((s, a) => s + (computeRealHours(a) ?? 0), 0);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF((x) => ({ ...x, [k]: e.target.value }));

  return (
    <div className="space-y-4">
      <Card bodyClass="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-8">
        <Field label="Buscar" className="sm:col-span-2">
          <div className="relative">
            <Search className="absolute left-2 top-2 h-4 w-4 text-slate-400" />
            <input className="input pl-8" value={f.q} onChange={set('q')} placeholder="ID, descrição, documento, SEP…" />
          </div>
        </Field>
        {user.role !== 'colaborador' && (
          <Field label="Colaborador">
            <select className="input" value={f.collab} onChange={set('collab')}>
              <option value="">Todos</option>
              {collabs.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome}
                </option>
              ))}
            </select>
          </Field>
        )}
        <Field label="Status">
          <select className="input" value={f.status} onChange={set('status')}>
            <option value="">Todos</option>
            {ACTIVITY_STATUSES.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </Field>
        <Field label="Situação">
          <select className="input" value={f.situacao} onChange={set('situacao')}>
            <option value="">Todas</option>
            <option value="abertas">Em aberto</option>
            <option value="hoje">Em execução hoje</option>
            <option value="atrasadas">Atrasadas</option>
          </select>
        </Field>
        <Field label="Mês">
          <select className="input" value={f.month} onChange={set('month')}>
            <option value="">Todos</option>
            {months.map((m) => (
              <option key={m} value={m}>
                {monthLabel(m)}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Área usina">
          <select className="input" value={f.area} onChange={set('area')}>
            <option value="">Todas</option>
            {areas.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </Field>
        <Field label="Solicitante">
          <select className="input" value={f.solicitante} onChange={set('solicitante')}>
            <option value="">Todos</option>
            {solicitantes.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </Field>
        <Field label="Centro de custo">
          <select className="input" value={f.cc} onChange={set('cc')}>
            <option value="">Todos</option>
            {ccsUsed.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </Field>
      </Card>

      <Card
        title={
          <span>
            {list.length} atividade(s) · <span className="font-normal text-slate-500">estimado {totEst.toFixed(1)} h · realizado {totReal.toFixed(1)} h</span>
          </span>
        }
        bodyClass="p-0"
        actions={
          <>
            <Button variant="secondary" size="sm" icon={<FileSpreadsheet className="h-4 w-4" />} onClick={() => setExportOpen(true)}>
              Exportar Relatório (SE-PL-0510)
            </Button>
            {can.createActivity(user) && (
              <Button
                size="sm"
                icon={<Plus className="h-4 w-4" />}
                onClick={() => setEditing({ a: emptyActivity(user.role === 'colaborador' ? user.collaboratorId! : f.collab || collabs[0]?.id || '', user), isNew: true })}
              >
                Nova atividade
              </Button>
            )}
          </>
        }
      >
        {list.length === 0 ? (
          <div className="p-4">
            <Empty>Nenhuma atividade encontrada com os filtros atuais.</Empty>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1200px]">
              <thead>
                <tr>
                  <th className="th">ID</th>
                  <th className="th">Descrição</th>
                  {user.role !== 'colaborador' && <th className="th">Colaborador</th>}
                  <th className="th">Solicitante / Área</th>
                  <th className="th">Estimativa</th>
                  <th className="th">Real</th>
                  <th className="th text-right">Horas est./real</th>
                  <th className="th">CC</th>
                  <th className="th">Status</th>
                  <th className="th"></th>
                </tr>
              </thead>
              <tbody>
                {list.map((a) => {
                  const late = isLate(a, today);
                  const nLogs = logs.filter((l) => l.activityId === a.id).length;
                  const editable = can.editActivity(user, a.collaboratorId);
                  return (
                    <tr key={a.id} className="hover:bg-slate-50">
                      <td className="td font-mono text-xs">{a.codigo}</td>
                      <td className="td max-w-md">
                        <div className="line-clamp-2">{a.descricao}</div>
                        {a.observacao && <div className="text-xs text-slate-500">{a.observacao}</div>}
                        {a.documentosAMP && <div className="text-xs text-slate-400">{a.documentosAMP.split('\n').length} documento(s) AMP</div>}
                      </td>
                      {user.role !== 'colaborador' && <td className="td text-xs">{collaboratorName(a.collaboratorId)}</td>}
                      <td className="td text-xs">
                        {a.solicitante}
                        <div className="text-slate-500">{a.area}</div>
                      </td>
                      <td className="td whitespace-nowrap text-xs">
                        {fmtBR(a.estInicio) || '—'} → <span className={late && !isClosed(a) ? 'font-bold text-red-600' : ''}>{fmtBR(a.estTermino) || '—'}</span>
                      </td>
                      <td className="td whitespace-nowrap text-xs">
                        {fmtBR(a.inicioReal) || '—'} → {fmtBR(a.terminoReal) || '—'}
                      </td>
                      <td className="td whitespace-nowrap text-right text-xs">
                        {computeEstHours(a)?.toFixed(1) ?? '—'} / {computeRealHours(a)?.toFixed(1) ?? '—'}
                      </td>
                      <td className="td font-mono text-xs">{a.centroCusto}</td>
                      <td className="td">
                        <div className="flex flex-col items-start gap-1">
                          <StatusBadge status={a.status} />
                          {late && <Badge color="red">{isClosed(a) ? 'entregue com atraso' : 'atrasada'}</Badge>}
                          {nLogs > 0 && <Badge color="purple">{nLogs} reprogramação(ões)</Badge>}
                        </div>
                      </td>
                      <td className="td whitespace-nowrap text-right">
                        <button className="rounded p-1.5 text-slate-500 hover:bg-slate-100" title="Histórico de alterações de datas" onClick={() => setHistory(a)}>
                          <History className="h-4 w-4" />
                        </button>
                        <button className="rounded p-1.5 text-slate-500 hover:bg-slate-100" title={editable ? 'Editar' : 'Ver'} onClick={() => setEditing({ a, isNew: false })}>
                          {editable ? <Edit3 className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </button>
                        {editable && (
                          <button
                            className="rounded p-1.5 text-red-500 hover:bg-red-50"
                            title="Excluir"
                            onClick={() => confirm(`Excluir a atividade ${a.codigo}?`) && run(() => deleteActivity(a.id), 'Atividade excluída.')}
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {editing && <ActivityForm key={editing.a.id} initial={editing.a} isNew={editing.isNew} onClose={() => setEditing(undefined)} />}
      {history && <HistoryModal a={history} onClose={() => setHistory(undefined)} />}
      {exportOpen && <ExportModal onClose={() => setExportOpen(false)} defaultCollab={f.collab} defaultMonth={f.month} />}
    </div>
  );
}

function HistoryModal({ a, onClose }: { a: Activity; onClose: () => void }) {
  const db = useDb();
  const logs = db.all('dateChangeLogs').filter((l) => l.activityId === a.id);
  return (
    <Modal open onClose={onClose} title={`Histórico de alterações de datas · ${a.codigo}`}>
      {logs.length === 0 ? (
        <Empty>Nenhuma alteração de data registrada.</Empty>
      ) : (
        <table className="w-full">
          <thead>
            <tr>
              <th className="th">Data/hora</th>
              <th className="th">Usuário</th>
              <th className="th">Campo</th>
              <th className="th">Anterior → Nova</th>
              <th className="th">Justificativa</th>
            </tr>
          </thead>
          <tbody>
            {logs.map((l) => (
              <tr key={l.id}>
                <td className="td whitespace-nowrap text-xs">{fmtDateTimeBR(l.dataHora)}</td>
                <td className="td text-xs">
                  {l.usuarioNome}
                  <div className="text-slate-400">{l.usuarioEmail}</div>
                </td>
                <td className="td text-xs">{DATE_FIELD_LABEL[l.campo]}</td>
                <td className="td whitespace-nowrap text-xs">
                  {fmtBR(l.anterior) || '(vazio)'} → <b>{fmtBR(l.nova) || '(vazio)'}</b>
                </td>
                <td className="td text-xs">{l.justificativa}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Modal>
  );
}

function ExportModal({ onClose, defaultCollab, defaultMonth }: { onClose: () => void; defaultCollab: string; defaultMonth: string }) {
  const { user } = useSession();
  const today = todayISO();
  const collabs = visibleCollaborators(user);
  const all = visibleActivities(user);
  const months = activityMonths(all, today).reverse();
  const [sel, setSel] = useState<string[]>(defaultCollab ? [defaultCollab] : collabs.map((c) => c.id));
  const [mSel, setMSel] = useState<string[]>(defaultMonth ? [defaultMonth] : months.slice(0, 1));
  const [byMonth, setByMonth] = useState(true);
  const { busy, run } = useAction();
  const sheets = planSheets(
    collabs.filter((c) => sel.includes(c.id)),
    all,
    byMonth ? mSel : [],
  );
  const toggle = (arr: string[], v: string) => (arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);
  return (
    <Modal
      open
      onClose={onClose}
      title="Exportar Relatório de Atividades (SE-PL-0510-CD001-R0)"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            icon={<Download className="h-4 w-4" />}
            loading={busy}
            disabled={!sheets.length}
            onClick={() =>
              run(async () => {
                const hint = sel.length === 1 ? collabs.find((c) => c.id === sel[0])!.nome : 'EQUIPE_AMP';
                await exportActivities(sheets, `${hint}${byMonth && mSel.length === 1 ? '_' + mSel[0] : ''}`);
                onClose();
              }, 'Relatório gerado.')
            }
          >
            Gerar Excel ({sheets.length} aba{sheets.length === 1 ? '' : 's'})
          </Button>
        </>
      }
    >
      <p className="mb-3 text-sm text-slate-600">
        Gera o arquivo no layout oficial (cabeçalho mesclado, logo IDG em N1:O3, colunas A–O, total <code>=SUM(K5:Kn)</code>), com uma aba por colaborador e mês.
      </p>
      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <div className="label">Colaboradores</div>
          <div className="max-h-64 space-y-1 overflow-y-auto rounded border p-2">
            {collabs.map((c) => (
              <label key={c.id} className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={sel.includes(c.id)} onChange={() => setSel((s) => toggle(s, c.id))} /> {c.nome}
              </label>
            ))}
          </div>
        </div>
        <div>
          <label className="mb-2 flex items-center gap-2 text-sm">
            <input type="checkbox" checked={byMonth} onChange={(e) => setByMonth(e.target.checked)} /> Separar abas por mês
          </label>
          {byMonth && (
            <div className="max-h-56 space-y-1 overflow-y-auto rounded border p-2">
              {months.map((m) => (
                <label key={m} className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={mSel.includes(m)} onChange={() => setMSel((s) => toggle(s, m))} /> {monthLabel(m)}
                </label>
              ))}
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}
