import { useState } from 'react';
import { Download, Save, Upload } from 'lucide-react';
import ExcelJS from 'exceljs';
import { useDb, useSession } from '../lib/store';
import { fmtBR, fmtDateTimeBR, toDate } from '../lib/dates';
import { parseHrFile, reconcile, saveHrImport, type ReconRow, type ReconStatus } from '../services/hr';
import { download, XLSX_MIME } from '../excel/common';
import type { HrRow } from '../types';
import { Alert, Button, Card, Empty, Stat, StatusBadge, useAction } from '../components/ui';

const ALL: ReconStatus[] = ['Conciliado (OK)', 'Divergência de Datas', 'Ausente no RH', 'Ausente no Sistema'];

async function downloadTemplate() {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Férias RH');
  ws.columns = [
    { header: 'Matrícula', key: 'm', width: 14 },
    { header: 'Nome', key: 'n', width: 40 },
    { header: 'Início', key: 'i', width: 14, style: { numFmt: 'dd/mm/yyyy' } },
    { header: 'Fim', key: 'f', width: 14, style: { numFmt: 'dd/mm/yyyy' } },
  ];
  ws.getRow(1).font = { bold: true };
  ws.addRow({ m: '000000', n: 'NOME DO COLABORADOR', i: toDate('2027-01-04'), f: toDate('2027-02-02') });
  const buf = await wb.xlsx.writeBuffer();
  download(new Blob([buf], { type: XLSX_MIME }), 'modelo_conciliacao_ferias_RH.xlsx');
}

async function exportRecon(rows: ReconRow[]) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Conciliação');
  ws.columns = [
    { header: 'Status', key: 's', width: 22 },
    { header: 'Colaborador', key: 'n', width: 38 },
    { header: 'Matrícula', key: 'm', width: 12 },
    { header: 'Início (Sistema)', key: 'si', width: 15 },
    { header: 'Fim (Sistema)', key: 'sf', width: 15 },
    { header: 'Início (RH)', key: 'ri', width: 15 },
    { header: 'Fim (RH)', key: 'rf', width: 15 },
    { header: 'Detalhe', key: 'd', width: 60 },
  ];
  ws.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1B2A5C' } };
  const fill: Record<ReconStatus, string> = { 'Conciliado (OK)': 'FFC6EFCE', 'Divergência de Datas': 'FFFFEB9C', 'Ausente no RH': 'FFFFC7CE', 'Ausente no Sistema': 'FFFCE4D6' };
  for (const r of rows) {
    const row = ws.addRow({ s: r.status, n: r.nome, m: r.matricula, si: fmtBR(r.sistema?.inicio), sf: fmtBR(r.sistema?.fim), ri: fmtBR(r.rh?.inicio), rf: fmtBR(r.rh?.fim), d: r.detalhe });
    row.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: fill[r.status] } };
  }
  ws.autoFilter = 'A1:H1';
  const buf = await wb.xlsx.writeBuffer();
  download(new Blob([buf], { type: XLSX_MIME }), `conciliacao_ferias_${new Date().toISOString().slice(0, 10)}.xlsx`);
}

