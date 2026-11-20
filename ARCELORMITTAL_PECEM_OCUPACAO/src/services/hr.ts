// Conciliação das férias do sistema com a planilha de controle enviada pelo RH.
import { db } from '../lib/db';
import { uid } from '../lib/id';
import { addDays, fmtBR } from '../lib/dates';
import { asDate, asNumber, asText, normKey, readWorkbook } from '../excel/read';
import type { HrImport, HrRow, User } from '../types';

export type ReconStatus = 'Conciliado (OK)' | 'Divergência de Datas' | 'Ausente no RH' | 'Ausente no Sistema';
export interface ReconRow {
  status: ReconStatus;
  collaboratorId?: string;
  nome: string;
  matricula: string;
  sistema?: { inicio: string; fim: string; requestId: string; status: string };
  rh?: HrRow;
  detalhe: string;
}

/** Detecta colunas por cabeçalho: Matrícula, Nome/Colaborador, Início, Fim/Término/Retorno ou Dias. */
export async function parseHrFile(file: File): Promise<HrRow[]> {
  const grids = await readWorkbook(file);
  const out: HrRow[] = [];
  for (const g of grids) {
    const hIdx = g.rows.findIndex((r) => {
      const ks = r.map((c) => normKey(asText(c)));
      return ks.some((k) => /INICIO|SAIDA|GOZO/.test(k)) && ks.some((k) => /NOME|COLABORADOR|FUNCIONARIO|EMPREGADO|MATRICULA|CHAPA/.test(k));
    });
    if (hIdx < 0) continue;
    const ks = g.rows[hIdx].map((c) => normKey(asText(c)));
    const find = (re: RegExp, not?: RegExp) => ks.findIndex((k) => re.test(k) && !(not && not.test(k)));
    const iMat = find(/MATRICULA|CHAPA|^ID$|REGISTRO/);
    const iNome = find(/NOME|COLABORADOR|FUNCIONARIO|EMPREGADO/);
    const iIni = find(/INICIO|SAIDA|GOZO/, /AQUISITIVO|PERIODO AQ/);
    const iFim = find(/FIM|TERMINO|RETORNO|FINAL/, /AQUISITIVO/);
    const iDias = find(/^DIAS|QTD|QUANTIDADE/);
    for (const r of g.rows.slice(hIdx + 1)) {
      const inicio = asDate(r[iIni]);
      if (!inicio) continue;
      let fim = iFim >= 0 ? asDate(r[iFim]) : undefined;
      if (fim && /RETORNO/.test(ks[iFim])) fim = addDays(fim, -1);
      if (!fim && iDias >= 0) {
        const n = asNumber(r[iDias]);
        if (n) fim = addDays(inicio, n - 1);
      }
      if (!fim) continue;
      out.push({ matricula: iMat >= 0 ? asText(r[iMat]) : '', nome: iNome >= 0 ? asText(r[iNome]) : '', inicio, fim });
    }
  }
  if (!out.length) throw new Error('Não encontrei linhas de férias. A planilha precisa ter colunas de Matrícula ou Nome, Início e Fim (ou Retorno / Dias).');
  return out;
}

export function reconcile(rows: HrRow[]): ReconRow[] {
  const collabs = db.all('collaborators');
  const findCollab = (h: HrRow) =>
    (h.matricula ? collabs.find((c) => c.matricula && normKey(c.matricula) === normKey(h.matricula)) : undefined) ??
    collabs.find((c) => normKey(c.nome) === normKey(h.nome)) ??
    (h.nome ? collabs.find((c) => normKey(c.nome).startsWith(normKey(h.nome)) || normKey(h.nome).startsWith(normKey(c.nome))) : undefined);
  const sys = db
    .all('vacations')
    .filter((v) => v.status === 'Aprovada' || v.status === 'Cancelamento Solicitado')
    .flatMap((v) => v.periodos.map((p) => ({ ...p, requestId: v.id, collaboratorId: v.collaboratorId, status: v.status })));
  const usedRh = new Set<number>();
  const out: ReconRow[] = [];
  const hrWithCollab = rows.map((h) => ({ h, c: findCollab(h) }));
  for (const s of sys) {
    const c = collabs.find((x) => x.id === s.collaboratorId);
    const candidates = hrWithCollab.map((x, i) => ({ ...x, i })).filter((x) => !usedRh.has(x.i) && x.c?.id === s.collaboratorId);
    const exact = candidates.find((x) => x.h.inicio === s.inicio && x.h.fim === s.fim);
    const overlap = exact ?? candidates.find((x) => x.h.inicio <= s.fim && x.h.fim >= s.inicio);
    const base = { collaboratorId: s.collaboratorId, nome: c?.nome ?? '—', matricula: c?.matricula ?? '', sistema: { inicio: s.inicio, fim: s.fim, requestId: s.requestId, status: s.status } };
    if (exact) {
      usedRh.add(exact.i);
      out.push({ ...base, status: 'Conciliado (OK)', rh: exact.h, detalhe: 'Datas idênticas.' });
    } else if (overlap) {
      usedRh.add(overlap.i);
      out.push({ ...base, status: 'Divergência de Datas', rh: overlap.h, detalhe: `Sistema ${fmtBR(s.inicio)}–${fmtBR(s.fim)} × RH ${fmtBR(overlap.h.inicio)}–${fmtBR(overlap.h.fim)}` });
    } else out.push({ ...base, status: 'Ausente no RH', detalhe: 'Período aprovado no sistema não consta na planilha do RH.' });
  }
  hrWithCollab.forEach((x, i) => {
    if (usedRh.has(i)) return;
    out.push({
      status: 'Ausente no Sistema',
      collaboratorId: x.c?.id,
      nome: x.c?.nome ?? x.h.nome,
      matricula: x.c?.matricula ?? x.h.matricula,
      rh: x.h,
      detalhe: x.c ? 'Período registrado no RH sem solicitação aprovada no sistema.' : 'Colaborador da planilha do RH não encontrado no sistema.',
    });
  });
  const order: ReconStatus[] = ['Divergência de Datas', 'Ausente no RH', 'Ausente no Sistema', 'Conciliado (OK)'];
  return out.sort((a, b) => order.indexOf(a.status) - order.indexOf(b.status) || a.nome.localeCompare(b.nome));
}

export async function saveHrImport(arquivo: string, linhas: HrRow[], user: User): Promise<HrImport> {
  return db.insert('hrImports', { id: uid('h_'), arquivo, importadoEm: new Date().toISOString(), importadoPor: user.email, linhas });
}
