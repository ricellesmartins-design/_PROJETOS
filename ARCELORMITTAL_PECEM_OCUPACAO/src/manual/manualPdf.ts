// Manual completo em PDF (A4): capa, índice com páginas, capítulos com imagens e o comparativo de tempo.
import { importFresh } from '../lib/reload';
import { todayISO, fmtBR } from '../lib/dates';
import { download, logoSource } from '../excel/common';
import type { Profile } from '../lib/db';
import { APP_FILE_NAME, APP_NAME, APP_SUBTITLE, CAPTURE_PAGES } from './content';
import { composeWithMarkers, toDataUrl } from './capture';
import { canSee, fmtH, fmtMin, timeTotals, type ManualData } from './data';
import { parseBlocks, parseInline, pdfSafe, type Span } from './markup';

const PW = 210;
const PH = 297;
const M = 18;
const CW = PW - 2 * M;

export async function exportManualPdf(data: ManualData, user: Profile) {
  const [{ jsPDF }, { default: autoTable }] = await importFresh(() => Promise.all([import('jspdf'), import('jspdf-autotable')]));
  const doc = new jsPDF({ unit: 'mm', format: 'a4', compress: true });
  const logo = await toDataUrl(logoSource());
  const pageOfCap = new Map(CAPTURE_PAGES.map((p) => [p.pagina, p]));
  let y = M;

  const setF = (bold: boolean, size: number, rgb: [number, number, number] = [30, 41, 59]) => {
    doc.setFont('helvetica', bold ? 'bold' : 'normal');
    doc.setFontSize(size);
    doc.setTextColor(...rgb);
  };
  const header = () => {
    doc.setDrawColor(242, 140, 27);
    doc.setLineWidth(0.6);
    doc.line(M, 12, PW - M, 12);
    setF(false, 8, [100, 116, 139]);
    doc.text(pdfSafe(`${APP_NAME} · Manual do usuário`), M, 9.5);
  };
  const newPage = () => {
    doc.addPage();
    header();
    y = M;
  };
  const ensure = (h: number) => {
    if (y + h > PH - M) newPage();
  };

  /** Escreve um parágrafo com trechos em negrito, quebrando linhas pela largura. */
  const rich = (spans: Span[], x: number, w: number, size: number, lh = 1.4, rgb: [number, number, number] = [30, 41, 59]) => {
    const words: { t: string; b: boolean }[] = [];
    for (const s of spans) {
      const t = pdfSafe(s.marker ? `(${s.text})` : s.text);
      for (const part of t.split(/(\s+)/)) if (part) words.push({ t: part, b: !!s.bold || !!s.marker });
    }
    const lineH = (size * 0.3528) * lh;
    let line: typeof words = [];
    let lw = 0;
    const flush = () => {
      ensure(lineH);
      let cx = x;
      for (const wd of line) {
        setF(wd.b, size, rgb);
        doc.text(wd.t, cx, y, { baseline: 'top' });
        cx += doc.getTextWidth(wd.t);
      }
      y += lineH;
      line = [];
      lw = 0;
    };
    for (const wd of words) {
      setF(wd.b, size, rgb);
      const ww = doc.getTextWidth(wd.t);
      if (/^\s+$/.test(wd.t)) {
        if (line.length) {
          line.push(wd);
          lw += ww;
        }
        continue;
      }
      if (lw + ww > w && line.length) {
        while (line.length && /^\s+$/.test(line[line.length - 1].t)) line.pop();
        flush();
      }
      line.push(wd);
      lw += ww;
    }
    if (line.length) flush();
  };

  // Capa
  doc.setFillColor(27, 42, 92);
  doc.rect(0, 0, PW, PH, 'F');
  doc.setFillColor(242, 140, 27);
  doc.rect(0, PH - 10, PW, 10, 'F');
  doc.setFillColor(255, 255, 255);
  doc.roundedRect(M, 30, 70, 26, 2, 2, 'F');
  {
    const r = logo.w / logo.h;
    let w = 64,
      h = w / r;
    if (h > 22) (h = 22), (w = h * r);
    doc.addImage(logo.dataUrl, 'PNG', M + 3 + (64 - w) / 2, 32 + (22 - h) / 2, w, h);
  }
  setF(true, 30, [255, 255, 255]);
  doc.text(doc.splitTextToSize(pdfSafe(APP_NAME), CW) as string[], M, 110);
  setF(false, 14, [203, 213, 225]);
  doc.text(pdfSafe(APP_SUBTITLE), M, 135);
  setF(true, 18, [242, 140, 27]);
  doc.text('Manual do usuário', M, 155);
  setF(false, 12, [203, 213, 225]);
  doc.text(`Versão de ${fmtBR(todayISO())}`, M, 165);

  // Página do índice (preenchida no final)
  doc.addPage();
  const tocPage = doc.getNumberOfPages();
  const toc: { titulo: string; page: number }[] = [];

  const chapters = data.chapters;

  for (let idx = 0; idx < chapters.length; idx++) {
    const ch = chapters[idx];
    newPage();
    toc.push({ titulo: `${idx + 1}. ${ch.titulo}`, page: doc.getNumberOfPages() });
    doc.setFillColor(27, 42, 92);
    doc.rect(M, y, CW, 12, 'F');
    setF(true, 15, [255, 255, 255]);
    doc.text(pdfSafe(`${idx + 1}. ${ch.titulo}`), M + 4, y + 8.2);
    y += 16;
    if (ch.perfis?.length) {
      setF(false, 8.5, [100, 116, 139]);
      doc.text(pdfSafe(`Disponível para: ${ch.perfis.map((p) => (p === 'coordenador' ? 'Coordenador' : p === 'cliente' ? 'Cliente ArcelorMittal' : 'Colaborador IDG')).join(', ')}`), M, y);
      y += 6;
    }
    const cap = ch.captura ? data.captures[ch.captura] : undefined;
    const capPerfis = ch.captura ? pageOfCap.get(ch.captura)?.perfis : undefined;
    if (cap && canSee(capPerfis, user)) {
      const img = await composeWithMarkers(cap.imagem_url, cap.marcadores);
      const w = CW;
      const h = (img.h / img.w) * w;
      ensure(h + 8);
      doc.setDrawColor(203, 213, 225);
      doc.setLineWidth(0.3);
      doc.rect(M - 0.3, y - 0.3, w + 0.6, h + 0.6);
      doc.addImage(img.dataUrl, 'JPEG', M, y, w, h, undefined, 'MEDIUM');
      y += h + 2;
      setF(false, 8.5, [100, 116, 139]);
      doc.text(pdfSafe(`${cap.legenda || ''} · captura de ${fmtBR(cap.data_captura.slice(0, 10))}`), PW / 2, y + 2, { align: 'center', baseline: 'top' });
      y += 8;
    }
    for (const b of parseBlocks(ch.conteudo)) {
      if (b.t === 'h') {
        ensure(14);
        y += 2;
        setF(true, 12.5, [36, 65, 143]);
        doc.text(pdfSafe(b.text), M, y, { baseline: 'top' });
        y += 7;
      } else if (b.t === 'p') {
        rich(parseInline(b.text), M, CW, 10.5);
        y += 2;
      } else if (b.t === 'ul' || b.t === 'ol') {
        b.items.forEach((it, k) => {
          ensure(6);
          setF(true, 10.5, [242, 140, 27]);
          doc.text(b.t === 'ol' ? `${k + 1}.` : '•', M + 2, y, { baseline: 'top' });
          rich(parseInline(it), M + 8, CW - 8, 10.5);
          y += 0.8;
        });
        y += 1.5;
      } else {
        const tip = b.t === 'tip';
        const startY = y;
        const startPage = doc.getNumberOfPages();
        y += 3;
        rich([{ text: tip ? 'Dica: ' : 'Atenção: ', bold: true }, ...parseInline(b.text)], M + 6, CW - 10, 10, 1.4, tip ? [30, 64, 175] : [146, 64, 14]);
        y += 2;
        if (doc.getNumberOfPages() === startPage) {
          doc.setFillColor(...((tip ? [37, 99, 235] : [217, 119, 6]) as [number, number, number]));
          doc.rect(M, startY, 1.6, y - startY, 'F');
        }
        y += 3;
      }
    }
  }

  // Ganho de tempo
  newPage();
  toc.push({ titulo: `${chapters.length + 1}. Ganho de tempo: manual x sistema`, page: doc.getNumberOfPages() });
  doc.setFillColor(27, 42, 92);
  doc.rect(M, y, CW, 12, 'F');
  setF(true, 15, [255, 255, 255]);
  doc.text(pdfSafe(`${chapters.length + 1}. Ganho de tempo: manual x sistema`), M + 4, y + 8.2);
  y += 18;
  const t = timeTotals(data.timeRows);
  autoTable(doc, {
    startY: y,
    margin: { left: M, right: M },
    head: [['Atividade', 'Manual', 'Sistema', 'Volume/mês', 'Economia']],
    body: t.per.map((r) => [pdfSafe(r.atividade), fmtMin(r.manualMin), fmtMin(r.sistemaMin), String(r.volumeMes), `${fmtH(r.economiaH)} h/mês`]),
    foot: [['Total', `${fmtH(t.manualMes)} h/mês`, `${fmtH(t.sistemaMes)} h/mês`, '', `${fmtH(t.mes)} h/mês · ${fmtH(t.ano)} h/ano`]],
    styles: { fontSize: 9 },
    headStyles: { fillColor: [27, 42, 92] },
    footStyles: { fillColor: [254, 243, 199], textColor: [30, 41, 59] },
  });
  y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 6;
  setF(false, 9, [180, 83, 9]);
  doc.text('Valores estimados, ajustáveis pelo coordenador no Manual › Ganho de tempo.', M, y);

  // Índice
  doc.setPage(tocPage);
  header();
  setF(true, 18, [27, 42, 92]);
  doc.text('Índice', M, 28);
  let ty = 40;
  for (const it of toc) {
    setF(false, 11.5);
    const label = pdfSafe(it.titulo);
    doc.text(label, M, ty);
    doc.text(String(it.page), PW - M, ty, { align: 'right' });
    const lw = doc.getTextWidth(label);
    doc.setDrawColor(203, 213, 225);
    doc.setLineDashPattern([0.5, 1], 0);
    doc.line(M + lw + 2, ty, PW - M - 8, ty);
    doc.setLineDashPattern([], 0);
    doc.link(M, ty - 5, CW, 7, { pageNumber: it.page });
    ty += 8.5;
  }

  // Numeração das páginas
  const n = doc.getNumberOfPages();
  for (let p = 2; p <= n; p++) {
    doc.setPage(p);
    setF(false, 8, [100, 116, 139]);
    doc.text(`${p} / ${n}`, PW - M, PH - 8, { align: 'right' });
  }
  download(doc.output('blob'), `Manual_${APP_FILE_NAME}_${todayISO()}.pdf`);
}
