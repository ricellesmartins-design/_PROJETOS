// Camada de persistência: Supabase (PostgreSQL) com cache em memória para leitura síncrona
// pelas telas e atualização em tempo real (Realtime). Escritas são assíncronas e retornam a
// versão gravada no servidor (triggers podem ajustar status/auditoria).
import { supabase, errMsg } from './supabase';
import type { Activity, Collaborator, CostCenter, DateChangeLog, HrImport, Settings, VacationRequest } from '../types';

export interface Profile {
  id: string;
  email: string;
  nome: string;
  role: 'coordenador' | 'colaborador' | 'cliente';
  collaboratorId?: string;
  ativo: boolean;
  createdAt: string;
}

export interface Tables {
  profiles: Profile[];
  collaborators: Collaborator[];
  costCenters: CostCenter[];
  activities: Activity[];
  dateChangeLogs: DateChangeLog[];
  vacations: VacationRequest[];
  hrImports: HrImport[];
}

const SQL_TABLE: Record<keyof Tables, string> = {
  profiles: 'profiles',
  collaborators: 'collaborators',
  costCenters: 'cost_centers',
  activities: 'activities',
  dateChangeLogs: 'date_change_logs',
  vacations: 'vacations',
  hrImports: 'hr_imports',
};
const KEY: Record<keyof Tables, string> = {
  profiles: 'id',
  collaborators: 'id',
  costCenters: 'codigo',
  activities: 'id',
  dateChangeLogs: 'id',
  vacations: 'id',
  hrImports: 'id',
};

export const DEFAULT_SETTINGS: Settings = {
  secaoPadrao: 'Contrato AMP - ArcelorMittal Pecém',
  gestorNome: 'Ricelles Silveira Martins',
  horasDiaPadrao: 8,
  limiteDia: 8,
  limiteSemana: 44,
  feriadosExtras: [],
  lembretes: ['10:00', '16:00'],
  backupEmail: 'ricellesmartins@gmail.com',
};

// Conversão camelCase <-> snake_case (somente chaves de 1º nível; JSONB fica como está).
const SPECIAL: Record<string, string> = { chamado_rh: 'chamadoRH', status_chamado_rh: 'statusChamadoRH', documentos_amp: 'documentosAMP' };
const toSnake = (k: string) => k.replace(/([a-z0-9])([A-Z]+)/g, '$1_$2').toLowerCase();
const toCamel = (k: string) => SPECIAL[k] ?? k.replace(/_([a-z])/g, (_, c) => c.toUpperCase());

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function fromRow<T>(row: Record<string, any>): T {
  const o: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) {
    if (k === 'justificativa_alteracao') continue;
    o[toCamel(k)] = v === null ? undefined : typeof v === 'string' && /_(at|em)$/.test(k) === false ? v : v;
  }
  return o as T;
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function toRow(obj: Record<string, any>): Record<string, unknown> {
  const o: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) o[toSnake(k)] = v === undefined ? null : v;
  return o;
}

type Listener = () => void;

class SupabaseDB {
  private cache: Tables = { profiles: [], collaborators: [], costCenters: [], activities: [], dateChangeLogs: [], vacations: [], hrImports: [] };
  private settingsData: Settings = { ...DEFAULT_SETTINGS };
  private listeners = new Set<Listener>();
  private version = 0;
  private role?: Profile['role'];
  private myCollab?: string;
  private channel?: ReturnType<typeof supabase.channel>;
  private reloadTimers: Partial<Record<keyof Tables | 'settings', number>> = {};
  loaded = false;

  subscribe = (fn: Listener) => {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  };
  getVersion = () => this.version;
  private emit() {
    this.version++;
    this.listeners.forEach((l) => l());
  }

  all<K extends keyof Tables>(table: K): Tables[K] {
    return this.cache[table];
  }

  get settings(): Settings {
    return this.settingsData;
  }

