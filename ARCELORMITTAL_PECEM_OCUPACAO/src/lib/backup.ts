// Backup completo do sistema (JSON e Excel) e zerar o sistema. Uso exclusivo do coordenador.
import ExcelJS from 'exceljs';
import { db } from './db';
import { supabase, errMsg } from './supabase';
import { download, XLSX_MIME } from '../excel/common';

const stamp = () => new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 16).replace('T', '_').replace(':', 'h');

export function backupDump() {
  return {
    geradoEm: new Date().toISOString(),
    sistema: 'Gestão de Atividades e Férias · Contrato AMP',
    settings: db.settings,
    collaborators: db.all('collaborators'),
    costCenters: db.all('costCenters'),
    activities: db.all('activities'),
    dateChangeLogs: db.all('dateChangeLogs'),
    vacations: db.all('vacations'),
    hrImports: db.all('hrImports'),
    profiles: db.all('profiles'),
  };
}

export function downloadBackupJson(prefix = 'backup_amp') {
  download(new Blob([JSON.stringify(backupDump(), null, 2)], { type: 'application/json' }), `${prefix}_${stamp()}.json`);
}

const cell = (v: unknown): ExcelJS.CellValue => {
  if (v == null) return null;
  if (typeof v === 'number' || typeof v === 'boolean') return v;
  if (typeof v === 'object') return JSON.stringify(v);
  const s = String(v);
  return s.length > 32000 ? s.slice(0, 32000) + '…' : s;
};

function addSheet(wb: ExcelJS.Workbook, name: string, rows: Record<string, unknown>[], omit: string[] = []) {
  const ws = wb.addWorksheet(name, { views: [{ state: 'frozen', ySplit: 1 }] });
  const cols = [...new Set(rows.flatMap((r) => Object.keys(r)))].filter((c) => !omit.includes(c));
  if (!cols.length) {
    ws.getCell('A1').value = 'Sem registros';
    return;
  }
  ws.columns = cols.map((c) => ({ header: c, key: c, width: Math.min(60, Math.max(12, c.length + 2)) }));
  rows.forEach((r) => ws.addRow(Object.fromEntries(cols.map((c) => [c, cell(r[c])]))));
  const h = ws.getRow(1);
  h.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  h.eachCell((c) => (c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F3864' } }));
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: cols.length } };
}

export async function buildBackupExcel(): Promise<Blob> {
  const d = backupDump();
  const wb = new ExcelJS.Workbook();
  wb.creator = 'IDG Engenharia';
  const nome = (id: string) => d.collaborators.find((c) => c.id === id)?.nome ?? '';

  const resumo = wb.addWorksheet('Resumo');
  resumo.columns = [{ width: 34 }, { width: 18 }];
  resumo.addRows([
    ['Backup completo', d.sistema],
    ['Gerado em', new Date(d.geradoEm).toLocaleString('pt-BR', { timeZone: 'America/Fortaleza' })],
    [],
    ['Tabela', 'Registros'],
    ['Atividades (serviços)', d.activities.length],
    ['Alterações de data (justificativas)', d.dateChangeLogs.length],
    ['Solicitações de férias', d.vacations.length],
    ['Colaboradores', d.collaborators.length],
    ['Centros de custo', d.costCenters.length],
    ['Usuários', d.profiles.length],
    ['Importações do RH', d.hrImports.length],
  ]);
  resumo.getRow(1).font = { bold: true, size: 14 };
  resumo.getRow(4).font = { bold: true };

  addSheet(wb, 'Atividades', d.activities.map((a) => ({ colaborador: nome(a.collaboratorId), ...a })) as Record<string, unknown>[]);
  addSheet(wb, 'Alterações de data', d.dateChangeLogs as unknown as Record<string, unknown>[]);
  addSheet(wb, 'Férias', d.vacations.map((v) => ({ colaborador: nome(v.collaboratorId), ...v })) as Record<string, unknown>[], ['historico']);
  addSheet(
    wb,
    'Férias - períodos',
    d.vacations.flatMap((v) => v.periodos.map((p, i) => ({ solicitacao: v.id, colaborador: nome(v.collaboratorId), status: v.status, periodo: i + 1, ...p }))) as Record<string, unknown>[],
  );
  addSheet(
    wb,
    'Férias - histórico',
    d.vacations.flatMap((v) => (v.historico ?? []).map((e) => ({ solicitacao: v.id, colaborador: nome(v.collaboratorId), ...e }))) as Record<string, unknown>[],
  );
  addSheet(wb, 'Colaboradores', d.collaborators as unknown as Record<string, unknown>[]);
  addSheet(wb, 'Centros de custo', d.costCenters as unknown as Record<string, unknown>[]);
  addSheet(wb, 'Usuários', d.profiles as unknown as Record<string, unknown>[]);
  addSheet(wb, 'Importações RH', d.hrImports as unknown as Record<string, unknown>[]);
  addSheet(
    wb,
    'Configurações',
    Object.entries(d.settings)
      .filter(([k]) => !/DataUrl$/.test(k))
      .map(([chave, valor]) => ({ chave, valor })),
  );
  const buf = await wb.xlsx.writeBuffer();
  return new Blob([buf], { type: XLSX_MIME });
}

export async function downloadBackupExcel(prefix = 'backup_amp') {
  download(await buildBackupExcel(), `${prefix}_${stamp()}.xlsx`);
}

export type ResetScope = 'movimento' | 'tudo';

/** Baixa o backup completo (JSON + Excel) e depois apaga os dados no servidor. */
export async function resetSystem(scope: ResetScope) {
  downloadBackupJson('backup_antes_de_zerar');
  await downloadBackupExcel('backup_antes_de_zerar');
  const { data, error } = await supabase.rpc('reset_system', { p_scope: scope, p_confirm: 'ZERAR' });
  if (error) throw new Error(errMsg(error));
  for (const t of ['activities', 'dateChangeLogs', 'vacations', 'hrImports', 'collaborators', 'costCenters', 'profiles'] as const) await db.refresh(t);
  return data as Record<string, number>;
}
