// Tema claro/escuro. Padrão: segue o tema do Windows/navegador. A escolha fica salva neste navegador.
export type ThemePref = 'system' | 'light' | 'dark';
const KEY = 'amp-theme';
const media = window.matchMedia('(prefers-color-scheme: dark)');
const listeners = new Set<() => void>();

export const getThemePref = (): ThemePref => {
  const v = localStorage.getItem(KEY);
  return v === 'light' || v === 'dark' ? v : 'system';
};
export const isDark = () => document.documentElement.classList.contains('dark');

export function applyTheme() {
  const pref = getThemePref();
  const dark = pref === 'dark' || (pref === 'system' && media.matches);
  document.documentElement.classList.toggle('dark', dark);
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#0b1220' : '#1B2A5C');
  listeners.forEach((l) => l());
}

export function setThemePref(p: ThemePref) {
  if (p === 'system') localStorage.removeItem(KEY);
  else localStorage.setItem(KEY, p);
  applyTheme();
}

export function onThemeChange(fn: () => void) {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

media.addEventListener('change', () => getThemePref() === 'system' && applyTheme());
applyTheme();
