// Leitura de planilhas (.xlsx/.csv) enviadas pelo usuário, normalizando valores de células.
import ExcelJS from 'exceljs';
import { fromExcelSerial, toISO } from '../lib/dates';

export interface Grid {
  name: string;
  hidden: boolean;
  rows: CellValue[][];
}
export interface CellValue {
  v: string | number | boolean | Date | null;
  formula?: string;
}

function norm(value: ExcelJS.CellValue): CellValue {
  if (value === null || value === undefined) return { v: null };
  if (value instanceof Date) return { v: value };
  if (typeof value === 'object') {
    const o = value as unknown as Record<string, unknown>;
    if ('formula' in o || 'sharedFormula' in o) {
      const r = o.result as ExcelJS.CellValue;
      const inner = r === undefined || r === null || (typeof r === 'object' && !(r instanceof Date) && 'error' in (r as object)) ? { v: null } : norm(r);
      return { v: inner.v, formula: String(o.formula ?? o.sharedFormula ?? '') };
    }
    if ('richText' in o) return { v: (o.richText as { text: string }[]).map((t) => t.text).join('') };
    if ('text' in o) return { v: String(o.text) };
    if ('error' in o) return { v: null };
  }
  return { v: value as string | number | boolean };
}

export async function readWorkbook(file: File): Promise<Grid[]> {
  const buf = await file.arrayBuffer();
  if (/\.csv$/i.test(file.name)) return [readCsv(new TextDecoder('utf-8').decode(buf), file.name)];
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf);
  return wb.worksheets.map((ws) => {
    const rows: CellValue[][] = [];
    ws.eachRow({ includeEmpty: true }, (row, r) => {
      const cells: CellValue[] = [];
      row.eachCell({ includeEmpty: true }, (cell, c) => {
        cells[c - 1] = norm(cell.value);
      });
      rows[r - 1] = cells;
    });
    return { name: ws.name, hidden: ws.state !== 'visible', rows: Array.from(rows, (r) => r ?? []) };
  });
}

function readCsv(text: string, name: string): Grid {
  const sep = (text.split('\n')[0].match(/;/g)?.length ?? 0) >= (text.split('\n')[0].match(/,/g)?.length ?? 0) ? ';' : ',';
  const rows: CellValue[][] = [];
  let cur: string[] = [];
  let field = '';
  let q = false;
  const t = text.replace(/^﻿/, '');
  for (let i = 0; i < t.length; i++) {
    const ch = t[i];
    if (q) {
      if (ch === '"' && t[i + 1] === '"') {
        field += '"';
        i++;
      } else if (ch === '"') q = false;
      else field += ch;
    } else if (ch === '"') q = true;
    else if (ch === sep) {
      cur.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && t[i + 1] === '\n') i++;
      cur.push(field);
      rows.push(cur.map((v) => ({ v: v === '' ? null : v })));
      cur = [];
      field = '';
    } else field += ch;
  }
  if (field || cur.length) {
    cur.push(field);
    rows.push(cur.map((v) => ({ v: v === '' ? null : v })));
  }
  return { name, hidden: false, rows };
}

/** Converte um valor de célula em data ISO (aceita Date, serial Excel, dd/mm/aaaa, aaaa-mm-dd). */
export function asDate(c?: CellValue): string | undefined {
  const v = c?.v;
  if (v === null || v === undefined || v === '') return undefined;
  if (v instanceof Date) return toISO(new Date(Date.UTC(v.getUTCFullYear(), v.getUTCMonth(), v.getUTCDate())));
  if (typeof v === 'number') return v > 20000 && v < 80000 ? fromExcelSerial(v) : undefined;
  const s = String(v).trim();
  let m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/);
  if (m) {
    const y = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
    return `${y}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  }
  m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  return undefined;
}

export function asText(c?: CellValue): string {
  const v = c?.v;
  if (v === null || v === undefined) return '';
  if (v instanceof Date) return toISO(v);
  return String(v).trim();
}

export function asNumber(c?: CellValue): number | undefined {
  const v = c?.v;
  if (typeof v === 'number') return Math.round(v * 100) / 100;
  if (typeof v === 'string' && v.trim() && !isNaN(Number(v.replace(',', '.')))) return Number(v.replace(',', '.'));
  return undefined;
}

export const normKey = (s: string) =>
  s
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/\(FICTICIO\)/i, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();
