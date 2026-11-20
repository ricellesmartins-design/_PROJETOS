import { useState } from 'react';
import { Download, FileSpreadsheet } from 'lucide-react';
import ExcelJS from 'exceljs';
import { useDb, useSession, collaboratorName } from '../lib/store';
import { addDays, fmtBR, fmtDateTimeBR, isWeekend, monthKey, monthLabel, networkDays, todayISO } from '../lib/dates';
import { computeEstHours, computeRealHours, isClosed, isLate } from '../services/activities';
import { visibleActivities, visibleCollaborators } from '../services/views';
import { exportActivities, planSheets } from '../excel/exportActivities';
import { download, XLSX_MIME } from '../excel/common';
import { DATE_FIELD_LABEL, MODALITY_LABEL, type Activity } from '../types';
import VacationMap from '../components/VacationMap';
import { Badge, Button, Card, Empty, Stat, StatusBadge, cx, useAction } from '../components/ui';

/** Distribui horas proporcionalmente pelos dias úteis de cada mês do intervalo. */
function splitByMonth(start: string | undefined, end: string | undefined, hours: number | undefined, out: Map<string, number>) {
  if (!hours || !start) return;
  const e = end && end >= start ? end : start;
  const work = networkDays(start, e);
  const useWork = work > 0;
  const total = useWork ? work : Math.round((Date.parse(e) - Date.parse(start)) / 86_400_000) + 1;
  for (let d = start; d <= e; d = addDays(d, 1)) {
    if (useWork && isWeekend(d)) continue;
    const k = monthKey(d);
    out.set(k, (out.get(k) ?? 0) + hours / total);
  }
}

interface Agg {
  key: string;
  label: string;
  est: number;
  real: number;
  /** Horas estimadas só das atividades que já têm horas realizadas (base do desvio). */
  estComReal: number;
  total: number;
  finalizadas: number;
  noPrazo: number;
  atrasadas: number;
}

function aggregate(list: Activity[], keyOf: (a: Activity) => string, labelOf: (k: string) => string): Agg[] {
  const m = new Map<string, Agg>();
  const today = todayISO();
  for (const a of list) {
    const k = keyOf(a) || '(não informado)';
    const g = m.get(k) ?? { key: k, label: labelOf(k), est: 0, real: 0, estComReal: 0, total: 0, finalizadas: 0, noPrazo: 0, atrasadas: 0 };
    if (a.status !== 'Cancelado') {
      const e = computeEstHours(a) ?? 0;
      const r = computeRealHours(a);
      g.est += e;
      g.real += r ?? 0;
      if (r) g.estComReal += e;
    }
    g.total++;
    if (a.status === 'Finalizado') {
      g.finalizadas++;
      if (!isLate(a, today)) g.noPrazo++;
    }
    if (isLate(a, today)) g.atrasadas++;
    m.set(k, g);
  }
  return [...m.values()].sort((a, b) => b.est + b.real - (a.est + a.real));
}

const h = (n: number) => n.toLocaleString('pt-BR', { maximumFractionDigits: 1 });
const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0);

