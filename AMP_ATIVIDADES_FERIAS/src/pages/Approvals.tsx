import { useState } from 'react';
import { CheckCircle2, Eye, FileSpreadsheet, RotateCcw, Ticket, XCircle } from 'lucide-react';
import { useDb, useSession, collaboratorName } from '../lib/store';
import { diffDays, fmtBR, fmtDateTimeBR, todayISO } from '../lib/dates';
import { analyzeConflicts, decide, decideCancellation, describeConflicts, updateHrTicket, type Decision } from '../services/vacations';
import { exportVacationForm } from '../excel/exportVacation';
import { MODALITY_LABEL, type HrTicketStatus, type VacationRequest } from '../types';
import VacationDetail, { PeriodList } from '../components/VacationDetail';
import { Alert, Badge, Button, Card, Empty, Field, Modal, StatusBadge, useAction } from '../components/ui';

const TICKET_STATUSES: HrTicketStatus[] = ['Não aberto', 'Aberto', 'Em análise', 'Concluído'];

export default function Approvals() {
  const db = useDb();
  const { user } = useSession();
  const { busy, run } = useAction();
  const [act, setAct] = useState<{ v: VacationRequest; decision: Decision }>();
  const [cancelAct, setCancelAct] = useState<{ v: VacationRequest; aprovar: boolean }>();
  const [ticket, setTicket] = useState<VacationRequest>();
  const [detail, setDetail] = useState<VacationRequest>();
  const [parecer, setParecer] = useState('');
  const [justConf, setJustConf] = useState('');
  const [tNum, setTNum] = useState('');
  const [tStatus, setTStatus] = useState<HrTicketStatus>('Não aberto');

  const all = db.all('vacations');
  const queue = all.filter((v) => v.status === 'Pendente').sort((a, b) => (a.periodos[0]?.inicio ?? '').localeCompare(b.periodos[0]?.inicio ?? ''));
  const cancelQueue = all.filter((v) => v.status === 'Cancelamento Solicitado');
  const waiting = all.filter((v) => v.status === 'Ajuste Solicitado');
  const approved = all
    .filter((v) => v.status === 'Aprovada')
    .sort((a, b) => (a.periodos[0]?.inicio ?? '').localeCompare(b.periodos[0]?.inicio ?? ''));

  const openDecision = (v: VacationRequest, decision: Decision) => {
    setParecer('');
    setJustConf('');
    setAct({ v, decision });
  };

  const exportForm = (v: VacationRequest) =>
    run(async () => {
      const c = db.all('collaborators').find((x) => x.id === v.collaboratorId);
      if (!c) throw new Error('Colaborador não encontrado.');
      await exportVacationForm(v, c);
    }, 'Formulário ADM-PF158 gerado.');

  const conflictBadge = (v: VacationRequest) => {
    const c = analyzeConflicts(v.collaboratorId, v.periodos, v.id);
    if (c.nivel === 'ok') return <Badge color="green">Sem conflito</Badge>;
    return (
      <span title={describeConflicts(c).join('\n')}>
        <Badge color={c.nivel === 'critico' ? 'red' : 'yellow'}>{c.nivel === 'critico' ? 'Conflito crítico' : 'Alerta'}</Badge>
      </span>
    );
  };

  return (
    <div className="space-y-5">
      <Card title={`Fila de aprovação (${queue.length})`} bodyClass="p-0">
        {!queue.length ? (
          <div className="p-4">
            <Empty>Nenhuma solicitação pendente.</Empty>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr>
                  <th className="th">Colaborador</th>
                  <th className="th">Modalidade / Períodos</th>
                  <th className="th">Antecedência</th>
                  <th className="th">Escala</th>
                  <th className="th">Revisão</th>
                  <th className="th text-right">Decisão</th>
                </tr>
              </thead>
              <tbody>
                {queue.map((v) => {
                  const adv = v.periodos[0] ? diffDays(todayISO(), v.periodos[0].inicio) : 0;
                  return (
                    <tr key={v.id} className="align-top hover:bg-slate-50">
                      <td className="td font-medium">
                        {collaboratorName(v.collaboratorId)}
                        <div className="text-xs font-normal text-slate-500">solicitada em {fmtBR(v.dataSolicitacao)}</div>
                      </td>
                      <td className="td">
                        <div className="text-xs text-slate-500">{MODALITY_LABEL[v.modalidade]}</div>
                        <PeriodList periodos={v.periodos} />
                      </td>
                      <td className="td">
                        <Badge color={adv < 40 ? 'red' : 'green'}>{adv} dias</Badge>
                      </td>
                      <td className="td">{conflictBadge(v)}</td>
                      <td className="td">
                        {v.revisao > 1 ? <Badge color="purple">Alterada (rev. {v.revisao})</Badge> : <Badge>Nova</Badge>}
                        {v.versaoAnteriorAprovada && <div className="mt-1 text-xs text-slate-500">antes aprovada: {v.versaoAnteriorAprovada.periodos.map((p) => fmtBR(p.inicio)).join(' / ')}</div>}
                      </td>
                      <td className="td">
                        <div className="flex flex-wrap justify-end gap-1">
                          <Button size="sm" variant="ghost" icon={<Eye className="h-4 w-4" />} onClick={() => setDetail(v)} title="Detalhes" />
                          <Button size="sm" variant="success" icon={<CheckCircle2 className="h-4 w-4" />} onClick={() => openDecision(v, 'Aprovar')}>
                            Aprovar
                          </Button>
                          <Button size="sm" variant="warning" icon={<RotateCcw className="h-4 w-4" />} onClick={() => openDecision(v, 'Solicitar Ajuste')}>
                            Ajuste
                          </Button>
                          <Button size="sm" variant="danger" icon={<XCircle className="h-4 w-4" />} onClick={() => openDecision(v, 'Reprovar')}>
                            Reprovar
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {cancelQueue.length > 0 && (
        <Card title={`Pedidos de cancelamento (${cancelQueue.length})`} bodyClass="p-0">
          <table className="w-full">
            <tbody>
              {cancelQueue.map((v) => {
                const last = [...v.historico].reverse().find((h) => /Cancelamento solicitado/.test(h.acao));
                return (
                  <tr key={v.id}>
                    <td className="td font-medium">{collaboratorName(v.collaboratorId)}</td>
                    <td className="td">
                      <PeriodList periodos={v.periodos} />
                    </td>
                    <td className="td text-xs">{last?.texto ?? '—'}</td>
                    <td className="td">
                      <div className="flex justify-end gap-1">
                        <Button size="sm" variant="danger" onClick={() => (setParecer(''), setCancelAct({ v, aprovar: true }))}>
                          Aprovar cancelamento
                        </Button>
                        <Button size="sm" variant="secondary" onClick={() => (setParecer(''), setCancelAct({ v, aprovar: false }))}>
                          Manter férias
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      )}

      {waiting.length > 0 && (
        <Card title={`Aguardando ajuste do colaborador (${waiting.length})`} bodyClass="p-0">
          <table className="w-full">
            <tbody>
              {waiting.map((v) => (
                <tr key={v.id}>
                  <td className="td font-medium">{collaboratorName(v.collaboratorId)}</td>
                  <td className="td">
                    <PeriodList periodos={v.periodos} />
                  </td>
                  <td className="td text-xs text-orange-700">{v.parecer}</td>
                  <td className="td text-right">
                    <Button size="sm" variant="ghost" icon={<Eye className="h-4 w-4" />} onClick={() => setDetail(v)} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      <Card title="Férias aprovadas · chamados RH e formulários" bodyClass="p-0">
        {!approved.length ? (
          <div className="p-4">
            <Empty>Nenhuma férias aprovada.</Empty>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr>
                  <th className="th">Colaborador</th>
                  <th className="th">Períodos</th>
                  <th className="th">Aprovada por</th>
                  <th className="th">Chamado RH</th>
                  <th className="th text-right">Ações</th>
                </tr>
              </thead>
              <tbody>
                {approved.map((v) => (
                  <tr key={v.id} className="hover:bg-slate-50">
                    <td className="td font-medium">{collaboratorName(v.collaboratorId)}</td>
                    <td className="td">
                      <PeriodList periodos={v.periodos} />
                    </td>
                    <td className="td text-xs">
                      {v.aprovadoPor}
                      <div className="text-slate-500">{fmtDateTimeBR(v.aprovadoEm)}</div>
                    </td>
                    <td className="td">
                      <div>{v.chamadoRH || '—'}</div>
                      <StatusBadge status={v.statusChamadoRH} />
                    </td>
                    <td className="td">
                      <div className="flex justify-end gap-1">
                        <Button
                          size="sm"
                          variant="secondary"
                          icon={<Ticket className="h-4 w-4" />}
                          onClick={() => {
                            setTNum(v.chamadoRH);
                            setTStatus(v.statusChamadoRH);
                            setTicket(v);
                          }}
                        >
                          Chamado
                        </Button>
                        <Button size="sm" variant="secondary" icon={<FileSpreadsheet className="h-4 w-4 text-emerald-600" />} loading={busy} onClick={() => exportForm(v)}>
                          ADM-PF158
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {act && (() => {
        const conf = analyzeConflicts(act.v.collaboratorId, act.v.periodos, act.v.id);
        const needJust = act.decision === 'Aprovar' && conf.nivel === 'critico';
        return (
          <Modal
            open
            size="md"
            onClose={() => setAct(undefined)}
            title={`${act.decision} · ${collaboratorName(act.v.collaboratorId)}`}
            footer={
              <>
                <Button variant="secondary" onClick={() => setAct(undefined)}>
                  Voltar
                </Button>
                <Button
                  variant={act.decision === 'Aprovar' ? 'success' : act.decision === 'Reprovar' ? 'danger' : 'warning'}
                  loading={busy}
                  onClick={() =>
                    run(async () => {
                      await decide(act.v.id, act.decision, parecer, user, justConf);
                      setAct(undefined);
                    }, `Solicitação: ${act.decision.toLowerCase()} registrado.`)
                  }
                >
                  Confirmar
                </Button>
              </>
            }
          >
            <div className="space-y-3 text-sm">
              <div>
                {MODALITY_LABEL[act.v.modalidade]} · {act.v.periodos.map((p) => `${fmtBR(p.inicio)} a ${fmtBR(p.fim)}`).join(' / ')}
              </div>
              {conf.nivel !== 'ok' && (
                <Alert kind={conf.nivel === 'critico' ? 'error' : 'warning'}>{describeConflicts(conf).join('\n')}</Alert>
              )}
              <Field label={act.decision === 'Aprovar' ? 'Parecer (opcional)' : 'Parecer (obrigatório)'}>
                <textarea className="input" rows={3} value={parecer} onChange={(e) => setParecer(e.target.value)} />
              </Field>
              {needJust && (
                <Field label="Justificativa para aprovar com conflito crítico (mín. 10 caracteres)">
                  <textarea className="input" rows={2} value={justConf} onChange={(e) => setJustConf(e.target.value)} />
                </Field>
              )}
            </div>
          </Modal>
        );
      })()}

      {cancelAct && (
        <Modal
          open
          size="md"
          onClose={() => setCancelAct(undefined)}
          title={cancelAct.aprovar ? 'Aprovar cancelamento' : 'Recusar cancelamento (manter férias)'}
          footer={
            <Button
              variant={cancelAct.aprovar ? 'danger' : 'primary'}
              loading={busy}
              onClick={() =>
                run(async () => {
                  await decideCancellation(cancelAct.v.id, cancelAct.aprovar, parecer, user);
                  setCancelAct(undefined);
                }, 'Decisão registrada.')
              }
            >
              Confirmar
            </Button>
          }
        >
          <Field label="Parecer">
            <textarea className="input" rows={3} value={parecer} onChange={(e) => setParecer(e.target.value)} />
          </Field>
        </Modal>
      )}

      {ticket && (
        <Modal
          open
          size="md"
          onClose={() => setTicket(undefined)}
          title={`Chamado RH · ${collaboratorName(ticket.collaboratorId)}`}
          footer={
            <Button
              loading={busy}
              onClick={() =>
                run(async () => {
                  await updateHrTicket(ticket.id, tNum, tStatus, user);
                  setTicket(undefined);
                }, 'Chamado RH atualizado.')
              }
            >
              Salvar
            </Button>
          }
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Número do chamado">
              <input className="input" value={tNum} onChange={(e) => setTNum(e.target.value)} />
            </Field>
            <Field label="Status">
              <select className="input" value={tStatus} onChange={(e) => setTStatus(e.target.value as HrTicketStatus)}>
                {TICKET_STATUSES.map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </Field>
          </div>
        </Modal>
      )}

      {detail && <VacationDetail v={db.all('vacations').find((x) => x.id === detail.id) ?? detail} onClose={() => setDetail(undefined)} />}
    </div>
  );
}
