import { useState } from 'react';
import { Ban, Edit3, Eye, FileSpreadsheet, Plus } from 'lucide-react';
import { useDb, useSession, collaboratorName } from '../lib/store';
import { diffDays, fmtBR, todayISO } from '../lib/dates';
import { canCollaboratorEdit, requestCancellation } from '../services/vacations';
import { visibleCollaborators, visibleVacations } from '../services/views';
import { exportVacationForm } from '../excel/exportVacation';
import { MODALITY_LABEL, type VacationRequest } from '../types';
import VacationForm from '../components/VacationForm';
import VacationDetail, { PeriodList } from '../components/VacationDetail';
import VacationMap from '../components/VacationMap';
import { Alert, Badge, Button, Card, Empty, Field, Modal, StatusBadge, useAction } from '../components/ui';

export default function Vacations() {
  const db = useDb();
  const { user } = useSession();
  const { busy, run } = useAction();
  const [form, setForm] = useState<{ request?: VacationRequest; collaboratorId: string }>();
  const [detail, setDetail] = useState<VacationRequest>();
  const [cancel, setCancel] = useState<VacationRequest>();
  const [motivo, setMotivo] = useState('');
  const [year, setYear] = useState(Number(todayISO().slice(0, 4)) + (Number(todayISO().slice(5, 7)) >= 10 ? 1 : 0));
  const [collabFilter, setCollabFilter] = useState('');
  const isCoord = user.role === 'coordenador';
  const collabs = visibleCollaborators(user);
  const allTeam = db.all('collaborators').filter((c) => c.ativo);

  const mine = visibleVacations(user)
    .filter((v) => (isCoord ? !collabFilter || v.collaboratorId === collabFilter : v.collaboratorId === user.collaboratorId))
    .sort((a, b) => (b.periodos[0]?.inicio ?? '').localeCompare(a.periodos[0]?.inicio ?? ''));

  const newFor = isCoord ? collabFilter || collabs[0]?.id : user.collaboratorId;
  const exportForm = (v: VacationRequest) =>
    run(async () => {
      const c = db.all('collaborators').find((x) => x.id === v.collaboratorId);
      if (!c) throw new Error('Colaborador não encontrado.');
      await exportVacationForm(v, c);
    }, 'Formulário ADM-PF158 gerado.');

  return (
    <div className="space-y-5">
      {!isCoord && !user.collaboratorId && <Alert kind="warning">Seu usuário não está vinculado a um colaborador. Peça ao coordenador para fazer o vínculo em Configurações › Usuários.</Alert>}
      <Card
        title={isCoord ? 'Solicitações de férias' : 'Minhas férias'}
        actions={
          <>
            {isCoord && (
              <select className="input w-56" value={collabFilter} onChange={(e) => setCollabFilter(e.target.value)}>
                <option value="">Todos os colaboradores</option>
                {collabs.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nome}
                  </option>
                ))}
              </select>
            )}
            {newFor && (
              <Button icon={<Plus className="h-4 w-4" />} onClick={() => setForm({ collaboratorId: newFor })}>
                Solicitar férias{isCoord && collabFilter ? '' : isCoord ? ` (${collaboratorName(newFor).split(' ')[0]})` : ''}
              </Button>
            )}
          </>
        }
        bodyClass="p-0"
      >
        {!mine.length ? (
          <div className="p-4">
            <Empty>Nenhuma solicitação de férias.</Empty>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr>
                  {isCoord && <th className="th">Colaborador</th>}
                  <th className="th">Modalidade</th>
                  <th className="th">Períodos</th>
                  <th className="th">Solicitada em</th>
                  <th className="th">Status</th>
                  <th className="th">Chamado RH</th>
                  <th className="th text-right">Ações</th>
                </tr>
              </thead>
              <tbody>
                {mine.map((v) => {
                  const editable = isCoord ? v.status !== 'Cancelada' && v.status !== 'Reprovada' : canCollaboratorEdit(v);
                  const cancellable = v.status === 'Pendente' || v.status === 'Ajuste Solicitado' || v.status === 'Aprovada';
                  const first = v.periodos[0]?.inicio;
                  return (
                    <tr key={v.id} className="hover:bg-slate-50">
                      {isCoord && <td className="td font-medium">{collaboratorName(v.collaboratorId)}</td>}
                      <td className="td">{MODALITY_LABEL[v.modalidade]}</td>
                      <td className="td">
                        <PeriodList periodos={v.periodos} />
                        {v.status === 'Aprovada' && first && first >= todayISO() && <div className="text-xs text-slate-500">faltam {diffDays(todayISO(), first)} dias</div>}
                      </td>
                      <td className="td">{fmtBR(v.dataSolicitacao)}</td>
                      <td className="td">
                        <StatusBadge status={v.status} />
                        {v.revisao > 1 && <Badge className="ml-1">rev. {v.revisao}</Badge>}
                        {v.status === 'Ajuste Solicitado' && v.parecer && <div className="mt-1 max-w-xs text-xs text-orange-700">{v.parecer}</div>}
                      </td>
                      <td className="td">
                        <div>{v.chamadoRH || '—'}</div>
                        <StatusBadge status={v.statusChamadoRH} />
                      </td>
                      <td className="td">
                        <div className="flex justify-end gap-1">
                          <Button size="sm" variant="ghost" icon={<Eye className="h-4 w-4" />} onClick={() => setDetail(v)} title="Detalhes e histórico" />
                          {editable && <Button size="sm" variant="ghost" icon={<Edit3 className="h-4 w-4" />} onClick={() => setForm({ request: v, collaboratorId: v.collaboratorId })} title="Alterar (retorna para aprovação)" />}
                          {v.status === 'Aprovada' && <Button size="sm" variant="ghost" icon={<FileSpreadsheet className="h-4 w-4 text-emerald-600" />} onClick={() => exportForm(v)} disabled={busy} title="Gerar formulário ADM-PF158" />}
                          {cancellable && (
                            <Button
                              size="sm"
                              variant="ghost"
                              icon={<Ban className="h-4 w-4 text-red-600" />}
                              onClick={() => {
                                setMotivo('');
                                setCancel(v);
                              }}
                              title="Cancelar"
                            />
                          )}
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

      <Card
        title="Mapa anual de férias da equipe"
        actions={
          <select className="input w-28" value={year} onChange={(e) => setYear(Number(e.target.value))}>
            {[0, 1, 2].map((k) => {
              const y = Number(todayISO().slice(0, 4)) - 1 + k;
              return <option key={y}>{y}</option>;
            })}
          </select>
        }
      >
        <VacationMap year={year} collaborators={allTeam} vacations={db.all('vacations')} />
        <p className="mt-2 text-xs text-slate-500">Regras da escala: sobreposição de até 7 dias com um colega gera alerta amarelo; acima de 7 dias ou mais de 2 pessoas ausentes ao mesmo tempo gera alerta vermelho.</p>
      </Card>

      {form && <VacationForm request={form.request} collaboratorId={form.collaboratorId} onClose={() => setForm(undefined)} />}
      {detail && (
        <VacationDetail
          v={db.all('vacations').find((x) => x.id === detail.id) ?? detail}
          onClose={() => setDetail(undefined)}
          footer={
            detail.status === 'Aprovada' ? (
              <Button variant="success" icon={<FileSpreadsheet className="h-4 w-4" />} loading={busy} onClick={() => exportForm(detail)}>
                Gerar formulário ADM-PF158
              </Button>
            ) : undefined
          }
        />
      )}
      {cancel && (
        <Modal
          open
          size="md"
          onClose={() => setCancel(undefined)}
          title="Cancelar férias"
          footer={
            <>
              <Button variant="secondary" onClick={() => setCancel(undefined)}>
                Voltar
              </Button>
              <Button
                variant="danger"
                loading={busy}
                onClick={() =>
                  run(async () => {
                    await requestCancellation(cancel.id, motivo, user);
                    setCancel(undefined);
                  }, cancel.status === 'Aprovada' && !isCoord ? 'Cancelamento enviado para aprovação.' : 'Solicitação cancelada.')
                }
              >
                Confirmar
              </Button>
            </>
          }
        >
          <div className="space-y-3">
            {cancel.status === 'Aprovada' && !isCoord && <Alert kind="warning">As férias já estão aprovadas: o cancelamento será enviado ao coordenador para aprovação.</Alert>}
            <Field label="Motivo do cancelamento">
              <textarea className="input" rows={3} value={motivo} onChange={(e) => setMotivo(e.target.value)} />
            </Field>
          </div>
        </Modal>
      )}
    </div>
  );
}
