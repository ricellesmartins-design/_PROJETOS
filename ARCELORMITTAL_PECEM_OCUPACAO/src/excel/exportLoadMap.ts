// Exportação do Mapa de Carga: Gantt (carga diária + barras das atividades) e tabela, em Excel e PDF.
import { importFresh } from '../lib/reload';
import ExcelJS from 'exceljs';
import { fmtBR, fmtDateTimeBR, isWeekend, MONTHS_ABBR } from '../lib/dates';
import type { Activity } from '../types';
import { download, logoSource, safeFileName, toPng, XLSX_MIME } from './common';

export interface LoadDay {
  d: string;
  h: number;
  n: number;
  off: boolean; // fim de semana ou feriado
  vac: boolean; // férias aprovadas
  abs?: boolean; // ausência: atestado, afastamento, doença ou falta (ID 0510-0000)
}
export interface LoadRow {
  a: Activity;
  colaborador: string;
  start: string; // janela de execução
  end: string;
  previsto: boolean;
  late: boolean;
  hDia: number;
}
export interface LoadGroup {
  title: string;
  daily: LoadDay[];
  weekH?: number;
  rows: LoadRow[];
}
export interface LoadModel {
  start: string;
  end: string;
  days: string[];
  groupBy: 'colaborador' | 'area';
  groups: LoadGroup[];
  limiteDia: number;
  limiteSemana: number;
  filtroTexto: string;
  today: string;
}

const STATUS_HEX: Record<string, string> = {
  'Não Iniciado': '94A3B8',
  'Em andamento': '3B82F6',
  'Aguardando Cliente': 'FB923C',
  Finalizado: '10B981',
  Cancelado: 'FCA5A5',
};
const LATE_HEX = 'EF4444';
const ABS_HEX = '9333EA'; // roxo: ausência (atestado, afastamento, doença, falta)
const isAbs = (a: Activity) => a.codigo.trim().toUpperCase() === '0510-0000';
const NAVY = '1F3864';

/** Cor da célula de carga diária, mesma regra da tela. */
function heat(day: LoadDay, limite: number): { hex: string; white?: boolean } {
  if (day.vac) return { hex: 'DDD6FE' };
  if (day.abs && !day.off) return { hex: ABS_HEX, white: true };
  if (day.off) return { hex: 'F1F5F9' };
  if (day.h === 0) return { hex: 'E2E8F0' };
  if (day.h > limite) return { hex: 'EF4444', white: true };
  if (day.h >= limite * 0.75) return { hex: '10B981', white: true };
  return { hex: 'FCD34D' };
}

const fmtH = (h: number) => (h % 1 ? h.toFixed(1) : String(h));
const fileBase = (m: LoadModel) => `Mapa_de_Carga_AMP_${safeFileName(`${m.start}_a_${m.end}`)}`;
const LEGEND = 'Legenda: verde = carga adequada · amarelo = abaixo de 75% · vermelho = acima do limite diário · cinza = ocioso · lilás = férias · roxo (AT) = atestado/afastamento/falta · barra vermelha = atraso · ◆ = término previsto';