function AggTable({ rows, title }: { rows: Agg[]; title: string }) {
  const max = Math.max(1, ...rows.map((r) => Math.max(r.est, r.real)));
  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead>
          <tr>
            <th className="th">{title}</th>
            <th className="th w-1/3">Estimado × Realizado</th>
            <th className="th text-right">Est. (h)</th>
            <th className="th text-right">Real (h)</th>
            <th className="th text-right" title="Realizado × estimado, só das atividades com horas realizadas">Desvio</th>
            <th className="th text-right">Ativ.</th>
            <th className="th text-right">No prazo</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const dev = r.estComReal ? Math.round(((r.real - r.estComReal) / r.estComReal) * 100) : 0;
            return (
              <tr key={r.key} className="hover:bg-slate-50">
                <td className="td max-w-xs truncate font-medium" title={r.label}>
                  {r.label}
                </td>
                <td className="td">
                  <div className="h-2 rounded bg-slate-100">
                    <div className="h-2 rounded bg-idg-blue" style={{ width: `${(r.est / max) * 100}%` }} />
                  </div>
                  <div className="mt-0.5 h-2 rounded bg-slate-100">
                    <div className={cx('h-2 rounded', r.real > r.est ? 'bg-red-500' : 'bg-idg-orange')} style={{ width: `${(r.real / max) * 100}%` }} />
                  </div>
                </td>
                <td className="td text-right">{h(r.est)}</td>
                <td className="td text-right">{h(r.real)}</td>
                <td className={cx('td text-right', dev > 10 ? 'text-red-600' : dev < -10 ? 'text-amber-600' : 'text-emerald-600')}>{r.estComReal ? `${dev > 0 ? '+' : ''}${dev}%` : '—'}</td>
                <td className="td text-right">{r.total}</td>
                <td className="td text-right">{r.finalizadas ? `${pct(r.noPrazo, r.finalizadas)}%` : '—'}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div className="mt-1 flex gap-4 px-3 pb-2 text-xs text-slate-500">
        <span className="inline-flex items-center gap-1">
          <span className="inline-block h-2 w-4 rounded bg-idg-blue" /> Estimado
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="inline-block h-2 w-4 rounded bg-idg-orange" /> Realizado
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="inline-block h-2 w-4 rounded bg-red-500" /> Realizado acima do estimado
        </span>
      </div>
    </div>
  );
}

