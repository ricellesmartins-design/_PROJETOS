// Exportação 1 — Relatório de Atividades (SE-PL-0510-CD001-R0), layout idêntico ao modelo:
// aba oficial "ANTÔNIO DOS ANJOS_SETEMBRO-2026" (estimativas F:H ocultas), cabeçalho mesclado (A1:L1, A2:F2, G2:L2, A3:F3, G3:L3), logo IDG em N1:O3, tabela A:O a partir da
// linha 4, fórmula de total =SUM(K5:Kn), rodapé de assinaturas, estilos/tema originais e aba
// oculta "Planilha1" com os centros de custo (usada pela formatação condicional da coluna M).
import JSZip from 'jszip';
import sheetTpl from '../templates/atividades_sheet.xml?raw';
import stylesXml from '../templates/atividades_styles.xml?raw';
import themeXml from '../templates/atividades_theme.xml?raw';
import drawingTpl from '../templates/atividades_drawing.xml?raw';
import cfTpl from '../templates/atividades_cf.xml?raw';
import { db } from '../lib/db';
import { excelSerial, monthEnd, monthStart, MONTHS_ABBR, MONTHS_PT, networkDays } from '../lib/dates';
import { ABSENCE_DESC, computeEstHours, computeRealHours, isAbsence } from '../services/activities';
import type { Activity, Collaborator } from '../types';
import { download, esc, fitBox, logoSource, safeFileName, toPng, XLSX_MIME } from './common';

// Linhas de ausência (atestado, afastamento, doença, falta) saem grifadas em roxo-claro: os estilos
// usados na linha são clonados no styles.xml do modelo com um preenchimento novo.
const ABS_FILL = 'FFE9D5FF';
const ROW_STYLES = [30, 11, 3, 1, 4, 29, 8, 40];
const { styles: STYLES_XML, hl: HL } = (() => {
  let xml = stylesXml;
  const fillsCount = Number(xml.match(/<fills count="(\d+)"/)![1]);
  xml = xml.replace(/<fills count="\d+">/, `<fills count="${fillsCount + 1}">`).replace('</fills>', `<fill><patternFill patternType="solid"><fgColor rgb="${ABS_FILL}"/><bgColor indexed="64"/></patternFill></fill></fills>`);
  const body = xml.match(/<cellXfs count="\d+">([\s\S]*?)<\/cellXfs>/)![1];
  const xfs = body.match(/<xf\b[^>]*\/>|<xf\b[^>]*>[\s\S]*?<\/xf>/g)!;
  const hl: Record<number, number> = {};
  const extra = ROW_STYLES.map((id, i) => {
    hl[id] = xfs.length + i;
    return xfs[id].replace(/fillId="\d+"/, `fillId="${fillsCount}"`).replace(/^<xf\b(?![^>]*applyFill)/, '<xf applyFill="1"');
  });
  xml = xml.replace(/<cellXfs count="\d+">[\s\S]*?<\/cellXfs>/, `<cellXfs count="${xfs.length + extra.length}">${body}${extra.join('')}</cellXfs>`);
  return { styles: xml, hl };
})();

export interface ActivitySheet {
  collaborator: Collaborator;
  month?: string; // YYYY-MM; ausente = todas as atividades
  activities: Activity[];
}