// ---------------------------------------------------------------- Excel
export async function exportLoadMapExcel(m: LoadModel) {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'IDG Engenharia';
  const fill = (hex: string): ExcelJS.Fill => ({ type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + hex } });
  const thin: Partial<ExcelJS.Borders> = { top: { style: 'thin', color: { argb: 'FFE2E8F0' } }, left: { style: 'thin', color: { argb: 'FFE2E8F0' } }, bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } }, right: { style: 'thin', color: { argb: 'FFE2E8F0' } } };
  let png: Awaited<ReturnType<typeof toPng>> | undefined;
  try {
    png = await toPng(logoSource());
  } catch {
    /* sem logo */
  }
  const logo = (ws: ExcelJS.Worksheet, col: number) => {
    if (!png) return;
    const id = wb.addImage({ buffer: png.bytes as unknown as ExcelJS.Buffer, extension: 'png' });
    const h = 46;
    ws.addImage(id, { tl: { col, row: 0.1 }, ext: { width: (png.width / png.height) * h, height: h } });
  };

  // Aba 1: Gantt
  const g = wb.addWorksheet('Gantt', { views: [{ state: 'frozen', xSplit: 4, ySplit: 5, showGridLines: false }], pageSetup: { orientation: 'landscape', paperSize: 8 as ExcelJS.PaperSize, fitToPage: true, fitToWidth: 1, fitToHeight: 0 } });
  const D0 = 5; // primeira coluna de dia
  g.columns = [{ width: 16 }, { width: 46 }, { width: 13 }, { width: 8 }, ...m.days.map(() => ({ width: 3.6 }))];
  const lastCol = D0 + m.days.length - 1;
  g.mergeCells(1, 1, 1, Math.max(lastCol - 8, 4));
  g.getCell(1, 1).value = 'MAPA DE CARGA · CONTRATO AMP · ARCELORMITTAL PECÉM';
  g.getCell(1, 1).font = { bold: true, size: 14, color: { argb: 'FF' + NAVY } };
  g.getRow(1).height = 40;
  g.mergeCells(2, 1, 2, Math.max(lastCol - 8, 4));
  g.getCell(2, 1).value = `Período ${fmtBR(m.start)} a ${fmtBR(m.end)} · ${m.filtroTexto} · gerado em ${fmtDateTimeBR(new Date().toISOString())}`;
  g.getCell(2, 1).font = { italic: true, size: 9, color: { argb: 'FF555555' } };
  g.mergeCells(3, 1, 3, Math.max(lastCol - 8, 4));
  g.getCell(3, 1).value = LEGEND;
  g.getCell(3, 1).font = { size: 9, color: { argb: 'FF555555' } };
  logo(g, Math.max(lastCol - 6, 4));

  const h4 = g.getRow(4);
  const h5 = g.getRow(5);
  ['', m.groupBy === 'colaborador' ? 'COLABORADOR / ATIVIDADE' : 'ÁREA / ATIVIDADE', 'TÉRMINO', 'H/DIA'].forEach((t, i) => {
    g.mergeCells(4, i + 1, 5, i + 1);
    const c = g.getCell(4, i + 1);
    c.value = i === 0 ? 'CÓDIGO' : t;
  });
  for (const r of [h4, h5]) {
    r.font = { bold: true, size: 9, color: { argb: 'FFFFFFFF' } };
    r.alignment = { horizontal: 'center', vertical: 'middle' };
    for (let c = 1; c <= lastCol; c++) r.getCell(c).fill = fill(NAVY);
  }
  m.days.forEach((d, i) => {
    const col = D0 + i;
    if (i === 0 || d.slice(8) === '01') h4.getCell(col).value = MONTHS_ABBR[Number(d.slice(5, 7)) - 1];
    h5.getCell(col).value = Number(d.slice(8));
    if (isWeekend(d)) h5.getCell(col).fill = fill('475569');
    if (d === m.today) h5.getCell(col).fill = fill('F59E0B');
  });

  let r = 6;
  for (const grp of m.groups) {
    const row = g.getRow(r);
    g.mergeCells(r, 1, r, 2);
    row.getCell(1).value = `${grp.title} (${grp.rows.length})`;
    row.getCell(3).value = grp.weekH !== undefined ? 'Semana atual' : '';
    row.getCell(4).value = grp.weekH !== undefined ? `${fmtH(Number(grp.weekH.toFixed(1)))} h` : '';
    row.font = { bold: true, size: 10, color: { argb: 'FF' + NAVY } };
    for (let c = 1; c <= 4; c++) row.getCell(c).fill = fill('F8FAFC');
    if (grp.weekH !== undefined && grp.weekH > m.limiteSemana) row.getCell(4).font = { bold: true, color: { argb: 'FFDC2626' } };
    grp.daily.forEach((day, i) => {
      const c = row.getCell(D0 + i);
      const hc = heat(day, m.limiteDia);
      c.fill = fill(hc.hex);
      c.value = day.vac ? 'F' : day.abs && !day.off ? 'AT' : !day.off && day.h > 0 ? Number(day.h.toFixed(1)) : null;
      c.font = { size: 8, bold: true, color: { argb: hc.white ? 'FFFFFFFF' : 'FF334155' } };
      c.alignment = { horizontal: 'center', vertical: 'middle' };
      c.border = day.n >= 2 && !day.vac ? { top: { style: 'medium', color: { argb: 'FF7C3AED' } }, bottom: { style: 'medium', color: { argb: 'FF7C3AED' } }, left: { style: 'medium', color: { argb: 'FF7C3AED' } }, right: { style: 'medium', color: { argb: 'FF7C3AED' } } } : thin;
    });
    row.height = 18;
    r++;
    for (const x of grp.rows) {
      const ar = g.getRow(r);
      ar.getCell(1).value = x.a.codigo;
      ar.getCell(2).value = m.groupBy === 'area' ? `${x.a.descricao} · ${x.colaborador}` : x.a.descricao;
      ar.getCell(3).value = fmtBR(x.a.terminoReal ?? x.a.estTermino) || '—';
      ar.getCell(4).value = x.hDia;
      ar.font = { size: 9 };
      ar.getCell(1).font = { size: 9, name: 'Consolas', color: { argb: 'FF64748B' } };
      ar.getCell(2).alignment = { shrinkToFit: true, vertical: 'middle' };
      [3, 4].forEach((c) => (ar.getCell(c).alignment = { horizontal: 'center', vertical: 'middle' }));
      m.days.forEach((d, i) => {
        const c = ar.getCell(D0 + i);
        c.border = thin;
        if (d >= x.start && d <= x.end) {
          const late = x.late && x.a.estTermino && d > x.a.estTermino;
          c.fill = fill(isAbs(x.a) ? ABS_HEX : late ? LATE_HEX : STATUS_HEX[x.a.status] ?? '94A3B8');
        } else if (isWeekend(d)) c.fill = fill('F8FAFC');
        if (x.a.estTermino === d) {
          c.value = '◆';
          c.font = { size: 8, bold: true, color: { argb: 'FF' + NAVY } };
          c.alignment = { horizontal: 'center', vertical: 'middle' };
        }
      });
      ar.height = 16;
      r++;
    }
  }

  // Aba 2: Tabela
  const t = wb.addWorksheet('Tabela', { views: [{ state: 'frozen', ySplit: 4 }], pageSetup: { orientation: 'landscape', paperSize: 9, fitToPage: true, fitToWidth: 1, fitToHeight: 0 } });
  const heads = [m.groupBy === 'colaborador' ? 'Colaborador' : 'Área', 'Código', 'Descrição', 'Colaborador', 'Solicitante', 'Área', 'Centro de custo', 'Status', 'Início', 'Término previsto', 'Término real', 'H/dia', 'Situação'];
  t.columns = [{ width: 30 }, { width: 16 }, { width: 60 }, { width: 28 }, { width: 16 }, { width: 20 }, { width: 16 }, { width: 18 }, { width: 12 }, { width: 14 }, { width: 13 }, { width: 8 }, { width: 14 }];
  t.mergeCells('A1:K1');
  t.getCell('A1').value = 'MAPA DE CARGA · TABELA DE ATIVIDADES';
  t.getCell('A1').font = { bold: true, size: 14, color: { argb: 'FF' + NAVY } };
  t.getRow(1).height = 40;
  t.mergeCells('A2:K2');
  t.getCell('A2').value = `Período ${fmtBR(m.start)} a ${fmtBR(m.end)} · ${m.filtroTexto}`;
  t.getCell('A2').font = { italic: true, size: 9, color: { argb: 'FF555555' } };
  logo(t, 11);
  const hr = t.getRow(4);
  hr.values = heads;
  hr.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  hr.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
  hr.eachCell((c) => (c.fill = fill(NAVY)));
  hr.height = 30;
  let tr = 5;
  for (const grp of m.groups)
    for (const x of grp.rows) {
      const row = t.getRow(tr++);
      row.values = [grp.title, x.a.codigo, x.a.descricao, x.colaborador, x.a.solicitante, x.a.area, x.a.centroCusto, x.a.status, fmtBR(x.start), fmtBR(x.a.estTermino) || '—', fmtBR(x.a.terminoReal) || '—', x.hDia, x.late ? 'Atrasada' : x.previsto ? 'Previsto' : 'No prazo'];
      row.alignment = { vertical: 'middle', wrapText: true };
      row.getCell(8).fill = fill(STATUS_HEX[x.a.status] ?? '94A3B8');
      row.getCell(8).font = { color: { argb: 'FFFFFFFF' }, bold: true };
      if (x.late) row.getCell(13).font = { color: { argb: 'FFDC2626' }, bold: true };
      row.eachCell((c) => (c.border = thin));
    }
  t.autoFilter = { from: { row: 4, column: 1 }, to: { row: 4, column: heads.length } };

  const buf = await wb.xlsx.writeBuffer();
  download(new Blob([buf], { type: XLSX_MIME }), `${fileBase(m)}.xlsx`);
}

