// Aba "Manual": manual completo do sistema, com capturas reais das telas, busca, índice,
// edição pelo coordenador, comparativo de ganho de tempo e exportações (manual em PDF,
// apresentação em PDF e em PowerPoint).
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowUp, BookOpen, Camera, Clock, Edit3, ExternalLink, FileText, ImageUp, Loader2, MapPin, Plus, Presentation, RotateCcw, Search, Trash2, X } from 'lucide-react';
import { useSession } from '../lib/store';
import { fmtDateTimeBR } from '../lib/dates';
import { ROLE_LABEL } from '../lib/auth';
import { uid } from '../lib/id';
import { Alert, Badge, Button, Card, Field, Modal, cx, useAction, useToast } from '../components/ui';
import { CAPTURE_PAGES, DEFAULT_CHAPTERS, DEFAULT_TIME_ROWS, type TimeRow } from '../manual/content';
import { canSee, fmtH, fmtMin, loadManual, resetChapter, saveCapture, saveChapter, saveTimeRows, timeTotals, type Capture, type Chapter, type ManualData, type Marker } from '../manual/data';
import { parseBlocks, parseInline, type Span } from '../manual/markup';
import { captureRoute, fileToJpeg } from '../manual/capture';
import { importFresh } from '../lib/reload';

const norm = (s: string) => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
const TIME_ID = 'ganho-de-tempo';

