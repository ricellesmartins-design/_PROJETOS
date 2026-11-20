// Consultas filtradas pelo perfil efetivo (a segurança real é garantida pelo RLS no banco).
import { db, type Profile } from '../lib/db';
import type { Activity, VacationRequest } from '../types';

export function visibleActivities(u: Profile): Activity[] {
  const all = db.all('activities');
  if (u.role === 'colaborador') return all.filter((a) => a.collaboratorId === u.collaboratorId);
  return all;
}

export function visibleCollaborators(u: Profile) {
  const all = db.all('collaborators');
  if (u.role === 'colaborador') return all.filter((c) => c.id === u.collaboratorId);
  return all.filter((c) => c.ativo);
}

export function visibleVacations(u: Profile): VacationRequest[] {
  const all = db.all('vacations');
  if (u.role === 'colaborador') return all.filter((v) => v.collaboratorId === u.collaboratorId);
  if (u.role === 'cliente') return [];
  return all;
}