export default function HrRecon() {
  const db = useDb();
  const { user } = useSession();
  const { busy, run } = useAction();
  const [file, setFile] = useState<{ name: string; rows: HrRow[] }>();
  const [filter, setFilter] = useState<ReconStatus | ''>('');
  const imports = [...db.all('hrImports')].sort((a, b) => b.importadoEm.localeCompare(a.importadoEm));
  const rows = file ? reconcile(file.rows) : undefined;
  const count = (s: ReconStatus) => rows?.filter((r) => r.status === s).length ?? 0;
  const shown = rows?.filter((r) => !filter || r.status === filter) ?? [];

  const onFile = (f?: File) =>
    f &&
    run(async () => {
      const linhas = await parseHrFile(f);
      setFile({ name: f.name, rows: linhas });
    }, 'Planilha do RH lida.');

  return (
    <div className="space-y-5">
      <Card
        title="Conciliação de férias com a planilha do RH"
        actions={
          <Button variant="secondary" size="sm" icon={<Download className="h-4 w-4" />} onClick={() => downloadTemplate()}>
            Modelo de planilha
          </Button>
        }
      >
        <div className="space-y-3">
          <p className="text-sm text-slate-600">
            Envie a planilha de férias do RH (.xlsx ou .csv) com colunas de <b>Matrícula</b> e/ou <b>Nome</b>, <b>Início</b> e <b>Fim</b> (aceita também <i>Retorno</i> ou <i>Dias</i>). O sistema compara com as férias aprovadas.
          </p>
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-md bg-idg-blue px-3.5 py-2 text-sm font-medium text-white hover:bg-idg-navy">
            <Upload className="h-4 w-4" /> Selecionar planilha do RH
            <input type="file" accept=".xlsx,.xlsm,.csv" className="hidden" onChange={(e) => onFile(e.target.files?.[0] ?? undefined)} />
          </label>
          {file && <div className="text-sm text-slate-600">Arquivo: <b>{file.name}</b> · {file.rows.length} linha(s) de férias</div>}
        </div>
      </Card>

      {rows && (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat label="Conciliado (OK)" value={count('Conciliado (OK)')} tone="green" />
            <Stat label="Divergência de Datas" value={count('Divergência de Datas')} tone="amber" />
            <Stat label="Ausente no RH" value={count('Ausente no RH')} tone="red" />
            <Stat label="Ausente no Sistema" value={count('Ausente no Sistema')} tone="red" />
          </div>
          <Card
            title="Resultado"
            bodyClass="p-0"
            actions={
              <>
                <select className="input w-52" value={filter} onChange={(e) => setFilter(e.target.value as ReconStatus | '')}>
                  <option value="">Todos os status</option>
                  {ALL.map((s) => (
                    <option key={s}>{s}</option>
                  ))}
                </select>
                <Button size="sm" variant="secondary" icon={<Download className="h-4 w-4" />} onClick={() => run(() => exportRecon(rows))}>
                  Exportar
                </Button>
                <Button size="sm" icon={<Save className="h-4 w-4" />} loading={busy} onClick={() => run(() => saveHrImport(file!.name, file!.rows, user), 'Importação registrada no histórico.')}>
                  Registrar importação
                </Button>
              </>
            }
          >
            {!shown.length ? (
              <div className="p-4">
                <Empty>Nada para mostrar.</Empty>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr>
                      <th className="th">Status</th>
                      <th className="th">Colaborador</th>
                      <th className="th">Sistema</th>
                      <th className="th">RH</th>
                      <th className="th">Detalhe</th>
                    </tr>
                  </thead>
                  <tbody>
                    {shown.map((r, i) => (
                      <tr key={i} className="hover:bg-slate-50">
                        <td className="td">
                          <StatusBadge status={r.status} />
                        </td>
                        <td className="td">
                          <div className="font-medium">{r.nome}</div>
                          <div className="text-xs text-slate-500">{r.matricula}</div>
                        </td>
                        <td className="td whitespace-nowrap">{r.sistema ? `${fmtBR(r.sistema.inicio)} a ${fmtBR(r.sistema.fim)}` : '—'}</td>
                        <td className="td whitespace-nowrap">{r.rh ? `${fmtBR(r.rh.inicio)} a ${fmtBR(r.rh.fim)}` : '—'}</td>
                        <td className="td text-xs">{r.detalhe}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </>
      )}

      <Card title="Histórico de importações do RH">
        {!imports.length ? (
          <Empty>Nenhuma importação registrada.</Empty>
        ) : (
          <ul className="divide-y text-sm">
            {imports.map((h) => (
              <li key={h.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span>
                  <b>{h.arquivo}</b> · {h.linhas.length} linhas · {fmtDateTimeBR(h.importadoEm)} · {h.importadoPor}
                </span>
                <Button size="sm" variant="secondary" onClick={() => setFile({ name: h.arquivo, rows: h.linhas })}>
                  Reconciliar novamente
                </Button>
              </li>
            ))}
          </ul>
        )}
        <Alert kind="info" className="mt-3">
          A conciliação considera as férias com status Aprovada (e com cancelamento em análise). Pendentes não entram na comparação.
        </Alert>
      </Card>
    </div>
  );
}
