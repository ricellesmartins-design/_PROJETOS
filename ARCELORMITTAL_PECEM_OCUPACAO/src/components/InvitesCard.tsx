// Convites: o coordenador envia um link de cadastro por e-mail e acompanha pendentes/aceitos.
import { useCallback, useEffect, useState } from 'react';
import { Copy, KeyRound, Mail, MessageCircle, RefreshCw, Send, UserPlus, X } from 'lucide-react';
import { cancelInvite, createUserWithDefault, getDefaultPassword, isAllowedDomain, isEmailFormat, listInvites, normalizeEmail, ROLE_LABEL, roleForEmail, sendInvite, ALLOWED_DOMAINS, type Invite } from '../lib/auth';
import { fmtDateTimeBR } from '../lib/dates';
import { useDb } from '../lib/store';
import type { Role } from '../types';
import { Alert, Badge, Button, Card, Field, useAction, useToast } from './ui';

export type Sent = { email: string; nome: string; link: string; enviado: boolean; erroEnvio?: string };

const STATUS_COLOR: Record<Invite['status'], string> = { Pendente: 'amber', Aceito: 'green', Expirado: 'red' };

export default function InvitesCard() {
  const db = useDb();
  const { busy, run } = useAction();
  const [email, setEmail] = useState('');
  const [nome, setNome] = useState('');
  const [role, setRole] = useState<Role>('colaborador');
  const [collaboratorId, setCollaboratorId] = useState('');
  const [invites, setInvites] = useState<Invite[]>();
  const [loadError, setLoadError] = useState('');
  const [sent, setSent] = useState<Sent>();
  const [criados, setCriados] = useState<{ email: string; nome: string }[]>();

  const collabs = [...db.all('collaborators')].sort((a, b) => a.nome.localeCompare(b.nome));
  const profiles = db.all('profiles');
  const withAccess = new Set(profiles.map((p) => p.email.toLowerCase()));
  const pendingEmails = new Set((invites ?? []).filter((i) => i.status !== 'Aceito').map((i) => i.email.toLowerCase()));
  const semAcesso = collabs.filter((c) => c.ativo !== false && c.email && isAllowedDomain(c.email) && !withAccess.has(c.email.toLowerCase()) && !pendingEmails.has(c.email.toLowerCase()));

  const load = useCallback(async () => {
    setLoadError('');
    try {
      setInvites(await listInvites());
      await db.refresh('profiles');
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : String(e));
    }
  }, [db]);
  useEffect(() => {
    load();
  }, [load]);

  const pickEmail = (v: string) => {
    setEmail(v);
    if (isEmailFormat(v) && isAllowedDomain(v)) setRole(roleForEmail(v));
  };
  const pickCollab = (id: string) => {
    setCollaboratorId(id);
    const c = collabs.find((x) => x.id === id);
    if (c) {
      setNome(c.nome);
      if (c.email) pickEmail(c.email);
      setRole('colaborador');
    }
  };

  const invite = (p: { email: string; nome: string; role: Role; collaboratorId?: string }) =>
    run(async () => {
      const r = await sendInvite(p);
      setSent({ email: p.email, nome: p.nome, ...r });
      setEmail('');
      setNome('');
      setCollaboratorId('');
      await load();
    }, 'Convite criado.');

  /** Cria os acessos já liberados com a senha padrão (a pessoa troca a senha no primeiro acesso). */
  const createAccess = (list: { email: string; nome: string; role: Role; collaboratorId?: string }[]) =>
    run(async () => {
      const ok: { email: string; nome: string }[] = [];
      const erros: string[] = [];
      for (const p of list) {
        try {
          await createUserWithDefault(p);
          ok.push({ email: p.email, nome: p.nome });
        } catch (err) {
          erros.push(`${p.email}: ${err instanceof Error ? err.message : String(err)}`);
        }
      }
      if (ok.length) setCriados(ok);
      setEmail('');
      setNome('');
      setCollaboratorId('');
      await load();
      if (erros.length) throw new Error(erros.join(' · '));
    }, list.length > 1 ? 'Acessos criados com a senha padrão.' : 'Acesso criado com a senha padrão.');

  const e = normalizeEmail(email);
  const emailOk = isEmailFormat(e) && isAllowedDomain(e);
  return (
    <Card
      title={
        <span className="inline-flex items-center gap-2">
          <UserPlus className="h-4 w-4" /> Convidar pessoas
        </span>
      }
      actions={
        <Button size="sm" variant="ghost" icon={<RefreshCw className="h-4 w-4" />} onClick={load}>
          Atualizar
        </Button>
      }
    >
      <div className="space-y-4">
        <p className="text-sm text-slate-600">
          Informe o e-mail corporativo da pessoa. Ela recebe um link para criar a senha e completar o cadastro (nome, matrícula e função) e já entra com o perfil escolhido. Se vincular a um colaborador
          existente, as atividades e férias dele já aparecem para ela.
        </p>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <Field label="Colaborador já cadastrado (opcional)">
            <select className="input" value={collaboratorId} onChange={(ev) => pickCollab(ev.target.value)}>
              <option value="">— nenhum / pessoa nova —</option>
              {collabs.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome}
                </option>
              ))}
            </select>
          </Field>
          <Field label="E-mail corporativo">
            <input className="input" type="email" value={email} onChange={(ev) => pickEmail(ev.target.value)} placeholder="nome@idg-eng.com" />
          </Field>
          <Field label="Nome (opcional)">
            <input className="input" value={nome} onChange={(ev) => setNome(ev.target.value)} />
          </Field>
          <Field label="Perfil">
            <select className="input" value={role} onChange={(ev) => setRole(ev.target.value as Role)}>
              {(Object.keys(ROLE_LABEL) as Role[]).map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABEL[r]}
                </option>
              ))}
            </select>
          </Field>
        </div>
        {email && isEmailFormat(e) && !isAllowedDomain(e) && <Alert kind="error">Domínio não autorizado. Use {ALLOWED_DOMAINS.map((d) => '@' + d).join(', ')}.</Alert>}
        <Button icon={<Send className="h-4 w-4" />} loading={busy} disabled={!emailOk} onClick={() => invite({ email: e, nome, role, collaboratorId: role === 'colaborador' ? collaboratorId || undefined : undefined })}>
          Enviar convite
        </Button>{' '}
        <Button
          variant="secondary"
          icon={<KeyRound className="h-4 w-4" />}
          loading={busy}
          disabled={!emailOk}
          onClick={() => createAccess([{ email: e, nome, role, collaboratorId: role === 'colaborador' ? collaboratorId || undefined : undefined }])}
        >
          Criar acesso com senha padrão
        </Button>
        <p className="text-xs text-slate-500">
          <b>Criar acesso com senha padrão</b> libera a pessoa na hora, sem depender de e-mail: ela entra com o e-mail corporativo e a senha padrão (definida em Usuários, abaixo) e é obrigada a criar a própria senha no
          primeiro acesso.
        </p>

        {sent && <InviteResult sent={sent} onClose={() => setSent(undefined)} />}
        {criados && <DefaultAccessResult criados={criados} onClose={() => setCriados(undefined)} />}

        <TeamMessage />

        {semAcesso.length > 0 && (
          <div className="rounded-lg border border-slate-200 p-3">
            <div className="mb-2 flex items-center justify-between gap-2 text-sm font-medium">
              <span>Colaboradores com e-mail cadastrado e ainda sem acesso ({semAcesso.length})</span>
              <Button
                size="sm"
                variant="secondary"
                disabled={busy}
                icon={<KeyRound className="h-3.5 w-3.5" />}
                onClick={() => {
                  if (window.confirm(`Criar acesso com a senha padrão para ${semAcesso.length} colaborador(es)?`))
                    createAccess(semAcesso.map((c) => ({ email: normalizeEmail(c.email!), nome: c.nome, role: 'colaborador' as Role, collaboratorId: c.id })));
                }}
              >
                Criar acesso para todos com senha padrão
              </Button>
            </div>
            <p className="mb-2 text-xs text-slate-500">Clique no nome para enviar convite por e-mail.</p>
            <div className="flex flex-wrap gap-2">
              {semAcesso.map((c) => (
                <Button key={c.id} size="sm" variant="secondary" disabled={busy} icon={<Send className="h-3.5 w-3.5" />} onClick={() => invite({ email: normalizeEmail(c.email!), nome: c.nome, role: 'colaborador', collaboratorId: c.id })}>
                  {c.nome}
                </Button>
              ))}
            </div>
          </div>
        )}

        {loadError && <Alert kind="error">Não foi possível carregar os convites: {loadError}</Alert>}
        <div className="overflow-x-auto rounded-lg border border-slate-200">
          <table className="w-full">
            <thead>
              <tr>
                <th className="th">Convidado</th>
                <th className="th">Perfil</th>
                <th className="th">Situação</th>
                <th className="th">Convidado em</th>
                <th className="th" />
              </tr>
            </thead>
            <tbody>
              {(invites ?? []).map((i) => (
                <tr key={i.id} className="hover:bg-slate-50">
                  <td className="td">
                    <div className="font-medium">{i.nome || '—'}</div>
                    <div className="text-xs text-slate-500">{i.email}</div>
                  </td>
                  <td className="td text-sm">{ROLE_LABEL[i.role]}</td>
                  <td className="td">
                    <Badge color={STATUS_COLOR[i.status]}>{i.status}</Badge>
                    <div className="text-[11px] text-slate-500">
                      {i.status === 'Aceito' && i.aceitoEm ? `em ${fmtDateTimeBR(i.aceitoEm)}` : i.status === 'Pendente' && i.expira ? `vale até ${fmtDateTimeBR(i.expira)}` : ''}
                    </div>
                  </td>
                  <td className="td text-xs">
                    {fmtDateTimeBR(i.em)}
                    <div className="text-slate-500">por {i.por}</div>
                  </td>
                  <td className="td whitespace-nowrap text-right">
                    {i.status !== 'Aceito' && (
                      <>
                        <Button size="sm" variant="ghost" disabled={busy} icon={<Send className="h-4 w-4" />} onClick={() => invite({ email: i.email, nome: i.nome, role: i.role, collaboratorId: i.collaboratorId ?? undefined })}>
                          Reenviar
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={busy}
                          icon={<X className="h-4 w-4" />}
                          onClick={() =>
                            run(async () => {
                              await cancelInvite(i.id);
                              await load();
                            }, 'Convite cancelado.')
                          }
                        >
                          Cancelar
                        </Button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
              {invites && !invites.length && (
                <tr>
                  <td className="td text-center text-sm text-slate-400" colSpan={5}>
                    Nenhum convite enviado ainda.
                  </td>
                </tr>
              )}
              {!invites && !loadError && (
                <tr>
                  <td className="td text-center text-sm text-slate-400" colSpan={5}>
                    Carregando…
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </Card>
  );
}

/** Resultado de um convite: link para copiar, abrir no e-mail ou WhatsApp. */
export function InviteResult({ sent, onClose }: { sent: Sent; onClose: () => void }) {
  const toast = useToast();
  const msg = `Olá${sent.nome ? ' ' + sent.nome.split(' ')[0] : ''}! Você foi convidado para o sistema de Gestão de Atividades e Férias do Contrato AMP. Acesse o link para criar sua senha e completar seu cadastro (vale por 7 dias): ${sent.link}`;
  const copy = async (t: string) => {
    await navigator.clipboard.writeText(t);
    toast('success', 'Copiado.');
  };
  return (
          <Alert kind={sent.enviado ? 'success' : 'warning'} title={sent.enviado ? `Convite enviado para ${sent.email}` : `Convite criado para ${sent.email}, mas o e-mail não saiu`}>
            {!sent.enviado && (
              <p className="mb-2">
                O envio automático falhou (confira a senha de app do Gmail cadastrada no Supabase). Por enquanto, mande o link abaixo pela sua conta de e-mail ou pelo WhatsApp.
              </p>
            )}
            <div className="mb-2 break-all rounded bg-white/70 px-2 py-1 font-mono text-[11px]">{sent.link}</div>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="secondary" icon={<Copy className="h-4 w-4" />} onClick={() => copy(sent.link)}>
                Copiar link
              </Button>
              <Button size="sm" variant="secondary" icon={<Copy className="h-4 w-4" />} onClick={() => copy(msg)}>
                Copiar mensagem
              </Button>
              <Button
                size="sm"
                variant="secondary"
                icon={<Mail className="h-4 w-4" />}
                onClick={() => (window.location.href = `mailto:${sent.email}?subject=${encodeURIComponent('Convite · Gestão de Atividades e Férias AMP')}&body=${encodeURIComponent(msg)}`)}
              >
                Abrir no e-mail
              </Button>
              <Button size="sm" variant="secondary" icon={<MessageCircle className="h-4 w-4" />} onClick={() => window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, '_blank', 'noopener')}>
                WhatsApp
              </Button>
              <Button size="sm" variant="ghost" icon={<X className="h-4 w-4" />} onClick={() => onClose()}>
                Fechar
              </Button>
            </div>
          </Alert>
  );
}

/** Acessos criados com a senha padrão: mensagem pronta para avisar as pessoas. */
function DefaultAccessResult({ criados, onClose }: { criados: { email: string; nome: string }[]; onClose: () => void }) {
  const toast = useToast();
  const [senha, setSenha] = useState('');
  useEffect(() => {
    getDefaultPassword().then(setSenha).catch(() => setSenha(''));
  }, []);
  const msg = (c?: { nome: string; email: string }) =>
    `Olá${c?.nome ? ' ' + c.nome.split(' ')[0] : ''}! Seu acesso ao sistema de Gestão de Atividades e Férias do Contrato AMP está liberado. Acesse ${window.location.origin} e entre com ${c ? `seu e-mail ${c.email}` : 'seu e-mail corporativo'} e a senha padrão ${senha || '(informada pelo coordenador)'}. No primeiro acesso o sistema pede para você criar sua própria senha.`;
  const copy = async (t: string) => {
    await navigator.clipboard.writeText(t);
    toast('success', 'Copiado.');
  };
  const one = criados.length === 1 ? criados[0] : undefined;
  return (
    <Alert kind="success" title={one ? `Acesso criado para ${one.email}` : `${criados.length} acessos criados`}>
      <p className="mb-2">Avise a pessoa: ela entra com o e-mail corporativo e a senha padrão, e cria a própria senha no primeiro acesso.</p>
      <div className="mb-2 rounded bg-white/70 px-2 py-1 text-xs">{msg(one)}</div>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="secondary" icon={<Copy className="h-4 w-4" />} onClick={() => copy(msg(one))}>
          Copiar mensagem
        </Button>
        <Button size="sm" variant="secondary" icon={<MessageCircle className="h-4 w-4" />} onClick={() => window.open(`https://wa.me/?text=${encodeURIComponent(msg(one))}`, '_blank', 'noopener')}>
          WhatsApp
        </Button>
        <Button size="sm" variant="ghost" icon={<X className="h-4 w-4" />} onClick={onClose}>
          Fechar
        </Button>
      </div>
    </Alert>
  );
}

/** Mensagem pronta para a equipe: link do site + como criar a conta com o e-mail corporativo. */
function TeamMessage() {
  const toast = useToast();
  const site = window.location.origin;
  const msg = `Olá! Já está no ar o sistema de Gestão de Atividades e Férias do Contrato AMP: ${site}

Para entrar pela primeira vez:
1. Abra o link e toque em "Criar conta".
2. Use o seu e-mail corporativo (@idg-eng.com ou @idg.global), o mesmo que está no seu cadastro.
3. Informe nome completo, matrícula e função e crie uma senha (mínimo 8 caracteres).
Pronto: suas atividades e férias já aparecem.

No celular dá para instalar como app: botão "Instalar app" na tela de entrada.
Esqueceu a senha? Fale comigo que eu redefino.`;
  const copy = async () => {
    await navigator.clipboard.writeText(msg);
    toast('success', 'Mensagem copiada.');
  };
  return (
    <div className="rounded-lg border border-slate-200 p-3">
      <div className="mb-1 text-sm font-medium">Mensagem pronta para a equipe (sem depender de e-mail)</div>
      <p className="mb-2 text-xs text-slate-500">
        Mande no grupo do WhatsApp. Cada pessoa cria a própria conta com o e-mail corporativo e já fica vinculada ao seu cadastro de colaborador, inclusive quem tem convite pendente.
      </p>
      <pre className="mb-2 max-h-40 overflow-auto whitespace-pre-wrap rounded bg-slate-50 px-2 py-1 text-[11px]">{msg}</pre>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="secondary" icon={<Copy className="h-4 w-4" />} onClick={copy}>
          Copiar mensagem
        </Button>
        <Button size="sm" variant="secondary" icon={<MessageCircle className="h-4 w-4" />} onClick={() => window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, '_blank', 'noopener')}>
          Enviar pelo WhatsApp
        </Button>
      </div>
    </div>
  );
}
