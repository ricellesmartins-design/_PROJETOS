// Apresentação do sistema em 16:9, gerada em PowerPoint (pptxgenjs, editável) e em PDF (jsPDF)
// a partir do mesmo modelo de slides: mesmo conteúdo e mesma ordem nos dois formatos.
import { importFresh } from '../lib/reload';
import { db } from '../lib/db';
import { todayISO, fmtBR } from '../lib/dates';
import { download, logoSource } from '../excel/common';
import { APP_FILE_NAME, APP_NAME, APP_SUBTITLE, CAPTURE_PAGES, SLIDE_BENEFITS, SLIDE_BULLETS, SLIDE_PROBLEM, SLIDE_SOLUTION } from './content';
import { composeWithMarkers, toDataUrl } from './capture';
import { fmtH, fmtMin, timeTotals, type ManualData } from './data';
import { pdfSafe } from './markup';
import type PptxGen from 'pptxgenjs';

type PSlide = ReturnType<PptxGen['addSlide']>;
type PRows = Parameters<PSlide['addTable']>[0];

const NAVY = '1B2A5C';
const BLUE = '24418F';
const ORANGE = 'F28C1B';
const GRAY = '64748B';
const LIGHT = 'F1F5F9';
const W = 13.333;
const H = 7.5;
const APP_URL = 'https://idg-amp-gestao.netlify.app';

type Img = { dataUrl: string; w: number; h: number };
type Slide =
  | { kind: 'cover' }
  | { kind: 'list'; title: string; kicker: string; items: string[]; tone: 'problem' | 'solution' }
  | { kind: 'module'; title: string; items: string[]; img?: Img; legenda?: string; n: number }
  | { kind: 'time' }
  | { kind: 'benefits' }
  | { kind: 'end' };

interface Deck {
  date: string;
  logo: Img;
  slides: Slide[];
  t: ReturnType<typeof timeTotals>;
  gestor: string;
}

async function buildDeck(data: ManualData): Promise<Deck> {
  const logo = await toDataUrl(logoSource());
  const byPage = new Map(data.chapters.filter((c) => c.captura).map((c) => [c.captura!, c]));
  const modules: Slide[] = [];
  let n = 0;
  for (const p of CAPTURE_PAGES) {
    const items = SLIDE_BULLETS[p.pagina];
    if (!items) continue; // a tela de login não vira slide de módulo
    const cap = data.captures[p.pagina];
    const img = cap ? await composeWithMarkers(cap.imagem_url, cap.marcadores) : undefined;
    modules.push({ kind: 'module', title: byPage.get(p.pagina)?.titulo ?? p.legenda, items, img, legenda: cap?.legenda || p.legenda, n: ++n });
  }
  return {
    date: fmtBR(todayISO()),
    logo,
    t: timeTotals(data.timeRows),
    gestor: db.settings.gestorNome || 'Coordenação do Contrato AMP',
    slides: [
      { kind: 'cover' },
      { kind: 'list', kicker: 'O problema', title: 'Como o controle é feito hoje, de forma manual', items: SLIDE_PROBLEM, tone: 'problem' },
      { kind: 'list', kicker: 'A solução', title: `${APP_NAME}: visão geral`, items: SLIDE_SOLUTION, tone: 'solution' },
      ...modules,
      { kind: 'time' },
      { kind: 'benefits' },
      { kind: 'end' },
    ],
  };
}

const fit = (img: Img, bw: number, bh: number) => {
  const r = img.w / img.h;
  let w = bw;
  let h = w / r;
  if (h > bh) {
    h = bh;
    w = h * r;
  }
  return { w, h, dx: (bw - w) / 2, dy: (bh - h) / 2 };
};
const shortLabel = (s: string) => (s.length > 34 ? s.slice(0, 32).trimEnd() + '…' : s);
const fileName = (ext: string) => `Apresentacao_${APP_FILE_NAME}_${todayISO()}.${ext}`;

