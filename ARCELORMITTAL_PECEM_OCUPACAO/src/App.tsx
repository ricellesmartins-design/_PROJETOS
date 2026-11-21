import { useEffect, useMemo, useState } from 'react';
import {
  BarChart3,
  Bell,
  BookOpen,
  CalendarCheck,
  CalendarDays,
  ClipboardList,
  FileSpreadsheet,
  GanttChartSquare,
  LayoutDashboard,
  Loader2,
  LogOut,
  Menu,
  Scale,
  Settings as SettingsIcon,
  UserCircle,
  X,
} from 'lucide-react';
import { supabase } from './lib/supabase';
import { db, type Profile } from './lib/db';
import { can, fetchProfile, logout, ROLE_LABEL } from './lib/auth';
import { SessionProvider, useDb, useRoute, navigate } from './lib/store';
import { startLocalReminders } from './lib/push';
import { ToastProvider, cx, Badge } from './components/ui';
import Login from './pages/Login';
import { InstallButton, ThemeToggle } from './components/AppButtons';
import AccessLink from './pages/AccessLink';
import Dashboard from './pages/Dashboard';
import Activities from './pages/Activities';
import ActivityImport from './pages/ActivityImport';
import LoadMap from './pages/LoadMap';
import Vacations from './pages/Vacations';
import Approvals from './pages/Approvals';
import HrRecon from './pages/HrRecon';
import Reports from './pages/Reports';
import Settings from './pages/Settings';
import Account from './pages/Account';
import Manual from './pages/Manual';
import { CAPTURE_MODE } from './lib/theme';
import logo from './templates/logo-idg-default.png';

type NavItem = { to: string; label: string; icon: React.ReactNode; show: (u: Profile) => boolean; badge?: (u: Profile) => number };

const NAV: NavItem[] = [
  { to: '/', label: 'Painel', icon: <LayoutDashboard className="h-4 w-4" />, show: () => true },
  { to: '/atividades', label: 'Atividades', icon: <ClipboardList className="h-4 w-4" />, show: () => true },
  { to: '/importar', label: 'Importar / Comparar Excel', icon: <FileSpreadsheet className="h-4 w-4" />, show: (u) => can.importExcel(u) },
  { to: '/mapa', label: 'Mapa de Carga', icon: <GanttChartSquare className="h-4 w-4" />, show: () => true },
  { to: '/ferias', label: 'Férias', icon: <CalendarDays className="h-4 w-4" />, show: (u) => can.vacations(u) },
  {
    to: '/aprovacoes',
    label: 'Aprovações',
    icon: <CalendarCheck className="h-4 w-4" />,
    show: (u) => can.approveVacations(u),
    badge: () => db.all('vacations').filter((v) => v.status === 'Pendente' || v.status === 'Cancelamento Solicitado').length,
  },
  { to: '/conciliacao', label: 'Conciliação RH', icon: <Scale className="h-4 w-4" />, show: (u) => can.approveVacations(u) },
  { to: '/relatorios', label: 'Relatórios', icon: <BarChart3 className="h-4 w-4" />, show: (u) => can.reports(u) },
  { to: '/configuracoes', label: 'Configurações', icon: <SettingsIcon className="h-4 w-4" />, show: (u) => can.settings(u) },
  { to: '/conta', label: 'Minha conta e lembretes', icon: <UserCircle className="h-4 w-4" />, show: () => true },
  { to: '/manual', label: 'Manual', icon: <BookOpen className="h-4 w-4" />, show: () => true },
];

