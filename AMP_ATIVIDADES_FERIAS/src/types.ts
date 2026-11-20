// Modelo de dados da aplicação. Cada interface corresponde a uma "tabela" do
// repositório local (ver lib/db.ts) e a uma tabela do schema relacional em docs/schema.sql.

export type Role = 'coordenador' | 'colaborador' | 'cliente';

export type { Profile as User } from './lib/db';

export interface Collaborator {
  id: string;
  nome: string;
  matricula: string;
  funcao: string;
  email?: string;
  ativo: boolean;
}

export interface CostCenter {
  codigo: string;
  denominacao: string;
  responsavel: string;
}

export const ACTIVITY_STATUSES = [
  'Não Iniciado',
  'Em andamento',
  'Aguardando Cliente',
  'Finalizado',
  'Cancelado',
] as const;
export type ActivityStatus = (typeof ACTIVITY_STATUSES)[number];

export const PLANT_AREAS = [
  'Alto Forno',
  'Aciaria',
  'Coqueria',
  'Sinterização',
  'Oficina Central',
  'Lingotamento Contínuo',
  'Power Plant',
  'Gasômetro',
  'RAP 2',
  'Utilidades',
  'Pátio de Matérias-Primas',
  'Porto / Correias',
] as const;

export type HoursMode = 'auto' | 'manual';

export interface Activity {
  id: string;
  codigo: string; // ID AMP (ex.: T2IDEA0017524)
  collaboratorId: string;
  descricao: string;
  solicitante: string;
  area: string;
  dataSolicitacao?: string; // YYYY-MM-DD
  estInicio?: string;
  estTermino?: string;
  estModo: HoursMode;
  horasDia?: number; // usado quando estModo = auto (dias úteis × horas/dia)
  estHoras?: number;
  inicioReal?: string;
  terminoReal?: string;
  realModo: HoursMode;
  horasDiaReal?: number;
  horasRealizadas?: number;
  documentosAMP: string; // um código por linha
  centroCusto: string;
  status: ActivityStatus;
  observacao: string;
  createdAt: string;
  createdBy: string;
  updatedAt: string;
  updatedBy: string;
}

export const DATE_FIELDS = ['estInicio', 'estTermino', 'inicioReal', 'terminoReal'] as const;
export type DateField = (typeof DATE_FIELDS)[number];
export const DATE_FIELD_LABEL: Record<DateField, string> = {
  estInicio: 'Estimativa de Início',
  estTermino: 'Estimativa de Término',
  inicioReal: 'Início Real',
  terminoReal: 'Término Real',
};

export interface DateChangeLog {
  id: string;
  activityId: string;
  activityCodigo: string;
  collaboratorId: string;
  campo: DateField;
  anterior?: string;
  nova?: string;
  justificativa: string;
  usuarioEmail: string;
  usuarioNome: string;
  dataHora: string; // ISO
}

export type VacationModality = '30' | '15+15' | '10+20' | '20+10' | '19+11' | '20+10abono';

export const MODALITY_LABEL: Record<VacationModality, string> = {
  '30': '30 dias corridos',
  '15+15': 'Dois períodos de 15 dias (15+15)',
  '10+20': 'Dois períodos 10 + 20 dias',
  '20+10': 'Dois períodos 20 + 10 dias',
  '19+11': 'Dois períodos 19 + 11 dias',
  '20+10abono': '20 dias de descanso + 10 dias de abono pecuniário (venda)',
};

export const MODALITY_DAYS: Record<VacationModality, number[]> = {
  '30': [30],
  '15+15': [15, 15],
  '10+20': [10, 20],
  '20+10': [20, 10],
  '19+11': [19, 11],
  '20+10abono': [20],
};

export interface VacationPeriod {
  inicio: string;
  fim: string;
  dias: number;
}

export type VacationStatus = 'Pendente' | 'Ajuste Solicitado' | 'Aprovada' | 'Reprovada' | 'Cancelamento Solicitado' | 'Cancelada';
export type HrTicketStatus = 'Não aberto' | 'Aberto' | 'Em análise' | 'Concluído';

export interface VacationEvent {
  dataHora: string;
  usuario: string;
  acao: string;
  texto?: string;
}

export interface VacationRequest {
  id: string;
  collaboratorId: string;
  modalidade: VacationModality;
  periodos: VacationPeriod[];
  dataSolicitacao: string;
  secao: string;
  chamadoRH: string;
  statusChamadoRH: HrTicketStatus;
  status: VacationStatus;
  observacao: string;
  parecer?: string;
  aprovadoPor?: string;
  aprovadoEm?: string;
  conflitoJustificado?: string;
  /** Versão anterior aprovada, guardada quando o colaborador altera férias já aprovadas. */
  versaoAnteriorAprovada?: { modalidade: VacationModality; periodos: VacationPeriod[]; aprovadoEm?: string };
  revisao: number;
  historico: VacationEvent[];
}

export interface Holiday {
  data: string;
  nome: string;
}

export interface Settings {
  logoDataUrl?: string;
  selosDataUrl?: string;
  secaoPadrao: string;
  gestorNome: string;
  horasDiaPadrao: number;
  limiteDia: number;
  limiteSemana: number;
  feriadosExtras: Holiday[];
  lembretes: string[];
  backupEmail: string;
}

export interface HrImport {
  id: string;
  arquivo: string;
  importadoEm: string;
  importadoPor: string;
  linhas: HrRow[];
}

export interface HrRow {
  matricula: string;
  nome: string;
  inicio: string;
  fim: string;
}
