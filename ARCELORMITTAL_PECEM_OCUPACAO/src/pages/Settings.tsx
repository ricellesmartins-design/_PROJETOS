import { useState } from 'react';
import { Bell, Database, Image as ImageIcon, KeyRound, Mail, Plus, RotateCcw, Save, Trash2, Users } from 'lucide-react';
import { useDb, useSession } from '../lib/store';
import { invokeFunction } from '../lib/supabase';
import { adminResetPassword, ROLE_LABEL } from '../lib/auth';
import { type Profile } from '../lib/db';
import { uid } from '../lib/id';
import { fmtBR, fmtDateTimeBR, holidaysOf, todayISO } from '../lib/dates';
import { download } from '../excel/common';
import type { Collaborator, CostCenter, Holiday, Role, Settings as SettingsT } from '../types';
import defaultLogo from '../templates/logo-idg-default.png';
import defaultSeals from '../templates/selos-iso-default.png';
import { Alert, Badge, Button, Card, Field, Modal, useAction } from '../components/ui';

/** Lê uma imagem e reduz para no máximo 900 px (PNG), para caber nas configurações. */
async function readImage(file: File): Promise<string> {
  const url = await new Promise<string>((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result));
    r.onerror = () => rej(new Error('Não foi possível ler a imagem.'));
    r.readAsDataURL(file);
  });
  const img = await new Promise<HTMLImageElement>((res, rej) => {
    const i = new Image();
    i.onload = () => res(i);
    i.onerror = () => rej(new Error('Arquivo de imagem inválido.'));
    i.src = url;
  });
  const scale = Math.min(1, 900 / Math.max(img.width, img.height));
  const c = document.createElement('canvas');
  c.width = Math.round(img.width * scale);
  c.height = Math.round(img.height * scale);
  c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
  return c.toDataURL('image/png');
}

function ImageSetting({ label, hint, value, fallback, onChange }: { label: string; hint: string; value?: string; fallback: string; onChange: (v?: string) => void }) {
  const { run } = useAction();
  return (
    <div className="space-y-2">
      <div className="label">{label}</div>
      <div className="flex h-24 items-center justify-center rounded-lg border border-dashed border-slate-300 bg-slate-50 p-2">
        <img src={value || fallback} alt={label} className="max-h-20 max-w-full object-contain" />
      </div>
      <div className="flex flex-wrap gap-2">
        <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium hover:bg-slate-50">
          <ImageIcon className="h-4 w-4" /> Carregar imagem
          <input
            type="file"
            accept="image/png,image/jpeg,image/svg+xml,image/webp"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) run(async () => onChange(await readImage(f)));
              e.target.value = '';
            }}
          />
        </label>
        {value && (
          <Button size="sm" variant="ghost" icon={<RotateCcw className="h-4 w-4" />} onClick={() => onChange(undefined)}>
            Restaurar padrão
          </Button>
        )}
      </div>
      <p className="text-xs text-slate-500">{hint}</p>
    </div>
  );
}

