// Formatação simples do texto do Manual, usada na tela e no PDF.
export type Block =
  | { t: 'h'; text: string }
  | { t: 'p'; text: string }
  | { t: 'ul'; items: string[] }
  | { t: 'ol'; items: string[] }
  | { t: 'tip'; text: string }
  | { t: 'warn'; text: string };

export function parseBlocks(src: string): Block[] {
  const out: Block[] = [];
  let para: string[] = [];
  const flush = () => {
    if (para.length) out.push({ t: 'p', text: para.join(' ') });
    para = [];
  };
  for (const raw of src.replace(/\r/g, '').split('\n')) {
    const line = raw.trim();
    if (!line) {
      flush();
      continue;
    }
    let m: RegExpMatchArray | null;
    if ((m = line.match(/^#{2,3}\s+(.*)$/))) {
      flush();
      out.push({ t: 'h', text: m[1] });
    } else if ((m = line.match(/^[-*]\s+(.*)$/))) {
      flush();
      const last = out[out.length - 1];
      if (last?.t === 'ul') last.items.push(m[1]);
      else out.push({ t: 'ul', items: [m[1]] });
    } else if ((m = line.match(/^\d+[.)]\s+(.*)$/))) {
      flush();
      const last = out[out.length - 1];
      if (last?.t === 'ol') last.items.push(m[1]);
      else out.push({ t: 'ol', items: [m[1]] });
    } else if ((m = line.match(/^>\s?(.*)$/))) {
      flush();
      out.push({ t: 'tip', text: m[1] });
    } else if ((m = line.match(/^!\s?(.*)$/))) {
      flush();
      out.push({ t: 'warn', text: m[1] });
    } else para.push(line);
  }
  flush();
  return out;
}

/** Trechos de uma linha: texto normal, negrito ou marcação numerada [n]. */
export type Span = { text: string; bold?: boolean; marker?: number };
export function parseInline(text: string): Span[] {
  const out: Span[] = [];
  const re = /\*\*(.+?)\*\*|\[(\d{1,2})\]/g;
  let i = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    if (m.index > i) out.push({ text: text.slice(i, m.index) });
    if (m[1] !== undefined) out.push({ text: m[1], bold: true });
    else out.push({ text: m[2], marker: Number(m[2]) });
    i = m.index + m[0].length;
  }
  if (i < text.length) out.push({ text: text.slice(i) });
  return out;
}

export const plain = (text: string) => text.replace(/\*\*(.+?)\*\*/g, '$1').replace(/\[(\d{1,2})\]/g, '($1)');

/** Primeiros tópicos de um capítulo (para os slides): itens de lista, em texto simples. */
export function bulletsOf(src: string, max = 5): string[] {
  const items = parseBlocks(src).flatMap((b) => (b.t === 'ul' || b.t === 'ol' ? b.items : []));
  return items.slice(0, max).map((x) => {
    const p = plain(x);
    return p.length > 150 ? p.slice(0, 147).trimEnd() + '…' : p;
  });
}

/** Troca símbolos que as fontes padrão do PDF não têm. */
export const pdfSafe = (s: string) =>
  s
    .replace(/→/g, '->')
    .replace(/[◀]/g, '<')
    .replace(/[▶]/g, '>')
    .replace(/◆/g, '*')
    .replace(/☰/g, '(menu)')
    .replace(/[⋯⋮]/g, '...')
    .replace(/⊕/g, '(+)')
    .replace(/[≥]/g, '>=')
    .replace(/[÷]/g, '/')
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[^\u0000-ÿ€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ]/g, '');
