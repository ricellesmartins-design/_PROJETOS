import { createContext, useContext, useSyncExternalStore, type ReactNode } from 'react';
import { db, type Profile } from './db';

/** Re-renderiza o componente quando qualquer tabela muda (inclui alterações em tempo real). */
export function useDb() {
  useSyncExternalStore(db.subscribe, db.getVersion);
  return db;
}

export interface Session {
  /** Usuário efetivo (pode ser a simulação "ver como" do coordenador). */
  user: Profile;
  /** Usuário autenticado de fato. */
  realUser: Profile;
  setViewAs: (v?: { role: Profile['role']; collaboratorId?: string }) => void;
  logout: () => void;
}

const Ctx = createContext<Session | null>(null);
export const SessionProvider = ({ value, children }: { value: Session; children: ReactNode }) => <Ctx.Provider value={value}>{children}</Ctx.Provider>;
export function useSession(): Session {
  const s = useContext(Ctx);
  if (!s) throw new Error('Sessão não iniciada');
  return s;
}

export function collaboratorName(id?: string) {
  return db.all('collaborators').find((c) => c.id === id)?.nome ?? '—';
}

export function useRoute(): [string, URLSearchParams] {
  const hash = useSyncExternalStore(
    (cb) => {
      window.addEventListener('hashchange', cb);
      return () => window.removeEventListener('hashchange', cb);
    },
    () => window.location.hash,
  );
  const [path, query] = (hash.replace(/^#/, '') || '/').split('?');
  return [path || '/', new URLSearchParams(query ?? '')];
}

export const navigate = (to: string) => {
  window.location.hash = to;
};