  private async fetchTable<K extends keyof Tables>(table: K) {
    const all: Record<string, unknown>[] = [];
    // Paginação (PostgREST retorna no máx. 1000 linhas por requisição).
    for (let from = 0; ; from += 1000) {
      const { data, error } = await supabase.from(SQL_TABLE[table]).select('*').range(from, from + 999);
      if (error) throw new Error(`${SQL_TABLE[table]}: ${errMsg(error)}`);
      all.push(...(data ?? []));
      if (!data || data.length < 1000) break;
    }
    let rows = all.map((r) => fromRow<Tables[K][number]>(r)) as Tables[K];
    if (table === 'vacations' && this.role === 'colaborador') {
      // Colaborador vê as próprias solicitações completas + ausências da equipe (sem pareceres).
      const { data: team, error } = await supabase.rpc('team_absences');
      if (error) throw new Error(errMsg(error));
      const own = new Set((rows as VacationRequest[]).map((v) => v.id));
      const others = (team ?? [])
        .filter((t: { id: string }) => !own.has(t.id))
        .map(
          (t: { id: string; collaborator_id: string; status: VacationRequest['status']; modalidade: VacationRequest['modalidade']; periodos: VacationRequest['periodos'] }) =>
            ({
              id: t.id,
              collaboratorId: t.collaborator_id,
              status: t.status,
              modalidade: t.modalidade,
              periodos: t.periodos,
              dataSolicitacao: '',
              secao: '',
              chamadoRH: '',
              statusChamadoRH: 'Não aberto',
              observacao: '',
              revisao: 1,
              historico: [],
            }) as VacationRequest,
        );
      rows = [...(rows as VacationRequest[]), ...others] as Tables[K];
    }
    if (table === 'activities') (rows as Activity[]).sort((a, b) => (b.estInicio ?? b.inicioReal ?? '').localeCompare(a.estInicio ?? a.inicioReal ?? ''));
    if (table === 'dateChangeLogs') (rows as DateChangeLog[]).sort((a, b) => b.dataHora.localeCompare(a.dataHora));
    if (table === 'collaborators') (rows as Collaborator[]).sort((a, b) => a.nome.localeCompare(b.nome));
    if (table === 'costCenters') (rows as CostCenter[]).sort((a, b) => a.codigo.localeCompare(b.codigo));
    this.cache[table] = rows;
  }

  private async fetchSettings() {
    const { data, error } = await supabase.from('app_settings').select('data').eq('id', 1).maybeSingle();
    if (error) throw new Error(errMsg(error));
    this.settingsData = { ...DEFAULT_SETTINGS, ...((data?.data as Partial<Settings>) ?? {}) };
  }

  async load(profile: Profile) {
    this.role = profile.role;
    this.myCollab = profile.collaboratorId;
    const tables: (keyof Tables)[] = ['profiles', 'collaborators', 'costCenters', 'activities', 'dateChangeLogs'];
    if (profile.role !== 'cliente') tables.push('vacations');
    if (profile.role === 'coordenador') tables.push('hrImports');
    await Promise.all([...tables.map((t) => this.fetchTable(t)), this.fetchSettings()]);
    this.loaded = true;
    this.listenRealtime();
    this.emit();
  }

  private listenRealtime() {
    this.channel?.unsubscribe();
    const map: Record<string, keyof Tables | 'settings'> = {
      activities: 'activities',
      vacations: 'vacations',
      date_change_logs: 'dateChangeLogs',
      collaborators: 'collaborators',
      cost_centers: 'costCenters',
      app_settings: 'settings',
    };
    let ch = supabase.channel('amp-db');
    for (const sqlTable of Object.keys(map)) {
      ch = ch.on('postgres_changes', { event: '*', schema: 'public', table: sqlTable }, () => this.scheduleReload(map[sqlTable]));
    }
    this.channel = ch.subscribe();
  }