class SST {
  list: string[] = [];
  private idx = new Map<string, number>();
  get(s: string) {
    let i = this.idx.get(s);
    if (i === undefined) {
      i = this.list.length;
      this.list.push(s);
      this.idx.set(s, i);
    }
    return i;
  }
  xml() {
    const items = this.list.map((s) => `<si><t xml:space="preserve">${esc(s)}</t></si>`).join('');
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="${this.list.length}" uniqueCount="${this.list.length}">${items}</sst>`;
  }
}

type Cell = { s: number; v?: string | number; f?: string };

function rowXml(r: number, cells: (Cell | undefined)[], sst: SST, attrs = '') {
  const cs = cells
    .map((c, i) => {
      if (!c) return '';
      const ref = String.fromCharCode(65 + i) + r;
      if (c.f !== undefined) return `<c r="${ref}" s="${c.s}"><f>${esc(c.f)}</f>${c.v !== undefined ? `<v>${c.v}</v>` : ''}</c>`;
      if (c.v === undefined || c.v === '') return `<c r="${ref}" s="${c.s}"/>`;
      if (typeof c.v === 'number') return `<c r="${ref}" s="${c.s}"><v>${c.v}</v></c>`;
      return `<c r="${ref}" s="${c.s}" t="s"><v>${sst.get(c.v)}</v></c>`;
    })
    .join('');
  return `<row r="${r}" spans="1:15"${attrs}>${cs}</row>`;
}

const d = (iso?: string) => (iso ? excelSerial(iso) : undefined);

export function periodLabel(month?: string) {
  if (!month) return 'GERAL';
  const [y, m] = month.split('-').map(Number);
  return `${MONTHS_PT[m - 1]}/${y}`;
}

export function sheetName(c: Collaborator, month: string | undefined, used: Set<string>) {
  const parts = c.nome.replace(/\(FICTÍCIO\)/i, '').trim().split(/\s+/);
  const short = parts.length > 1 ? `${parts[0]} ${parts[parts.length - 1]}` : parts[0];
  const suffix = month ? ` ${MONTHS_ABBR[Number(month.slice(5)) - 1]}-${month.slice(0, 4)}` : '';
  let base = (short.slice(0, 31 - suffix.length) + suffix).replace(/[\\/?*[\]:]/g, '');
  let name = base;
  for (let i = 2; used.has(name.toUpperCase()); i++) name = base.slice(0, 28) + ` (${i})`;
  used.add(name.toUpperCase());
  return name;
}

function buildSheet(sh: ActivitySheet, sst: SST): string {
  const c = sh.collaborator;
  const rows: string[] = [];
  const H = ' ht="39.950000000000003" customHeight="1"';
  rows.push(
    rowXml(1, [{ s: 51, v: 'RELATÓRIO DE ATIVIDADES CONTRATO AMP ' }, ...Array(10).fill({ s: 52 }), { s: 53 }, { s: 22 }, { s: 42 }, { s: 43 }], sst, ' ht="50.1" customHeight="1"'),
  );
  rows.push(
    rowXml(
      2,
      [{ s: 48, v: `COLABORADOR:  ${c.nome}` }, { s: 54 }, { s: 54 }, { s: 54 }, { s: 54 }, { s: 56 }, { s: 48, v: `MATRÍCULA:  ${c.matricula}` }, { s: 54 }, { s: 49 }, { s: 49 }, { s: 49 }, { s: 50 }, { s: 23 }, { s: 44 }, { s: 45 }],
      sst,
      H,
    ),
  );
  rows.push(
    rowXml(
      3,
      [{ s: 55, v: `FUNÇÃO:  ${c.funcao}` }, { s: 54 }, { s: 54 }, { s: 54 }, { s: 54 }, { s: 56 }, { s: 48, v: `PERÍODO: ${periodLabel(sh.month)}` }, { s: 49 }, { s: 49 }, { s: 49 }, { s: 49 }, { s: 50 }, { s: 24 }, { s: 46 }, { s: 47 }],
      sst,
      H,
    ),
  );
  const heads = ['ID', 'DESCRIÇÃO DA ATIVIDADE', 'SOLICITANTE', 'ÁREA USINA', 'DATA SOLICITAÇÃO', 'ESTIMATIVA DE INÍCIO', 'ESTIMATIVA DE TÉRMINO', 'ESTIMATIVA DE HORAS', 'INÍCIO REAL', 'TÉRMINO REAL', 'HORAS REALIZADAS', 'NÚMERO DO DOCUMENTO AMP', 'CENTRO DE CUSTO', 'STATUS', 'OBSERVAÇÃO'];
  const headStyles = [14, 13, 13, 13, 14, 17, 17, 17, 14, 14, 13, 13, 13, 13, 14];
  rows.push(rowXml(4, heads.map((h, i) => ({ s: headStyles[i], v: h })), sst, ' s="7" customFormat="1" ht="36"'));

  let r = 5;
  const list = [...sh.activities].sort((a, b) => (a.inicioReal ?? a.estInicio ?? a.dataSolicitacao ?? '').localeCompare(b.inicioReal ?? b.estInicio ?? b.dataSolicitacao ?? ''));
  const absRows = new Set<number>();
  for (const a of list) {
    if (isAbsence(a)) absRows.add(r);
    const est = computeEstHours(a);
    const real = computeRealHours(a);
    const estCell: Cell =
      a.estModo === 'auto' && a.estInicio && a.estTermino && a.horasDia
        ? { s: 1, f: `NETWORKDAYS(F${r},G${r})*${a.horasDia}`, v: networkDays(a.estInicio, a.estTermino) * a.horasDia }
        : { s: 1, v: est };
    const realCell: Cell =
      a.realModo === 'auto' && a.inicioReal && a.terminoReal && a.horasDiaReal
        ? { s: 40, f: `NETWORKDAYS(I${r},J${r})*${a.horasDiaReal}`, v: networkDays(a.inicioReal, a.terminoReal) * a.horasDiaReal }
        : { s: 40, v: real };
    const docs = a.documentosAMP.trim();
    const lines = Math.max(docs ? docs.split('\n').length : 1, Math.ceil(a.descricao.length / 85), Math.ceil(a.observacao.length / 65));
    const ht = Math.max(36, lines * 20);
    const abs = isAbsence(a);
    const st = (id: number) => (abs ? HL[id] : id);
    // Ausência: descrição como no modelo ("ATESTADO MÉDICO", "FALTA"...), sem status e centro de custo "-".
    const [origem, ...resto] = a.observacao.split(' · ');
    const descricao = abs ? (a.observacao ? origem : ABSENCE_DESC).toUpperCase() : a.descricao;
    const observacao = abs ? resto.join(' · ') : a.observacao;
    rows.push(
      rowXml(
        r,
        [
          { s: st(30), v: a.codigo },
          { s: st(11), v: descricao },
          { s: st(3), v: a.solicitante },
          { s: st(1), v: a.area },
          { s: st(4), v: d(a.dataSolicitacao) },
          { s: st(4), v: d(a.estInicio) },
          { s: st(4), v: d(a.estTermino) },
          { ...estCell, s: st(estCell.s) },
          { s: st(4), v: d(a.inicioReal) },
          { s: st(4), v: d(a.terminoReal) },
          { ...realCell, s: st(realCell.s) },
          { s: st(29), v: docs },
          { s: st(4), v: abs ? a.centroCusto || '-' : a.centroCusto },
          { s: st(1), v: abs ? '' : a.status },
          { s: st(8), v: observacao },
        ],
        sst,
        ` ht="${ht}" customHeight="1"`,
      ),
    );
    r++;
  }
  const last = Math.max(r - 1, 5);
  const totalReal = list.reduce((s, a) => s + (computeRealHours(a) ?? 0), 0);
  rows.push(
    rowXml(
      r,
      [{ s: 8 }, { s: 11 }, { s: 8 }, { s: 8 }, { s: 8 }, { s: 8 }, { s: 1 }, { s: 1 }, { s: 1 }, { s: 39, v: 'Total' }, { s: 38, f: `SUM(K5:K${last})`, v: totalReal }, { s: 8 }, { s: 41 }, { s: 1 }, { s: 8 }],
      sst,
      ' ht="41.45" customHeight="1"',
    ),
  );
  // Quatro linhas em branco com bordas após o total, como na aba oficial do modelo.
  for (let i = 1; i <= 4; i++) {
    const rr = r + i;
    rows.push(
      rowXml(rr, [{ s: 8 }, { s: i <= 2 ? 11 : 8 }, { s: 8 }, { s: 8 }, { s: 8 }, { s: 8 }, { s: 1 }, { s: 1 }, { s: 1 }, { s: i === 2 ? 26 : 1 }, { s: 1 }, { s: 8 }, { s: 8 }, { s: 1 }, { s: 8 }], sst, ' ht="39.6" customHeight="1"'),
    );
  }
  // A validação do centro de custo (vermelho/verde) não se aplica às linhas de ausência.
  const cfRows = Array.from({ length: Math.max(last, 5) - 4 }, (_, i) => i + 5).filter((n) => !absRows.has(n));
  const cfRange = cfRows.length ? cfRows.reduce<string[]>((acc, n, i) => (i && cfRows[i - 1] === n - 1 ? (acc[acc.length - 1] = acc[acc.length - 1].replace(/:M\d+$/, '') + `:M${n}`, acc) : [...acc, `M${n}:M${n}`]), []).join(' ') : 'M5:M5';
  const cf = cfTpl.replace(/M5:M7 M9:M91/g, cfRange);
  const cfMain = cf.slice(0, cf.indexOf('<extLst>'));
  const cfExt = cf.slice(cf.indexOf('<extLst>'));
  return sheetTpl
    .replace(/<dimension ref="[^"]*"\/>/, `<dimension ref="A1:O${r + 4}"/>`)
    .replace('<sheetData/>', `<sheetData>${rows.join('')}</sheetData>`)
    .replace('<pageMargins', `${cfMain.trim()}<pageMargins`)
    .replace('</worksheet>', `${cfExt.trim()}</worksheet>`)
    .replace(/tabSelected="1" /, '');
}

function costCenterSheet(sst: SST): string {
  const rows = [
    `<row r="1"><c r="A1" t="s"><v>${sst.get('Centro custo')}</v></c><c r="B1" t="s"><v>${sst.get('Denominação')}</v></c><c r="C1" t="s"><v>${sst.get('Responsável')}</v></c></row>`,
    ...db.all('costCenters').map(
      (c, i) =>
        `<row r="${i + 2}"><c r="A${i + 2}" t="s"><v>${sst.get(c.codigo)}</v></c><c r="B${i + 2}" t="s"><v>${sst.get(c.denominacao)}</v></c><c r="C${i + 2}" t="s"><v>${sst.get(c.responsavel)}</v></c></row>`,
    ),
  ];
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheetData>${rows.join('')}</sheetData></worksheet>`;
}

export async function buildActivitiesWorkbook(sheets: ActivitySheet[]): Promise<Blob> {
  if (!sheets.length) throw new Error('Nenhuma aba para exportar.');
  const zip = new JSZip();
  const sst = new SST();
  const logo = await toPng(logoSource());
  // Área N1:O3 do modelo: caixa de ~3,99 x 1,42 cm (EMU) a partir de N1 com deslocamento original.
  const box = fitBox(logo, 3985847, 1424276);
  const drawing = drawingTpl
    .replace(/<xdr:twoCellAnchor editAs="oneCell"><xdr:from>.*?<\/xdr:from><xdr:to>.*?<\/xdr:to>/s, `<xdr:oneCellAnchor><xdr:from><xdr:col>13</xdr:col><xdr:colOff>${835269 + box.dx}</xdr:colOff><xdr:row>0</xdr:row><xdr:rowOff>${146538 + box.dy}</xdr:rowOff></xdr:from><xdr:ext cx="${box.cx}" cy="${box.cy}"/>`)
    .replace('</xdr:twoCellAnchor>', '</xdr:oneCellAnchor>')
    .replace(/<a:ext cx="\d+" cy="\d+"\/>/, `<a:ext cx="${box.cx}" cy="${box.cy}"/>`)
    .replace('name="Imagem 2"', 'name="Logo IDG Engenharia"');

  const used = new Set<string>();
  const names: string[] = [];
  sheets.forEach((sh, i) => {
    const n = i + 1;
    names.push(sheetName(sh.collaborator, sh.month, used));
    zip.file(`xl/worksheets/sheet${n}.xml`, buildSheet(sh, sst));
    zip.file(
      `xl/worksheets/_rels/sheet${n}.xml.rels`,
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing" Target="../drawings/drawing${n}.xml"/></Relationships>`,
    );
    zip.file(`xl/drawings/drawing${n}.xml`, drawing);
    zip.file(
      `xl/drawings/_rels/drawing${n}.xml.rels`,
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/image1.png"/></Relationships>`,
    );
  });
  const ccIndex = sheets.length + 1;
  zip.file(`xl/worksheets/sheet${ccIndex}.xml`, costCenterSheet(sst));
  zip.file('xl/media/image1.png', logo.bytes);
  zip.file('xl/styles.xml', STYLES_XML);
  zip.file('xl/theme/theme1.xml', themeXml);
  zip.file('xl/sharedStrings.xml', sst.xml());

  const sheetEntries = names.map((nm, i) => `<sheet name="${esc(nm)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('') + `<sheet name="Planilha1" sheetId="${ccIndex}" state="hidden" r:id="rId${ccIndex}"/>`;
  const defined = names.map((nm, i) => `<definedName name="_xlnm.Print_Titles" localSheetId="${i}">'${esc(nm.replace(/'/g, "''"))}'!$1:$4</definedName>`).join('');
  zip.file(
    'xl/workbook.xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><workbookPr defaultThemeVersion="166925"/><bookViews><workbookView xWindow="-120" yWindow="-120" windowWidth="29040" windowHeight="15720" tabRatio="725" activeTab="0"/></bookViews><sheets>${sheetEntries}</sheets><definedNames>${defined}</definedNames><calcPr calcId="191028" fullCalcOnLoad="1"/></workbook>`,
  );
  const rels = [
    ...Array.from({ length: ccIndex }, (_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`),
    `<Relationship Id="rId${ccIndex + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>`,
    `<Relationship Id="rId${ccIndex + 2}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme" Target="theme/theme1.xml"/>`,
    `<Relationship Id="rId${ccIndex + 3}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings" Target="sharedStrings.xml"/>`,
  ];
  zip.file('xl/_rels/workbook.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${rels.join('')}</Relationships>`);
  zip.file(
    '_rels/.rels',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
  );
  const now = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
  zip.file(
    'docProps/core.xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:dcmitype="http://purl.org/dc/dcmitype/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>SE-PL-0510-CD001-R0 RELATÓRIO DE ATIVIDADES</dc:title><dc:creator>IDG Engenharia</dc:creator><cp:lastModifiedBy>IDG Engenharia</cp:lastModifiedBy><dcterms:created xsi:type="dcterms:W3CDTF">${now}</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">${now}</dcterms:modified></cp:coreProperties>`,
  );
  zip.file(
    'docProps/app.xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes"><Application>Microsoft Excel</Application><Company>IDG Engenharia</Company></Properties>`,
  );
  const ct = [
    '<Default Extension="png" ContentType="image/png"/>',
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>',
    '<Default Extension="xml" ContentType="application/xml"/>',
    '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>',
    ...Array.from({ length: ccIndex }, (_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`),
    ...sheets.map((_, i) => `<Override PartName="/xl/drawings/drawing${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/>`),
    '<Override PartName="/xl/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/>',
    '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>',
    '<Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/>',
    '<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>',
    '<Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>',
  ];
  zip.file('[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">${ct.join('')}</Types>`);
  const buf = await zip.generateAsync({ type: 'arraybuffer', compression: 'DEFLATE' });
  return new Blob([buf], { type: XLSX_MIME });
}

/** Monta as abas (uma por colaborador × mês) a partir de filtros. */
export function planSheets(collaborators: Collaborator[], activities: Activity[], months: string[]): ActivitySheet[] {
  const out: ActivitySheet[] = [];
  for (const c of collaborators) {
    const mine = activities.filter((a) => a.collaboratorId === c.id);
    if (!months.length) {
      if (mine.length) out.push({ collaborator: c, activities: mine });
      continue;
    }
    for (const m of months) {
      const ms = monthStart(m);
      const me = monthEnd(m);
      const inMonth = mine.filter((a) => {
        const s = a.inicioReal ?? a.estInicio ?? a.dataSolicitacao ?? a.createdAt.slice(0, 10);
        const e = a.terminoReal ?? (a.status === 'Finalizado' || a.status === 'Cancelado' ? a.estTermino ?? s : '9999-12-31');
        return s <= me && e >= ms;
      });
      if (inMonth.length) out.push({ collaborator: c, month: m, activities: inMonth });
    }
  }
  return out;
}

export async function exportActivities(sheets: ActivitySheet[], fileHint: string) {
  const blob = await buildActivitiesWorkbook(sheets);
  download(blob, `SE-PL-0510-CD001-R0 RELATORIO DE ATIVIDADES_${safeFileName(fileHint)}.xlsx`);
}
