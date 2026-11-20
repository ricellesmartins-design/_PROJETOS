// Tela aberta pelo link do e-mail (?acesso=...): aceitar convite ou criar nova senha.
import { useEffect, useState } from 'react';
import { KeyRound, Loader2, UserPlus } from 'lucide-react';
import { accessInfo, completeAccess, ROLE_LABEL, type AccessInfo } from '../lib/auth';
import { Alert, Button, Field } from '../components/ui';
import logo from '../templates/logo-idg-default.png';

export default function AccessLink({ acesso, onDone, onCancel }: { acesso: string; onDone: () => void; onCancel: () => void }) {
  const [info, setInfo] = useState<AccessInfo>();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [nome, setNome] = useState('');
  const [matricula, setMatricula] = useState('');
  const [funcao, setFuncao] = useState('');
  const [password, setPassword] = useState('');
  const [password2, setPassword2] = useState('');

  useEffect(() => {
    accessInfo(acesso)
      .then((i) => {
        setInfo(i);
        setNome(i.nome);
      })
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, [acesso]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (password !== password2) return setError('As duas senhas não são iguais.');
    setBusy(true);
    try {
      await completeAccess(acesso, info?.precisaCadastro ? { password, nome, matricula, funcao } : { password });
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  const cadastro = info?.precisaCadastro;
  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-idg-navy via-idg-blue to-slate-800 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-7 shadow-2xl">
        <div className="mb-5 flex flex-col items-center text-center">
          <img src={logo} alt="IDG Engenharia" className="keep-light h-16 rounded-lg bg-white p-1" />
          <h1 className="mt-3 text-lg font-bold text-idg-navy">{cadastro ? 'Bem-vindo! Complete seu cadastro' : 'Criar nova senha'}</h1>
          <p className="text-sm text-slate-500">Gestão de Atividades e Férias · Contrato AMP</p>
        </div>
        {!info && !error && (
          <div className="flex items-center justify-center gap-2 py-6 text-slate-500">
            <Loader2 className="h-5 w-5 animate-spin" /> Verificando o link…
          </div>
        )}
        {!info && error && (
          <div className="space-y-3">
            <Alert kind="error">{error}</Alert>
            <Button className="w-full" variant="secondary" onClick={onCancel}>
              Ir para o login
            </Button>
          </div>
        )}
        {info && (
          <form onSubmit={submit} className="space-y-3">
            <div className="rounded-lg bg-slate-50 px-3 py-2 text-sm">
              <div className="font-medium">{info.email}</div>
              <div className="text-xs text-slate-500">Perfil: {ROLE_LABEL[info.role]}</div>
            </div>
            {cadastro && (
              <>
                <Field label="Nome completo">
                  <input className="input" value={nome} onChange={(e) => setNome(e.target.value)} required />
                </Field>
                {info.role === 'colaborador' && (
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
            <Field label={cadastro ? 'Crie sua senha' : 'Nova senha'} hint="Mínimo de 8 caracteres.">
              <input className="input" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
            </Field>
            <Field label="Repita a senha">
              <input className="input" type="password" autoComplete="new-password" value={password2} onChange={(e) => setPassword2(e.target.value)} required />
            </Field>
            {error && <Alert kind="error">{error}</Alert>}
            <Button type="submit" className="w-full" loading={busy} disabled={password.length < 8} icon={cadastro ? <UserPlus className="h-4 w-4" /> : <KeyRound className="h-4 w-4" />}>
              {cadastro ? 'Concluir cadastro e entrar' : 'Salvar nova senha e entrar'}
            </Button>
          </form>
        )}
      </div>
    </div>
  );
}
