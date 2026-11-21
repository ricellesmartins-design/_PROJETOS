// Importação comparativa da planilha de referência SE-PL-0510-CD001-R0:
// lê todas as abas, identifica colaborador/matrícula/função/período, compara cada atividade com o
// que já está no sistema e permite importar somente o que falta (ou atualizar divergências).
import { db } from '../lib/db';
import { uid } from '../lib/id';
import { asDate, asNumber, asText, normKey, readWorkbook, type CellValue, type Grid } from '../excel/read';
import { ACTIVITY_STATUSES, type Activity, type ActivityStatus, type Collaborator, type CostCenter, type User } from '../types';
import { ABSENCE_CODE, ABSENCE_DESC, computeEstHours, computeRealHours } from './activities';

export interface ParsedActivity {
  codigo: string;
  descricao: string;
  solicitante: string;
  area: string;
  dataSolicitacao?: string;
  estInicio?: string;
  estTermino?: string;
  estHoras?: number;
  estModo: 'auto' | 'manual';
  horasDia?: number;
  inicioReal?: string;
  terminoReal?: string;
  horasRealizadas?: number;
  realModo: 'auto' | 'manual';
  horasDiaReal?: number;
  documentosAMP: string;
  centroCusto: string;
  status: ActivityStatus;
  observacao: string;
}

export interface ParsedSheet {
  sheet: string;
  hidden: boolean;
  nome: string;
  matricula: string;
  funcao: string;
  periodo: string;
  rows: ParsedActivity[];
}

export type CompareStatus = 'novo' | 'igual' | 'diferente';
export interface CompareRow {
  key: string;
  sheet: string;
  collaboratorNome: string;
  collaboratorId?: string; // existente
  novoColaborador?: Collaborator;
  parsed: ParsedActivity;
  existing?: Activity;
  status: CompareStatus;
  diffs: { campo: string; sistema: string; planilha: string }[];
}

export function normalizeStatus(s: string): ActivityStatus {
  const k = normKey(s);
  if (!k) return 'Não Iniciado';
  if (/CONCLU|FINALIZ/.test(k)) return 'Finalizado';
  if (/ANDAMENTO|EXECU/.test(k)) return 'Em andamento';
  if (/AGUARD/.test(k)) return 'Aguardando Cliente';
  if (/CANCEL/.test(k)) return 'Cancelado';
  return (ACTIVITY_STATUSES.find((x) => normKey(x) === k) ?? 'Não Iniciado') as ActivityStatus;
}

const after = (label: string, s: string) => s.replace(new RegExp('^\\s*' + label + '\\s*:?', 'i'), '').trim();

function hoursFrom(c: CellValue | undefined): { value?: number; auto?: number } {
  const value = asNumber(c);
  const f = c?.formula ?? '';
  const m = f.match(/NETWORKDAYS\([A-Z]+\d+,\s*[A-Z]+\d+\)\)?\s*\*\s*([\d.]+)/i);
  return { value, auto: m ? Number(m[1]) : undefined };
}

/**
 * Linha de ausência (atestado médico, afastamento, doença ou falta), pelo ID, descrição ou status.
 * A observação não conta: uma atividade comum pode citar "afastado" ali. "Falta" só vale
 * sozinha ou como "Falta justificada/injustificada/abonada" (evita "falta de material" etc.).
 */
