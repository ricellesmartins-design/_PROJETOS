import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { AlertTriangle, CheckCircle2, Info, Loader2, X, XCircle } from 'lucide-react';

export function cx(...c: (string | false | null | undefined)[]) {
  return c.filter(Boolean).join(' ');
}

type BtnVariant = 'primary' | 'secondary' | 'danger' | 'ghost' | 'success' | 'warning';
const BTN: Record<BtnVariant, string> = {
  primary: 'bg-idg-blue text-white hover:bg-idg-navy',
  secondary: 'border border-slate-300 bg-white text-slate-700 hover:bg-slate-50',
  danger: 'bg-red-600 text-white hover:bg-red-700',
  success: 'bg-emerald-600 text-white hover:bg-emerald-700',
  warning: 'bg-amber-500 text-white hover:bg-amber-600',
  ghost: 'text-slate-600 hover:bg-slate-100',
};

export function Button({
  variant = 'primary',
  size = 'md',
  loading,
  icon,
  className,
  children,
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: BtnVariant; size?: 'sm' | 'md'; loading?: boolean; icon?: ReactNode }) {
  return (
    <button
      {...rest}
      disabled={rest.disabled || loading}
      className={cx(
        'inline-flex items-center justify-center gap-1.5 rounded-md font-medium transition disabled:cursor-not-allowed disabled:opacity-50',
        size === 'sm' ? 'px-2.5 py-1 text-xs' : 'px-3.5 py-2 text-sm',
        BTN[variant],
        className,
      )}
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : icon}
      {children}
    </button>
  );
}

export function Card({ title, actions, children, className, bodyClass }: { title?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string; bodyClass?: string }) {
  return (
    <section className={cx('card', className)}>
      {(title || actions) && (
        <header className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-3">
          <h2 className="text-sm font-semibold text-slate-700">{title}</h2>
          <div className="flex flex-wrap items-center gap-2">{actions}</div>
        </header>
      )}
      <div className={cx('p-4', bodyClass)}>{children}</div>
    </section>
  );
}

const BADGE: Record<string, string> = {
  gray: 'bg-slate-100 text-slate-700 ring-slate-200',
  blue: 'bg-blue-50 text-blue-700 ring-blue-200',
  green: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  yellow: 'bg-amber-50 text-amber-800 ring-amber-200',
  red: 'bg-red-50 text-red-700 ring-red-200',
  orange: 'bg-orange-50 text-orange-700 ring-orange-200',
  purple: 'bg-violet-50 text-violet-700 ring-violet-200',
};
export function Badge({ color = 'gray', children, className }: { color?: keyof typeof BADGE | string; children: ReactNode; className?: string }) {
  return <span className={cx('inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset', BADGE[color] ?? BADGE.gray, className)}>{children}</span>;
}

export const STATUS_COLOR: Record<string, string> = {
  'Não Iniciado': 'gray',
  'Em andamento': 'blue',
  'Aguardando Cliente': 'orange',
  Finalizado: 'green',
  Cancelado: 'red',
  Pendente: 'yellow',
  'Ajuste Solicitado': 'orange',
  Aprovada: 'green',
  Reprovada: 'red',
  'Cancelamento Solicitado': 'purple',
  Cancelada: 'gray',
  'Conciliado (OK)': 'green',
  'Divergência de Datas': 'yellow',
  'Ausente no RH': 'red',
  'Ausente no Sistema': 'orange',
  'Não aberto': 'gray',
  Aberto: 'blue',
  'Em análise': 'yellow',
  Concluído: 'green',
};
export const StatusBadge = ({ status }: { status: string }) => <Badge color={STATUS_COLOR[status] ?? 'gray'}>{status}</Badge>;

export function Modal({ open, onClose, title, children, footer, size = 'lg' }: { open: boolean; onClose: () => void; title: ReactNode; children: ReactNode; footer?: ReactNode; size?: 'md' | 'lg' | 'xl' }) {
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [open, onClose]);
  if (!open) return null;
  const w = size === 'md' ? 'max-w-lg' : size === 'lg' ? 'max-w-3xl' : 'max-w-6xl';
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/50 p-3 sm:p-8" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={cx('w-full rounded-xl bg-white shadow-2xl', w)}>
        <div className="flex items-center justify-between border-b px-5 py-3">
          <h3 className="text-base font-semibold text-slate-800">{title}</h3>
          <button onClick={onClose} className="rounded p-1 text-slate-500 hover:bg-slate-100" aria-label="Fechar">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="max-h-[75vh] overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="flex flex-wrap justify-end gap-2 border-t bg-slate-50 px-5 py-3">{footer}</div>}
      </div>
    </div>
  );
}