export default function Manual() {
  const { user } = useSession();
  const toast = useToast();
  const isCoord = user.role === 'coordenador';
  const [data, setData] = useState<ManualData>();
  const [loadErr, setLoadErr] = useState('');
  const [q, setQ] = useState('');
  const [active, setActive] = useState('');
  const [lightbox, setLightbox] = useState<Capture>();
  const [editing, setEditing] = useState<Chapter>();
  const [timeOpen, setTimeOpen] = useState(false);
  const [progress, setProgress] = useState<string>();
  const [exporting, setExporting] = useState<string>();
  const [showTop, setShowTop] = useState(false);
  const topRef = useRef<HTMLDivElement>(null);

  const reload = useCallback(async () => {
    try {
      setData(await loadManual());
      setLoadErr('');
    } catch (e) {
      setLoadErr(e instanceof Error ? e.message : String(e));
    }
  }, []);
  useEffect(() => {
    reload();
  }, [reload]);
  useEffect(() => {
    const h = () => setShowTop(window.scrollY > 500);
    window.addEventListener('scroll', h, { passive: true });
    return () => window.removeEventListener('scroll', h);
  }, []);

  const chapters: Chapter[] = data?.chapters ?? DEFAULT_CHAPTERS;
  const nq = norm(q.trim());
  const matches = (c: Chapter) => !nq || norm(c.titulo + '\n' + c.conteudo).includes(nq);
  const shown = chapters.filter(matches);
  const timeMatches = !nq || norm('ganho de tempo manual sistema economia horas').includes(nq);

  const go = (id: string) => {
    setActive(id);
    document.getElementById('man-' + id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  async function runExport(label: string, fn: () => Promise<void>) {
    setExporting(label);
    try {
      await fn();
      toast('success', 'Arquivo gerado. O download começou.');
    } catch (e) {
      toast('error', e instanceof Error ? e.message : String(e));
    } finally {
      setExporting(undefined);
    }
  }
  const exportManual = () => data && runExport('manual', async () => (await importFresh(() => import('../manual/manualPdf'))).exportManualPdf(data, user));
  const exportPdf = () => data && runExport('pdf', async () => (await importFresh(() => import('../manual/presentation'))).exportPresentationPdf(data));
  const exportPptx = () => data && runExport('pptx', async () => (await importFresh(() => import('../manual/presentation'))).exportPptx(data));

  async function captureAll() {
    if (!data) return;
    const fails: string[] = [];
    for (let i = 0; i < CAPTURE_PAGES.length; i++) {
      const p = CAPTURE_PAGES[i];
      setProgress(`Capturando ${i + 1} de ${CAPTURE_PAGES.length}: ${p.legenda}…`);
      try {
        const img = await captureRoute(p.rota);
        const prev = data.captures[p.pagina];
        await saveCapture({ pagina: p.pagina, rota: p.rota, imagem_url: img, legenda: prev?.legenda || p.legenda, marcadores: prev?.marcadores ?? [], data_captura: new Date().toISOString(), origem: 'automatica' });
      } catch (e) {
        fails.push(`${p.legenda}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
    setProgress(undefined);
    await reload();
    if (fails.length) toast('error', `Algumas telas não foram capturadas:\n${fails.join('\n')}`);
    else toast('success', 'Capturas de tela atualizadas.');
  }

  const t = timeTotals(data?.timeRows ?? DEFAULT_TIME_ROWS);

  return (
    <div ref={topRef} className="space-y-4">
      <Card bodyClass="flex flex-wrap items-center gap-2">
        <div className="mr-auto flex items-center gap-2 text-sm text-slate-600">
          <BookOpen className="h-5 w-5 text-idg-blue" /> Manual do usuário: tudo o que o sistema faz, tela por tela.
        </div>
        <Button size="sm" variant="secondary" icon={<FileText className="h-4 w-4" />} loading={exporting === 'manual'} disabled={!data || !!exporting} onClick={exportManual}>
          Exportar manual em PDF
        </Button>
        {isCoord && (
          <>
            <Button size="sm" variant="secondary" icon={<FileText className="h-4 w-4 text-red-600" />} loading={exporting === 'pdf'} disabled={!data || !!exporting} onClick={exportPdf}>
              Exportar apresentação em PDF
            </Button>
            <Button size="sm" variant="secondary" icon={<Presentation className="h-4 w-4 text-orange-600" />} loading={exporting === 'pptx'} disabled={!data || !!exporting} onClick={exportPptx}>
              Exportar apresentação em PowerPoint (.pptx)
            </Button>
            <Button size="sm" icon={<Camera className="h-4 w-4" />} loading={!!progress} disabled={!data || !!data.faltaTabela || !!exporting} onClick={captureAll}>
              Gerar/atualizar capturas de tela
            </Button>
          </>
        )}
      </Card>

      {exporting && (
        <Alert kind="info">
          <span className="inline-flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" /> Gerando o arquivo. Isso pode levar alguns segundos…
          </span>
        </Alert>
      )}
      {progress && (
        <Alert kind="info" title="Capturando as telas reais do sistema">
          <span className="inline-flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" /> {progress} Não feche esta tela.
          </span>
        </Alert>
      )}
      {loadErr && <Alert kind="error">Não foi possível carregar o manual: {loadErr}</Alert>}
      {data?.faltaTabela && isCoord && <Alert kind="warning">As tabelas do Manual ainda não existem no Supabase. Rode o SQL 011_manual.sql para salvar capturas, textos e o ganho de tempo.</Alert>}

      <div className="grid gap-4 lg:grid-cols-[260px_minmax(0,1fr)]">
        <aside className="lg:sticky lg:top-16 lg:max-h-[calc(100vh-5rem)] lg:self-start lg:overflow-y-auto">
          <Card bodyClass="space-y-2 p-3">
            <div className="relative">
              <Search className="absolute left-2 top-2 h-4 w-4 text-slate-400" />
              <input className="input pl-8" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar no manual…" aria-label="Buscar no manual" />
              {q && (
                <button className="absolute right-2 top-2 text-slate-400" onClick={() => setQ('')} aria-label="Limpar busca">
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
            {nq && (
              <div className="text-xs text-slate-500">
                {shown.length + (timeMatches ? 1 : 0)} capítulo(s) com “{q.trim()}”
              </div>
            )}
            <nav className="space-y-0.5 text-sm">
              {chapters.map((c, i) => (
                <button
                  key={c.id}
                  onClick={() => go(c.id)}
                  disabled={!matches(c)}
                  className={cx('block w-full rounded px-2 py-1.5 text-left', active === c.id ? 'bg-blue-50 font-semibold text-idg-blue' : 'hover:bg-slate-100', !matches(c) && 'opacity-35')}
                >
                  <span className="mr-1 text-slate-400">{i + 1}.</span> {c.titulo}
                </button>
              ))}
              <button onClick={() => go(TIME_ID)} disabled={!timeMatches} className={cx('block w-full rounded px-2 py-1.5 text-left', active === TIME_ID ? 'bg-blue-50 font-semibold text-idg-blue' : 'hover:bg-slate-100', !timeMatches && 'opacity-35')}>
                <span className="mr-1 text-slate-400">{chapters.length + 1}.</span> Ganho de tempo
              </button>
            </nav>
            {isCoord && (
              <Button
                size="sm"
                variant="ghost"
                className="w-full"
                icon={<Plus className="h-4 w-4" />}
                disabled={!!data?.faltaTabela}
                onClick={() => setEditing({ id: 'cap-' + uid(''), titulo: 'Novo capítulo', ordem: (chapters[chapters.length - 1]?.ordem ?? 0) + 1, conteudo: '', personalizado: true })}
              >
                Novo capítulo
              </Button>
            )}
          </Card>
        </aside>

        <div className="min-w-0 space-y-4">
          {!data && !loadErr && (
            <div className="flex items-center justify-center gap-2 py-10 text-slate-500">
              <Loader2 className="h-5 w-5 animate-spin" /> Carregando o manual…
            </div>
          )}
          {shown.map((c) => {
            const idx = chapters.indexOf(c) + 1;
            const capDef = CAPTURE_PAGES.find((p) => p.pagina === c.captura);
            const cap = c.captura ? data?.captures[c.captura] : undefined;
            const mayView = canSee(capDef?.perfis ?? c.perfis, user);
            return (
              <section key={c.id} id={'man-' + c.id} className="scroll-mt-20">
                <Card
                  title={
                    <span className="flex flex-wrap items-center gap-2">
                      <span>
                        {idx}. {c.titulo}
                      </span>
                      {c.perfis?.map((p) => (
                        <Badge key={p} color={p === 'coordenador' ? 'blue' : p === 'cliente' ? 'purple' : 'green'}>
                          {ROLE_LABEL[p]}
                        </Badge>
                      ))}
                    </span>
                  }
                  actions={
                    <>
                      {c.rota && canSee(c.perfis, user) && (
                        <a className="inline-flex items-center gap-1 text-xs text-idg-blue hover:underline" href={'#' + c.rota}>
                          <ExternalLink className="h-3.5 w-3.5" /> Abrir tela
                        </a>
                      )}
                      {isCoord && (
                        <Button size="sm" variant="ghost" icon={<Edit3 className="h-4 w-4" />} disabled={!!data?.faltaTabela} onClick={() => setEditing(c)}>
                          Editar texto
                        </Button>
                      )}
                    </>
                  }
                >
                  <div className="space-y-4">
                    {c.captura && capDef && (
                      <Figure
                        cap={cap}
                        def={capDef}
                        mayView={mayView}
                        isCoord={isCoord && !data?.faltaTabela}
                        onOpen={() => cap && setLightbox(cap)}
                        onSaved={reload}
                      />
                    )}
                    <RichText src={c.conteudo} q={q.trim()} />
                    {c.editado && <p className="text-[11px] text-slate-400">Texto editado em {fmtDateTimeBR(c.editado.em)}{c.editado.por ? ` por ${c.editado.por}` : ''}.</p>}
                  </div>
                </Card>
              </section>
            );
          })}

          {timeMatches && (
            <section id={'man-' + TIME_ID} className="scroll-mt-20">
              <Card
                title={
                  <span className="flex items-center gap-2">
                    {chapters.length + 1}. Ganho de tempo: manual x sistema <Badge color="yellow">estimativa</Badge>
                  </span>
                }
                actions={
                  isCoord && (
                    <Button size="sm" variant="ghost" icon={<Clock className="h-4 w-4" />} disabled={!!data?.faltaTabela} onClick={() => setTimeOpen(true)}>
                      Ajustar valores
                    </Button>
                  )
                }
              >
                <TimeSavings t={t} />
              </Card>
            </section>
          )}
          {nq && !shown.length && !timeMatches && <Alert kind="info">Nenhum capítulo com “{q.trim()}”. Tente outra palavra.</Alert>}
        </div>
      </div>

      {showTop && (
        <button
          className="fixed bottom-5 right-5 z-30 rounded-full bg-idg-blue p-3 text-white shadow-lg hover:bg-idg-navy"
          onClick={() => topRef.current?.scrollIntoView({ behavior: 'smooth' }) ?? window.scrollTo({ top: 0, behavior: 'smooth' })}
          title="Voltar ao topo"
          aria-label="Voltar ao topo"
        >
          <ArrowUp className="h-5 w-5" />
        </button>
      )}
      {lightbox && <Lightbox cap={lightbox} onClose={() => setLightbox(undefined)} />}
      {editing && (
        <EditChapter
          ch={editing}
          onClose={() => setEditing(undefined)}
          onSaved={async () => {
            setEditing(undefined);
            await reload();
          }}
        />
      )}
      {timeOpen && data && (
        <TimeConfig
          rows={data.timeRows}
          onClose={() => setTimeOpen(false)}
          onSaved={async () => {
            setTimeOpen(false);
            await reload();
          }}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------- texto
function Highlight({ text, q }: { text: string; q: string }) {
  if (!q) return <>{text}</>;
  const parts: React.ReactNode[] = [];
  const lower = text.toLowerCase();
  const ql = q.toLowerCase();
  let i = 0;
  let k = lower.indexOf(ql);
  while (k >= 0) {
    parts.push(text.slice(i, k), <mark key={k} className="rounded bg-yellow-200 px-0.5">{text.slice(k, k + q.length)}</mark>);
    i = k + q.length;
    k = lower.indexOf(ql, i);
  }
  parts.push(text.slice(i));
  return <>{parts}</>;
}

function Inline({ text, q }: { text: string; q: string }) {
  return (
    <>
      {parseInline(text).map((s: Span, i) =>
        s.marker ? (
          <span key={i} className="mx-0.5 inline-flex h-5 w-5 items-center justify-center rounded-full bg-idg-orange align-middle text-[11px] font-bold text-white">
            {s.marker}
          </span>
        ) : s.bold ? (
          <b key={i}>
            <Highlight text={s.text} q={q} />
          </b>
        ) : (
          <Highlight key={i} text={s.text} q={q} />
        ),
      )}
    </>
  );
}

export function RichText({ src, q = '' }: { src: string; q?: string }) {
  const blocks = useMemo(() => parseBlocks(src), [src]);
  return (
    <div className="space-y-2.5 text-[15px] leading-relaxed text-slate-700">
      {blocks.map((b, i) => {
        if (b.t === 'h')
          return (
            <h3 key={i} className="pt-2 text-base font-semibold text-idg-navy">
              <Highlight text={b.text} q={q} />
            </h3>
          );
        if (b.t === 'p')
          return (
            <p key={i}>
              <Inline text={b.text} q={q} />
            </p>
          );
        if (b.t === 'ul' || b.t === 'ol') {
          const L = b.t === 'ol' ? 'ol' : 'ul';
          return (
            <L key={i} className={cx('space-y-1 pl-6', b.t === 'ol' ? 'list-decimal' : 'list-disc', 'marker:text-idg-orange')}>
              {b.items.map((it, k) => (
                <li key={k}>
                  <Inline text={it} q={q} />
                </li>
              ))}
            </L>
          );
        }
        return (
          <div key={i} className={cx('rounded-r-md border-l-4 px-3 py-2 text-sm', b.t === 'tip' ? 'border-blue-500 bg-blue-50 text-blue-900' : 'border-amber-500 bg-amber-50 text-amber-900')}>
            <b>{b.t === 'tip' ? 'Dica: ' : 'Atenção: '}</b>
            <Inline text={b.text} q={q} />
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------- imagens
function Markers({ list, onClick }: { list: Marker[]; onClick?: (m: Marker) => void }) {
  return (
    <>
      {list.map((m) => (
        <span
          key={m.n}
          onClick={
            onClick
              ? (e) => {
                  e.stopPropagation();
                  onClick(m);
                }
              : undefined
          }
          className={cx('absolute flex h-6 w-6 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 border-white bg-idg-orange text-xs font-bold text-white shadow', onClick && 'cursor-pointer hover:bg-red-600')}
          style={{ left: `${m.x * 100}%`, top: `${m.y * 100}%` }}
          title={onClick ? 'Remover marcação' : undefined}
        >
          {m.n}
        </span>
      ))}
    </>
  );
}

function Figure({ cap, def, mayView, isCoord, onOpen, onSaved }: { cap?: Capture; def: (typeof CAPTURE_PAGES)[number]; mayView: boolean; isCoord: boolean; onOpen: () => void; onSaved: () => Promise<void> }) {
  const { busy, run } = useAction();
  const [marking, setMarking] = useState(false);
  const [markers, setMarkers] = useState<Marker[]>(cap?.marcadores ?? []);
  const [legenda, setLegenda] = useState<string>();
  const fileRef = useRef<HTMLInputElement>(null);
  useEffect(() => setMarkers(cap?.marcadores ?? []), [cap]);

  if (!mayView)
    return <div className="rounded-lg border border-dashed border-slate-300 px-3 py-4 text-center text-sm text-slate-500">Tela exclusiva de {def.perfis?.map((p) => ROLE_LABEL[p]).join(' e ')}. A imagem não é exibida para o seu perfil.</div>;

  const upload = (f: File) =>
    run(async () => {
      const img = await fileToJpeg(f);
      await saveCapture({ pagina: def.pagina, rota: def.rota, imagem_url: img, legenda: cap?.legenda || def.legenda, marcadores: [], data_captura: new Date().toISOString(), origem: 'upload' });
      await onSaved();
    }, 'Imagem enviada.');
  const saveMarkers = () =>
    run(async () => {
      await saveCapture({ ...cap!, marcadores: markers });
      setMarking(false);
      await onSaved();
    }, 'Marcações salvas.');

  return (
    <figure className="space-y-1.5">
      {cap ? (
        <div
          className={cx('relative overflow-hidden rounded-lg border border-slate-200 shadow-sm', marking ? 'cursor-crosshair ring-2 ring-idg-orange' : 'cursor-zoom-in')}
          onClick={(e) => {
            if (!marking) return onOpen();
            const r = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
            const n = (markers.reduce((m, x) => Math.max(m, x.n), 0) || 0) + 1;
            setMarkers([...markers, { n, x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height }]);
          }}
        >
          <img src={cap.imagem_url} alt={cap.legenda} className="keep-light block w-full" loading="lazy" />
          <Markers list={markers} onClick={marking ? (m) => setMarkers(markers.filter((x) => x.n !== m.n)) : undefined} />
        </div>
      ) : (
        <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-3 py-8 text-center text-sm text-slate-500">
          Captura ainda não gerada.{isCoord ? ' Use "Gerar/atualizar capturas de tela" no topo ou envie uma imagem.' : ''}
        </div>
      )}
      <figcaption className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
        <span className="mr-auto">
          {legenda !== undefined ? (
            <span className="flex items-center gap-1">
              <input className="input !w-72 !py-1 text-xs" value={legenda} onChange={(e) => setLegenda(e.target.value)} />
              <Button
                size="sm"
                loading={busy}
                onClick={() =>
                  run(async () => {
                    await saveCapture({ ...cap!, legenda });
                    setLegenda(undefined);
                    await onSaved();
                  }, 'Legenda salva.')
                }
              >
                Salvar
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setLegenda(undefined)}>
                Cancelar
              </Button>
            </span>
          ) : (
            <>
              {cap?.legenda || def.legenda}
              {cap && ` · ${cap.origem === 'upload' ? 'imagem enviada' : 'captura real'} em ${fmtDateTimeBR(cap.data_captura)}`}
            </>
          )}
        </span>
        {isCoord && (
          <>
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
            <Button size="sm" variant="ghost" icon={<ImageUp className="h-3.5 w-3.5" />} loading={busy && !marking} onClick={() => fileRef.current?.click()}>
              {cap ? 'Substituir imagem' : 'Enviar imagem'}
            </Button>
            {cap && !marking && (
              <>
                <Button size="sm" variant="ghost" icon={<MapPin className="h-3.5 w-3.5" />} onClick={() => setMarking(true)}>
                  Marcações
                </Button>
                <Button size="sm" variant="ghost" icon={<Edit3 className="h-3.5 w-3.5" />} onClick={() => setLegenda(cap.legenda || def.legenda)}>
                  Legenda
                </Button>
              </>
            )}
            {marking && (
              <>
                <span className="text-idg-orange">Toque na imagem para pôr o próximo número; toque num número para tirar.</span>
                <Button size="sm" variant="ghost" icon={<Trash2 className="h-3.5 w-3.5" />} onClick={() => setMarkers([])}>
                  Limpar
                </Button>
                <Button size="sm" loading={busy} onClick={saveMarkers}>
                  Salvar marcações
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setMarkers(cap?.marcadores ?? []);
                    setMarking(false);
                  }}
                >
                  Cancelar
                </Button>
              </>
            )}
          </>
        )}
      </figcaption>
    </figure>
  );
}

function Lightbox({ cap, onClose }: { cap: Capture; onClose: () => void }) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4" onClick={onClose} role="dialog" aria-label={cap.legenda}>
      <button className="absolute right-4 top-4 rounded-full bg-white/15 p-2 text-white hover:bg-white/25" onClick={onClose} aria-label="Fechar">
        <X className="h-6 w-6" />
      </button>
      <figure className="max-h-full max-w-[min(96vw,1600px)]" onClick={(e) => e.stopPropagation()}>
        <div className="relative">
          <img src={cap.imagem_url} alt={cap.legenda} className="keep-light block max-h-[85vh] w-auto rounded-lg" />
          <Markers list={cap.marcadores} />
        </div>
        <figcaption className="mt-2 text-center text-sm text-white/85">{cap.legenda}</figcaption>
      </figure>
    </div>
  );
}

// ---------------------------------------------------------------- edição
function EditChapter({ ch, onClose, onSaved }: { ch: Chapter; onClose: () => void; onSaved: () => Promise<void> }) {
  const { user } = useSession();
  const { busy, run } = useAction();
  const [titulo, setTitulo] = useState(ch.titulo);
  const [ordem, setOrdem] = useState(ch.ordem);
  const [conteudo, setConteudo] = useState(ch.conteudo);
  const [rota, setRota] = useState(ch.rota ?? '');
  const [preview, setPreview] = useState(false);
  const isDefault = DEFAULT_CHAPTERS.some((d) => d.id === ch.id);
  return (
    <Modal
      open
      size="xl"
      onClose={onClose}
      title={`Editar capítulo · ${ch.titulo}`}
      footer={
        <>
          {ch.editado && (
            <Button
              variant="ghost"
              className="mr-auto"
              icon={isDefault ? <RotateCcw className="h-4 w-4" /> : <Trash2 className="h-4 w-4" />}
              loading={busy}
              onClick={() => confirm(isDefault ? 'Voltar ao texto padrão deste capítulo?' : 'Excluir este capítulo?') && run(async () => (await resetChapter(ch.id), await onSaved()), isDefault ? 'Texto padrão restaurado.' : 'Capítulo excluído.')}
            >
              {isDefault ? 'Restaurar padrão' : 'Excluir capítulo'}
            </Button>
          )}
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button loading={busy} disabled={titulo.trim().length < 2} onClick={() => run(async () => (await saveChapter({ id: ch.id, titulo: titulo.trim(), ordem, conteudo, rota: rota || undefined }, user), await onSaved()), 'Capítulo salvo.')}>
            Salvar
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <div className="grid gap-3 md:grid-cols-[1fr_110px_200px]">
          <Field label="Título">
            <input className="input" value={titulo} onChange={(e) => setTitulo(e.target.value)} />
          </Field>
          <Field label="Ordem">
            <input className="input" type="number" value={ordem} onChange={(e) => setOrdem(Number(e.target.value))} />
          </Field>
          <Field label="Tela relacionada (rota)" hint="Ex.: /atividades">
            <input className="input" value={rota} onChange={(e) => setRota(e.target.value)} />
          </Field>
        </div>
        <div className="flex items-center justify-between">
          <span className="label">Texto</span>
          <Button size="sm" variant="ghost" onClick={() => setPreview(!preview)}>
            {preview ? 'Editar' : 'Pré-visualizar'}
          </Button>
        </div>
        {preview ? (
          <div className="max-h-[55vh] overflow-y-auto rounded-lg border border-slate-200 p-3">
            <RichText src={conteudo} />
          </div>
        ) : (
          <textarea className="input min-h-[50vh] font-mono text-xs" value={conteudo} onChange={(e) => setConteudo(e.target.value)} />
        )}
        <p className="text-xs text-slate-500">
          Formatação: <code>## Subtítulo</code> · <code>- item</code> · <code>1. passo</code> · <code>**negrito**</code> · <code>&gt; Dica</code> · <code>! Atenção</code> · <code>[2]</code> mostra a marcação nº 2 da imagem. Deixe uma linha em branco entre
          parágrafos.
        </p>
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------- ganho de tempo
function TimeSavings({ t }: { t: ReturnType<typeof timeTotals> }) {
  const max = Math.max(1, ...t.per.map((r) => r.manualH));
  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-600">Comparação do tempo gasto em cada tarefa no controle manual (planilha e papel) e com o sistema. Os números são estimativas e o coordenador pode ajustá-los à realidade da equipe.</p>
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-lg bg-emerald-50 p-3 ring-1 ring-emerald-200">
          <div className="text-xs text-emerald-700">Economia por mês</div>
          <div className="text-2xl font-bold text-emerald-700">{fmtH(t.mes)} h</div>
        </div>
        <div className="rounded-lg bg-emerald-50 p-3 ring-1 ring-emerald-200">
          <div className="text-xs text-emerald-700">Economia por ano</div>
          <div className="text-2xl font-bold text-emerald-700">{fmtH(t.ano)} h</div>
        </div>
        <div className="rounded-lg bg-blue-50 p-3 ring-1 ring-blue-200">
          <div className="text-xs text-blue-700">Redução do tempo</div>
          <div className="text-2xl font-bold text-blue-700">{t.pct}%</div>
        </div>
      </div>
      <div className="overflow-x-auto rounded-lg border border-slate-200">
        <table className="w-full min-w-[640px]">
          <thead>
            <tr>
              <th className="th">Atividade</th>
              <th className="th text-center">Tempo no controle manual</th>
              <th className="th text-center">Tempo com o sistema</th>
              <th className="th text-center">Volume/mês</th>
              <th className="th text-center">Economia</th>
            </tr>
          </thead>
          <tbody>
            {t.per.map((r) => (
              <tr key={r.id}>
                <td className="td text-sm">{r.atividade}</td>
                <td className="td text-center text-sm">{fmtMin(r.manualMin)}</td>
                <td className="td text-center text-sm">{fmtMin(r.sistemaMin)}</td>
                <td className="td text-center text-sm">{r.volumeMes}</td>
                <td className="td text-center text-sm font-semibold text-emerald-700">
                  {fmtH(r.economiaH)} h/mês <span className="font-normal text-slate-500">({r.pct}%)</span>
                </td>
              </tr>
            ))}
            <tr className="bg-amber-50 font-semibold">
              <td className="td">Total por mês</td>
              <td className="td text-center">{fmtH(t.manualMes)} h</td>
              <td className="td text-center">{fmtH(t.sistemaMes)} h</td>
              <td className="td" />
              <td className="td text-center text-emerald-700">{fmtH(t.mes)} h</td>
            </tr>
          </tbody>
        </table>
      </div>
      <div className="space-y-2">
        <div className="flex gap-4 text-xs text-slate-600">
          <span className="flex items-center gap-1">
            <span className="inline-block h-3 w-5 rounded bg-idg-orange" /> Manual (h/mês)
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block h-3 w-5 rounded bg-idg-blue" /> Sistema (h/mês)
          </span>
        </div>
        {t.per.map((r) => (
          <div key={r.id} className="grid grid-cols-[minmax(0,220px)_1fr] items-center gap-2 text-xs">
            <div className="truncate text-right text-slate-600" title={r.atividade}>
              {r.atividade}
            </div>
            <div className="space-y-0.5">
              {(
                [
                  [r.manualH, 'bg-idg-orange'],
                  [r.sistemaH, 'bg-idg-blue'],
                ] as const
              ).map(([v, c], k) => (
                <Fragment key={k}>
                  <div className="flex items-center gap-1">
                    <div className={cx('h-2.5 rounded', c)} style={{ width: `${Math.max(0.5, (v / max) * 85)}%` }} />
                    <span className="text-[10px] text-slate-500">{fmtH(v)}</span>
                  </div>
                </Fragment>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function TimeConfig({ rows, onClose, onSaved }: { rows: TimeRow[]; onClose: () => void; onSaved: () => Promise<void> }) {
  const { busy, run } = useAction();
  const [list, setList] = useState<TimeRow[]>(rows.map((r) => ({ ...r })));
  const t = timeTotals(list);
  const upd = (i: number, patch: Partial<TimeRow>) => setList((l) => l.map((r, k) => (k === i ? { ...r, ...patch } : r)));
  const num = (v: string) => Math.max(0, Number(v.replace(',', '.')) || 0);
  return (
    <Modal
      open
      size="xl"
      onClose={onClose}
      title="Ganho de tempo · ajustar valores (estimativa)"
      footer={
        <>
          <Button variant="ghost" className="mr-auto" icon={<RotateCcw className="h-4 w-4" />} onClick={() => setList(DEFAULT_TIME_ROWS.map((r) => ({ ...r })))}>
            Valores iniciais
          </Button>
          <span className="self-center text-sm text-emerald-700">
            Economia: <b>{fmtH(t.mes)} h/mês</b> · {fmtH(t.ano)} h/ano
          </span>
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button loading={busy} disabled={list.some((r) => !r.atividade.trim())} onClick={() => run(async () => (await saveTimeRows(list), await onSaved()), 'Valores salvos.')}>
            Salvar
          </Button>
        </>
      }
    >
      <p className="mb-3 text-sm text-slate-600">Informe quanto tempo cada tarefa leva (em minutos, por ocorrência) no controle manual e no sistema, e quantas vezes ela acontece por mês. A tabela, o gráfico e os slides se atualizam sozinhos.</p>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[700px]">
          <thead>
            <tr>
              <th className="th">Atividade</th>
              <th className="th w-28">Manual (min)</th>
              <th className="th w-28">Sistema (min)</th>
              <th className="th w-28">Vezes por mês</th>
              <th className="th w-24 text-right">Economia</th>
              <th className="th w-8" />
            </tr>
          </thead>
          <tbody>
            {list.map((r, i) => (
              <tr key={r.id}>
                <td className="td">
                  <input className="input" value={r.atividade} onChange={(e) => upd(i, { atividade: e.target.value })} />
                </td>
                <td className="td">
                  <input className="input" type="number" min={0} value={r.manualMin} onChange={(e) => upd(i, { manualMin: num(e.target.value) })} />
                </td>
                <td className="td">
                  <input className="input" type="number" min={0} value={r.sistemaMin} onChange={(e) => upd(i, { sistemaMin: num(e.target.value) })} />
                </td>
                <td className="td">
                  <input className="input" type="number" min={0} value={r.volumeMes} onChange={(e) => upd(i, { volumeMes: num(e.target.value) })} />
                </td>
                <td className="td text-right text-sm text-emerald-700">{fmtH(t.per[i].economiaH)} h</td>
                <td className="td">
                  <button className="text-red-600" onClick={() => setList((l) => l.filter((_, k) => k !== i))} aria-label="Remover">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Button size="sm" variant="ghost" className="mt-2" icon={<Plus className="h-4 w-4" />} onClick={() => setList((l) => [...l, { id: uid('t'), atividade: '', manualMin: 10, sistemaMin: 2, volumeMes: 10 }])}>
        Incluir atividade
      </Button>
    </Modal>
  );
}
