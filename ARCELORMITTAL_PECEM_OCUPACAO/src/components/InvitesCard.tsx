// Convites: o coordenador envia um link de cadastro por e-mail e acompanha pendentes/aceitos.
import { useCallback, useEffect, useState } from 'react';
import { Copy, Mail, MessageCircle, RefreshCw, Send, UserPlus, X } from 'lucide-react';
import { cancelInvite, isAllowedDomain, isEmailFormat, listInvites, normalizeEmail, ROLE_LABEL, roleForEmail, sendInvite, ALLOWED_DOMAINS, type Invite } from '../lib/auth';
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
        </Button>

        {sent && <InviteResult sent={sent} onClose={() => setSent(undefined)} />}

        {semAcesso.length > 0 && (
          <div className="rounded-lg border border-slate-200 p-3">
            <div className="mb-2 flex items-center justify-between gap-2 text-sm font-medium">
              <span>Colaboradores com e-mail cadastrado e ainda sem acesso ({semAcesso.length})</span>
            </div>
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
                O envio automático só chega a outros endereços depois que um domínio for verificado no Resend. Por enquanto, mande o link abaixo pela sua conta de e-mail ou pelo WhatsApp.
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