export default function Settings() {
  const db = useDb();
  const { user } = useSession();
  const { busy, run } = useAction();
  const [s, setS] = useState<SettingsT>(() => structuredClone(db.settings));
  const [newHol, setNewHol] = useState<Holiday>({ data: '', nome: '' });
  const [newTime, setNewTime] = useState('');
  const dirty = JSON.stringify(s) !== JSON.stringify(db.settings);
  const set = <K extends keyof SettingsT>(k: K, v: SettingsT[K]) => setS((o) => ({ ...o, [k]: v }));
  const year = Number(todayISO().slice(0, 4));

  const save = () => run(() => db.saveSettings({ ...s, lembretes: [...s.lembretes].sort() }), 'Configurações salvas.');

  const downloadBackup = () => {
    const dump = {
      geradoEm: new Date().toISOString(),
      settings: db.settings,
      collaborators: db.all('collaborators'),
      costCenters: db.all('costCenters'),
      activities: db.all('activities'),
      dateChangeLogs: db.all('dateChangeLogs'),
      vacations: db.all('vacations'),
      hrImports: db.all('hrImports'),
      profiles: db.all('profiles'),
    };
    download(new Blob([JSON.stringify(dump, null, 2)], { type: 'application/json' }), `backup_amp_${new Date().toISOString().slice(0, 10)}.json`);
  };

  return (
    <div className="space-y-5">
      <div className="sticky top-0 z-20 -mx-1 flex items-center justify-between rounded-lg bg-white/90 px-1 py-2 backdrop-blur">
        <p className="text-sm text-slate-500">As alterações desta página valem para todos os usuários após salvar.</p>
        <Button icon={<Save className="h-4 w-4" />} loading={busy} disabled={!dirty} onClick={save}>
          {dirty ? 'Salvar alterações' : 'Salvo'}
        </Button>
      </div>

      <Card title="Identidade visual das exportações">
        <div className="grid gap-5 md:grid-cols-2">
          <ImageSetting
            label="Logo IDG"
            hint="Carregue uma vez: o logo é inserido em todas as exportações (SE-PL-0510 em N1:O3 e formulário ADM-PF158) e no menu."
            value={s.logoDataUrl}
            fallback={defaultLogo}
            onChange={(v) => set('logoDataUrl', v)}
          />
          <ImageSetting label="Selos de certificação (ADM-PF158)" hint="Imagem do canto superior direito do formulário de férias." value={s.selosDataUrl} fallback={defaultSeals} onChange={(v) => set('selosDataUrl', v)} />
        </div>
      </Card>

      <Card title="Parâmetros gerais">
        <div className="grid gap-3 md:grid-cols-3">
          <Field label="Seção (formulário de férias)">
            <input className="input" value={s.secaoPadrao} onChange={(e) => set('secaoPadrao', e.target.value)} />
          </Field>
          <Field label="Gestor / coordenador (aprovação)">
            <input className="input" value={s.gestorNome} onChange={(e) => set('gestorNome', e.target.value)} />
          </Field>
          <Field label="Horas/dia padrão de uma atividade">
            <input type="number" min={1} max={24} step={0.5} className="input" value={s.horasDiaPadrao} onChange={(e) => set('horasDiaPadrao', Number(e.target.value))} />
          </Field>
          <Field label="Limite de sobrecarga diária (h)">
            <input type="number" min={1} className="input" value={s.limiteDia} onChange={(e) => set('limiteDia', Number(e.target.value))} />
          </Field>
          <Field label="Limite de sobrecarga semanal (h)">
            <input type="number" min={1} className="input" value={s.limiteSemana} onChange={(e) => set('limiteSemana', Number(e.target.value))} />
          </Field>
        </div>
      </Card>

      <Card title={<span className="inline-flex items-center gap-2"><Bell className="h-4 w-4" /> Lembretes diários no Windows</span>}>
        <p className="mb-3 text-sm text-slate-600">
          Nos dias úteis, cada colaborador com serviços em aberto recebe uma notificação do Windows nestes horários (horário de Brasília) para atualizar horas, datas e status. O colaborador ativa em <b>Minha conta e lembretes</b>.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          {s.lembretes.map((t) => (
            <span key={t} className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-3 py-1 text-sm font-medium text-blue-800 ring-1 ring-blue-200">
              {t}
              <button aria-label={`Remover ${t}`} onClick={() => set('lembretes', s.lembretes.filter((x) => x !== t))}>
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </span>
          ))}
          <input type="time" step={1800} className="input w-32" value={newTime} onChange={(e) => setNewTime(e.target.value)} />
          <Button
            size="sm"
            variant="secondary"
            icon={<Plus className="h-4 w-4" />}
            disabled={!newTime || s.lembretes.includes(newTime)}
            onClick={() => {
              set('lembretes', [...s.lembretes, newTime].sort());
              setNewTime('');
            }}
          >
            Adicionar
          </Button>
        </div>
        <p className="mt-2 text-xs text-slate-500">O servidor verifica a cada 30 minutos; use horários cheios ou meia hora (ex.: 10:00, 16:30).</p>
      </Card>

      <Card title={<span className="inline-flex items-center gap-2"><Database className="h-4 w-4" /> Backup</span>}>
        <div className="grid gap-3 md:grid-cols-[1fr_auto_auto] md:items-end">
          <Field label="E-mail que recebe o backup diário (06:00)" hint="JSON completo + CSV de atividades e férias.">
            <input type="email" className="input" value={s.backupEmail} onChange={(e) => set('backupEmail', e.target.value)} />
          </Field>
          <Button
            variant="secondary"
            icon={<Mail className="h-4 w-4" />}
            loading={busy}
            disabled={dirty}
            title={dirty ? 'Salve as configurações antes' : undefined}
            onClick={() => run(() => invokeFunction('backup', {}), `Backup enviado para ${db.settings.backupEmail}.`)}
          >
            Enviar backup agora
          </Button>
          <Button variant="secondary" icon={<Database className="h-4 w-4" />} onClick={downloadBackup}>
            Baixar backup (JSON)
          </Button>
        </div>
      </Card>

      <Card title="Feriados">
        <p className="mb-2 text-sm text-slate-600">Feriados nacionais e do Ceará já são calculados automaticamente. Inclua aqui feriados municipais (Caucaia / São Gonçalo do Amarante) ou pontos facultativos.</p>
        <div className="mb-3 flex flex-wrap gap-2">
          <input type="date" className="input w-44" value={newHol.data} onChange={(e) => setNewHol({ ...newHol, data: e.target.value })} />
          <input className="input w-64" placeholder="Nome do feriado" value={newHol.nome} onChange={(e) => setNewHol({ ...newHol, nome: e.target.value })} />
          <Button
            size="sm"
            variant="secondary"
            icon={<Plus className="h-4 w-4" />}
            disabled={!newHol.data || !newHol.nome.trim()}
            onClick={() => {
              set('feriadosExtras', [...s.feriadosExtras.filter((h) => h.data !== newHol.data), { data: newHol.data, nome: newHol.nome.trim() }].sort((a, b) => a.data.localeCompare(b.data)));
              setNewHol({ data: '', nome: '' });
            }}
          >
            Incluir
          </Button>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <div className="label">Feriados extras</div>
            {!s.feriadosExtras.length && <div className="text-sm text-slate-400">Nenhum.</div>}
            <ul className="text-sm">
              {s.feriadosExtras.map((h) => (
                <li key={h.data} className="flex items-center justify-between border-b py-1">
                  <span>
                    {fmtBR(h.data)} · {h.nome}
                  </span>
                  <button className="text-red-600" onClick={() => set('feriadosExtras', s.feriadosExtras.filter((x) => x.data !== h.data))} aria-label="Remover">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <div className="label">Automáticos {year} e {year + 1}</div>
            <ul className="max-h-48 overflow-y-auto text-xs text-slate-600">
              {[...holidaysOf(year), ...holidaysOf(year + 1)].map((h) => (
                <li key={h.data}>
                  {fmtBR(h.data)} · {h.nome}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </Card>

      <CollaboratorsCard />
      <CostCentersCard />
      <UsersCard currentUserId={user.id} />
    </div>
  );
}

function CollaboratorsCard() {
  const db = useDb();
  const { busy, run } = useAction();
  const [edit, setEdit] = useState<Collaborator & { novo?: boolean }>();
  const list = db.all('collaborators');
  return (
    <Card
      title="Colaboradores"
      bodyClass="p-0"
      actions={
        <Button size="sm" icon={<Plus className="h-4 w-4" />} onClick={() => setEdit({ id: uid('c_'), nome: '', matricula: '', funcao: '', email: '', ativo: true, novo: true })}>
          Novo colaborador
        </Button>
      }
    >
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr>
              <th className="th">Nome</th>
              <th className="th">Matrícula</th>
              <th className="th">Função</th>
              <th className="th">E-mail (vínculo do login)</th>
              <th className="th">Situação</th>
              <th className="th" />
            </tr>
          </thead>
          <tbody>
            {list.map((c) => (
              <tr key={c.id} className="hover:bg-slate-50">
                <td className="td font-medium">{c.nome}</td>
                <td className="td">{c.matricula}</td>
                <td className="td">{c.funcao}</td>
                <td className="td text-xs">{c.email || <span className="text-slate-400">—</span>}</td>
                <td className="td">{c.ativo ? <Badge color="green">Ativo</Badge> : <Badge>Inativo</Badge>}</td>
                <td className="td text-right">
                  <Button size="sm" variant="ghost" onClick={() => setEdit({ ...c })}>
                    Editar
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {edit && (
        <Modal
          open
          size="md"
          onClose={() => setEdit(undefined)}
          title={edit.novo ? 'Novo colaborador' : 'Editar colaborador'}
          footer={
            <Button
              loading={busy}
              disabled={!edit.nome.trim()}
              onClick={() =>
                run(async () => {
                  const { novo, ...c } = edit;
                  const row: Collaborator = { ...c, nome: c.nome.trim().toUpperCase(), funcao: c.funcao.trim().toUpperCase(), matricula: c.matricula.trim(), email: c.email?.trim().toLowerCase() || undefined };
                  if (novo) await db.insert('collaborators', row);
                  else await db.update('collaborators', row);
                  setEdit(undefined);
                }, 'Colaborador salvo.')
              }
            >
              Salvar
            </Button>
          }
        >
          <div className="grid gap-3">
            <Field label="Nome completo">
              <input className="input" value={edit.nome} onChange={(e) => setEdit({ ...edit, nome: e.target.value })} />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Matrícula">
                <input className="input" value={edit.matricula} onChange={(e) => setEdit({ ...edit, matricula: e.target.value })} />
              </Field>
              <Field label="Função">
                <input className="input" value={edit.funcao} onChange={(e) => setEdit({ ...edit, funcao: e.target.value })} />
              </Field>
            </div>
            <Field label="E-mail corporativo" hint="Quando o colaborador se cadastrar com este e-mail, o login é vinculado automaticamente a este cadastro.">
              <input type="email" className="input" value={edit.email ?? ''} onChange={(e) => setEdit({ ...edit, email: e.target.value })} />
            </Field>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={edit.ativo} onChange={(e) => setEdit({ ...edit, ativo: e.target.checked })} /> Ativo
            </label>
          </div>
        </Modal>
      )}
    </Card>
  );
}

function CostCentersCard() {
  const db = useDb();
  const { busy, run } = useAction();
  const [q, setQ] = useState('');
  const [edit, setEdit] = useState<CostCenter & { novo?: boolean }>();
  const list = db.all('costCenters').filter((c) => !q || `${c.codigo} ${c.denominacao} ${c.responsavel}`.toLowerCase().includes(q.toLowerCase()));
  return (
    <Card
      title={`Centros de custo (${db.all('costCenters').length})`}
      bodyClass="p-0"
      actions={
        <>
          <input className="input w-56" placeholder="Buscar…" value={q} onChange={(e) => setQ(e.target.value)} />
          <Button size="sm" icon={<Plus className="h-4 w-4" />} onClick={() => setEdit({ codigo: '', denominacao: '', responsavel: '', novo: true })}>
            Novo
          </Button>
        </>
      }
    >
      <div className="max-h-96 overflow-auto">
        <table className="w-full">
          <thead className="sticky top-0">
            <tr>
              <th className="th">Código</th>
              <th className="th">Denominação</th>
              <th className="th">Responsável</th>
              <th className="th" />
            </tr>
          </thead>
          <tbody>
            {list.map((c) => (
              <tr key={c.codigo} className="hover:bg-slate-50">
                <td className="td font-mono text-xs">{c.codigo}</td>
                <td className="td text-xs">{c.denominacao}</td>
                <td className="td text-xs">{c.responsavel}</td>
                <td className="td whitespace-nowrap text-right">
                  <Button size="sm" variant="ghost" onClick={() => setEdit({ ...c })}>
                    Editar
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    icon={<Trash2 className="h-4 w-4 text-red-600" />}
                    onClick={() => {
                      if (window.confirm(`Excluir o centro de custo ${c.codigo}?`)) run(() => db.remove('costCenters', c.codigo), 'Centro de custo excluído.');
                    }}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {edit && (
        <Modal
          open
          size="md"
          onClose={() => setEdit(undefined)}
          title={edit.novo ? 'Novo centro de custo' : `Centro de custo ${edit.codigo}`}
          footer={
            <Button
              loading={busy}
              disabled={!edit.codigo.trim()}
              onClick={() =>
                run(async () => {
                  const { novo, ...c } = edit;
                  const row = { ...c, codigo: c.codigo.trim().toUpperCase() };
                  if (novo && db.all('costCenters').some((x) => x.codigo === row.codigo)) throw new Error('Código já cadastrado.');
                  if (novo) await db.insert('costCenters', row);
                  else await db.update('costCenters', row);
                  setEdit(undefined);
                }, 'Centro de custo salvo.')
              }
            >
              Salvar
            </Button>
          }
        >
          <div className="grid gap-3">
            <Field label="Código">
              <input className="input font-mono" disabled={!edit.novo} value={edit.codigo} onChange={(e) => setEdit({ ...edit, codigo: e.target.value })} />
            </Field>
            <Field label="Denominação">
              <input className="input" value={edit.denominacao} onChange={(e) => setEdit({ ...edit, denominacao: e.target.value })} />
            </Field>
            <Field label="Responsável">
              <input className="input" value={edit.responsavel} onChange={(e) => setEdit({ ...edit, responsavel: e.target.value })} />
            </Field>
          </div>
        </Modal>
      )}
    </Card>
  );
}

function UsersCard({ currentUserId }: { currentUserId: string }) {
  const db = useDb();
  const { busy, run } = useAction();
  const [reset, setReset] = useState<Profile>();
  const [pwd, setPwd] = useState('');
  const profiles = [...db.all('profiles')].sort((a, b) => a.nome.localeCompare(b.nome));
  const collabs = db.all('collaborators');
  const pending = profiles.filter((p) => p.role === 'colaborador' && !p.collaboratorId);
  const upd = (p: Profile, patch: Partial<Profile>) => run(() => db.update('profiles', { ...p, ...patch }), 'Usuário atualizado.');
  return (
    <Card title={<span className="inline-flex items-center gap-2"><Users className="h-4 w-4" /> Usuários e perfis de acesso</span>} bodyClass="p-0">
      {pending.length > 0 && (
        <div className="p-4 pb-0">
          <Alert kind="warning" title="Vínculo pendente">
            {pending.map((p) => p.nome).join(', ')} se cadastrou, mas não foi vinculado automaticamente a um colaborador (nome ou matrícula igual a um cadastro existente sem o mesmo e-mail). Confira e selecione o colaborador abaixo.
          </Alert>
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr>
              <th className="th">Usuário</th>
              <th className="th">Perfil</th>
              <th className="th">Colaborador vinculado</th>
              <th className="th">Cadastro</th>
              <th className="th">Acesso</th>
              <th className="th" />
            </tr>
          </thead>
          <tbody>
            {profiles.map((p) => {
              const self = p.id === currentUserId;
              return (
                <tr key={p.id} className="hover:bg-slate-50">
                  <td className="td">
                    <div className="font-medium">{p.nome}</div>
                    <div className="text-xs text-slate-500">{p.email}</div>
                  </td>
                  <td className="td">
                    <select className="input" disabled={self || busy} value={p.role} onChange={(e) => upd(p, { role: e.target.value as Role })}>
                      {(Object.keys(ROLE_LABEL) as Role[]).map((r) => (
                        <option key={r} value={r}>
                          {ROLE_LABEL[r]}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="td">
                    {p.role === 'colaborador' ? (
                      <select className="input" disabled={busy} value={p.collaboratorId ?? ''} onChange={(e) => upd(p, { collaboratorId: e.target.value || undefined })}>
                        <option value="">— sem vínculo —</option>
                        {collabs.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.nome}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <span className="text-xs text-slate-400">não se aplica</span>
                    )}
                  </td>
                  <td className="td text-xs">{fmtDateTimeBR(p.createdAt)}</td>
                  <td className="td">
                    <label className="flex items-center gap-1 text-sm">
                      <input type="checkbox" disabled={self || busy} checked={p.ativo} onChange={(e) => upd(p, { ativo: e.target.checked })} />
                      {p.ativo ? 'Liberado' : 'Bloqueado'}
                    </label>
                  </td>
                  <td className="td text-right">
                    <Button
                      size="sm"
                      variant="ghost"
                      icon={<KeyRound className="h-4 w-4" />}
                      onClick={() => {
                        setPwd('');
                        setReset(p);
                      }}
                    >
                      Senha
                    </Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {reset && (
        <Modal
          open
          size="md"
          onClose={() => setReset(undefined)}
          title={`Redefinir senha · ${reset.nome}`}
          footer={
            <Button
              loading={busy}
              disabled={pwd.length < 8}
              onClick={() =>
                run(async () => {
                  await adminResetPassword(reset.id, pwd);
                  setReset(undefined);
                }, 'Senha redefinida. Informe a nova senha ao usuário.')
              }
            >
              Redefinir
            </Button>
          }
        >
          <Field label="Nova senha (mín. 8 caracteres)" hint="Informe ao usuário e peça para trocar em Minha conta.">
            <input className="input" value={pwd} onChange={(e) => setPwd(e.target.value)} />
          </Field>
        </Modal>
      )}
    </Card>
  );
}
