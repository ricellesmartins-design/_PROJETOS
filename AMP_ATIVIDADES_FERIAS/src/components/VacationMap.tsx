// Mapa anual de férias da equipe (uma linha por colaborador, colunas = dias do ano).
import { Fragment } from 'react';
import { db } from '../lib/db';
import { MONTHS_ABBR, addDays, findHoliday, isWeekend, todayISO } from '../lib/dates';
import type { Collaborator, VacationRequest } from '../types';
import { cx } from './ui';

const COLOR: Record<string, string> = {
  Aprovada: 'bg-emerald-500',
  Pendente: 'bg-amber-400',
  'Ajuste Solicitado': 'bg-orange-400',
  'Cancelamento Solicitado': 'bg-violet-400',
};

export default function VacationMap({ year, collaborators, vacations }: { year: number; collaborators: Collaborator[]; vacations: VacationRequest[] }) {
  const days: string[] = [];
  for (let d = `${year}-01-01`; d <= `${year}-12-31`; d = addDays(d, 1)) days.push(d);
  const today = todayISO();
  const extras = db.settings.feriadosExtras;
  const active = vacations.filter((v) => COLOR[v.status]);
  const W = 4;
  return (
    <div className="overflow-x-auto">
      <div className="inline-block min-w-full">
        <div className="flex">
          <div className="sticky left-0 z-10 w-48 shrink-0 bg-white" />
          {MONTHS_ABBR.map((m, i) => {
            const n = days.filter((d) => Number(d.slice(5, 7)) === i + 1).length;
            return (
              <div key={m} style={{ width: n * W }} className="shrink-0 border-l border-slate-200 text-center text-[10px] font-semibold text-slate-500">
                {m}
              </div>
            );
          })}
        </div>
        {collaborators.map((c) => {
          const mine = active.filter((v) => v.collaboratorId === c.id);
          return (
            <div key={c.id} className="flex items-center border-t border-slate-100">
              <div className="sticky left-0 z-10 w-48 shrink-0 truncate bg-white py-1 pr-2 text-xs" title={c.nome}>
                {c.nome}
              </div>
              <div className="relative flex h-5">
                {days.map((d) => {
                  const v = mine.find((x) => x.periodos.some((p) => p.inicio <= d && p.fim >= d));
                  return (
                    <Fragment key={d}>
                      <div
                        style={{ width: W }}
                        title={v ? `${c.nome} · ${v.status} · ${d.split('-').reverse().join('/')}` : undefined}
                        className={cx(
                          'h-5 shrink-0',
                          v ? COLOR[v.status] : isWeekend(d) || findHoliday(d, extras) ? 'bg-slate-100' : '',
                          d.slice(8) === '01' && 'border-l border-slate-200',
                          d === today && 'bg-red-500',
                        )}
                      />
                    </Fragment>
                  );
                })}
              </div>
            </div>
          );
        })}
        <div className="mt-2 flex flex-wrap gap-3 text-xs text-slate-600">
          {Object.entries(COLOR).map(([k, c]) => (
            <span key={k} className="inline-flex items-center gap-1">
              <span className={cx('inline-block h-3 w-3 rounded-sm', c)} /> {k}
            </span>
          ))}
          <span className="inline-flex items-center gap-1">
            <span className="inline-block h-3 w-1 bg-red-500" /> Hoje
          </span>
        </div>
      </div>
    </div>
  );
}
