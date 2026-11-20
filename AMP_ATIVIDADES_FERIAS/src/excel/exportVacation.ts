// Exportação 2 — Formulário de Solicitação de Férias (ADM-PF158), preenchido sobre o arquivo
// oficial: mantém mesclagens, bordas, checkboxes nativos do Excel, bloco de observações e logos.
import JSZip from 'jszip';
import templateUrl from '../templates/ADM-PF158.xlsx?url';
import { db } from '../lib/db';
import { excelSerial, fmtDateTimeBR } from '../lib/dates';
import type { Collaborator, VacationRequest } from '../types';
import { download, esc, fitBox, logoSource, safeFileName, sealsSource, toPng, XLSX_MIME } from './common';

/** Substitui a célula `ref` (vazia ou não) preservando o estilo, ou com estilo informado. */
function setCell(xml: string, ref: string, value: { str?: string; num?: number; bool?: boolean }, style?: number): string {
  const re = new RegExp(`<c r="${ref}"( s="(\\d+)")?( t="\\w+")?(/>|>.*?</c>)`);
  const m = xml.match(re);
  if (!m) throw new Error(`Célula ${ref} não encontrada no modelo.`);
  const s = style ?? (m[2] ? Number(m[2]) : undefined);
  const sAttr = s !== undefined ? ` s="${s}"` : '';
  let cell: string;
  if (value.bool !== undefined) cell = `<c r="${ref}"${sAttr} t="b"><v>${value.bool ? 1 : 0}</v></c>`;
  else if (value.num !== undefined) cell = `<c r="${ref}"${sAttr}><v>${value.num}</v></c>`;
  else cell = `<c r="${ref}"${sAttr} t="inlineStr"><is><t xml:space="preserve">${esc(value.str ?? '')}</t></is></c>`;
  return xml.replace(re, cell);
}

const CHECKBOX: Record<VacationRequest['modalidade'], string> = {
  '30': 'B7',
  '15+15': 'D7',
  '20+10abono': 'J7',
  '20+10': 'B8',
  '10+20': 'B8',
  '19+11': 'D8',
};

function anchorFor(drawing: string, rId: string, img: { width: number; height: number }, boxW: number, boxH: number) {
  // Converte a âncora da imagem `rId` em oneCellAnchor com a proporção da nova imagem.
  const re = /<xdr:twoCellAnchor editAs="oneCell">[\s\S]*?<\/xdr:twoCellAnchor>/g;
  return drawing.replace(re, (block) => {
    if (!block.includes(`r:embed="${rId}"`)) return block;
    const from = block.match(/<xdr:from><xdr:col>(\d+)<\/xdr:col><xdr:colOff>(\d+)<\/xdr:colOff><xdr:row>(\d+)<\/xdr:row><xdr:rowOff>(\d+)<\/xdr:rowOff><\/xdr:from>/);
    if (!from) return block;
    const box = fitBox({ bytes: new Uint8Array(), ...img }, boxW, boxH);
    return block
      .replace('<xdr:twoCellAnchor editAs="oneCell">', '<xdr:oneCellAnchor>')
      .replace('</xdr:twoCellAnchor>', '</xdr:oneCellAnchor>')
      .replace(
        /<xdr:from>[\s\S]*?<\/xdr:from><xdr:to>[\s\S]*?<\/xdr:to>/,
        `<xdr:from><xdr:col>${from[1]}</xdr:col><xdr:colOff>${Number(from[2]) + box.dx}</xdr:colOff><xdr:row>${from[3]}</xdr:row><xdr:rowOff>${Number(from[4]) + box.dy}</xdr:rowOff></xdr:from><xdr:ext cx="${box.cx}" cy="${box.cy}"/>`,
      )
      .replace(/<a:ext cx="\d+" cy="\d+"\/>/, `<a:ext cx="${box.cx}" cy="${box.cy}"/>`);
  });
}