  private scheduleReload(t: keyof Tables | 'settings') {
    if (t === 'vacations' && this.role === 'cliente') return;
    window.clearTimeout(this.reloadTimers[t]);
    this.reloadTimers[t] = window.setTimeout(async () => {
      try {
        if (t === 'settings') await this.fetchSettings();
        else await this.fetchTable(t);
        this.emit();
      } catch {
        /* ignora falhas transitórias de rede */
      }
    }, 400);
  }

  async refresh(t: keyof Tables) {
    await this.fetchTable(t);
    this.emit();
  }

  clear() {
    this.channel?.unsubscribe();
    this.cache = { profiles: [], collaborators: [], costCenters: [], activities: [], dateChangeLogs: [], vacations: [], hrImports: [] };
    this.loaded = false;
    this.emit();
  }

  private replaceInCache<K extends keyof Tables>(table: K, row: Tables[K][number]) {
    const key = KEY[table] as keyof typeof row;
    const list = this.cache[table] as Tables[K][number][];
    const i = list.findIndex((r) => r[key] === row[key]);
    this.cache[table] = (i >= 0 ? list.map((r, j) => (j === i ? row : r)) : [...list, row]) as Tables[K];
  }

  async insert<K extends keyof Tables>(table: K, row: Tables[K][number], extra: Record<string, unknown> = {}): Promise<Tables[K][number]> {
    const { data, error } = await supabase
      .from(SQL_TABLE[table])
      .insert({ ...toRow(row as unknown as Record<string, unknown>), ...extra })
      .select()
      .single();
    if (error) throw new Error(errMsg(error));
    const saved = fromRow<Tables[K][number]>(data);
    this.replaceInCache(table, saved);
    this.emit();
    return saved;
  }

  async insertMany<K extends keyof Tables>(table: K, rows: Tables[K][number][], opts: { upsert?: boolean } = {}) {
    if (!rows.length) return;
    for (let i = 0; i < rows.length; i += 500) {
      const chunk = rows.slice(i, i + 500).map((r) => toRow(r as unknown as Record<string, unknown>));
      const q = opts.upsert ? supabase.from(SQL_TABLE[table]).upsert(chunk, { onConflict: KEY[table] }) : supabase.from(SQL_TABLE[table]).insert(chunk);
      const { error } = await q;
      if (error) throw new Error(errMsg(error));
    }
    await this.fetchTable(table);
    this.emit();
  }

  async update<K extends keyof Tables>(table: K, row: Tables[K][number], extra: Record<string, unknown> = {}): Promise<Tables[K][number]> {
    const key: string = KEY[table];
    const payload = { ...toRow(row as unknown as Record<string, unknown>), ...extra };
    const { data, error } = await supabase
      .from(SQL_TABLE[table])
      .update(payload)
      .eq(key, (row as unknown as Record<string, unknown>)[toCamel(key)] as string)
      .select()
      .single();
    if (error) throw new Error(errMsg(error));
    const saved = fromRow<Tables[K][number]>(data);
    this.replaceInCache(table, saved);
    if (table === 'activities') await this.fetchTable('dateChangeLogs'); // trigger de auditoria pode ter gravado logs
    this.emit();
    return saved;
  }

  async remove<K extends keyof Tables>(table: K, value: string) {
    const key: string = KEY[table];
    const { error } = await supabase.from(SQL_TABLE[table]).delete().eq(key, value);
    if (error) throw new Error(errMsg(error));
    const k = toCamel(key);
    this.cache[table] = (this.cache[table] as unknown as Record<string, unknown>[]).filter((r) => r[k] !== value) as unknown as Tables[K];
    this.emit();
  }

  async saveSettings(s: Settings) {
    const { error } = await supabase.from('app_settings').update({ data: s }).eq('id', 1);
    if (error) throw new Error(errMsg(error));
    this.settingsData = s;
    this.emit();
  }

  get myCollaboratorId() {
    return this.myCollab;
  }
}

export const db = new SupabaseDB();