export default function Reports() {
  const db = useDb();
  const { user } = useSession();
  const { busy, run } = useAction();
  const year0 = Number(todayISO().slice(0, 4));
  const [from, setFrom] = useState(`${year0}-01`);
  const [to, setTo] = useState(`${year0}-12`);
  const [collab, setCollab] = useState('');
  const [vacYear, setVacYear] = useState(year0 + 1);
  const isCoord = user.role === 'coordenador';
  const collabs = visibleCollaborators(user);
  const ccName = new Map(db.all('costCenters').map((c) => [c.codigo, c.denominacao]));

  const inPeriod = (a: Activity) => {
    const s = (a.inicioReal ?? a.estInicio ?? a.dataSolicitacao ?? a.createdAt).slice(0, 7);
    const e = (a.terminoReal ?? a.estTermino ?? s).slice(0, 7);
    return s <= to && e >= from;
  };
  const list = visibleActivities(user).filter((a) => (!collab || a.collaboratorId === collab) && inPeriod(a));
  const today = todayISO();
  const finished = list.filter((a) => a.status === 'Finalizado');
  const onTime = finished.filter((a) => !isLate(a, today));
  const open = list.filter((a) => !isClosed(a));
  const lateOpen = open.filter((a) => isLate(a, today));
  const totEst = list.filter((a) => a.status !== 'Cancelado').reduce((s, a) => s + (computeEstHours(a) ?? 0), 0);
  const totReal = list.filter((a) => a.status !== 'Cancelado').reduce((s, a) => s + (computeRealHours(a) ?? 0), 0);

  const byCollab = aggregate(list, (a) => a.collaboratorId, (k) => collaboratorName(k));
  const byCC = aggregate(list, (a) => a.centroCusto, (k) => (ccName.get(k) ? `${k} · ${ccName.get(k)}` : k));

  const estM = new Map<string, number>();
  const realM = new Map<string, number>();
  list
    .filter((a) => a.status !== 'Cancelado')
    .forEach((a) => {
      splitByMonth(a.estInicio, a.estTermino, computeEstHours(a), estM);
      splitByMonth(a.inicioReal, a.terminoReal ?? a.inicioReal, computeRealHours(a), realM);
    });
  const months = [...new Set([...estM.keys(), ...realM.keys()])].filter((k) => k >= from && k <= to).sort();
  const maxM = Math.max(1, ...months.map((k) => Math.max(estM.get(k) ?? 0, realM.get(k) ?? 0)));

  const ids = new Set(list.map((a) => a.id));
  const logs = db.all('dateChangeLogs').filter((l) => ids.has(l.activityId) || (!collab && l.dataHora.slice(0, 7) >= from && l.dataHora.slice(0, 7) <= to && (!isCoord ? visibleActivities(user).some((a) => a.id === l.activityId) : true)));
  const vacations = isCoord ? db.all('vacations') : [];

  const exportMgmt = () =>
    run(async () => {
      const wb = new ExcelJS.Workbook();
      wb.creator = 'Gestão AMP · IDG Engenharia';
      const head = (ws: ExcelJS.Worksheet) => {
        ws.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
        ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1B2A5C' } };
        ws.views = [{ state: 'frozen', ySplit: 1 }];
      };
      const aggSheet = (name: string, rows: Agg[], first: string) => {
        const ws = wb.addWorksheet(name);
        ws.columns = [
          { header: first, key: 'l', width: 50 },
          { header: 'Horas estimadas', key: 'e', width: 16, style: { numFmt: '0.0' } },
          { header: 'Horas realizadas', key: 'r', width: 16, style: { numFmt: '0.0' } },
          { header: 'Desvio % (ativ. com horas realizadas)', key: 'd', width: 18, style: { numFmt: '0%' } },
          { header: 'Atividades', key: 't', width: 11 },
          { header: 'Finalizadas', key: 'f', width: 11 },
          { header: 'Finalizadas no prazo', key: 'p', width: 18 },
          { header: 'Índice no prazo', key: 'i', width: 15, style: { numFmt: '0%' } },
          { header: 'Atrasadas', key: 'a', width: 10 },
        ];
        rows.forEach((r) => ws.addRow({ l: r.label, e: r.est, r: r.real, d: r.estComReal ? (r.real - r.estComReal) / r.estComReal : null, t: r.total, f: r.finalizadas, p: r.noPrazo, i: r.finalizadas ? r.noPrazo / r.finalizadas : null, a: r.atrasadas }));
        head(ws);
      };
      const res = wb.addWorksheet('Resumo');
      res.columns = [
        { header: 'Indicador', key: 'k', width: 40 },
        { header: 'Valor', key: 'v', width: 20 },
      ];
      [
        ['Período', `${monthLabel(from)} a ${monthLabel(to)}`],
        ['Colaborador', collab ? collaboratorName(collab) : 'Todos'],
        ['Atividades', list.length],
        ['Horas estimadas', Math.round(totEst * 10) / 10],
        ['Horas realizadas', Math.round(totReal * 10) / 10],
        ['Finalizadas', finished.length],
        ['Índice de cumprimento de prazo', finished.length ? `${pct(onTime.length, finished.length)}%` : '—'],
        ['Em aberto atrasadas', lateOpen.length],
        ['Alterações de data justificadas', logs.length],
        ['Gerado em', fmtDateTimeBR(new Date().toISOString())],
      ].forEach(([k, v]) => res.addRow({ k, v }));
      head(res);
      aggSheet('Por colaborador', byCollab, 'Colaborador');
      aggSheet('Por centro de custo', byCC, 'Centro de custo');
      const wm = wb.addWorksheet('Por mês');
      wm.columns = [
        { header: 'Mês', key: 'm', width: 18 },
        { header: 'Horas estimadas', key: 'e', width: 16, style: { numFmt: '0.0' } },
        { header: 'Horas realizadas', key: 'r', width: 16, style: { numFmt: '0.0' } },
      ];
      months.forEach((k) => wm.addRow({ m: monthLabel(k), e: estM.get(k) ?? 0, r: realM.get(k) ?? 0 }));
      head(wm);
      const wj = wb.addWorksheet('Justificativas de datas');
      wj.columns = [
        { header: 'Data/hora', key: 'd', width: 18 },
        { header: 'Atividade', key: 'a', width: 18 },
        { header: 'Colaborador', key: 'c', width: 34 },
        { header: 'Campo', key: 'f', width: 22 },
        { header: 'Anterior', key: 'o', width: 12 },
        { header: 'Nova', key: 'n', width: 12 },
        { header: 'Justificativa', key: 'j', width: 60 },
        { header: 'Usuário', key: 'u', width: 34 },
      ];
      logs.forEach((l) =>
        wj.addRow({ d: fmtDateTimeBR(l.dataHora), a: l.activityCodigo, c: collaboratorName(l.collaboratorId), f: DATE_FIELD_LABEL[l.campo], o: fmtBR(l.anterior), n: fmtBR(l.nova), j: l.justificativa, u: `${l.usuarioNome} <${l.usuarioEmail}>` }),
      );
      head(wj);
      if (isCoord) {
        const wv = wb.addWorksheet('Férias e chamados RH');
        wv.columns = [
          { header: 'Colaborador', key: 'c', width: 34 },
          { header: 'Modalidade', key: 'm', width: 34 },
          { header: 'Períodos', key: 'p', width: 40 },
          { header: 'Status', key: 's', width: 22 },
          { header: 'Chamado RH', key: 't', width: 16 },
          { header: 'Status chamado', key: 'ts', width: 15 },
          { header: 'Aprovado por', key: 'a', width: 28 },
          { header: 'Aprovado em', key: 'ae', width: 18 },
        ];
        vacations.forEach((v) =>
          wv.addRow({ c: collaboratorName(v.collaboratorId), m: MODALITY_LABEL[v.modalidade], p: v.periodos.map((p) => `${fmtBR(p.inicio)} a ${fmtBR(p.fim)}`).join(' / '), s: v.status, t: v.chamadoRH, ts: v.statusChamadoRH, a: v.aprovadoPor ?? '', ae: fmtDateTimeBR(v.aprovadoEm) }),
        );
        head(wv);
      }
      const buf = await wb.xlsx.writeBuffer();
      download(new Blob([buf], { type: XLSX_MIME }), `Relatorio_Gerencial_AMP_${from}_a_${to}.xlsx`);
    }, 'Relatório gerencial exportado.');

  const exportSE = () =>
    run(async () => {
      const ms: string[] = [];
      for (let k = from; k <= to; k = monthKey(addDays(`${k}-28`, 7))) ms.push(k);
      const cs = collab ? collabs.filter((c) => c.id === collab) : collabs;
      const sheets = planSheets(cs, list, ms);
      await exportActivities(sheets, `${from}_a_${to}`);
    }, 'Relatório SE-PL-0510 gerado.');

  return (
    <div className="space-y-5">
      <Card
        bodyClass="flex flex-wrap items-end gap-3"
        title="Relatórios executivos"
        actions={
          <>
            <Button size="sm" variant="secondary" icon={<FileSpreadsheet className="h-4 w-4 text-emerald-600" />} loading={busy} onClick={exportSE}>
              SE-PL-0510 (abas por mês)
            </Button>
            <Button size="sm" icon={<Download className="h-4 w-4" />} loading={busy} onClick={exportMgmt}>
              Exportar relatório gerencial
            </Button>
          </>
        }
      >
        <label>
          <span className="label">De</span>
          <input type="month" className="input" value={from} onChange={(e) => setFrom(e.target.value)} />
        </label>
        <label>
          <span className="label">Até</span>
          <input type="month" className="input" value={to} onChange={(e) => setTo(e.target.value)} />
        </label>
        <label>
          <span className="label">Colaborador</span>
          <select className="input w-64" value={collab} onChange={(e) => setCollab(e.target.value)}>
            <option value="">Todos</option>
            {collabs.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nome}
              </option>
            ))}
          </select>
        </label>
      </Card>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Stat label="Horas estimadas" value={h(totEst)} tone="blue" />
        <Stat label="Horas realizadas" value={h(totReal)} sub={totEst ? `${pct(totReal, totEst)}% do estimado` : undefined} />
        <Stat label="Índice no prazo" value={finished.length ? `${pct(onTime.length, finished.length)}%` : '—'} sub={`${onTime.length} de ${finished.length} finalizadas`} tone={pct(onTime.length, finished.length) >= 80 ? 'green' : 'amber'} />
        <Stat label="Abertas atrasadas" value={lateOpen.length} tone={lateOpen.length ? 'red' : 'green'} />
        <Stat label="Datas alteradas" value={logs.length} sub="com justificativa" tone="amber" />
      </div>

      <Card title="Estimado × Realizado por colaborador" bodyClass="p-0">
        {byCollab.length ? <AggTable rows={byCollab} title="Colaborador" /> : <div className="p-4"><Empty>Sem atividades no período.</Empty></div>}
      </Card>

      <Card title="Estimado × Realizado por centro de custo" bodyClass="p-0">
        {byCC.length ? <AggTable rows={byCC} title="Centro de custo" /> : <div className="p-4"><Empty>Sem atividades no período.</Empty></div>}
      </Card>

      <Card title="Horas por mês (distribuídas pelos dias úteis)">
        {!months.length ? (
          <Empty>Sem horas no período.</Empty>
        ) : (
          <div className="flex h-56 items-end gap-2 overflow-x-auto">
            {months.map((k) => {
              const e = estM.get(k) ?? 0;
              const r = realM.get(k) ?? 0;
              return (
                <div key={k} className="flex min-w-[56px] flex-1 flex-col items-center">
                  <div className="flex h-44 items-end gap-1">
                    <div className="w-4 rounded-t bg-idg-blue" style={{ height: `${(e / maxM) * 100}%` }} title={`Estimado: ${h(e)} h`} />
                    <div className="w-4 rounded-t bg-idg-orange" style={{ height: `${(r / maxM) * 100}%` }} title={`Realizado: ${h(r)} h`} />
                  </div>
                  <div className="mt-1 text-[10px] text-slate-500">{monthLabel(k).replace(/ de /, '/').slice(0, 8)}</div>
                  <div className="text-[10px] text-slate-400">
                    {Math.round(e)}/{Math.round(r)}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      <Card title={`Justificativas de alteração de datas (${logs.length})`} bodyClass="p-0">
        {!logs.length ? (
          <div className="p-4">
            <Empty>Nenhuma alteração de data no período.</Empty>
          </div>
        ) : (
          <div className="max-h-[480px] overflow-auto">
            <table className="w-full">
              <thead className="sticky top-0">
                <tr>
                  <th className="th">Data/hora</th>
                  <th className="th">Atividade</th>
                  <th className="th">Campo</th>
                  <th className="th">De → Para</th>
                  <th className="th">Justificativa</th>
                  <th className="th">Usuário</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((l) => (
                  <tr key={l.id} className="align-top hover:bg-slate-50">
                    <td className="td whitespace-nowrap text-xs">{fmtDateTimeBR(l.dataHora)}</td>
                    <td className="td">
                      <div className="font-mono text-xs">{l.activityCodigo}</div>
                      <div className="text-xs text-slate-500">{collaboratorName(l.collaboratorId)}</div>
                    </td>
                    <td className="td text-xs">{DATE_FIELD_LABEL[l.campo]}</td>
                    <td className="td whitespace-nowrap text-xs">
                      {fmtBR(l.anterior) || '—'} → <b>{fmtBR(l.nova) || '—'}</b>
                    </td>
                    <td className="td text-xs">{l.justificativa}</td>
                    <td className="td text-xs">{l.usuarioNome}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {isCoord && (
        <>
          <Card
            title="Mapa anual de férias"
            actions={
              <select className="input w-28" value={vacYear} onChange={(e) => setVacYear(Number(e.target.value))}>
                {[year0 - 1, year0, year0 + 1, year0 + 2].map((y) => (
                  <option key={y}>{y}</option>
                ))}
              </select>
            }
          >
            <VacationMap year={vacYear} collaborators={db.all('collaborators').filter((c) => c.ativo)} vacations={vacations} />
          </Card>
          <Card title="Status dos chamados RH" bodyClass="p-0">
            {!vacations.length ? (
              <div className="p-4">
                <Empty>Nenhuma solicitação.</Empty>
              </div>
            ) : (
              <table className="w-full">
                <thead>
                  <tr>
                    <th className="th">Colaborador</th>
                    <th className="th">Períodos</th>
                    <th className="th">Férias</th>
                    <th className="th">Chamado</th>
                    <th className="th">Status do chamado</th>
                  </tr>
                </thead>
                <tbody>
                  {vacations
                    .filter((v) => v.status !== 'Cancelada' && v.status !== 'Reprovada')
                    .map((v) => (
                      <tr key={v.id}>
                        <td className="td font-medium">{collaboratorName(v.collaboratorId)}</td>
                        <td className="td text-xs">{v.periodos.map((p) => `${fmtBR(p.inicio)} a ${fmtBR(p.fim)}`).join(' / ')}</td>
                        <td className="td">
                          <StatusBadge status={v.status} />
                        </td>
                        <td className="td">{v.chamadoRH || <Badge color="red">sem chamado</Badge>}</td>
                        <td className="td">
                          <StatusBadge status={v.statusChamadoRH} />
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            )}
          </Card>
        </>
      )}
    </div>
  );
}
