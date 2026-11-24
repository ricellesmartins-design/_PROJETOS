// Primeiro acesso com a senha padrão (ou senha redefinida pelo coordenador): a pessoa cria a própria senha antes de entrar.
import { useState } from 'react';
import { KeyRound, LogOut } from 'lucide-react';
import { changePassword } from '../lib/auth';
import { Alert, Button, Field } from '../components/ui';
import logo from '../templates/logo-idg-default.png';

export default function ForcePassword({ nome, onDone, onLogout }: { nome: string; onDone: () => void; onLogout: () => void }) {
  const [password, setPassword] = useState('');
  const [password2, setPassword2] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (password !== password2) return setError('As duas senhas não são iguais.');
    setBusy(true);
    try {
      await changePassword(password);
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-idg-navy via-idg-blue to-slate-800 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-7 shadow-2xl">
        <div className="mb-5 flex flex-col items-center text-center">
          <img src={logo} alt="IDG Engenharia" className="keep-light h-16 rounded-lg bg-white p-1" />
          <h1 className="mt-3 text-lg font-bold text-idg-navy">Crie sua senha</h1>
          <p className="text-sm text-slate-500">Gestão de Atividades e Férias · Contrato AMP</p>
        </div>
        <Alert kind="info">
          Olá{nome ? `, ${nome.split(' ')[0]}` : ''}! Você entrou com a senha padrão. Para continuar, crie uma senha só sua. Nas próximas vezes, entre com ela.
        </Alert>
        <form onSubmit={submit} className="mt-4 space-y-3">
          <Field label="Nova senha" hint="Mínimo de 8 caracteres, diferente da senha padrão.">
            <input className="input" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </Field>
          <Field label="Confirmar nova senha">
            <input className="input" type="password" autoComplete="new-password" value={password2} onChange={(e) => setPassword2(e.target.value)} required />
          </Field>
          {error && <Alert kind="error">{error}</Alert>}
          <Button type="submit" className="w-full" loading={busy} disabled={password.length < 8 || !password2} icon={<KeyRound className="h-4 w-4" />}>
            Salvar senha e entrar
          </Button>
          <button type="button" className="flex w-full items-center justify-center gap-1.5 text-sm text-slate-500 hover:underline" onClick={onLogout}>
            <LogOut className="h-3.5 w-3.5" /> Sair
          </button>
        </form>
      </div>
    </div>
  );
}
