// Utilitários comuns às exportações Excel (manipulação direta do OpenXML para fidelidade total).
import defaultLogoUrl from '../templates/logo-idg-default.png';
import defaultSealsUrl from '../templates/selos-iso-default.png';
import { db } from '../lib/db';

export const esc = (s: string) =>
  s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    // remove caracteres de controle inválidos em XML (mantém \t \n \r)
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');

export function colLetter(n: number): string {
  let s = '';
  for (n++; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
}

export interface PngImage {
  bytes: Uint8Array;
  width: number;
  height: number;
}

/** Carrega qualquer imagem (PNG/JPG/data URL) e devolve PNG + dimensões, via canvas. */
export async function toPng(src: string): Promise<PngImage> {
  const img = new Image();
  img.crossOrigin = 'anonymous';
  await new Promise<void>((res, rej) => {
    img.onload = () => res();
    img.onerror = () => rej(new Error('Não foi possível carregar a imagem da logo.'));
    img.src = src;
  });
  const canvas = document.createElement('canvas');
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  canvas.getContext('2d')!.drawImage(img, 0, 0);
  const blob: Blob = await new Promise((res) => canvas.toBlob((b) => res(b!), 'image/png'));
  return { bytes: new Uint8Array(await blob.arrayBuffer()), width: img.naturalWidth, height: img.naturalHeight };
}

export const logoSource = () => db.settings.logoDataUrl || defaultLogoUrl;
export const sealsSource = () => db.settings.selosDataUrl || defaultSealsUrl;

/** Ajusta (largura, altura) EMU para caber na caixa preservando a proporção. */
export function fitBox(img: PngImage, boxW: number, boxH: number) {
  const r = img.width / img.height;
  let w = boxW;
  let h = w / r;
  if (h > boxH) {
    h = boxH;
    w = h * r;
  }
  return { cx: Math.round(w), cy: Math.round(h), dx: Math.round((boxW - w) / 2), dy: Math.round((boxH - h) / 2) };
}

export function download(blob: Blob, filename: string) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    URL.revokeObjectURL(a.href);
    a.remove();
  }, 1000);
}

export const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

export function safeFileName(s: string) {
  return s.normalize('NFD').replace(/\p{Diacritic}/gu, '').replace(/[^\w\-. ]+/g, '').replace(/\s+/g, '_');
}
