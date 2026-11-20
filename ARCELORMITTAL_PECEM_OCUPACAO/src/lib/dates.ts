// Utilitários de data. Todas as datas de negócio são strings ISO "YYYY-MM-DD"
// e a aritmética é feita em UTC para evitar problemas de fuso/horário de verão.
import type { Holiday } from '../types';

export const DAY_MS = 86_400_000;

export function toDate(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

export function toISO(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function todayISO(): string {
  const n = new Date();
  return toISO(new Date(Date.UTC(n.getFullYear(), n.getMonth(), n.getDate())));
}

export function addDays(iso: string, n: number): string {
  return toISO(new Date(toDate(iso).getTime() + n * DAY_MS));
}

export function diffDays(a: string, b: string): number {
  return Math.round((toDate(b).getTime() - toDate(a).getTime()) / DAY_MS);
}

/** 0 = domingo ... 6 = sábado */
export function weekday(iso: string): number {
  return toDate(iso).getUTCDay();
}

export const WEEKDAY_NAMES = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'];
export const MONTHS_PT = ['JANEIRO', 'FEVEREIRO', 'MARÇO', 'ABRIL', 'MAIO', 'JUNHO', 'JULHO', 'AGOSTO', 'SETEMBRO', 'OUTUBRO', 'NOVEMBRO', 'DEZEMBRO'];
export const MONTHS_ABBR = ['JAN', 'FEV', 'MAR', 'ABR', 'MAI', 'JUN', 'JUL', 'AGO', 'SET', 'OUT', 'NOV', 'DEZ'];

export function isWeekend(iso: string): boolean {
  const w = weekday(iso);
  return w === 0 || w === 6;
}

/** Equivalente ao NETWORKDAYS do Excel (sem lista de feriados): dias úteis inclusivos. */
export function networkDays(start?: string, end?: string): number {
  if (!start || !end) return 0;
  let a = start;
  let b = end;
  let sign = 1;
  if (a > b) {
    [a, b] = [b, a];
    sign = -1;
  }
  let count = 0;
  for (let d = a; d <= b; d = addDays(d, 1)) if (!isWeekend(d)) count++;
  return sign * count;
}

export function fmtBR(iso?: string): string {
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

export function fmtDateTimeBR(isoDateTime?: string): string {
  if (!isoDateTime) return '';
  const d = new Date(isoDateTime);
  return d.toLocaleString('pt-BR', { timeZone: 'America/Fortaleza', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

/** Número de série de data do Excel (sistema 1900). */
export function excelSerial(iso: string): number {
  return Math.round((toDate(iso).getTime() - Date.UTC(1899, 11, 30)) / DAY_MS);
}

export function fromExcelSerial(n: number): string {
  return toISO(new Date(Date.UTC(1899, 11, 30) + Math.round(n) * DAY_MS));
}

export function monthKey(iso: string): string {
  return iso.slice(0, 7);
}

export function monthLabel(key: string): string {
  const [y, m] = key.split('-').map(Number);
  return `${MONTHS_ABBR[m - 1]}/${y}`;
}

export function monthStart(key: string): string {
  return `${key}-01`;
}

export function monthEnd(key: string): string {
  const [y, m] = key.split('-').map(Number);
  return toISO(new Date(Date.UTC(y, m, 0)));
}

export function addMonths(key: string, n: number): string {
  const [y, m] = key.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return toISO(d).slice(0, 7);
}

export function rangesOverlapDays(a1: string, a2: string, b1: string, b2: string): number {
  const s = a1 > b1 ? a1 : b1;
  const e = a2 < b2 ? a2 : b2;
  if (s > e) return 0;
  return diffDays(s, e) + 1;
}

/** Semana ISO-like iniciando na segunda-feira. */
export function weekStart(iso: string): string {
  const w = weekday(iso);
  return addDays(iso, w === 0 ? -6 : 1 - w);
}

// ---------------------------------------------------------------------------
// Feriados: nacionais (inclui móveis via Páscoa) + estaduais do Ceará.
// Feriados municipais / pontos facultativos podem ser incluídos em Configurações.

function easter(year: number): string {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return toISO(new Date(Date.UTC(year, month - 1, day)));
}

const holidayCache = new Map<number, Holiday[]>();

export function holidaysOf(year: number): Holiday[] {
  const cached = holidayCache.get(year);
  if (cached) return cached;
  const p = (md: string) => `${year}-${md}`;
  const e = easter(year);
  const list: Holiday[] = [
    { data: p('01-01'), nome: 'Confraternização Universal' },
    { data: addDays(e, -48), nome: 'Carnaval (segunda)' },
    { data: addDays(e, -47), nome: 'Carnaval (terça)' },
    { data: p('03-19'), nome: 'São José (CE)' },
    { data: p('03-25'), nome: 'Data Magna do Ceará' },
    { data: addDays(e, -2), nome: 'Sexta-feira Santa' },
    { data: p('04-21'), nome: 'Tiradentes' },
    { data: p('05-01'), nome: 'Dia do Trabalho' },
    { data: addDays(e, 60), nome: 'Corpus Christi' },
    { data: p('09-07'), nome: 'Independência do Brasil' },
    { data: p('10-12'), nome: 'Nossa Senhora Aparecida' },
    { data: p('11-02'), nome: 'Finados' },
    { data: p('11-15'), nome: 'Proclamação da República' },
    { data: p('11-20'), nome: 'Dia Nacional de Zumbi e da Consciência Negra' },
    { data: p('12-25'), nome: 'Natal' },
  ];
  holidayCache.set(year, list);
  return list;
}

export function findHoliday(iso: string, extras: Holiday[] = []): Holiday | undefined {
  return holidaysOf(Number(iso.slice(0, 4))).find((h) => h.data === iso) ?? extras.find((h) => h.data === iso);
}
