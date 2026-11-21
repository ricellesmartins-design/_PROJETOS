// Capturas reais das telas: cada rota é aberta num iframe invisível (mesma sessão do coordenador),
// em modo "captura" (tema claro, sem lembretes), e fotografada com html2canvas.
import { importFresh } from '../lib/reload';
import type { Marker } from './data';

export const CAPTURE_W = 1440;
export const CAPTURE_H = 900;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function waitReady(win: Window, rota: string, timeout = 25_000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) {
    const doc = win.document;
    const ready = rota === 'login' ? !!doc.querySelector('form input[type="email"]') : !!doc.querySelector('main') && !/Carregando…/.test(doc.body?.innerText ?? '');
    if (ready) return;
    await sleep(300);
  }
  throw new Error('A tela demorou demais para abrir.');
}

/** Fotografa uma rota do app e devolve um JPEG em data URL. */
export async function captureRoute(rota: string): Promise<string> {
  const { default: html2canvas } = await importFresh(() => import('html2canvas'));
  const iframe = document.createElement('iframe');
  iframe.setAttribute('aria-hidden', 'true');
  iframe.style.cssText = `position:fixed;left:-${CAPTURE_W + 200}px;top:0;width:${CAPTURE_W}px;height:${CAPTURE_H}px;border:0;pointer-events:none;`;
  iframe.src = rota === 'login' ? '/?captura=login' : `/?captura=1#${rota}`;
  document.body.appendChild(iframe);
  try {
    await new Promise<void>((res, rej) => {
      iframe.onload = () => res();
      iframe.onerror = () => rej(new Error('Falha ao abrir a tela.'));
    });
    const win = iframe.contentWindow!;
    await waitReady(win, rota);
    await sleep(1800); // gráficos, fontes e dados em tempo real
    await win.document.fonts?.ready;
    // 1ª opção: modern-screenshot (usa o próprio motor do navegador, fiel a campos e fontes).
    try {
      const { domToJpeg } = await importFresh(() => import('modern-screenshot'));
      const body = win.document.body;
      const url = await domToJpeg(body, { width: CAPTURE_W, height: CAPTURE_H, quality: 0.82, backgroundColor: '#ffffff', scale: 1, style: { margin: '0' } });
      if (url.length > 20_000) return url;
    } catch {
      /* cai para o html2canvas */
    }
    const canvas = await html2canvas(win.document.body, {
      window: win,
      width: CAPTURE_W,
      height: CAPTURE_H,
      windowWidth: CAPTURE_W,
      windowHeight: CAPTURE_H,
      x: 0,
      y: 0,
      scrollX: 0,
      scrollY: 0,
      scale: 1,
      backgroundColor: '#ffffff',
      logging: false,
      useCORS: true,
      // html2canvas desloca o texto para baixo com o reset do Tailwind (img display:block):
      // no clone, imagens voltam a inline-block e os campos ganham altura de linha explícita.
      onclone: (d: Document) => {
        const st = d.createElement('style');
        st.textContent = 'img{display:inline-block!important}input,select,textarea{line-height:1.25!important}';
        d.head.appendChild(st);
      },
    } as Parameters<typeof html2canvas>[1]);
    return canvas.toDataURL('image/jpeg', 0.82);
  } finally {
    iframe.remove();
  }
}

export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => res(img);
    img.onerror = () => rej(new Error('Não foi possível carregar a imagem.'));
    img.src = src;
  });
}

/** Imagem enviada pelo coordenador: redimensiona para no máximo 1600 px e converte em JPEG. */
export async function fileToJpeg(file: File): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await loadImage(url);
    const k = Math.min(1, 1600 / img.naturalWidth);
    const c = document.createElement('canvas');
    c.width = Math.round(img.naturalWidth * k);
    c.height = Math.round(img.naturalHeight * k);
    const g = c.getContext('2d')!;
    g.fillStyle = '#fff';
    g.fillRect(0, 0, c.width, c.height);
    g.drawImage(img, 0, 0, c.width, c.height);
    return c.toDataURL('image/jpeg', 0.85);
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Desenha as marcações numeradas sobre a imagem (para PDF e PowerPoint). */
export async function composeWithMarkers(src: string, markers: Marker[]): Promise<{ dataUrl: string; w: number; h: number }> {
  const img = await loadImage(src);
  if (!markers.length) return { dataUrl: src, w: img.naturalWidth, h: img.naturalHeight };
  const c = document.createElement('canvas');
  c.width = img.naturalWidth;
  c.height = img.naturalHeight;
  const g = c.getContext('2d')!;
  g.drawImage(img, 0, 0);
  const r = Math.max(14, Math.round(c.width / 70));
  for (const m of markers) {
    const x = m.x * c.width;
    const y = m.y * c.height;
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.fillStyle = '#F28C1B';
    g.fill();
    g.lineWidth = Math.max(2, r / 6);
    g.strokeStyle = '#ffffff';
    g.stroke();
    g.fillStyle = '#ffffff';
    g.font = `bold ${Math.round(r * 1.1)}px Arial`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(String(m.n), x, y + 1);
  }
  return { dataUrl: c.toDataURL('image/jpeg', 0.88), w: c.width, h: c.height };
}

/** Converte uma URL (ex.: logo importado pelo Vite) em data URL PNG com dimensões. */
export async function toDataUrl(src: string): Promise<{ dataUrl: string; w: number; h: number }> {
  const img = await loadImage(src);
  const c = document.createElement('canvas');
  c.width = img.naturalWidth;
  c.height = img.naturalHeight;
  c.getContext('2d')!.drawImage(img, 0, 0);
  return { dataUrl: c.toDataURL('image/png'), w: c.width, h: c.height };
}