export function isAbsenceText(parts: string[], descricao = '', status = ''): boolean {
  const t = normKey([...parts, descricao, status].join(' '));
  if (t.includes(ABSENCE_CODE) || /ATESTAD|AFASTAD|AFASTAMENTO|LICENCA MEDICA|AUXILIO DOENCA|\bDOENCA\b|\bDOENTE\b|\bENFERMIDADE/.test(t)) return true;
  const falta = /^FALTAS?(\s*[-:|(].*|\s+(JUSTIFICADA|INJUSTIFICADA|ABONADA|AO TRABALHO|NAO JUSTIFICADA)\b.*)?$/;
  return falta.test(normKey(descricao)) || falta.test(normKey(status));
}

const MONTHS = 'JAN|FEV|MAR|ABR|MAI|JUN|JUL|AGO|SET|OUT|NOV|DEZ|JANEIRO|FEVEREIRO|MARCO|ABRIL|MAIO|JUNHO|JULHO|AGOSTO|SETEMBRO|OUTUBRO|NOVEMBRO|DEZEMBRO';
/** "ANTÔNIO DOS ANJOS NOV-2026" → "ANTÔNIO DOS ANJOS" (quando o cabeçalho não traz o nome). */
export function nameFromSheet(sheet: string): string {
  return sheet
    .replace(new RegExp(`[\\s_-]*(${MONTHS})[\\s_./-]*\\d{2,4}\\s*$`, 'i'), '')
    .replace(/\s*\(\d+\)\s*$/, '')
    .trim();
}

export function parseGrids(grids: Grid[]): { sheets: ParsedSheet[]; costCenters: CostCenter[] } {
  const sheets: ParsedSheet[] = [];
  let costCenters: CostCenter[] = [];
  for (const g of grids) {
    const headerIdx = g.rows.findIndex((r) => r.some((c) => normKey(asText(c)) === 'ID') && r.some((c) => normKey(asText(c)).startsWith('DESCRICAO DA ATIVIDADE')));
    if (headerIdx < 0) {
      const ccHeader = g.rows.findIndex((r) => normKey(asText(r[0])).startsWith('CENTRO CUSTO') || normKey(asText(r[0])) === 'CENTRO DE CUSTO');
      if (ccHeader >= 0) {
        const merged = new Map<string, CostCenter>();
        for (const r of g.rows.slice(ccHeader + 1)) {
          const codigo = asText(r[0]);
          if (!codigo) continue;
          const den = asText(r[1]);
          const resp = asText(r[2]);
          const cur = merged.get(codigo);
          if (!cur) merged.set(codigo, { codigo, denominacao: den, responsavel: resp });
          else {
            if (den && !cur.denominacao.split(' / ').includes(den)) cur.denominacao += ' / ' + den;
            if (resp && !cur.responsavel.split(' / ').includes(resp)) cur.responsavel += ' / ' + resp;
          }
        }
        costCenters = [...merged.values()];
      }
      continue;
    }
    const head = g.rows.slice(0, headerIdx).flat().map(asText).filter(Boolean);
    const find = (label: string) => after(label, head.find((t) => normKey(t).startsWith(normKey(label))) ?? '');
    const cols = g.rows[headerIdx].map((c) => normKey(asText(c)));
    const col = (name: string) => cols.findIndex((c) => c.startsWith(normKey(name)));
    const ix = {
      id: col('ID'),
      desc: col('DESCRICAO DA ATIVIDADE'),
      sol: col('SOLICITANTE'),
      area: col('AREA USINA'),
      dsol: col('DATA SOLICITACAO'),
      ei: col('ESTIMATIVA DE INICIO'),
      et: col('ESTIMATIVA DE TERMINO'),
      eh: col('ESTIMATIVA DE HORAS'),
      ir: col('INICIO REAL'),
      tr: col('TERMINO REAL'),
      hr: col('HORAS REALIZADAS'),
      doc: col('NUMERO DO DOCUMENTO'),
      cc: col('CENTRO DE CUSTO'),
      st: col('STATUS'),
      obs: col('OBSERVACAO'),
    };
    const rows: ParsedActivity[] = [];
    for (const r of g.rows.slice(headerIdx + 1)) {
      const codigo = asText(r[ix.id]);
      const descricao = asText(r[ix.desc]);
      if (normKey(codigo) === 'TOTAL' || normKey(descricao) === 'TOTAL') continue;
      const ausencia = !!descricao && isAbsenceText([codigo], descricao, asText(r[ix.st]));
      // Linhas de ausência costumam vir sem ID; as demais precisam de ID e descrição.
      if (!ausencia && (!codigo || !descricao)) continue;
      const eh = hoursFrom(r[ix.eh]);
      const hr = hoursFrom(r[ix.hr]);
      const obs = asText(r[ix.obs]);
      rows.push({
        codigo: ausencia ? ABSENCE_CODE : codigo.toUpperCase(),
        descricao: ausencia ? ABSENCE_DESC : descricao,
        solicitante: asText(r[ix.sol]),
        area: asText(r[ix.area]),
        dataSolicitacao: asDate(r[ix.dsol]),
        estInicio: asDate(r[ix.ei]),
        estTermino: asDate(r[ix.et]),
        estHoras: eh.value,
        estModo: eh.auto ? 'auto' : 'manual',
        horasDia: eh.auto,
        inicioReal: asDate(r[ix.ir]),
        terminoReal: asDate(r[ix.tr]),
        horasRealizadas: hr.value,
        realModo: hr.auto ? 'auto' : 'manual',
        horasDiaReal: hr.auto,
        documentosAMP: asText(r[ix.doc]).replace(/\r/g, ''),
        centroCusto: asText(r[ix.cc]),
        status: ausencia ? 'Finalizado' : normalizeStatus(asText(r[ix.st])),
        // No afastamento, guarda o texto original da planilha na observação.
        observacao: ausencia && normKey(descricao) !== normKey(ABSENCE_DESC) ? [descricao.toUpperCase(), obs].filter(Boolean).join(' · ') : obs,
      });
      if (ausencia) {
        const x = rows[rows.length - 1];
        // Sem datas reais, usa as estimadas (e vice-versa) para o período ficar visível.
        x.inicioReal ??= x.estInicio;
        x.terminoReal ??= x.estTermino ?? x.inicioReal;
        x.estInicio ??= x.inicioReal;
        x.estTermino ??= x.terminoReal;
        // As horas da planilha são mantidas (aparecem no relatório oficial), mas não contam como carga.
        x.estHoras = undefined;
        x.estModo = 'manual';
        x.realModo = 'manual';
        x.horasDia = undefined;
        x.horasDiaReal = undefined;
        if (x.centroCusto === '-') x.centroCusto = '';
        x.status = x.terminoReal ? 'Finalizado' : 'Em andamento';
      }
    }
    sheets.push({ sheet: g.name, hidden: g.hidden, nome: find('COLABORADOR') || nameFromSheet(g.name), matricula: find('MATRICULA'), funcao: find('FUNCAO'), periodo: find('PERIODO'), rows });
  }
  return { sheets, costCenters };
}

export async function parseReferenceFile(file: File) {
  return parseGrids(await readWorkbook(file));
}

const FIELDS: [keyof ParsedActivity, string][] = [
  ['descricao', 'Descrição'],
  ['solicitante', 'Solicitante'],
  ['area', 'Área'],
  ['dataSolicitacao', 'Data solicitação'],
  ['estInicio', 'Est. início'],
  ['estTermino', 'Est. término'],
  ['estHoras', 'Est. horas'],
  ['inicioReal', 'Início real'],
  ['terminoReal', 'Término real'],
  ['horasRealizadas', 'Horas realizadas'],
  ['documentosAMP', 'Documentos AMP'],
  ['centroCusto', 'Centro de custo'],
  ['status', 'Status'],
  ['observacao', 'Observação'],
];

export function matchCollaborator(nome: string, matricula: string): Collaborator | undefined {
  const list = db.all('collaborators');
  return (matricula ? list.find((c) => c.matricula && normKey(c.matricula) === normKey(matricula)) : undefined) ?? list.find((c) => normKey(c.nome) === normKey(nome));
}

/** Compara as atividades da planilha com o sistema. Atividades repetidas em várias abas são consolidadas. */
export function compare(sheets: ParsedSheet[]): CompareRow[] {
  const out = new Map<string, CompareRow>();
  const acts = db.all('activities');
  const newCollabs = new Map<string, Collaborator>();
  const startOf = (x: { inicioReal?: string; estInicio?: string }) => x.inicioReal ?? x.estInicio ?? '';
  // 1º passo: colaborador de cada aba (existente ou novo).
  const resolved = sheets
    .filter((sh) => sh.rows.length)
    .map((sh) => {
      const existingCollab = matchCollaborator(sh.nome, sh.matricula);
      let novo: Collaborator | undefined;
      if (!existingCollab) {
        const k = normKey(sh.matricula || sh.nome || sh.sheet);
        novo = newCollabs.get(k);
        if (!novo) {
          novo = { id: uid('c_'), nome: (sh.nome || sh.sheet).toUpperCase(), matricula: sh.matricula, funcao: sh.funcao.toUpperCase(), ativo: true };
          newCollabs.set(k, novo);
        }
      }
      return { sh, existingCollab, novo, collabId: existingCollab?.id ?? novo!.id };
    });
  // Trechos (inícios distintos) de cada ID por colaborador, somando todas as abas.
  const trechos = new Map<string, Set<string>>();
  for (const { sh, collabId } of resolved)
    for (const p of sh.rows) {
      const k = `${collabId}|${p.codigo}`;
      if (!trechos.has(k)) trechos.set(k, new Set());
      trechos.get(k)!.add(startOf(p));
    }
  for (const { sh, existingCollab, novo, collabId } of resolved) {
    for (const p of sh.rows) {
      // Chave = colaborador + ID + início. O mesmo ID pode aparecer para colaboradores diferentes e,
      // para o mesmo colaborador, em vários trechos (ex.: interrompido por atestado): cada trecho é
      // uma linha própria, como no relatório oficial. A mesma linha repetida em abas de meses
      // diferentes (mesmo início) é consolidada.
      const inicio = startOf(p);
      const key = `${collabId}|${p.codigo}|${inicio}`;
      const sameId = existingCollab ? acts.filter((a) => a.collaboratorId === existingCollab.id && a.codigo.toUpperCase() === p.codigo) : [];
      // Sem trecho com o mesmo início: se no sistema e na planilha só há um trecho desse ID, é a mesma atividade (com datas alteradas).
      const existing =
        sameId.find((a) => startOf(a) === inicio) ?? (p.codigo !== ABSENCE_CODE && sameId.length === 1 && trechos.get(`${collabId}|${p.codigo}`)!.size === 1 ? sameId[0] : undefined);
      const diffs: CompareRow['diffs'] = [];
      if (existing) {
        const sys: Record<string, unknown> = { ...existing, estHoras: computeEstHours(existing), horasRealizadas: computeRealHours(existing) };
        for (const [f, label] of FIELDS) {
          const a = sys[f] ?? '';
          const b = p[f] ?? '';
          const eq = typeof a === 'number' || typeof b === 'number' ? Math.abs(Number(a || 0) - Number(b || 0)) < 0.01 : normKey(String(a)) === normKey(String(b));
          if (!eq && String(b) !== '') diffs.push({ campo: label, sistema: String(a), planilha: String(b) });
        }
      }
      const row: CompareRow = {
        key,
        sheet: sh.sheet,
        collaboratorNome: existingCollab?.nome ?? novo!.nome,
        collaboratorId: existingCollab?.id,
        novoColaborador: novo,
        parsed: p,
        existing,
        status: !existing ? 'novo' : diffs.length ? 'diferente' : 'igual',
        diffs,
      };
      // Mesma atividade em várias abas (meses): mantém a versão com mais informação preenchida.
      const prev = out.get(key);
      const filled = (x: ParsedActivity) => Object.values(x).filter((v) => v !== undefined && v !== '').length;
      if (!prev || filled(p) > filled(prev.parsed)) out.set(key, row);
    }
  }
  return [...out.values()];
}

export interface ImportResult {
  colaboradores: number;
  inseridas: number;
  atualizadas: number;
  centrosCusto: number;
  erros: string[];
}

export async function applyImport(rows: CompareRow[], user: User, arquivo: string, costCenters: CostCenter[] = []): Promise<ImportResult> {
  const res: ImportResult = { colaboradores: 0, inseridas: 0, atualizadas: 0, centrosCusto: 0, erros: [] };
  if (costCenters.length) {
    const known = new Set(db.all('costCenters').map((c) => c.codigo));
    const novos = costCenters.filter((c) => !known.has(c.codigo));
    await db.insertMany('costCenters', novos, { upsert: true });
    res.centrosCusto = novos.length;
  }
  const collabs = new Map<string, Collaborator>();
  rows.forEach((r) => r.novoColaborador && collabs.set(r.novoColaborador.id, r.novoColaborador));
  if (collabs.size) {
    await db.insertMany('collaborators', [...collabs.values()]);
    res.colaboradores = collabs.size;
  }
  const now = new Date().toISOString();
  const inserts: Activity[] = [];
  for (const r of rows) {
    const collaboratorId = r.collaboratorId ?? r.novoColaborador!.id;
    const p = r.parsed;
    const base = {
      codigo: p.codigo,
      collaboratorId,
      descricao: p.descricao,
      solicitante: p.solicitante,
      area: p.area,
      dataSolicitacao: p.dataSolicitacao,
      estInicio: p.estInicio,
      estTermino: p.estTermino,
      estModo: p.estModo,
      horasDia: p.horasDia,
      estHoras: p.estHoras,
      inicioReal: p.inicioReal,
      terminoReal: p.terminoReal,
      realModo: p.realModo,
      horasDiaReal: p.horasDiaReal,
      horasRealizadas: p.horasRealizadas,
      documentosAMP: p.documentosAMP,
      centroCusto: p.centroCusto,
      status: p.status,
      observacao: p.observacao,
    };
    if (r.status === 'novo') {
      inserts.push({ id: uid('a_'), ...base, createdAt: now, createdBy: user.email, updatedAt: now, updatedBy: user.email });
    } else if (r.status === 'diferente' && r.existing) {
      try {
        await db.update('activities', { ...r.existing, ...base, updatedAt: now, updatedBy: user.email }, {
          justificativa_alteracao: `Atualização via importação da planilha de referência "${arquivo}".`,
        });
        res.atualizadas++;
      } catch (e) {
        res.erros.push(`${p.codigo}: ${(e as Error).message}`);
      }
    }
  }
  if (inserts.length) {
    try {
      await db.insertMany('activities', inserts);
      res.inseridas = inserts.length;
    } catch (e) {
      res.erros.push((e as Error).message);
    }
  }
  return res;
}
