// Botões do topo: tema claro/escuro e instalar o app pelo navegador.
import { useEffect, useState } from 'react';
import { Download, Monitor, Moon, Sun } from 'lucide-react';
import { getThemePref, onThemeChange, setThemePref, type ThemePref } from '../lib/theme';
import { canPromptInstall, isStandalone, onInstallChange, promptInstall } from '../lib/install';
import { Button, Modal, cx } from './ui';

const NEXT: Record<ThemePref, ThemePref> = { system: 'light', light: 'dark', dark: 'system' };
const LABEL: Record<ThemePref, string> = { system: 'Tema: automático (segue o Windows)', light: 'Tema: claro', dark: 'Tema: escuro' };

export function ThemeToggle({ className }: { className?: string }) {
  const [pref, setPref] = useState(getThemePref());
  useEffect(() => onThemeChange(() => setPref(getThemePref())), []);
  const Icon = pref === 'dark' ? Moon : pref === 'light' ? Sun : Monitor;
  return (
    <button type="button" title={`${LABEL[pref]} · clique para trocar`} aria-label={LABEL[pref]} onClick={() => setThemePref(NEXT[pref])} className={cx('rounded p-1.5 text-slate-500 hover:bg-slate-100', className)}>
      <Icon className="h-4 w-4" />
    </button>
  );
}

/** Seletor completo (Minha conta). */
export function ThemePicker() {
  const [pref, setPref] = useState(getThemePref());
  useEffect(() => onThemeChange(() => setPref(getThemePref())), []);
  const opts: [ThemePref, string, typeof Sun][] = [
    ['system', 'Automático', Monitor],
    ['light', 'Claro', Sun],
    ['dark', 'Escuro', Moon],
  ];
  return (
    <div className="inline-flex rounded-lg bg-slate-100 p-1 text-sm">
      {opts.map(([v, l, I]) => (
        <button key={v} type="button" onClick={() => setThemePref(v)} className={cx('inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 font-medium', pref === v ? 'bg-white text-idg-blue shadow' : 'text-slate-500')}>
          <I className="h-4 w-4" /> {l}
        </button>
      ))}
    </div>
  );
}

export function InstallSteps() {
  return (
    <ol className="list-decimal space-y-1.5 pl-5 text-sm text-slate-700">
      <li>
        Abra <b>{window.location.origin}</b> no <b>Microsoft Edge</b> ou no <b>Google Chrome</b>.
      </li>
      <li>
        <b>Edge:</b> clique no ícone de instalação na barra de endereço (um quadrado com +) ou vá no menu <b>⋯</b> › <b>Aplicativos</b> › <b>Instalar este site como um aplicativo</b>.
      </li>
      <li>
        <b>Chrome:</b> clique no ícone <b>⊕</b> na barra de endereço ou vá no menu <b>⋮</b> › <b>Transmitir, salvar e compartilhar</b> › <b>Instalar página como app</b>.
      </li>
      <li>
        <b>Celular:</b> Android (Chrome) menu <b>⋮</b> › <b>Instalar app</b>. iPhone (Safari) botão <b>Compartilhar</b> › <b>Adicionar à Tela de Início</b>.
      </li>
      <li>Confirme em <b>Instalar</b>. O app ganha ícone no menu Iniciar e abre em janela própria.</li>
    </ol>
  );
}

/** "Instalar app": usa o pedido nativo do navegador quando disponível; senão mostra o passo a passo. */
export function InstallButton({ variant = 'icon' }: { variant?: 'icon' | 'full' }) {
  const [, force] = useState(0);
  const [help, setHelp] = useState(false);
  useEffect(() => onInstallChange(() => force((x) => x + 1)), []);
  if (isStandalone()) return null;
  const click = async () => {
    if (canPromptInstall()) await promptInstall();
    else setHelp(true);
  };
  return (
    <>
      {variant === 'icon' ? (
        <button type="button" onClick={click} title="Instalar o app no computador" className="inline-flex items-center gap-1 rounded px-1.5 py-1 text-xs font-medium text-idg-blue hover:bg-slate-100">
          <Download className="h-4 w-4" /> <span className="hidden md:inline">Instalar app</span>
        </button>
      ) : (
        <Button type="button" variant="secondary" className="w-full" icon={<Download className="h-4 w-4" />} onClick={click}>
          Instalar o app no computador ou celular
        </Button>
      )}
      {help && (
        <Modal open size="md" onClose={() => setHelp(false)} title="Instalar o app">
          <div className="space-y-3">
            <p className="text-sm text-slate-600">Este navegador não ofereceu a instalação automática. Faça assim:</p>
            <InstallSteps />
          </div>
        </Modal>
      )}
    </>
  );
}