// ---------------------------------------------------------------- PowerPoint
export async function exportPptx(data: ManualData) {
  const deck = await buildDeck(data);
  const { default: PptxGenJS } = await importFresh(() => import('pptxgenjs'));
  const pptx = new PptxGenJS();
  pptx.layout = 'LAYOUT_WIDE';
  pptx.title = `Apresentação · ${APP_NAME}`;
  pptx.company = 'IDG Engenharia';
  const font = 'Segoe UI';
  const logoBox = (s: PSlide, x: number, y: number, bw: number, bh: number) => {
    const f = fit(deck.logo, bw - 0.16, bh - 0.12);
    s.addShape(pptx.ShapeType.roundRect, { x, y, w: bw, h: bh, fill: { color: 'FFFFFF' }, line: { color: 'FFFFFF' }, rectRadius: 0.08 });
    s.addImage({ data: deck.logo.dataUrl, x: x + 0.08 + f.dx, y: y + 0.06 + f.dy, w: f.w, h: f.h });
  };
  const header = (s: PSlide, title: string, kicker?: string) => {
    s.background = { color: 'FFFFFF' };
    s.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: W, h: 1.0, fill: { color: NAVY }, line: { color: NAVY } });
    s.addShape(pptx.ShapeType.rect, { x: 0, y: 1.0, w: W, h: 0.06, fill: { color: ORANGE }, line: { color: ORANGE } });
    if (kicker) s.addText(kicker.toUpperCase(), { x: 0.5, y: 0.1, w: 9.8, h: 0.3, fontFace: font, fontSize: 11, bold: true, color: ORANGE, charSpacing: 2 });
    s.addText(title, { x: 0.5, y: kicker ? 0.38 : 0.2, w: 10.2, h: kicker ? 0.55 : 0.6, fontFace: font, fontSize: 24, bold: true, color: 'FFFFFF', fit: 'shrink' });
    logoBox(s, W - 2.2, 0.17, 1.8, 0.66);
  };
  const footer = (s: PSlide, i: number) => {
    s.addText(`${APP_NAME} · ${APP_SUBTITLE}`, { x: 0.5, y: H - 0.42, w: 10, h: 0.3, fontFace: font, fontSize: 9, color: GRAY });
    s.addText(String(i), { x: W - 1.0, y: H - 0.42, w: 0.5, h: 0.3, fontFace: font, fontSize: 9, color: GRAY, align: 'right' });
  };

  deck.slides.forEach((sl, idx) => {
    const s = pptx.addSlide();
    const i = idx + 1;
    if (sl.kind === 'cover' || sl.kind === 'end') {
      s.background = { color: NAVY };
      s.addShape(pptx.ShapeType.rect, { x: 0, y: H - 0.35, w: W, h: 0.35, fill: { color: ORANGE }, line: { color: ORANGE } });
      logoBox(s, 0.7, 0.6, 2.6, 0.95);
      if (sl.kind === 'cover') {
        s.addText(APP_NAME, { x: 0.7, y: 2.3, w: 11.5, h: 1.2, fontFace: font, fontSize: 44, bold: true, color: 'FFFFFF' });
        s.addText(APP_SUBTITLE, { x: 0.7, y: 3.5, w: 11.5, h: 0.6, fontFace: font, fontSize: 20, color: 'CBD5E1' });
        s.addText('Apresentação do sistema', { x: 0.7, y: 4.4, w: 11.5, h: 0.5, fontFace: font, fontSize: 16, bold: true, color: ORANGE });
        s.addText(deck.date, { x: 0.7, y: 4.9, w: 11.5, h: 0.4, fontFace: font, fontSize: 14, color: 'CBD5E1' });
      } else {
        s.addText('Obrigado!', { x: 0.7, y: 2.2, w: 11.5, h: 1.1, fontFace: font, fontSize: 44, bold: true, color: 'FFFFFF' });
        s.addText(
          [
            { text: 'Contato', options: { bold: true, color: ORANGE, fontSize: 16, breakLine: true } },
            { text: deck.gestor, options: { color: 'FFFFFF', fontSize: 18, breakLine: true } },
            { text: 'Coordenação · Contrato AMP · IDG Engenharia', options: { color: 'CBD5E1', fontSize: 14, breakLine: true } },
            { text: `Acesse: ${APP_URL}`, options: { color: 'CBD5E1', fontSize: 14, hyperlink: { url: APP_URL } } },
          ],
          { x: 0.7, y: 3.5, w: 11.5, h: 2, fontFace: font, valign: 'top' },
        );
      }
      return;
    }
    if (sl.kind === 'list') {
      header(s, sl.title, sl.kicker);
      const color = sl.tone === 'problem' ? 'DC2626' : '16A34A';
      sl.items.forEach((t, k) => {
        const y = 1.5 + k * 1.0;
        s.addShape(pptx.ShapeType.roundRect, { x: 0.7, y, w: 11.9, h: 0.82, fill: { color: LIGHT }, line: { color: 'E2E8F0' }, rectRadius: 0.06 });
        s.addShape(pptx.ShapeType.ellipse, { x: 0.9, y: y + 0.18, w: 0.46, h: 0.46, fill: { color }, line: { color } });
        s.addText(sl.tone === 'problem' ? '!' : '✓', { x: 0.9, y: y + 0.18, w: 0.46, h: 0.46, fontFace: font, fontSize: 16, bold: true, color: 'FFFFFF', align: 'center', valign: 'middle' });
        s.addText(t, { x: 1.6, y, w: 10.8, h: 0.82, fontFace: font, fontSize: 18, color: '1E293B', valign: 'middle' });
      });
      footer(s, i);
      return;
    }
    if (sl.kind === 'module') {
      header(s, sl.title, `Módulo ${sl.n}`);
      const bx = 0.5,
        by = 1.35,
        bw = 8.3,
        bh = 5.2;
      if (sl.img) {
        const f = fit(sl.img, bw, bh);
        s.addShape(pptx.ShapeType.rect, { x: bx + f.dx - 0.03, y: by + f.dy - 0.03, w: f.w + 0.06, h: f.h + 0.06, fill: { color: 'E2E8F0' }, line: { color: 'CBD5E1' } });
        s.addImage({ data: sl.img.dataUrl, x: bx + f.dx, y: by + f.dy, w: f.w, h: f.h });
      } else {
        s.addShape(pptx.ShapeType.rect, { x: bx, y: by, w: bw, h: bh, fill: { color: LIGHT }, line: { color: 'CBD5E1', dashType: 'dash' } });
        s.addText('Captura de tela ainda não gerada.\nNo Manual, use "Gerar/atualizar capturas de tela".', { x: bx, y: by, w: bw, h: bh, fontFace: font, fontSize: 14, color: GRAY, align: 'center', valign: 'middle' });
      }
      if (sl.legenda) s.addText(sl.legenda, { x: bx, y: by + bh + 0.05, w: bw, h: 0.3, fontFace: font, fontSize: 10, italic: true, color: GRAY, align: 'center' });
      s.addText('Funcionalidades', { x: 9.1, y: 1.35, w: 3.8, h: 0.4, fontFace: font, fontSize: 14, bold: true, color: BLUE });
      s.addText(
        sl.items.map((t) => ({ text: t, options: { bullet: { indent: 18 }, breakLine: true, paraSpaceAfter: 10 } })),
        { x: 9.1, y: 1.8, w: 3.85, h: 4.8, fontFace: font, fontSize: 14, color: '1E293B', valign: 'top', fit: 'shrink' },
      );
      footer(s, i);
      return;
    }
    if (sl.kind === 'time') {
      header(s, 'Ganho de tempo: manual x sistema', 'Comparativo');
      const t = deck.t;
      const rows: PRows = [
        ['Atividade', 'Controle manual (planilha/papel)', 'Com o sistema', 'Economia'].map((h) => ({ text: h, options: { bold: true, color: 'FFFFFF', fill: { color: NAVY }, fontSize: 10 } })),
        ...t.per.map((r, k) => [
          { text: `${r.atividade} (${r.volumeMes}/mês)`, options: { fontSize: 9, fill: { color: k % 2 ? 'FFFFFF' : LIGHT } } },
          { text: fmtMin(r.manualMin), options: { fontSize: 9, align: 'center' as const, fill: { color: k % 2 ? 'FFFFFF' : LIGHT } } },
          { text: fmtMin(r.sistemaMin), options: { fontSize: 9, align: 'center' as const, fill: { color: k % 2 ? 'FFFFFF' : LIGHT } } },
          { text: `${fmtH(r.economiaH)} h/mês (${r.pct}%)`, options: { fontSize: 9, bold: true, color: '15803D', align: 'center' as const, fill: { color: k % 2 ? 'FFFFFF' : LIGHT } } },
        ]),
        [
          { text: 'Total por mês', options: { bold: true, fontSize: 10, fill: { color: 'FEF3C7' } } },
          { text: `${fmtH(t.manualMes)} h`, options: { bold: true, fontSize: 10, align: 'center', fill: { color: 'FEF3C7' } } },
          { text: `${fmtH(t.sistemaMes)} h`, options: { bold: true, fontSize: 10, align: 'center', fill: { color: 'FEF3C7' } } },
          { text: `${fmtH(t.mes)} h (${t.pct}%)`, options: { bold: true, fontSize: 10, color: '15803D', align: 'center', fill: { color: 'FEF3C7' } } },
        ],
      ];
      s.addTable(rows, { x: 0.4, y: 1.3, w: 7.6, colW: [3.7, 1.35, 1.1, 1.45], fontFace: font, color: '1E293B', border: { type: 'solid', pt: 0.5, color: 'CBD5E1' }, valign: 'middle', rowH: 0.36 });
      s.addChart(
        pptx.ChartType.bar,
        [
          // Barras horizontais desenham a 1ª categoria embaixo: inverte para seguir a ordem da tabela.
          { name: 'Manual (h/mês)', labels: [...t.per].reverse().map((r) => shortLabel(r.atividade)), values: [...t.per].reverse().map((r) => Math.round(r.manualH * 10) / 10) },
          { name: 'Sistema (h/mês)', labels: [...t.per].reverse().map((r) => shortLabel(r.atividade)), values: [...t.per].reverse().map((r) => Math.round(r.sistemaH * 10) / 10) },
        ],
        {
          x: 8.2,
          y: 1.25,
          w: 4.8,
          h: 4.15,
          barDir: 'bar',
          barGrouping: 'clustered',
          chartColors: [ORANGE, BLUE],
          showLegend: true,
          legendPos: 'b',
          legendFontSize: 9,
          catAxisLabelFontSize: 8,
          valAxisLabelFontSize: 8,
          showValue: true,
          dataLabelFontSize: 7,
          dataLabelFormatCode: '0.#',
          showTitle: true,
          title: 'Horas por mês',
          titleFontSize: 11,
          titleColor: NAVY,
        },
      );
      s.addShape(pptx.ShapeType.roundRect, { x: 8.2, y: 5.5, w: 4.8, h: 1.25, fill: { color: 'DCFCE7' }, line: { color: '86EFAC' }, rectRadius: 0.08 });
      s.addText(
        [
          { text: `${fmtH(t.mes)} h economizadas por mês`, options: { bold: true, fontSize: 18, color: '15803D', breakLine: true } },
          { text: `${fmtH(t.ano)} h por ano · ${t.pct}% menos tempo`, options: { bold: true, fontSize: 13, color: '166534' } },
        ],
        { x: 8.3, y: 5.5, w: 4.6, h: 1.25, fontFace: font, align: 'center', valign: 'middle' },
      );
      s.addText('* Valores estimados, ajustáveis no Manual › Ganho de tempo. Tempos por ocorrência; volume mensal entre parênteses.', { x: 0.4, y: H - 0.75, w: 7.6, h: 0.3, fontFace: font, fontSize: 9, italic: true, color: 'B45309' });
      footer(s, i);
      return;
    }
    // benefits
    header(s, 'Benefícios', 'Resultados');
    SLIDE_BENEFITS.forEach(([t, d], k) => {
      const x = 0.5 + (k % 3) * 4.15;
      const y = 1.45 + Math.floor(k / 3) * 2.75;
      s.addShape(pptx.ShapeType.roundRect, { x, y, w: 3.95, h: 2.5, fill: { color: LIGHT }, line: { color: 'E2E8F0' }, rectRadius: 0.08 });
      s.addShape(pptx.ShapeType.rect, { x, y, w: 0.1, h: 2.5, fill: { color: ORANGE }, line: { color: ORANGE } });
      s.addText(t, { x: x + 0.3, y: y + 0.25, w: 3.5, h: 0.5, fontFace: font, fontSize: 20, bold: true, color: NAVY });
      s.addText(d, { x: x + 0.3, y: y + 0.85, w: 3.5, h: 1.4, fontFace: font, fontSize: 14, color: '334155', valign: 'top' });
    });
    footer(s, i);
  });
  const blob = (await pptx.write({ outputType: 'blob' })) as Blob;
  download(blob, fileName('pptx'));
}