export function Field({ label, children, hint, className }: { label: ReactNode; children: ReactNode; hint?: ReactNode; className?: string }) {
  return (
    <label className={cx('block', className)}>
      <span className="label">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-slate-500">{hint}</span>}
    </label>
  );
}

export function Alert({ kind = 'info', title, children, className }: { kind?: 'info' | 'warning' | 'error' | 'success'; title?: ReactNode; children?: ReactNode; className?: string }) {
  const map = {
    info: ['border-blue-200 bg-blue-50 text-blue-900', Info],
    warning: ['border-amber-300 bg-amber-50 text-amber-900', AlertTriangle],
    error: ['border-red-300 bg-red-50 text-red-900', XCircle],
    success: ['border-emerald-300 bg-emerald-50 text-emerald-900', CheckCircle2],
  } as const;
  const [cls, Icon] = map[kind];
  return (
    <div className={cx('flex gap-2 rounded-lg border px-3 py-2 text-sm', cls, className)}>
      <Icon className="mt-0.5 h-4 w-4 shrink-0" />
      <div className="min-w-0">
        {title && <div className="font-semibold">{title}</div>}
        {children && <div className="whitespace-pre-line">{children}</div>}
      </div>
    </div>
  );
}

export function Stat({ label, value, sub, tone = 'default', icon }: { label: string; value: ReactNode; sub?: ReactNode; tone?: 'default' | 'red' | 'amber' | 'green' | 'blue'; icon?: ReactNode }) {
  const t = { default: 'text-slate-800', red: 'text-red-600', amber: 'text-amber-600', green: 'text-emerald-600', blue: 'text-idg-blue' }[tone];
  return (
    <div className="card flex items-start gap-3 p-4">
      {icon && <div className="rounded-lg bg-slate-100 p-2 text-slate-600">{icon}</div>}
      <div className="min-w-0">
        <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</div>
        <div className={cx('text-2xl font-bold', t)}>{value}</div>
        {sub && <div className="text-xs text-slate-500">{sub}</div>}
      </div>
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="rounded-lg border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">{children}</div>;
}

// Toasts ---------------------------------------------------------------------
type Toast = { id: number; kind: 'success' | 'error' | 'info'; text: string };
const ToastCtx = createContext<(kind: Toast['kind'], text: string) => void>(() => {});
export function ToastProvider({ children }: { children: ReactNode }) {
  const [list, setList] = useState<Toast[]>([]);
  const push = useCallback((kind: Toast['kind'], text: string) => {
    const id = Date.now() + Math.random();
    setList((l) => [...l, { id, kind, text }]);
    setTimeout(() => setList((l) => l.filter((t) => t.id !== id)), kind === 'error' ? 9000 : 4500);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="fixed bottom-4 right-4 z-[60] flex w-[min(420px,calc(100vw-2rem))] flex-col gap-2">
        {list.map((t) => (
          <div
            key={t.id}
            className={cx(
              'whitespace-pre-line rounded-lg px-4 py-3 text-sm text-white shadow-lg',
              t.kind === 'success' ? 'bg-emerald-600' : t.kind === 'error' ? 'bg-red-600' : 'bg-slate-800',
            )}
          >
            {t.text}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}
export const useToast = () => useContext(ToastCtx);

/** Executa uma ação assíncrona exibindo erro em toast. */
export function useAction() {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const run = useCallback(
    async <T,>(fn: () => Promise<T>, ok?: string): Promise<T | undefined> => {
      setBusy(true);
      try {
        const r = await fn();
        if (ok) toast('success', ok);
        return r;
      } catch (e) {
        toast('error', e instanceof Error ? e.message : String(e));
        return undefined;
      } finally {
        setBusy(false);
      }
    },
    [toast],
  );
  return { busy, run };
}
