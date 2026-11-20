// Central de exportação: filtros completos + escolha do formato (SE-PL-0510 oficial e/ou alocação mensal).
import { useState, type ReactNode } from 'react';
import { Download } from 'lucide-react';
import { useDb, useSession } from '../lib/store';
import { addMonths, monthLabel, todayISO } from '../lib/dates';
import { visibleActivities, visibleCollaborators } from '../services/views';
import { applyExportFilter, monthsBetween, type ExportFilter } from '../services/exportFilters';
import JSZip from 'jszip';
import { buildActivitiesWorkbook, planSheets } from '../excel/exportActivities';
import { buildAllocationWorkbook } from '../excel/exportAllocation';
import { download, safeFileName } from '../excel/common';
import { ACTIVITY_STATUSES, type ActivityStatus } from '../types';
import { Alert, Button, Modal, cx, useAction } from './ui';

type Layout = 'mes' | 'periodo';

// Nenhum item marcado = sem filtro (todos entram). "marcar todos" marca a lista inteira; "limpar" desmarca.
function MultiPick({ label, options, value, onChange, render }: { label: string; options: string[]; value: string[]; onChange: (v: string[]) => void; render?: (v: string) => ReactNode }) {
  const allMarked = options.length > 0 && options.every((o) => value.includes(o));
  return (
    <div>
      <div className="mb-1 flex items-center justify-between gap-2">
        <span className="label mb-0">{label}</span>
        <span className="flex gap-2 text-xs">
          {!allMarked && options.length > 0 && (
            <button type="button" className="text-idg-blue hover:underline" onClick={() => onChange([...options])}>
              marcar todos
            </button>
          )}
          {value.length > 0 && (
            <button type="button" className="text-idg-blue hover:underline" onClick={() => onChange([])}>
              limpar ({value.length})
            </button>
          )}
        </span>
      </div>
      {!value.length && <div className="mb-1 text-[11px] text-slate-400">Nenhum marcado = todos</div>}
      <div className="max-h-36 space-y-0.5 overflow-y-auto rounded border border-slate-200 p-1.5">
        {options.map((o) => (
          <label key={o} className={cx('flex items-center gap-2 rounded px-1 text-xs', value.includes(o) && 'bg-blue-50')}>
            <input type="checkbox" checked={value.includes(o)} onChange={() => onChange(value.includes(o) ? value.filter((x) => x !== o) : [...value, o])} />
            <span className="truncate">{render ? render(o) : o}</span>
          </label>
        ))}
        {!options.length && <div className="text-xs text-slate-400">—</div>}
      </div>
    </div>
  );
}

