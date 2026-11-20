import { fmtBR, fmtDateTimeBR, addDays } from '../lib/dates';
import { collaboratorName } from '../lib/store';
import { analyzeConflicts, describeConflicts } from '../services/vacations';
import { MODALITY_LABEL, type VacationPeriod, type VacationRequest } from '../types';
import { Alert, Badge, Modal, StatusBadge } from './ui';
import type { ReactNode } from 'react';

export function PeriodList({ periodos }: { periodos: VacationPeriod[] }) {
  return (
    <div className="space-y-0.5">
      {periodos.map((p, i) => (
        <div key={i} className="whitespace-nowrap text-sm">
          {fmtBR(p.inicio)} a {fmtBR(p.fim)} <span className="text-xs text-slate-500">({p.dias}d)</span>
        </div>
      ))}
    </div>
  );
}

export default function VacationDetail({ v, onClose, footer }: { v: VacationRequest; onClose: () => void; footer?: ReactNode }) {
  const conf = analyzeConflicts(v.collaboratorId, v.periodos, v.id);
  return (
    <Modal open onClose={onClose} title={`Férias · ${collaboratorName(v.collaboratorId)}`} footer={footer}>
      <div className="space-y-4 text-sm">
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge status={v.status} />
          <Badge>Revisão {v.revisao}</Badge>
          <Badge color="blue">Chamado RH: {v.chamadoRH || '—'} · {v.statusChamadoRH}</Badge>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <div className="label">Modalidade</div>
            {MODALITY_LABEL[v.modalidade]}
          </div>
          <div>
            <div className="label">Períodos</div>
            {v.periodos.map((p, i) => (
              <div key={i}>
                {fmtBR(p.inicio)} a {fmtBR(p.fim)} ({p.dias} dias) · retorno {fmtBR(addDays(p.fim, 1))}
              </div>
            ))}
          </div>
          <div>
            <div className="label">Data da solicitação</div>
            {fmtBR(v.dataSolicitacao)}
          </div>
          <div>
            <div className="label">Seção</div>
            {v.secao}
          </div>
          {v.observacao && (
            <div className="sm:col-span-2">
              <div className="label">Observação</div>
              {v.observacao}
            </div>
          )}
          {v.parecer && (
            <div className="sm:col-span-2">
              <div className="label">Parecer do coordenador</div>
              {v.parecer}
            </div>
          )}
          {v.aprovadoPor && (
            <div className="sm:col-span-2">
              <div className="label">Aprovação</div>
              {v.aprovadoPor} em {fmtDateTimeBR(v.aprovadoEm)}
              {v.conflitoJustificado && <div className="text-xs text-red-700">Conflito justificado: {v.conflitoJustificado}</div>}
            </div>
          )}
        </div>
        {v.versaoAnteriorAprovada && (
          <Alert kind="info" title="Versão anteriormente aprovada">
            {MODALITY_LABEL[v.versaoAnteriorAprovada.modalidade]} · {v.versaoAnteriorAprovada.periodos.map((p) => `${fmtBR(p.inicio)} a ${fmtBR(p.fim)}`).join(' / ')}
            {v.versaoAnteriorAprovada.aprovadoEm && ` · aprovada em ${fmtDateTimeBR(v.versaoAnteriorAprovada.aprovadoEm)}`}
          </Alert>
        )}
        {conf.nivel !== 'ok' && (
          <Alert kind={conf.nivel === 'critico' ? 'error' : 'warning'} title={conf.nivel === 'critico' ? 'Conflito crítico' : 'Alerta de sobreposição'}>
            {describeConflicts(conf).join('\n')}
          </Alert>
        )}
        <div>
          <div className="label">Histórico</div>
          <ol className="space-y-1 border-l-2 border-slate-200 pl-3">
            {[...v.historico].reverse().map((h, i) => (
              <li key={i}>
                <div className="text-xs text-slate-500">
                  {fmtDateTimeBR(h.dataHora)} · {h.usuario}
                </div>
                <div className="font-medium">{h.acao}</div>
                {h.texto && <div className="text-slate-600">{h.texto}</div>}
              </li>
            ))}
            {!v.historico.length && <li className="text-slate-400">Sem eventos.</li>}
          </ol>
        </div>
      </div>
    </Modal>
  );
}