export async function buildVacationForm(v: VacationRequest, c: Collaborator): Promise<Blob> {
  const buf = await (await fetch(templateUrl)).arrayBuffer();
  const zip = await JSZip.loadAsync(buf);
  let sheet = await zip.file('xl/worksheets/sheet1.xml')!.async('string');
  let styles = await zip.file('xl/styles.xml')!.async('string');
  const settings = db.settings;

  // Estilo extra para o registro digital de aprovação (cópia do xf 3 com alinhamento centralizado e quebra).
  const count = Number(styles.match(/<cellXfs count="(\d+)"/)![1]);
  styles = styles
    .replace(/<cellXfs count="\d+"/, `<cellXfs count="${count + 1}"`)
    .replace('</cellXfs>', '<xf numFmtId="0" fontId="0" fillId="2" borderId="1" xfId="0" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf></cellXfs>');
  const approvalStyle = count;

  sheet = setCell(sheet, 'D3', { str: c.nome });
  sheet = setCell(sheet, 'D4', { str: v.secao || settings.secaoPadrao });
  sheet = setCell(sheet, 'D5', { str: settings.gestorNome });
  sheet = sheet.replace(/<c r="L5" s="(\d+)"><f ca="1">TODAY\(\)<\/f><v>\d+<\/v><\/c>/, `<c r="L5" s="$1"><v>${excelSerial(v.dataSolicitacao)}</v></c>`);
  for (const ref of ['B7', 'D7', 'J7', 'B8', 'D8']) sheet = setCell(sheet, ref, { bool: CHECKBOX[v.modalidade] === ref });
  const [p1, p2] = v.periodos;
  if (p1) {
    sheet = setCell(sheet, 'D10', { num: excelSerial(p1.inicio) });
    sheet = setCell(sheet, 'L10', { num: excelSerial(p1.fim) });
  }
  if (p2) {
    sheet = setCell(sheet, 'D12', { num: excelSerial(p2.inicio) });
    sheet = setCell(sheet, 'L12', { num: excelSerial(p2.fim) });
  }
  if (v.status === 'Aprovada') {
    const txt = `Aprovado digitalmente por ${v.aprovadoPor ?? settings.gestorNome} em ${fmtDateTimeBR(v.aprovadoEm)}${v.chamadoRH ? ` · Chamado RH nº ${v.chamadoRH}` : ''}`;
    sheet = setCell(sheet, 'D22', { str: txt }, approvalStyle);
    sheet = sheet.replace('<mergeCells count="33">', '<mergeCells count="34"><mergeCell ref="D22:L22"/>');
  }

  // Logos: IDG (B2, image2) e selos/certificações (M2, image1).
  let drawing = await zip.file('xl/drawings/drawing1.xml')!.async('string');
  const logo = await toPng(logoSource());
  zip.file('xl/media/image2.png', logo.bytes);
  drawing = anchorFor(drawing, 'rId2', logo, 1301065, 446942);
  if (settings.selosDataUrl) {
    const seals = await toPng(sealsSource());
    zip.file('xl/media/image1.png', seals.bytes);
    drawing = anchorFor(drawing, 'rId1', seals, 1137322, 428400);
  }
  zip.file('xl/drawings/drawing1.xml', drawing);
  zip.file('xl/worksheets/sheet1.xml', sheet);
  zip.file('xl/styles.xml', styles);
  // Força recálculo ao abrir.
  const wb = await zip.file('xl/workbook.xml')!.async('string');
  zip.file('xl/workbook.xml', wb.replace(/<calcPr ([^>]*)\/>/, (_m, a) => `<calcPr ${a.replace(/ fullCalcOnLoad="\d"/, '')} fullCalcOnLoad="1"/>`));
  const out = await zip.generateAsync({ type: 'arraybuffer', compression: 'DEFLATE' });
  return new Blob([out], { type: XLSX_MIME });
}

export async function exportVacationForm(v: VacationRequest, c: Collaborator) {
  const blob = await buildVacationForm(v, c);
  download(blob, `ADM-PF158 - FORMULARIO DE SOLICITACAO DE FERIAS_${safeFileName(c.nome)}_${v.periodos[0]?.inicio ?? ''}.xlsx`);
}