export default function ExportDialog({ onClose, initial }: { onClose: () => void; initial?: Partial<ExportFilter> }) {
  const db = useDb();
  const { user } = useSession();
  const { busy, run } = useAction();
  const cur = todayISO().slice(0, 7);
  const [f, setF] = useState<ExportFilter>({
    from: initial?.from ?? cur,
    to: initial?.to ?? initial?.from ?? cur,
    collabs: initial?.collabs ?? [],
    status: initial?.status ?? [],
    areas: initial?.areas ?? [],
    ccs: initial?.ccs ?? [],
    solicitantes: initial?.solicitantes ?? [],
    situacao: initial?.situacao ?? '',
  });
  const [layout, setLayout] = useState<Layout>('mes');
  const [formatoSE, setFormatoSE] = useState(true);
  const [formatoAloc, setFormatoAloc] = useState(false);
  const [porColab, setPorColab] = useState(false);

  const all = visibleActivities(user);
  const collabs = visibleCollaborators(user);
  const nome = (id: string) => collabs.find((c) => c.id === id)?.nome ?? id;
  const uniq = (xs: string[]) => [...new Set(xs.filter(Boolean))].sort();
  const rescheduled = new Set(db.all('dateChangeLogs').map((l) => l.activityId));
  const list = applyExportFilter(all, f, rescheduled);
  const months = monthsBetween(f.from, f.to);
  const selCollabs = collabs.filter((c) => (!f.collabs.length || f.collabs.includes(c.id)) && list.some((a) => a.collaboratorId === c.id));
  const sheets = planSheets(selCollabs, list, layout === 'mes' ? months : []);
  const set = <K extends keyof ExportFilter>(k: K, v: ExportFilter[K]) => setF((x) => ({ ...x, [k]: v }));

  const filtroTexto = [
    `Período ${monthLabel(f.from)} a ${monthLabel(f.to)}`,
    f.collabs.length ? `Colaboradores: ${f.collabs.map(nome).join(', ')}` : 'Todos os colaboradores',
    f.status.length && `Status: ${f.status.join(', ')}`,
    f.areas.length && `Áreas: ${f.areas.join(', ')}`,
    f.ccs.length && `Centros de custo: ${f.ccs.join(', ')}`,
    f.solicitantes.length && `Solicitantes: ${f.solicitantes.join(', ')}`,
    f.situacao && `Situação: ${f.situacao}`,
  ]
    .filter(Boolean)
    .join(' · ');

  const presets: [string, () => void][] = [
    ['Mês atual', () => setF((x) => ({ ...x, from: cur, to: cur }))],
    ['Mês anterior', () => setF((x) => ({ ...x, from: addMonths(cur, -1), to: addMonths(cur, -1) }))],
    ['Últimos 3 meses', () => setF((x) => ({ ...x, from: addMonths(cur, -2), to: cur }))],
    ['Ano atual', () => setF((x) => ({ ...x, from: `${cur.slice(0, 4)}-01`, to: `${cur.slice(0, 4)}-12` }))],
  ];

  const generate = () =>
    run(async () => {
      const groups = porColab ? selCollabs.map((c) => [c]) : [selCollabs];
      const periodo = f.from === f.to ? f.from : `${f.from}_a_${f.to}`;
      const files: { name: string; blob: Blob }[] = [];
      for (const g of groups) {
        const acts = list.filter((a) => g.some((c) => c.id === a.collaboratorId));
        const hint = safeFileName(`${g.length === 1 ? g[0].nome : 'EQUIPE_AMP'}_${periodo}`);
        if (formatoSE) files.push({ name: `SE-PL-0510-CD001-R0 RELATORIO DE ATIVIDADES_${hint}.xlsx`, blob: await buildActivitiesWorkbook(planSheets(g, acts, layout === 'mes' ? months : [])) });
        if (formatoAloc) files.push({ name: `Alocacao_Mensal_AMP_${hint}.xlsx`, blob: await buildAllocationWorkbook({ collaborators: g, activities: acts, months, filtroTexto }) });
      }
      // Um arquivo baixa direto; vários vão juntos num .zip (o navegador bloqueia downloads múltiplos).
      if (files.length === 1) download(files[0].blob, files[0].name);
      else {
        const zip = new JSZip();
        files.forEach((x) => zip.file(x.name, x.blob));
        download(await zip.generateAsync({ type: 'blob' }), `Relatorios_AMP_${safeFileName(periodo)}.zip`);
      }
      onClose();
    }, 'Exportação concluída.');

  return (
    <Modal
      open
      size="xl"
      onClose={onClose}
      title="Exportar relatórios em Excel"
      footer={
        <>
          <span className="mr-auto self-center text-xs text-slate-500">
            {list.length} atividade(s) · {selCollabs.length} colaborador(es) · {months.length} mês(es)
          </span>
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button icon={<Download className="h-4 w-4" />} loading={busy} disabled={!list.length || (!formatoSE && !formatoAloc)} onClick={generate}>
            Gerar Excel
          </Button>
        </>
      }
    >
      <div className="space-y-4 text-sm">
        <div className="flex flex-wrap items-end gap-3">
          <label>
            <span className="label">De</span>
            <input type="month" className="input" value={f.from} onChange={(e) => set('from', e.target.value)} />
          </label>
          <label>
            <span className="label">Até</span>
            <input type="month" className="input" value={f.to} onChange={(e) => set('to', e.target.value)} />
          </label>
          <div className="flex flex-wrap gap-1">
            {presets.map(([l, fn]) => (
              <Button key={l} size="sm" variant="secondary" onClick={fn}>
                {l}
              </Button>
            ))}
          </div>
          <label>
            <span className="label">Situação</span>
            <select className="input" value={f.situacao} onChange={(e) => set('situacao', e.target.value as ExportFilter['situacao'])}>
              <option value="">Todas</option>
              <option value="abertas">Em aberto</option>
              <option value="atrasadas">Atrasadas</option>
              <option value="finalizadas">Finalizadas</option>
              <option value="reprogramadas">Com data alterada (justificadas)</option>
            </select>
          </label>
        </div>
        {f.from > f.to && <Alert kind="error">O mês inicial é posterior ao final.</Alert>}

        <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-5">
          {user.role !== 'colaborador' && <MultiPick label="Colaboradores" options={collabs.map((c) => c.id)} value={f.collabs} onChange={(v) => set('collabs', v)} render={nome} />}
          <MultiPick label="Status" options={[...ACTIVITY_STATUSES]} value={f.status} onChange={(v) => set('status', v as ActivityStatus[])} />
          <MultiPick label="Área da usina" options={uniq(all.map((a) => a.area))} value={f.areas} onChange={(v) => set('areas', v)} />
          <MultiPick label="Centro de custo" options={uniq(all.map((a) => a.centroCusto))} value={f.ccs} onChange={(v) => set('ccs', v)} />
          <MultiPick label="Solicitante" options={uniq(all.map((a) => a.solicitante))} value={f.solicitantes} onChange={(v) => set('solicitantes', v)} />
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <div className="rounded-lg border border-slate-200 p-3">
            <label className="flex items-start gap-2 font-medium">
              <input type="checkbox" className="mt-1" checked={formatoSE} onChange={(e) => setFormatoSE(e.target.checked)} />
              <span>Relatório oficial SE-PL-0510-CD001-R0</span>
            </label>
            {formatoSE && (
              <div className="mt-2 space-y-1 pl-6 text-xs">
                <label className="flex items-center gap-2">
                  <input type="radio" checked={layout === 'mes'} onChange={() => setLayout('mes')} /> Uma aba por colaborador e por mês ({sheets.length} aba{sheets.length === 1 ? '' : 's'})
                </label>
                <label className="flex items-center gap-2">
                  <input type="radio" checked={layout === 'periodo'} onChange={() => setLayout('periodo')} /> Uma aba por colaborador com o período inteiro
                </label>
              </div>
            )}
          </div>
          <div className="rounded-lg border border-slate-200 p-3">
            <label className="flex items-start gap-2 font-medium">
              <input type="checkbox" className="mt-1" checked={formatoAloc} onChange={(e) => setFormatoAloc(e.target.checked)} />
              <span>
                Justificativa de alocação mensal (opcional)
                <span className="block text-xs font-normal text-slate-500">Arquivo separado com horas por mês, ocupação e justificativas de data.</span>
              </span>
            </label>
          </div>
        </div>
        {user.role !== 'colaborador' && (
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={porColab} onChange={(e) => setPorColab(e.target.checked)} /> Gerar um arquivo separado por colaborador ({selCollabs.length} arquivo{selCollabs.length === 1 ? '' : 's'}, entregues num .zip)
          </label>
        )}
        {!list.length && <Alert kind="warning">Nenhuma atividade com esses filtros no período.</Alert>}
      </div>
    </Modal>
  );
}
