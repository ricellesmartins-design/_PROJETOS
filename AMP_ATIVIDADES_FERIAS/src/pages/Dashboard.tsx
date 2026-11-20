import { AlarmClock, CalendarClock, CheckCircle2, ClipboardList, Flame, PlayCircle } from 'lucide-react';
import { useDb, useSession, collaboratorName } from '../lib/store';
import { addDays, diffDays, fmtBR, monthKey, todayISO } from '../lib/dates';
import { dailyLoad, executionWindow, isClosed, isLate, isRunningToday } from '../services/activities';
import { visibleActivities, visibleCollaborators, visibleVacations } from '../services/views';
import { Badge, Card, Empty, Stat, StatusBadge } from '../components/ui';
import type { Activity } from '../types';

export default function Dashboard() {
  const db = useDb();
  const { user } = useSession();
  const today = todayISO();
  const acts = visibleActivities(user);
  const open = acts.filter((a) => !isClosed(a));
  const running = acts.filter((a) => isRunningToday(a, today));
  const late = open.filter((a) => isLate(a, today));
  const doneMonth = acts.filter((a) => a.status === 'Finalizado' && a.terminoReal && monthKey(a.terminoReal) === monthKey(today));
  const vac = visibleVacations(user);
  const pending = vac.filter((v) => v.status === 'Pendente' || v.status === 'Cancelamento Solicitado');
  const collabs = visibleCollaborators(user);
  const settings = db.settings;

  const loadToday = collabs.map((c) => {
    const list = running.filter((a) => a.collaboratorId === c.id);
    return { c, list, h: list.reduce((s, a) => s + dailyLoad(a), 0) };
  });
  const overloaded = loadToday.filter((x) => x.h > settings.limiteDia);
  const upcoming = vac
    .filter((v) => v.status === 'Aprovada')
    .flatMap((v) => v.periodos.map((p) => ({ v, p })))
    .filter(({ p }) => p.fim >= today && p.inicio <= addDays(today, 90))
    .sort((a, b) => a.p.inicio.localeCompare(b.p.inicio));

  const Row = ({ a }: { a: Activity }) => {
    const w = executionWindow(a, today);
    return (
      <li className="flex items-start justify-between gap-3 border-b border-slate-100 py-2 last:border-0">
        <div className="min-w-0">
          <div className="truncate text-sm font-medium">
            <span className="font-mono text-xs text-slate-500">{a.codigo}</span> · {a.descricao}
          </div>
          <div className="text-xs text-slate-500">
            {user.role !== 'colaborador' && <>{collaboratorName(a.collaboratorId)} · </>}
            {a.area} · prev. término {fmtBR(a.estTermino) || '—'}
            {a.estTermino && a.estTermino < today && !isClosed(a) && <b className="text-red-600"> ({diffDays(a.estTermino, today)} dias de atraso)</b>}
          </div>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <StatusBadge status={a.status} />
          {w && <span className="text-xs text-slate-400">{dailyLoad(a)} h/dia</span>}
        </div>
      </li>
    );
  };

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Stat label="Em aberto" value={open.length} icon={<ClipboardList className="h-5 w-5" />} />
        <Stat label="Em execução hoje" value={running.length} tone="blue" icon={<PlayCircle className="h-5 w-5" />} />
        <Stat label="Atrasadas" value={late.length} tone={late.length ? 'red' : 'green'} icon={<AlarmClock className="h-5 w-5" />} />
        <Stat label="Finalizadas no mês" value={doneMonth.length} tone="green" icon={<CheckCircle2 className="h-5 w-5" />} />
        <Stat label={`Sobrecarga hoje (> ${settings.limiteDia} h)`} value={overloaded.length} tone={overloaded.length ? 'amber' : 'green'} icon={<Flame className="h-5 w-5" />} />
        {user.role !== 'cliente' && <Stat label="Férias aguardando decisão" value={pending.length} tone={pending.length ? 'amber' : 'default'} icon={<CalendarClock className="h-5 w-5" />} />}
      </div>

      <div className="grid gap-5 xl:grid-cols-2">
        <Card title={`Atrasadas (${late.length})`} actions={<a className="text-xs text-idg-blue hover:underline" href="#/atividades?filtro=atrasadas">ver todas</a>}>
          {late.length ? <ul>{late.slice(0, 8).map((a) => <Row key={a.id} a={a} />)}</ul> : <Empty>Nenhuma atividade atrasada. 👏</Empty>}
        </Card>
        <Card title={`Em execução hoje (${running.length})`} actions={<a className="text-xs text-idg-blue hover:underline" href="#/mapa">mapa de carga</a>}>
          {running.length ? <ul>{running.slice(0, 8).map((a) => <Row key={a.id} a={a} />)}</ul> : <Empty>Nada em execução hoje.</Empty>}
        </Card>
      </div>

      <div className="grid gap-5 xl:grid-cols-2">
        <Card title="Carga de hoje por colaborador">
          {loadToday.length ? (
            <ul className="space-y-2">
              {loadToday.map(({ c, list, h }) => (
                <li key={c.id}>
                  <div className="flex justify-between text-sm">
                    <span className="font-medium">{c.nome}</span>
                    <span className={h > settings.limiteDia ? 'font-bold text-red-600' : h === 0 ? 'text-slate-400' : ''}>
                      {h.toFixed(1)} h · {list.length} ativ.{list.length >= 2 && <Badge color="purple" className="ml-1">paralelo</Badge>}
                      {h === 0 && <Badge className="ml-1">ocioso</Badge>}
                    </span>
                  </div>
                  <div className="mt-1 h-2 overflow-hidden rounded bg-slate-100">
                    <div className={`h-full ${h > settings.limiteDia ? 'bg-red-500' : h >= 6 ? 'bg-emerald-500' : 'bg-amber-400'}`} style={{ width: `${Math.min(100, (h / (settings.limiteDia * 1.5)) * 100)}%` }} />
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <Empty>Sem colaboradores.</Empty>
          )}
        </Card>
        {user.role !== 'cliente' && (
          <Card title="Próximas férias aprovadas (90 dias)" actions={<a className="text-xs text-idg-blue hover:underline" href="#/ferias">férias</a>}>
            {upcoming.length ? (
              <ul className="divide-y">
                {upcoming.map(({ v, p }) => (
                  <li key={v.id + p.inicio} className="flex justify-between py-2 text-sm">
                    <span>{collaboratorName(v.collaboratorId)}</span>
                    <span className="text-slate-600">
                      {fmtBR(p.inicio)} a {fmtBR(p.fim)} ({p.dias} dias)
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <Empty>Nenhuma férias aprovada nos próximos 90 dias.</Empty>
            )}
          </Card>
        )}
      </div>
    </div>
  );
}
