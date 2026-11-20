import { useEffect, useState } from 'react';
import { Bell, BellOff, Download, KeyRound, MonitorDown, Send } from 'lucide-react';
import { useDb, useSession, collaboratorName } from '../lib/store';
import { changePassword, ROLE_LABEL } from '../lib/auth';
import { currentSubscription, disablePush, enablePush, pushSupported, sendTestPush } from '../lib/push';
import { canPromptInstall, isStandalone, onInstallChange, promptInstall } from '../lib/install';
import { Alert, Badge, Button, Card, Field, useAction } from '../components/ui';

export default function Account() {
  const db = useDb();
  const { realUser } = useSession();
  const { busy, run } = useAction();
  const [pwd, setPwd] = useState('');
  const [pwd2, setPwd2] = useState('');
  const [subscribed, setSubscribed] = useState<boolean>();
  const [, force] = useState(0);
  const perm = 'Notification' in window ? Notification.permission : 'denied';

  useEffect(() => {
    currentSubscription().then((s) => setSubscribed(!!s));
    return onInstallChange(() => force((n) => n + 1));
  }, []);

  const lembretes = db.settings.lembretes ?? [];
  const installed = isStandalone();

  return (
    <div className="space-y-5">
      <Card title="Minha conta">
        <div className="grid gap-2 text-sm sm:grid-cols-2">
          <div>
            <span className="label">Nome</span>
            {realUser.nome}
          </div>
          <div>
            <span className="label">E-mail</span>
            {realUser.email}
          </div>
          <div>
            <span className="label">Perfil</span>
            <Badge color="blue">{ROLE_LABEL[realUser.role]}</Badge>
          </div>
          {realUser.role === 'colaborador' && (
            <div>
              <span className="label">Colaborador vinculado</span>
              {realUser.collaboratorId ? collaboratorName(realUser.collaboratorId) : <Badge color="yellow">Aguardando vínculo pelo coordenador</Badge>}
            </div>
          )}
        </div>
      </Card>

      <Card title={<span className="inline-flex items-center gap-2"><MonitorDown className="h-4 w-4" /> Instalar no computador (Windows)</span>}>
        {installed ? (
          <Alert kind="success">O aplicativo já está instalado e aberto como app do Windows.</Alert>
        ) : (
          <div className="space-y-3 text-sm">
            <p>
              O sistema pode ser instalado como um aplicativo do Windows: ganha ícone no menu Iniciar e na barra de tarefas, abre em janela própria e recebe os lembretes diários.
            </p>
            {canPromptInstall() ? (
              <Button icon={<Download className="h-4 w-4" />} onClick={() => run(async () => void (await promptInstall()))}>
                Instalar aplicativo
              </Button>
            ) : (
              <ol className="list-decimal space-y-1 pl-5 text-slate-700">
                <li>Abra este endereço no <b>Microsoft Edge</b> ou <b>Google Chrome</b>.</li>
                <li>
                  Edge: menu <b>⋯</b> › <b>Aplicativos</b> › <b>Instalar este site como um aplicativo</b>. Chrome: ícone de instalação <b>⊕</b> na barra de endereço (ou menu <b>⋮</b> › <b>Transmitir, salvar e compartilhar</b> › <b>Instalar página como app</b>).
                </li>
                <li>Confirme em <b>Instalar</b>. Se quiser, marque "Fixar na barra de tarefas" e "Iniciar automaticamente ao entrar no Windows".</li>
              </ol>
            )}
          </div>
        )}
      </Card>

      <Card title={<span className="inline-flex items-center gap-2"><Bell className="h-4 w-4" /> Lembretes diários no Windows</span>}>
        <div className="space-y-3 text-sm">
          <p>
            Nos dias úteis, às <b>{lembretes.join(' e ') || '—'}</b>, você recebe uma notificação do Windows lembrando de atualizar os serviços em execução (horas, datas e status). Só é enviada se houver serviço em aberto.
          </p>
          {!pushSupported() ? (
            <Alert kind="warning">Este navegador não suporta notificações. Use o Microsoft Edge ou o Google Chrome no Windows.</Alert>
          ) : perm === 'denied' ? (
            <Alert kind="error">As notificações estão bloqueadas para este site. Clique no cadeado na barra de endereço › Permissões › Notificações › Permitir, e recarregue a página.</Alert>
          ) : subscribed ? (
            <Alert kind="success">Lembretes ativos neste computador.</Alert>
          ) : (
            <Alert kind="info">Lembretes ainda não ativados neste computador.</Alert>
          )}
          <div className="flex flex-wrap gap-2">
            {!subscribed ? (
              <Button
                icon={<Bell className="h-4 w-4" />}
                loading={busy}
                disabled={!pushSupported()}
                onClick={() =>
                  run(async () => {
                    await enablePush(realUser.id);
                    setSubscribed(true);
                  }, 'Lembretes ativados neste computador.')
                }
              >
                Ativar lembretes
              </Button>
            ) : (
              <>
                <Button
                  variant="secondary"
                  icon={<Send className="h-4 w-4" />}
                  loading={busy}
                  onClick={() =>
                    run(async () => {
                      const r = await sendTestPush();
                      if (!r.enviados) throw new Error('Nenhuma notificação enviada. Desative e ative os lembretes novamente.');
                    }, 'Notificação de teste enviada.')
                  }
                >
                  Enviar teste
                </Button>
                <Button
                  variant="ghost"
                  icon={<BellOff className="h-4 w-4" />}
                  loading={busy}
                  onClick={() =>
                    run(async () => {
                      await disablePush();
                      setSubscribed(false);
                    }, 'Lembretes desativados neste computador.')
                  }
                >
                  Desativar
                </Button>
              </>
            )}
          </div>
          <p className="text-xs text-slate-500">
            Para receber com o app fechado, o Edge/Chrome precisa estar em execução em segundo plano (padrão do Windows). Verifique também se o "Assistente de foco / Não perturbe" do Windows está desligado nesses horários.
          </p>
        </div>
      </Card>

      <Card title={<span className="inline-flex items-center gap-2"><KeyRound className="h-4 w-4" /> Alterar senha</span>}>
        <div className="grid max-w-xl gap-3 sm:grid-cols-2">
          <Field label="Nova senha (mín. 8 caracteres)">
            <input type="password" className="input" autoComplete="new-password" value={pwd} onChange={(e) => setPwd(e.target.value)} />
          </Field>
          <Field label="Confirmar nova senha">
            <input type="password" className="input" autoComplete="new-password" value={pwd2} onChange={(e) => setPwd2(e.target.value)} />
          </Field>
        </div>
        {pwd2 && pwd !== pwd2 && <p className="mt-1 text-xs text-red-600">As senhas não conferem.</p>}
        <Button
          className="mt-3"
          loading={busy}
          disabled={pwd.length < 8 || pwd !== pwd2}
          onClick={() =>
            run(async () => {
              await changePassword(pwd);
              setPwd('');
              setPwd2('');
            }, 'Senha alterada.')
          }
        >
          Alterar senha
        </Button>
      </Card>
    </div>
  );
}