// ---------------------------------------------------------------- PDF
export async function exportPresentationPdf(data: ManualData) {
  const deck = await buildDeck(data);
  const [{ jsPDF }, { default: autoTable }] = await importFresh(() => Promise.all([import('jspdf'), import('jspdf-autotable')]));
  const doc = new jsPDF({ orientation: 'landscape', unit: 'in', format: [W, H], compress: true });
  const rgb = (hex: string) => [parseInt(hex.slice(0, 2), 16), parseInt(hex.slice(2, 4), 16), parseInt(hex.slice(4, 6), 16)] as [number, number, number];
  const fill = (hex: string) => doc.setFillColor(...rgb(hex));
  const color = (hex: string) => doc.setTextColor(...rgb(hex));
  const rect = (x: number, y: number, w: number, h: number, hex: string, r = 0) => {
    fill(hex);
    if (r) doc.roundedRect(x, y, w, h, r, r, 'F');
    else doc.rect(x, y, w, h, 'F');
  };
  const text = (s: string, x: number, y: number, o: { size: number; bold?: boolean; italic?: boolean; hex?: string; w?: number; align?: 'left' | 'center' | 'right'; lh?: number }) => {
    doc.setFont('helvetica', o.bold && o.italic ? 'bolditalic' : o.bold ? 'bold' : o.italic ? 'italic' : 'normal');
    doc.setFontSize(o.size);
    color(o.hex ?? '1E293B');
    const lines = o.w ? (doc.splitTextToSize(pdfSafe(s), o.w) as string[]) : [pdfSafe(s)];
    const lh = (o.size / 72) * (o.lh ?? 1.25);
    lines.forEach((l, k) => doc.text(l, o.align === 'center' && o.w ? x + o.w / 2 : o.align === 'right' && o.w ? x + o.w : x, y + k * lh, { align: o.align ?? 'left', baseline: 'top' }));
    return lines.length * lh;
  };
  const logoBox = (x: number, y: number, bw: number, bh: number) => {
    rect(x, y, bw, bh, 'FFFFFF', 0.08);
    const f = fit(deck.logo, bw - 0.16, bh - 0.12);
    doc.addImage(deck.logo.dataUrl, 'PNG', x + 0.08 + f.dx, y + 0.06 + f.dy, f.w, f.h);
  };
  const header = (title: string, kicker?: string) => {
    rect(0, 0, W, 1.0, NAVY);
    rect(0, 1.0, W, 0.06, ORANGE);
    if (kicker) text(kicker.toUpperCase(), 0.5, 0.16, { size: 11, bold: true, hex: ORANGE });
    text(title, 0.5, kicker ? 0.42 : 0.3, { size: 24, bold: true, hex: 'FFFFFF', w: 10.2 });
    logoBox(W - 2.2, 0.17, 1.8, 0.66);
  };
  const footer = (i: number) => {
    text(`${APP_NAME} · ${APP_SUBTITLE}`, 0.5, H - 0.38, { size: 9, hex: GRAY });
    text(String(i), W - 1.0, H - 0.38, { size: 9, hex: GRAY, w: 0.5, align: 'right' });
  };

  deck.slides.forEach((sl, idx) => {
    if (idx) doc.addPage([W, H], 'landscape');
    const i = idx + 1;
    if (sl.kind === 'cover' || sl.kind === 'end') {
      rect(0, 0, W, H, NAVY);
      rect(0, H - 0.35, W, 0.35, ORANGE);
      logoBox(0.7, 0.6, 2.6, 0.95);
      if (sl.kind === 'cover') {
        text(APP_NAME, 0.7, 2.45, { size: 44, bold: true, hex: 'FFFFFF', w: 11.5 });
        text(APP_SUBTITLE, 0.7, 3.6, { size: 20, hex: 'CBD5E1', w: 11.5 });
        text('Apresentação do sistema', 0.7, 4.45, { size: 16, bold: true, hex: ORANGE });
        text(deck.date, 0.7, 4.95, { size: 14, hex: 'CBD5E1' });
      } else {
        text('Obrigado!', 0.7, 2.3, { size: 44, bold: true, hex: 'FFFFFF' });
        text('Contato', 0.7, 3.55, { size: 16, bold: true, hex: ORANGE });
        text(deck.gestor, 0.7, 3.9, { size: 18, hex: 'FFFFFF' });
        text('Coordenação · Contrato AMP · IDG Engenharia', 0.7, 4.3, { size: 14, hex: 'CBD5E1' });
        text(`Acesse: ${APP_URL}`, 0.7, 4.62, { size: 14, hex: 'CBD5E1' });
        doc.link(0.7, 4.62, 5.5, 0.3, { url: APP_URL });
      }
      return;
    }
    if (sl.kind === 'list') {
      header(sl.title, sl.kicker);
      const c = sl.tone === 'problem' ? 'DC2626' : '16A34A';
      sl.items.forEach((t, k) => {
        const y = 1.5 + k * 1.0;
        rect(0.7, y, 11.9, 0.82, LIGHT, 0.06);
        fill(c);
        doc.circle(1.13, y + 0.41, 0.23, 'F');
        if (sl.tone === 'problem') text('!', 0.9, y + 0.25, { size: 16, bold: true, hex: 'FFFFFF', w: 0.46, align: 'center' });
        else {
          doc.setDrawColor(255, 255, 255);
          doc.setLineWidth(0.04);
          doc.lines([[0.08, 0.08], [0.16, -0.18]], 1.03, y + 0.43);
        }
        text(t, 1.6, y + 0.28, { size: 18, w: 10.8 });
      });
      footer(i);
      return;
    }
    if (sl.kind === 'module') {
      header(sl.title, `Módulo ${sl.n}`);
      const bx = 0.5,
        by = 1.35,
        bw = 8.3,
        bh = 5.2;
      if (sl.img) {
        const f = fit(sl.img, bw, bh);
        rect(bx + f.dx - 0.03, by + f.dy - 0.03, f.w + 0.06, f.h + 0.06, 'CBD5E1');
        doc.addImage(sl.img.dataUrl, 'JPEG', bx + f.dx, by + f.dy, f.w, f.h, undefined, 'MEDIUM');
      } else {
        rect(bx, by, bw, bh, LIGHT);
        text('Captura de tela ainda não gerada. No Manual, use "Gerar/atualizar capturas de tela".', bx + 0.5, by + bh / 2 - 0.2, { size: 14, hex: GRAY, w: bw - 1, align: 'center' });
      }
      if (sl.legenda) text(sl.legenda, bx, by + bh + 0.08, { size: 10, italic: true, hex: GRAY, w: bw, align: 'center' });
      text('Funcionalidades', 9.1, 1.4, { size: 14, bold: true, hex: BLUE });
      let y = 1.9;
      for (const t of sl.items) {
        fill(ORANGE);
        doc.circle(9.2, y + 0.11, 0.045, 'F');
        y += text(t, 9.35, y, { size: 14, w: 3.6 }) + 0.14;
      }
      footer(i);
      return;
    }
    if (sl.kind === 'time') {
      header('Ganho de tempo: manual x sistema', 'Comparativo');
      const t = deck.t;
      autoTable(doc, {
        startY: 1.3,
        margin: { left: 0.4 },
        tableWidth: 7.6,
        head: [['Atividade', 'Controle manual (planilha/papel)', 'Com o sistema', 'Economia']],
        body: t.per.map((r) => [pdfSafe(`${r.atividade} (${r.volumeMes}/mês)`), fmtMin(r.manualMin), fmtMin(r.sistemaMin), `${fmtH(r.economiaH)} h/mês (${r.pct}%)`]),
        foot: [['Total por mês', `${fmtH(t.manualMes)} h`, `${fmtH(t.sistemaMes)} h`, `${fmtH(t.mes)} h (${t.pct}%)`]],
        styles: { font: 'helvetica', fontSize: 9, cellPadding: 0.06, lineColor: rgb('CBD5E1'), lineWidth: 0.007, textColor: rgb('1E293B'), valign: 'middle' },
        headStyles: { fillColor: rgb(NAVY), textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 10 },
        footStyles: { fillColor: rgb('FEF3C7'), textColor: rgb('1E293B'), fontStyle: 'bold', fontSize: 10 },
        alternateRowStyles: { fillColor: rgb(LIGHT) },
        columnStyles: { 0: { cellWidth: 3.7 }, 1: { cellWidth: 1.35, halign: 'center' }, 2: { cellWidth: 1.1, halign: 'center' }, 3: { cellWidth: 1.45, halign: 'center', textColor: rgb('15803D'), fontStyle: 'bold' } },
      });
      // Gráfico de barras (manual x sistema, h/mês)
      const cx = 8.2,
        cy = 1.25,
        cw = 4.8;
      text('Horas por mês', cx, cy, { size: 11, bold: true, hex: NAVY, w: cw, align: 'center' });
      const max = Math.max(1, ...t.per.map((r) => r.manualH));
      const labW = 1.9;
      const barMax = cw - labW - 0.45;
      const rowH = 3.3 / Math.max(1, t.per.length);
      t.per.forEach((r, k) => {
        const y = cy + 0.35 + k * rowH;
        text(shortLabel(r.atividade), cx, y + rowH / 2 - 0.12, { size: 7.5, hex: '334155', w: labW - 0.05, align: 'right', lh: 1.05 });
        const bh = Math.min(0.14, rowH / 2 - 0.02);
        const wm = (r.manualH / max) * barMax;
        const ws = (r.sistemaH / max) * barMax;
        rect(cx + labW, y + rowH / 2 - bh - 0.01, Math.max(0.01, wm), bh, ORANGE);
        rect(cx + labW, y + rowH / 2 + 0.01, Math.max(0.01, ws), bh, BLUE);
        text(fmtH(r.manualH), cx + labW + wm + 0.04, y + rowH / 2 - bh - 0.02, { size: 6.5, hex: '334155' });
        text(fmtH(r.sistemaH), cx + labW + ws + 0.04, y + rowH / 2, { size: 6.5, hex: '334155' });
      });
      const ly = cy + 0.4 + t.per.length * rowH;
      rect(cx + 1.2, ly + 0.05, 0.2, 0.12, ORANGE);
      text('Manual (h/mês)', cx + 1.45, ly + 0.02, { size: 8, hex: '334155' });
      rect(cx + 2.8, ly + 0.05, 0.2, 0.12, BLUE);
      text('Sistema (h/mês)', cx + 3.05, ly + 0.02, { size: 8, hex: '334155' });
      rect(8.2, 5.5, 4.8, 1.25, 'DCFCE7', 0.08);
      text(`${fmtH(t.mes)} h economizadas por mês`, 8.2, 5.75, { size: 18, bold: true, hex: '15803D', w: 4.8, align: 'center' });
      text(`${fmtH(t.ano)} h por ano · ${t.pct}% menos tempo`, 8.2, 6.2, { size: 13, bold: true, hex: '166534', w: 4.8, align: 'center' });
      text('* Valores estimados, ajustáveis no Manual › Ganho de tempo. Tempos por ocorrência; volume mensal entre parênteses.', 0.4, H - 0.75, { size: 9, italic: true, hex: 'B45309', w: 7.6 });
      footer(i);
      return;
    }
    header('Benefícios', 'Resultados');
    SLIDE_BENEFITS.forEach(([t, d], k) => {
      const x = 0.5 + (k % 3) * 4.15;
      const y = 1.45 + Math.floor(k / 3) * 2.75;
      rect(x, y, 3.95, 2.5, LIGHT, 0.08);
      rect(x, y, 0.1, 2.5, ORANGE);
      text(t, x + 0.3, y + 0.3, { size: 20, bold: true, hex: NAVY, w: 3.5 });
      text(d, x + 0.3, y + 0.95, { size: 14, hex: '334155', w: 3.5 });
    });
    footer(i);
  });
  download(doc.output('blob'), fileName('pdf'));
}
