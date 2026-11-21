import { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, FileSpreadsheet, FileText } from 'lucide-react';
import { useDb, useSession, collaboratorName } from '../lib/store';
import { addDays, diffDays, findHoliday, fmtBR, isWeekend, MONTHS_ABBR, todayISO, weekStart } from '../lib/dates';
import { dailyLoad, executionWindow, isAbsence, isClosed, isLate } from '../services/activities';
import { visibleActivities, visibleCollaborators, visibleVacations } from '../services/views';
import { ACTIVITY_STATUSES, type Activity } from '../types';
import { Badge, Button, Card, Empty, Field, cx, useAction } from '../components/ui';
import { exportLoadMapExcel, exportLoadMapPdf, type LoadModel } from '../excel/exportLoadMap';

const DAY_W = 26;
const BAR: Record<string, string> = {
  'Não Iniciado': 'bg-slate-400',
  'Em andamento': 'bg-blue-500',
  'Aguardando Cliente': 'bg-orange-400',
  Finalizado: 'bg-emerald-500',
  Cancelado: 'bg-red-300',
};

export default function LoadMap() {
  const db = useDb();
  const { user } = useSession();
  const today = todayISO();
  const [start, setStart] = useState(addDays(weekStart(today), -14));
  const [weeks, setWeeks] = useState(8);
  const [groupBy, setGroupBy] = useState<'colaborador' | 'area'>('colaborador');
  const [f, setF] = useState({ collab: '', solicitante: '', area: '', cc: '', status: '', ocultarFinalizadas: false });
  const settings = db.settings;
  const end = addDays(start, weeks * 7 - 1);
  const days = useMemo(() => Array.from({ length: weeks * 7 }, (_, i) => addDays(start, i)), [start, weeks]);

  const all = visibleActivities(user);
  const collabs = visibleCollaborators(user);
  const vacs = visibleVacations(user).filter((v) => v.status === 'Aprovada');
  const acts = all.filter((a) => {
    if (f.collab && a.collaboratorId !== f.collab) return false;
    if (f.solicitante && a.solicitante !== f.solicitante) return false;
    if (f.area && a.area !== f.area) return false;
    if (f.cc && a.centroCusto !== f.cc) return false;
    if (f.status && a.status !== f.status) return false;
    if (f.ocultarFinalizadas && isClosed(a)) return false;
    const w = executionWindow(a, today);
    return !!w && w.start <= end && w.end >= start;
  });

  const groups =
    groupBy === 'colaborador'
      ? collabs.filter((c) => !f.collab || c.id === f.collab).map((c) => ({ key: c.id, title: c.nome, collabId: c.id, list: acts.filter((a) => a.collaboratorId === c.id) }))
      : [...new Set(acts.map((a) => a.area || '(sem área)'))].sort().map((ar) => ({ key: ar, title: ar, collabId: undefined as string | undefined, list: acts.filter((a) => (a.area || '(sem área)') === ar) }));

  const opts = (k: keyof Activity) => [...new Set(all.map((a) => String(a[k] ?? '')).filter(Boolean))].sort();
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLSelectElement>) => setF((x) => ({ ...x, [k]: e.target.value }));

  const loadOf = (list: Activity[], d: string) => {
    if (isWeekend(d) || findHoliday(d, settings.feriadosExtras)) return { h: 0, n: 0 };
    const on = list.filter((a) => {
      const w = executionWindow(a, today)!;
      return w.start <= d && w.end >= d && a.status !== 'Cancelado' && !isAbsence(a);
    });
    return { h: on.reduce((s, a) => s + dailyLoad(a), 0), n: on.length };
  };

  const absentOn = (list: Activity[], d: string) =>
    list.some((a) => {
      if (!isAbsence(a) || a.status === 'Cancelado') return false;
      const w = executionWindow(a, today);
      return !!w && w.start <= d && w.end >= d;
    });

  const { busy, run } = useAction();
  const buildModel = (): LoadModel => {
    const wk = weekStart(today);
    const filtroTexto =
      [
        f.collab && `Colaborador: ${collaboratorName(f.collab)}`,
        f.solicitante && `Solicitante: ${f.solicitante}`,
        f.area && `Área: ${f.area}`,
        f.cc && `Centro de custo: ${f.cc}`,
        f.status && `Status: ${f.status}`,
        f.ocultarFinalizadas && 'sem finalizadas',
      ]
        .filter(Boolean)
        .join(' · ') || 'Sem filtros';
    return {
      start,
      end,
      days,
      groupBy,
      today,
      limiteDia: settings.limiteDia,
      limiteSemana: settings.limiteSemana,
      filtroTexto,
      groups: groups.map((g) => {
        const myVac = g.collabId ? vacs.filter((v) => v.collaboratorId === g.collabId).flatMap((v) => v.periodos) : [];
        return {
          title: g.title,
          weekH: groupBy === 'colaborador' ? Array.from({ length: 7 }, (_, i) => loadOf(g.list, addDays(wk, i)).h).reduce((s, h) => s + h, 0) : undefined,
          daily: days.map((d) => ({ d, ...loadOf(g.list, d), off: isWeekend(d) || !!findHoliday(d, settings.feriadosExtras), vac: myVac.some((p) => p.inicio <= d && p.fim >= d), abs: absentOn(g.list, d) })),
          rows: g.list.map((a) => {
            const w = executionWindow(a, today)!;
            return { a, colaborador: collaboratorName(a.collaboratorId), start: w.start, end: w.end, previsto: w.previsto, late: !!(isLate(a, today) && !isClosed(a) && a.estTermino), hDia: dailyLoad(a) };
          }),
        };
      }),
    };
  };

  return (
    <div className="space-y-4">
      <Card bodyClass="flex flex-wrap items-end gap-3">
        <div className="flex items-end gap-1">
          <Button variant="secondary" size="sm" onClick={() => setStart(addDays(start, -7))}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Field label="Início">
            <input type="date" className="input" value={start} onChange={(e) => e.target.value && setStart(weekStart(e.target.value))} />
          </Field>
          <Button variant="secondary" size="sm" onClick={() => setStart(addDays(start, 7))}>
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setStart(addDays(weekStart(today), -14))}>
            Hoje
          </Button>
        </div>
        <Field label="Janela">
          <select className="input" value={weeks} onChange={(e) => setWeeks(Number(e.target.value))}>
            {[4, 6, 8, 12, 16, 26].map((w) => (
              <option key={w} value={w}>
                {w} semanas
              </option>
            ))}
          </select>
        </Field>
        <Field label="Agrupar por">
          <select className="input" value={groupBy} onChange={(e) => setGroupBy(e.target.value as typeof groupBy)}>
            <option value="colaborador">Colaborador</option>
            <option value="area">Área da usina</option>
          </select>
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
        <Field label="Solicitante">
          <select className="input" value={f.solicitante} onChange={set('solicitante')}>
            <option value="">Todos</option>
            {opts('solicitante').map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </Field>
        <Field label="Área">
          <select className="input" value={f.area} onChange={set('area')}>
            <option value="">Todas</option>
            {opts('area').map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </Field>
        <Field label="Centro de custo">
          <select className="input" value={f.cc} onChange={set('cc')}>
            <option value="">Todos</option>
            {opts('centroCusto').map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </Field>
        <Field label="Status">
          <select className="input" value={f.status} onChange={set('status')}>
            <option value="">Todos</option>
            {ACTIVITY_STATUSES.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </Field>
        <label className="flex items-center gap-2 pb-2 text-sm">
          <input type="checkbox" checked={f.ocultarFinalizadas} onChange={(e) => setF((x) => ({ ...x, ocultarFinalizadas: e.target.checked }))} /> Ocultar finalizadas
        </label>
      </Card>

      <div className="flex flex-wrap items-center justify-end gap-2">
        <span className="mr-auto text-xs text-slate-500">Exporta o que está na tela (período, filtros e agrupamento): Gantt + tabela.</span>
        <Button variant="secondary" size="sm" icon={<FileText className="h-4 w-4" />} loading={busy} disabled={!groups.length} onClick={() => run(() => exportLoadMapPdf(buildModel()), 'PDF gerado.')}>
          Exportar PDF
        </Button>
        <Button variant="secondary" size="sm" icon={<FileSpreadsheet className="h-4 w-4" />} loading={busy} disabled={!groups.length} onClick={() => run(() => exportLoadMapExcel(buildModel()), 'Excel gerado.')}>
          Exportar Excel
        </Button>
      </div>

      <div className="flex flex-wrap gap-3 text-xs text-slate-600">
        {Object.entries(BAR).map(([k, c]) => (
          <span key={k} className="flex items-center gap-1">
            <span className={cx('inline-block h-3 w-5 rounded', c)} /> {k}
          </span>
        ))}
        <span className="flex items-center gap-1">
          <span className="inline-block h-3 w-5 rounded bg-red-500/80" style={{ backgroundImage: 'repeating-linear-gradient(45deg,#fff5 0 3px,transparent 3px 6px)' }} /> atraso (após término previsto)
        </span>
        <span className="flex items-center gap-1">◆ término previsto</span>
        <span className="flex items-center gap-1">
          <span className="hatch inline-block h-3 w-5 rounded" /> férias aprovadas
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-3 w-5 rounded bg-purple-600" /> ausência: atestado, afastamento, doença ou falta (ID 0510-0000)
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-3 w-5 rounded bg-red-500" /> &gt; {settings.limiteDia} h/dia
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-3 w-5 rounded ring-2 ring-violet-500" /> 2+ atividades em paralelo
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-3 w-5 rounded bg-slate-200" /> ocioso
        </span>
      </div>

      <Card bodyClass="p-0">
        {groups.length === 0 ? (
          <div className="p-4">
            <Empty>Nada para exibir no período.</Empty>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <div style={{ width: 300 + days.length * DAY_W + 110 }}>
              {/* Cabeçalho */}
              <div className="sticky top-0 z-10 flex border-b bg-white text-[10px] text-slate-500">
                <div className="w-[300px] shrink-0 border-r px-3 py-1 font-semibold uppercase">{groupBy === 'colaborador' ? 'Colaborador / atividade' : 'Área / atividade'}</div>
                {days.map((d) => {
                  const hol = findHoliday(d, settings.feriadosExtras);
                  return (
                    <div
                      key={d}
                      title={hol?.nome}
                      className={cx('shrink-0 border-r py-1 text-center', isWeekend(d) && 'bg-slate-100', hol && 'bg-rose-50 text-rose-600', d === today && 'bg-idg-orange/20 font-bold text-idg-navy')}
                      style={{ width: DAY_W }}
                    >
                      {d.slice(8) === '01' || d === start ? <div className="font-semibold">{MONTHS_ABBR[Number(d.slice(5, 7)) - 1]}</div> : <div>&nbsp;</div>}
                      {d.slice(8)}
                    </div>
                  );
                })}
                <div className="w-[110px] shrink-0 px-2 py-1 font-semibold uppercase">Semana atual</div>
              </div>

              {groups.map((g) => {
                const myVac = g.collabId ? vacs.filter((v) => v.collaboratorId === g.collabId).flatMap((v) => v.periodos) : [];
                const wk = weekStart(today);
                const weekH = Array.from({ length: 7 }, (_, i) => loadOf(g.list, addDays(wk, i)).h).reduce((s, h) => s + h, 0);
                return (
                  <div key={g.key} className="border-b border-slate-200">
                    {/* Heatmap do grupo */}
                    <div className="flex bg-slate-50">
                      <div className="w-[300px] shrink-0 border-r px-3 py-1.5 text-sm font-semibold text-idg-navy">
                        {g.title} <span className="text-xs font-normal text-slate-500">({g.list.length})</span>
                      </div>
                      {days.map((d) => {
                        const onVac = myVac.some((p) => p.inicio <= d && p.fim >= d);
                        const onAbs = !onVac && absentOn(g.list, d);
                        const { h, n } = loadOf(g.list, d);
                        const off = isWeekend(d) || !!findHoliday(d, settings.feriadosExtras);
                        const color = onVac ? 'hatch' : onAbs && !off ? 'bg-purple-600 text-white' : off ? 'bg-slate-100' : h === 0 ? 'bg-slate-200' : h > settings.limiteDia ? 'bg-red-500 text-white' : h >= settings.limiteDia * 0.75 ? 'bg-emerald-500 text-white' : 'bg-amber-300';
                        return (
                          <div
                            key={d}
                            title={`${fmtBR(d)} · ${onVac ? 'férias' : onAbs ? 'afastado | atestado' : `${h.toFixed(1)} h em ${n} atividade(s)`}`}
                            className={cx('m-[1px] flex shrink-0 items-center justify-center rounded-sm text-[9px] font-semibold', color, n >= 2 && !onVac && 'ring-2 ring-inset ring-violet-600')}
                            style={{ width: DAY_W - 2, height: 22 }}
                          >
                            {!off && !onVac && onAbs ? 'AT' : !off && !onVac && h > 0 ? (h % 1 ? h.toFixed(1) : h) : ''}
                          </div>
                        );
                      })}
                      <div className="w-[110px] shrink-0 px-2 py-1 text-xs">
                        {groupBy === 'colaborador' && (
                          <span className={weekH > settings.limiteSemana ? 'font-bold text-red-600' : weekH === 0 ? 'text-slate-400' : ''}>
                            {weekH.toFixed(1)} h{weekH > settings.limiteSemana && <Badge color="red" className="ml-1">&gt;{settings.limiteSemana}h</Badge>}
                            {weekH === 0 && <Badge className="ml-1">ocioso</Badge>}
                          </span>
                        )}
                      </div>
                    </div>
                    {/* Barras de atividades */}
                    {g.list.map((a) => {
                      const w = executionWindow(a, today)!;
                      const s = w.start < start ? start : w.start;
                      const e = w.end > end ? end : w.end;
                      const left = diffDays(start, s) * DAY_W;
                      const width = (diffDays(s, e) + 1) * DAY_W;
                      const late = isLate(a, today) && !isClosed(a) && a.estTermino;
                      const lateLeft = late ? Math.max(0, (diffDays(start, addDays(a.estTermino!, 1)) - diffDays(start, s)) * DAY_W) : 0;
                      const estEndPos = a.estTermino && a.estTermino >= start && a.estTermino <= end ? (diffDays(start, a.estTermino) + 0.5) * DAY_W : undefined;
                      return (
                        <div key={a.id} className="flex items-center hover:bg-blue-50/40">
                          <div className="w-[300px] shrink-0 truncate border-r px-3 py-1 text-xs" title={a.descricao}>
                            <span className="font-mono text-slate-500">{a.codigo}</span> {isAbsence(a) ? <b className="text-purple-700">{a.observacao?.split(' · ')[0] || a.descricao}</b> : a.descricao}
                            {groupBy === 'area' && <span className="text-slate-400"> · {collaboratorName(a.collaboratorId)}</span>}
                          </div>
                          <div className="gantt-grid relative h-6 shrink-0" style={{ width: days.length * DAY_W, backgroundSize: `${DAY_W}px 100%` }}>
                            {today >= start && today <= end && <div className="absolute inset-y-0 w-0.5 bg-idg-orange" style={{ left: (diffDays(start, today) + 0.5) * DAY_W }} />}
                            <div
                              className={cx('absolute top-1 h-4 overflow-hidden rounded text-[10px] leading-4 text-white', isAbsence(a) ? 'bg-purple-600' : BAR[a.status])}
                              style={{ left, width }}
                              title={`${a.codigo} · ${a.status}\n${fmtBR(w.start)} → ${fmtBR(w.end)}${w.previsto ? ' (previsto)' : ''}\nTérmino previsto: ${fmtBR(a.estTermino) || '—'}\n${dailyLoad(a)} h/dia`}
                            >
                              {!isAbsence(a) && late && lateLeft < width && <div className="absolute inset-y-0 right-0 bg-red-500/90" style={{ left: lateLeft, backgroundImage: 'repeating-linear-gradient(45deg,#fff5 0 3px,transparent 3px 6px)' }} />}
                              <span className="relative px-1">{isAbsence(a) ? 'AUSÊNCIA' : `${dailyLoad(a)}h/d`}</span>
                            </div>
                            {estEndPos !== undefined && (
                              <div className="absolute top-0.5 -translate-x-1/2 text-[11px] text-idg-navy" style={{ left: estEndPos }}>
                                ◆
                              </div>
                            )}
                          </div>
                          <div className="w-[110px] shrink-0 px-2 text-[10px] text-slate-500">até {fmtBR(a.terminoReal ?? a.estTermino) || '—'}</div>
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
