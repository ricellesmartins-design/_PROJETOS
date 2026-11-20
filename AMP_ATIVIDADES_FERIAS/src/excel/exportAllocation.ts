// Relatório mensal de alocação (justificativa das horas por colaborador e mês) via exceljs.
import ExcelJS from 'exceljs';
import { db } from '../lib/db';
import { fmtBR, fmtDateTimeBR, monthEnd, monthLabel, monthStart, todayISO } from '../lib/dates';
import { computeEstHours, computeRealHours, isLate } from '../services/activities';
import { monthHours, touchesMonth, vacationWorkDays, workDays } from '../services/exportFilters';
import { DATE_FIELD_LABEL, type Activity, type Collaborator } from '../types';
import { download, logoSource, safeFileName, toPng, XLSX_MIME } from './common';

const NAVY = 'FF1B2A5C';
const thin = { style: 'thin' as const, color: { argb: 'FFBFBFBF' } };
const border = { top: thin, left: thin, bottom: thin, right: thin };
const r1 = (n: number) => Math.round(n * 10) / 10;

function header(ws: ExcelJS.Worksheet, row: number) {
  const r = ws.getRow(row);
  r.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  r.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
  r.height = 32;
  r.eachCell((c) => {
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: NAVY } };
    c.border = border;
  });
}

async function title(wb: ExcelJS.Workbook, ws: ExcelJS.Worksheet, text: string, sub: string, lastCol: string) {
  ws.mergeCells(`A1:${lastCol}1`);
  ws.getCell('A1').value = text;
  ws.getCell('A1').font = { bold: true, size: 14, color: { argb: NAVY } };
  ws.mergeCells(`A2:${lastCol}2`);
  ws.getCell('A2').value = sub;
  ws.getCell('A2').font = { italic: true, size: 10, color: { argb: 'FF555555' } };
  ws.getRow(1).height = 40;
  try {
    const png = await toPng(logoSource());
    const id = wb.addImage({ buffer: png.bytes as unknown as ExcelJS.Buffer, extension: 'png' });
    const h = 46;
    ws.addImage(id, { tl: { col: ws.columnCount - 2, row: 0.1 }, ext: { width: (png.width / png.height) * h, height: h } });
  } catch {
    /* sem logo */
  }
}

export interface AllocationInput {
  collaborators: Collaborator[];
  activities: Activity[];
  months: string[];
  filtroTexto: string;
}