// ---------------------------------------------------------------- PDF
const rgb = (hex: string): [number, number, number] => [parseInt(hex.slice(0, 2), 16), parseInt(hex.slice(2, 4), 16), parseInt(hex.slice(4, 6), 16)];

export async function exportLoadMapPdf(m: LoadModel) {
  const [{ jsPDF }, { default: autoTable }] = await importFresh(() => Promise.all([import('jspdf'), import('jspdf-autotable')]));
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a3' });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const M = 10;
  let logoImg: { data: string; w: number; h: number } | undefined;
  try {
    const png = await toPng(logoSource());
    let bin = '';
    png.bytes.forEach((b) => (bin += String.fromCharCode(b)));
    logoImg = { data: 'data:image/png;base64,' + btoa(bin), w: png.width, h: png.height };
  } catch {
    /* sem logo */
  }
  const header = (title: string) => {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(15);
    doc.setTextColor(...rgb(NAVY));
    doc.text(title, M, M + 6);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(85);
    doc.text(`Período ${fmtBR(m.start)} a ${fmtBR(m.end)} · ${m.filtroTexto} · gerado em ${fmtDateTimeBR(new Date().toISOString())}`, M, M + 12);
    if (logoImg) {
      const h = 14;
      const w = (logoImg.w / logoImg.h) * h;
      doc.addImage(logoImg.data, 'PNG', W - M - w, M - 2, w, h);
    }
  };

  // Gantt
  const LABEL = 110;
  const INFO = 26;
  const gx = M + LABEL;
  const dw = (W - 2 * M - LABEL - INFO) / m.days.length;
  const ROW = 5;
  const top0 = M + 30;
  const drawGanttHeader = () => {
    header('MAPA DE CARGA · CONTRATO AMP · ARCELORMITTAL PECÉM');
    // legenda
    let lx = M;
    const ly = M + 17;
    doc.setFontSize(7.5);
    const item = (hex: string, label: string) => {
      doc.setFillColor(...rgb(hex));
      doc.rect(lx, ly - 2.6, 5, 3, 'F');
      doc.setTextColor(60);
      doc.text(label, lx + 6, ly);
      lx += 8 + doc.getTextWidth(label) + 4;
    };
    Object.entries(STATUS_HEX).forEach(([k, v]) => item(v, k));
    item(LATE_HEX, 'Atraso');
    item('10B981', `Carga ≥ 75%`.replace('≥', '>='));
    item('FCD34D', 'Carga < 75%');
    item('EF4444', `> ${m.limiteDia} h/dia`);
    item('E2E8F0', 'Ocioso');
    item('DDD6FE', 'Férias');
    item(ABS_HEX, 'Ausência (AT)');
    doc.setTextColor(60);
    doc.text('Losango = término previsto', lx, ly);
    // cabeçalho de dias
    const y = top0 - 8;
    doc.setFillColor(...rgb(NAVY));
    doc.rect(M, y, W - 2 * M, 8, 'F');
    doc.setTextColor(255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.text(m.groupBy === 'colaborador' ? 'COLABORADOR / ATIVIDADE' : 'ÁREA / ATIVIDADE', M + 2, y + 5.3);
    doc.text('TÉRMINO', W - M - INFO + 2, y + 5.3);
    doc.setFontSize(dw < 3 ? 4.5 : 6);
    m.days.forEach((d, i) => {
      const x = gx + i * dw;
      if (d === m.today) {
        doc.setFillColor(...rgb('F59E0B'));
        doc.rect(x, y, dw, 8, 'F');
      }
      if (i === 0 || d.slice(8) === '01') doc.text(MONTHS_ABBR[Number(d.slice(5, 7)) - 1], x + 0.3, y + 3);
      doc.text(d.slice(8), x + dw / 2, y + 7, { align: 'center' });
    });
    doc.setFont('helvetica', 'normal');
  };
  const vline = (from: number, to: number) => {
    doc.setDrawColor(226, 232, 240);
    doc.setLineWidth(0.1);
    m.days.forEach((d, i) => {
      if (isWeekend(d)) {
        doc.setFillColor(248, 250, 252);
        doc.rect(gx + i * dw, from, dw, to - from, 'F');
      }
    });
  };
  const clip = (s: string, max: number) => {
    if (doc.getTextWidth(s) <= max) return s;
    while (s.length > 1 && doc.getTextWidth(s + '…') > max) s = s.slice(0, -1);
    return s + '…';
  };

  drawGanttHeader();
  let y = top0;
  const newPageIfNeeded = (need: number) => {
    if (y + need > H - M) {
      doc.addPage('a3', 'landscape');
      drawGanttHeader();
      y = top0;
    }
  };
  for (const grp of m.groups) {
    newPageIfNeeded(ROW * 2);
    // linha do grupo com carga diária
    doc.setFillColor(241, 245, 249);
    doc.rect(M, y, LABEL, ROW, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(...rgb(NAVY));
    doc.text(clip(`${grp.title} (${grp.rows.length})`, LABEL - 4), M + 2, y + 3.5);
    grp.daily.forEach((day, i) => {
      const hc = heat(day, m.limiteDia);
      doc.setFillColor(...rgb(hc.hex));
      doc.rect(gx + i * dw + 0.15, y + 0.3, dw - 0.3, ROW - 0.6, 'F');
      if (day.n >= 2 && !day.vac) {
        doc.setDrawColor(124, 58, 237);
        doc.setLineWidth(0.35);
        doc.rect(gx + i * dw + 0.3, y + 0.45, dw - 0.6, ROW - 0.9, 'S');
      }
      const label = day.vac ? 'F' : day.abs && !day.off ? 'AT' : !day.off && day.h > 0 ? fmtH(Number(day.h.toFixed(1))) : '';
      if (label && dw >= 2.6) {
        doc.setFontSize(dw < 4 ? 4.5 : 6);
        doc.setTextColor(hc.white ? 255 : 51);
        doc.text(label, gx + i * dw + dw / 2, y + 3.4, { align: 'center' });
      }
    });
    if (grp.weekH !== undefined) {
      doc.setFontSize(7);
      doc.setTextColor(grp.weekH > m.limiteSemana ? 220 : 71, grp.weekH > m.limiteSemana ? 38 : 85, grp.weekH > m.limiteSemana ? 38 : 105);
      doc.text(`Semana: ${grp.weekH.toFixed(1)} h`, W - M - INFO + 2, y + 3.4);
    }
    doc.setFont('helvetica', 'normal');
    y += ROW;
    for (const x of grp.rows) {
      newPageIfNeeded(ROW);
      vline(y, y + ROW);
      doc.setDrawColor(226, 232, 240);
      doc.setLineWidth(0.1);
      doc.line(M, y + ROW, W - M, y + ROW);
      doc.setFontSize(7);
      doc.setTextColor(100, 116, 139);
      doc.text(x.a.codigo, M + 2, y + 3.4);
      doc.setTextColor(30);
      const desc = m.groupBy === 'area' ? `${x.a.descricao} · ${x.colaborador}` : x.a.descricao;
      doc.text(clip(desc, LABEL - 30), M + 26, y + 3.4);
      // barra
      const si = Math.max(0, m.days.indexOf(x.start < m.start ? m.start : x.start));
      const eiRaw = m.days.indexOf(x.end > m.end ? m.end : x.end);
      const ei = eiRaw < 0 ? m.days.length - 1 : eiRaw;
      const bx = gx + si * dw;
      const bw = (ei - si + 1) * dw;
      doc.setFillColor(...rgb(isAbs(x.a) ? ABS_HEX : STATUS_HEX[x.a.status] ?? '94A3B8'));
      doc.roundedRect(bx, y + 1, bw, ROW - 2, 0.6, 0.6, 'F');
      if (x.late && x.a.estTermino && !isAbs(x.a)) {
        const li = m.days.findIndex((d) => d > x.a.estTermino!);
        if (li >= 0 && li <= ei) {
          const lx = gx + Math.max(li, si) * dw;
          doc.setFillColor(...rgb(LATE_HEX));
          doc.rect(lx, y + 1, bx + bw - lx, ROW - 2, 'F');
        }
      }
      if (bw > 12) {
        doc.setFontSize(6);
        doc.setTextColor(255);
        doc.text(`${x.hDia}h/d`, bx + 1, y + 3.3);
      }
      const ti = x.a.estTermino ? m.days.indexOf(x.a.estTermino) : -1;
      if (ti >= 0) {
        const cx = gx + (ti + 0.5) * dw;
        const cy = y + ROW / 2;
        doc.setFillColor(...rgb(NAVY));
        doc.triangle(cx - 1.1, cy, cx, cy - 1.4, cx + 1.1, cy, 'F');
        doc.triangle(cx - 1.1, cy, cx, cy + 1.4, cx + 1.1, cy, 'F');
      }
      if (m.today >= m.start && m.today <= m.end) {
        const tx = gx + (m.days.indexOf(m.today) + 0.5) * dw;
        doc.setDrawColor(...rgb('F59E0B'));
        doc.setLineWidth(0.4);
        doc.line(tx, y, tx, y + ROW);
      }
      doc.setFontSize(6.5);
      doc.setTextColor(100, 116, 139);
      doc.text(`até ${fmtBR(x.a.terminoReal ?? x.a.estTermino) || '—'}`, W - M - INFO + 2, y + 3.4);
      y += ROW;
    }
  }

  // Tabela
  doc.addPage('a3', 'landscape');
  header('MAPA DE CARGA · TABELA DE ATIVIDADES');
  const body = m.groups.flatMap((grp) =>
    grp.rows.map((x) => [grp.title, x.a.codigo, x.a.descricao, x.colaborador, x.a.solicitante, x.a.area, x.a.centroCusto, x.a.status, fmtBR(x.start), fmtBR(x.a.estTermino) || '—', fmtBR(x.a.terminoReal) || '—', String(x.hDia), x.late ? 'Atrasada' : x.previsto ? 'Previsto' : 'No prazo']),
  );
  autoTable(doc, {
    startY: M + 18,
    margin: { left: M, right: M },
    head: [[m.groupBy === 'colaborador' ? 'Colaborador' : 'Área', 'Código', 'Descrição', 'Colaborador', 'Solicitante', 'Área', 'Centro de custo', 'Status', 'Início', 'Término prev.', 'Término real', 'H/dia', 'Situação']],
    body,
    styles: { fontSize: 7.5, cellPadding: 1.2, valign: 'middle' },
    headStyles: { fillColor: rgb(NAVY), textColor: 255, halign: 'center' },
    columnStyles: { 2: { cellWidth: 110 }, 8: { halign: 'center' }, 9: { halign: 'center' }, 10: { halign: 'center' }, 11: { halign: 'center' } },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    didParseCell: (h) => {
      if (h.section !== 'body') return;
      if (h.column.index === 7) {
        h.cell.styles.fillColor = rgb(STATUS_HEX[String(h.cell.raw)] ?? '94A3B8');
        h.cell.styles.textColor = 255;
        h.cell.styles.fontStyle = 'bold';
      }
      if (h.column.index === 12 && h.cell.raw === 'Atrasada') {
        h.cell.styles.textColor = [220, 38, 38];
        h.cell.styles.fontStyle = 'bold';
      }
    },
  });

  // numeração de páginas
  const n = doc.getNumberOfPages();
  for (let i = 1; i <= n; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(120);
    doc.text(`IDG Engenharia · Contrato AMP · Página ${i} de ${n}`, W - M, H - 4, { align: 'right' });
  }
  doc.save(`${fileBase(m)}.pdf`);
}