function Shell({ realUser, onLogout }: { realUser: Profile; onLogout: () => void }) {
  useDb();
  const [route] = useRoute();
  const [viewAs, setViewAs] = useState<{ role: Profile['role']; collaboratorId?: string }>();
  const [menu, setMenu] = useState(false);
  const user = useMemo<Profile>(() => (viewAs ? { ...realUser, role: viewAs.role, collaboratorId: viewAs.collaboratorId } : realUser), [realUser, viewAs]);

  useEffect(() => {
    if (CAPTURE_MODE || realUser.role !== 'colaborador' || !realUser.collaboratorId) return;
    return startLocalReminders(
      () => db.all('activities').filter((a) => a.collaboratorId === realUser.collaboratorId && ['Não Iniciado', 'Em andamento', 'Aguardando Cliente'].includes(a.status)).length,
    );
  }, [realUser]);

  const items = NAV.filter((n) => n.show(user));
  const current = items.find((n) => n.to === route) ?? items[0];
  let page: React.ReactNode;
  switch (current.to) {
    case '/atividades':
      page = <Activities />;
      break;
    case '/importar':
      page = <ActivityImport />;
      break;
    case '/mapa':
      page = <LoadMap />;
      break;
    case '/ferias':
      page = <Vacations />;
      break;
    case '/aprovacoes':
      page = <Approvals />;
      break;
    case '/conciliacao':
      page = <HrRecon />;
      break;
    case '/relatorios':
      page = <Reports />;
      break;
    case '/configuracoes':
      page = <Settings />;
      break;
    case '/conta':
      page = <Account />;
      break;
    case '/manual':
      page = <Manual />;
      break;
    default:
      page = <Dashboard />;
  }

  const collabs = db.all('collaborators');
  return (
    <SessionProvider value={{ user, realUser, setViewAs, logout: onLogout }}>
      <div className="flex min-h-screen">
        <aside className={cx('fixed inset-y-0 left-0 z-40 w-64 transform bg-idg-navy text-slate-200 transition lg:static lg:translate-x-0', menu ? 'translate-x-0' : '-translate-x-full')}>
          <div className="keep-light flex items-center justify-between bg-white px-4 py-3">
            <img src={db.settings.logoDataUrl || logo} alt="IDG Engenharia" className="h-10 max-w-[180px] object-contain" />
            <button className="lg:hidden" onClick={() => setMenu(false)}>
              <X className="h-5 w-5 text-slate-600" />
            </button>
          </div>
          <div className="px-4 py-3 text-xs uppercase tracking-wider text-slate-400">Contrato AMP · Pecém</div>
          <nav className="space-y-0.5 px-2">
            {items.map((n) => (
              <a
                key={n.to}
                href={'#' + n.to}
                onClick={() => setMenu(false)}
                className={cx('flex items-center gap-2.5 rounded-md px-3 py-2 text-sm', current.to === n.to ? 'bg-white/15 font-semibold text-white' : 'hover:bg-white/10')}
              >
                {n.icon}
                <span className="flex-1">{n.label}</span>
                {n.badge && n.badge(user) > 0 && <span className="rounded-full bg-idg-orange px-1.5 text-xs font-bold text-white">{n.badge(user)}</span>}
              </a>
            ))}
          </nav>
        </aside>
        {menu && <div className="fixed inset-0 z-30 bg-black/40 lg:hidden" onClick={() => setMenu(false)} />}
        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-20 flex flex-wrap items-center gap-3 border-b bg-white/95 px-4 py-2.5 backdrop-blur">
            <button className="lg:hidden" onClick={() => setMenu(true)} aria-label="Menu">
              <Menu className="h-5 w-5" />
            </button>
            <h1 className="flex-1 truncate text-base font-semibold text-idg-navy">{current.label}</h1>
            {realUser.role === 'coordenador' && (
              <div className="flex items-center gap-1.5 text-xs">
                <span className="hidden text-slate-500 sm:inline">Ver como:</span>
                <select
                  className="input !w-auto !py-1 text-xs"
                  value={viewAs ? `${viewAs.role}|${viewAs.collaboratorId ?? ''}` : ''}
                  onChange={(e) => {
                    if (!e.target.value) return setViewAs(undefined);
                    const [role, cid] = e.target.value.split('|');
                    setViewAs({ role: role as Profile['role'], collaboratorId: cid || undefined });
                    navigate('/');
                  }}
                >
                  <option value="">Coordenador (eu)</option>
                  <option value="cliente|">Cliente ArcelorMittal</option>
                  {collabs.map((c) => (
                    <option key={c.id} value={`colaborador|${c.id}`}>
                      Colaborador: {c.nome}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <div className="flex items-center gap-2 text-right">
              <div className="hidden sm:block">
                <div className="text-sm font-medium leading-tight">{realUser.nome}</div>
                <div className="text-xs text-slate-500">{realUser.email}</div>
              </div>
              <Badge color={user.role === 'coordenador' ? 'blue' : user.role === 'cliente' ? 'purple' : 'green'}>{ROLE_LABEL[user.role]}</Badge>
              <InstallButton />
              <ThemeToggle />
              <a href="#/conta" title="Lembretes" className="rounded p-1.5 text-slate-500 hover:bg-slate-100">
                <Bell className="h-4 w-4" />
              </a>
              <button onClick={onLogout} title="Sair" className="rounded p-1.5 text-slate-500 hover:bg-slate-100">
                <LogOut className="h-4 w-4" />
              </button>
            </div>
          </header>
          {viewAs && (
            <div className="bg-amber-100 px-4 py-1.5 text-xs text-amber-900">
              Simulando a visão de <b>{viewAs.role === 'cliente' ? 'Cliente ArcelorMittal' : collabs.find((c) => c.id === viewAs.collaboratorId)?.nome}</b>. Ações continuam sendo gravadas com o seu usuário de coordenador.{' '}
              <button className="underline" onClick={() => setViewAs(undefined)}>
                Voltar
              </button>
            </div>
          )}
          <main className="flex-1 p-3 sm:p-5">{page}</main>
        </div>
      </div>
    </SessionProvider>
  );
}

export default function App() {
  const [state, setState] = useState<'loading' | 'out' | 'in'>('loading');
  const [profile, setProfile] = useState<Profile>();
  const [error, setError] = useState('');
  // Link de convite / nova senha enviado por e-mail (?acesso=<id>.<token>).
  const [acesso, setAcesso] = useState(() => new URLSearchParams(window.location.search).get('acesso') ?? '');
  const closeAccess = () => {
    const url = new URL(window.location.href);
    url.searchParams.delete('acesso');
    window.history.replaceState(null, '', url.pathname + url.search + url.hash);
    setAcesso('');
  };

  async function boot() {
    setError('');
    try {
      const p = await fetchProfile();
      if (!p) {
        setState('out');
        return;
      }
      await db.load(p);
      setProfile(p);
      setState('in');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setState('out');
    }
  }

  useEffect(() => {
    boot();
    const { data } = supabase.auth.onAuthStateChange((ev) => {
      if (ev === 'SIGNED_OUT') {
        setProfile(undefined);
        setState('out');
      }
    });
    return () => data.subscription.unsubscribe();
  }, []);

  return (
    <ToastProvider>
      {CAPTURE_MODE === 'login' && <Login onLogged={() => undefined} />}
      {CAPTURE_MODE !== 'login' && acesso && (
        <AccessLink
          acesso={acesso}
          onCancel={closeAccess}
          onDone={() => {
            closeAccess();
            setState('loading');
            boot();
          }}
        />
      )}
      {CAPTURE_MODE !== 'login' && !acesso && state === 'loading' && (
        <div className="flex min-h-screen items-center justify-center gap-2 text-slate-500">
          <Loader2 className="h-5 w-5 animate-spin" /> Carregando…
        </div>
      )}
      {CAPTURE_MODE !== 'login' && !acesso && state === 'out' && (
        <>
          {error && <div className="fixed inset-x-0 top-0 z-50 bg-red-600 px-4 py-2 text-center text-sm text-white">{error}</div>}
          <Login
            onLogged={() => {
              setState('loading');
              boot();
            }}
          />
        </>
      )}
      {CAPTURE_MODE !== 'login' && !acesso && state === 'in' && profile && (
        <Shell
          realUser={profile}
          onLogout={async () => {
            await logout();
            setState('out');
          }}
        />
      )}
    </ToastProvider>
  );
}