export async function buildAllocationWorkbook({ collaborators, activities, months, filtroTexto }: AllocationInput): Promise<Blob> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'IDG Engenharia · Contrato AMP';
  const today = todayISO();
  const hpd = db.settings.limiteDia || 8;
  const logs = db.all('dateChangeLogs');
  const logsOf = (id: string, key?: string) =>
    logs.filter((l) => l.activityId === id && (!key || (l.dataHora.slice(0, 10) >= monthStart(key) && l.dataHora.slice(0, 10) <= monthEnd(key))));
  const sub = `Gerado em ${fmtDateTimeBR(new Date().toISOString())} · ${filtroTexto}`;

  // Resumo colaborador × mês ---------------------------------------------------------------
  const res = wb.addWorksheet('Resumo de alocação');
  res.columns = [
    { key: 'm', width: 16 },
    { key: 'c', width: 38 },
    { key: 'mat', width: 11 },
    { key: 'du', width: 10 },
    { key: 'fe', width: 10 },
    { key: 'cap', width: 13 },
    { key: 'n', width: 11 },
    { key: 'est', width: 14 },
    { key: 'real', width: 14 },
    { key: 'oc', width: 13 },
    { key: 'at', width: 10 },
    { key: 'rp', width: 13 },
    { key: 'sit', width: 22 },
  ];
  await title(wb, res, 'RESUMO MENSAL DE ALOCAÇÃO · CONTRATO AMP', sub, 'M');
  res.addRow([]);
  res.addRow(['Mês', 'Colaborador', 'Matrícula', 'Dias úteis', 'Dias de férias', 'Capacidade (h)', 'Atividades', 'Horas estimadas no mês', 'Horas realizadas no mês', 'Ocupação (estimado)', 'Atrasadas', 'Datas alteradas', 'Situação']);
  header(res, 4);
  for (const m of months) {
    const du = workDays(monthStart(m), monthEnd(m)).length;
    for (const c of collaborators) {
      const acts = activities.filter((a) => a.collaboratorId === c.id && touchesMonth(a, m, today));
      if (!acts.length) continue;
      const fe = vacationWorkDays(c.id, m);
      const cap = (du - fe) * hpd;
      const est = acts.reduce((s, a) => s + monthHours(a, m).est, 0);
      const real = acts.reduce((s, a) => s + monthHours(a, m).real, 0);
      const oc = cap ? est / cap : 0;
      const row = res.addRow({
        m: monthLabel(m),
        c: c.nome,
        mat: c.matricula,
        du,
        fe,
        cap,
        n: acts.length,
        est: r1(est),
        real: r1(real),
        oc,
        at: acts.filter((a) => isLate(a, today) && a.status !== 'Finalizado').length,
        rp: acts.reduce((s, a) => s + logsOf(a.id, m).length, 0),
        sit: oc > 1.05 ? 'Sobrecarga' : oc < 0.6 ? 'Ociosidade / disponível' : 'Alocação adequada',
      });
      row.getCell('oc').numFmt = '0%';
      row.getCell('est').numFmt = '0.0';
      row.getCell('real').numFmt = '0.0';
      row.getCell('sit').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: oc > 1.05 ? 'FFFFC7CE' : oc < 0.6 ? 'FFFFEB9C' : 'FFC6EFCE' } };
      row.eachCell((cell) => (cell.border = border));
    }
  }
  res.views = [{ state: 'frozen', ySplit: 4 }];
  res.autoFilter = { from: 'A4', to: 'M4' };

  // Uma aba por mês com o detalhamento ------------------------------------------------------
  for (const m of months) {
    const acts = activities.filter((a) => touchesMonth(a, m, today) && collaborators.some((c) => c.id === a.collaboratorId));
    if (!acts.length) continue;
    const ws = wb.addWorksheet(monthLabel(m).replace('/', '-').slice(0, 31));
    ws.columns = [
      { key: 'col', width: 30 },
      { key: 'id', width: 16 },
      { key: 'desc', width: 48 },
      { key: 'sol', width: 14 },
      { key: 'area', width: 16 },
      { key: 'cc', width: 14 },
      { key: 'st', width: 16 },
      { key: 'ei', width: 11 },
      { key: 'et', width: 11 },
      { key: 'ir', width: 11 },
      { key: 'tr', width: 11 },
      { key: 'eh', width: 11 },
      { key: 'rh', width: 11 },
      { key: 'hm', width: 12 },
      { key: 'rm', width: 12 },
      { key: 'pz', width: 15 },
      { key: 'docs', width: 30 },
      { key: 'just', width: 60 },
      { key: 'obs', width: 30 },
    ];
    await title(wb, ws, `JUSTIFICATIVA DE ALOCAÇÃO · ${monthLabel(m).toUpperCase()}`, sub, 'S');
    ws.addRow([]);
    ws.addRow(['Colaborador', 'ID', 'Descrição da atividade', 'Solicitante', 'Área usina', 'Centro de custo', 'Status', 'Est. início', 'Est. término', 'Início real', 'Término real', 'Horas est. (total)', 'Horas real. (total)', 'Horas est. no mês', 'Horas real. no mês', 'Prazo', 'Documentos AMP', 'Justificativas de alteração de data', 'Observação']);
    header(ws, 4);
    const sorted = [...acts].sort((a, b) => collaboratorOrder(collaborators, a, b) || (a.estInicio ?? a.inicioReal ?? '').localeCompare(b.estInicio ?? b.inicioReal ?? ''));
    let lastCol = '';
    let subEst = 0;
    let subReal = 0;
    const flushSubtotal = () => {
      if (!lastCol) return;
      const r = ws.addRow({ col: `Subtotal ${lastCol}`, hm: r1(subEst), rm: r1(subReal) });
      r.font = { bold: true };
      r.eachCell((c) => {
        c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF2F2F2' } };
        c.border = border;
      });
      subEst = 0;
      subReal = 0;
    };
    for (const a of sorted) {
      const nome = collaborators.find((c) => c.id === a.collaboratorId)?.nome ?? '';
      if (nome !== lastCol) {
        flushSubtotal();
        lastCol = nome;
      }
      const h = monthHours(a, m);
      subEst += h.est;
      subReal += h.real;
      const just = logsOf(a.id)
        .map((l) => `${fmtBR(l.dataHora.slice(0, 10))} · ${DATE_FIELD_LABEL[l.campo]}: ${fmtBR(l.anterior)} → ${fmtBR(l.nova)} · ${l.justificativa} (${l.usuarioNome})`)
        .join('\n');
      const late = isLate(a, today);
      const prazo = a.status === 'Cancelado' ? 'Cancelada' : a.status === 'Finalizado' ? (late ? 'Entregue com atraso' : 'Entregue no prazo') : late ? 'Atrasada' : 'No prazo';
      const row = ws.addRow({
        col: nome,
        id: a.codigo,
        desc: a.descricao,
        sol: a.solicitante,
        area: a.area,
        cc: a.centroCusto,
        st: a.status,
        ei: fmtBR(a.estInicio),
        et: fmtBR(a.estTermino),
        ir: fmtBR(a.inicioReal),
        tr: fmtBR(a.terminoReal),
        eh: computeEstHours(a) ?? null,
        rh: computeRealHours(a) ?? null,
        hm: r1(h.est),
        rm: r1(h.real),
        pz: prazo,
        docs: a.documentosAMP,
        just,
        obs: a.observacao,
      });
      row.alignment = { vertical: 'top', wrapText: true };
      row.getCell('pz').font = { color: { argb: /atraso|Atrasada/.test(prazo) ? 'FFC00000' : 'FF2E7D32' }, bold: true };
      row.eachCell((c) => (c.border = border));
    }
    flushSubtotal();
    const tot = ws.addRow({ col: 'TOTAL DO MÊS', hm: r1(acts.reduce((s, a) => s + monthHours(a, m).est, 0)), rm: r1(acts.reduce((s, a) => s + monthHours(a, m).real, 0)) });
    tot.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    tot.eachCell((c) => (c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: NAVY } }));
    ws.views = [{ state: 'frozen', ySplit: 4, xSplit: 2 }];
    ws.pageSetup = { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0, paperSize: 9 };
  }

  const ws = wb.addWorksheet('Critérios');
  ws.getColumn(1).width = 110;
  [
    'Critérios de cálculo',
    `• Horas no mês: horas da atividade distribuídas proporcionalmente pelos dias úteis (sem fins de semana e feriados) do período estimado ou realizado.`,
    `• Capacidade: (dias úteis do mês − dias úteis de férias aprovadas) × ${hpd} h.`,
    '• Ocupação acima de 105% = sobrecarga; abaixo de 60% = disponível para novas demandas.',
    '• Justificativas: todas as alterações de datas registradas no sistema (usuário, data, valor anterior, novo valor e motivo).',
    `• Filtros aplicados: ${filtroTexto}`,
  ].forEach((t, i) => {
    const r = ws.addRow([t]);
    if (!i) r.font = { bold: true, size: 12 };
    r.alignment = { wrapText: true };
  });

  const buf = await wb.xlsx.writeBuffer();
  return new Blob([buf], { type: XLSX_MIME });
}

function collaboratorOrder(cs: Collaborator[], a: Activity, b: Activity) {
  return cs.findIndex((c) => c.id === a.collaboratorId) - cs.findIndex((c) => c.id === b.collaboratorId);
}

export async function exportAllocation(input: AllocationInput, fileHint: string) {
  const blob = await buildAllocationWorkbook(input);
  download(blob, `Alocacao_Mensal_AMP_${safeFileName(fileHint)}.xlsx`);
}
