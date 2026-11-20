import { useState } from 'react';
import { LogIn, ShieldCheck, UserPlus } from 'lucide-react';
import { ALLOWED_DOMAINS, isAllowedDomain, isEmailFormat, login, register, roleForEmail, ROLE_LABEL } from '../lib/auth';
import { Alert, Button, Field } from '../components/ui';
import logo from '../templates/logo-idg-default.png';

export default function Login({ onLogged }: { onLogged: () => void }) {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [nome, setNome] = useState('');
  const [matricula, setMatricula] = useState('');
  const [funcao, setFuncao] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const domainOk = !email || !isEmailFormat(email) || isAllowedDomain(email);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      if (mode === 'login') await login(email, password);
      else await register({ email, password, nome, matricula, funcao });
      onLogged();
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
          <img src={logo} alt="IDG Engenharia" className="h-16" />
          <h1 className="mt-3 text-lg font-bold text-idg-navy">Gestão de Atividades e Férias</h1>
          <p className="text-sm text-slate-500">Contrato AMP · ArcelorMittal Pecém</p>
        </div>
        <div className="mb-4 grid grid-cols-2 rounded-lg bg-slate-100 p-1 text-sm">
          {(['login', 'register'] as const).map((m) => (
            <button key={m} type="button" onClick={() => setMode(m)} className={`rounded-md py-1.5 font-medium ${mode === m ? 'bg-white shadow text-idg-blue' : 'text-slate-500'}`}>
              {m === 'login' ? 'Entrar' : 'Criar conta'}
            </button>
          ))}
        </div>
        <form onSubmit={submit} className="space-y-3">
          <Field label="E-mail corporativo">
            <input className="input" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="nome@idg-eng.com" required />
          </Field>
          {!domainOk && <Alert kind="error">Domínio não autorizado. Use {ALLOWED_DOMAINS.map((d) => '@' + d).join(', ')}.</Alert>}
          {mode === 'register' && email && isEmailFormat(email) && domainOk && (
            <div className="flex items-center gap-1.5 text-xs text-slate-500">
              <ShieldCheck className="h-3.5 w-3.5" /> Perfil: <b>{ROLE_LABEL[roleForEmail(email)]}</b>
            </div>
          )}
          {mode === 'register' && (
            <>
              <Field label="Nome completo">
                <input className="input" value={nome} onChange={(e) => setNome(e.target.value)} required />
              </Field>
              {roleForEmail(email) === 'colaborador' && (
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Matrícula">
                    <input className="input" value={matricula} onChange={(e) => setMatricula(e.target.value)} placeholder="Ex.: 000000" />
                  </Field>
                  <Field label="Função">
                    <input className="input" value={funcao} onChange={(e) => setFuncao(e.target.value)} placeholder="Engenheiro Mecânico" />
                  </Field>
                </div>
              )}
            </>
          )}
          <Field label="Senha" hint={mode === 'register' ? 'Mínimo de 8 caracteres.' : undefined}>
            <input className="input" type="password" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} value={password} onChange={(e) => setPassword(e.target.value)} required />
          </Field>
          {error && <Alert kind="error">{error}</Alert>}
          <Button type="submit" className="w-full" loading={busy} disabled={!domainOk} icon={mode === 'login' ? <LogIn className="h-4 w-4" /> : <UserPlus className="h-4 w-4" />}>
            {mode === 'login' ? 'Entrar' : 'Criar conta e entrar'}
          </Button>
          {mode === 'login' && <p className="text-center text-xs text-slate-500">Esqueceu a senha? Peça ao coordenador para redefinir em Configurações › Usuários.</p>}
        </form>
      </div>
    </div>
  );
}
