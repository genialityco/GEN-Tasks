import {
  ComplianceLevel,
  StatusType,
  type Activity,
  type Project,
  type ProjectStatus,
} from '@gen-task/shared';

/**
 * Sub-pestanas de actividades (equivalente a los sub-tabs de tickets en
 * Motorola). Se conservan los estados activos (OPEN) y cerrados (CLOSED) del
 * proyecto; los archivados se separan por la bandera `isArchived`.
 */
export type ActivitySubTab = 'activos' | 'finalizados' | 'archivados';

const DEFAULT_STATUS_COLOR = '#64748b';

/** Mapa id-de-estado -> definicion, para resolver nombre/color/tipo rapido. */
export function buildStatusMap(project: Project): Map<string, ProjectStatus> {
  const map = new Map<string, ProjectStatus>();
  project.statuses.forEach((s) => map.set(s.id, s));
  return map;
}

export function statusName(project: Project, statusId: string): string {
  return project.statuses.find((s) => s.id === statusId)?.name ?? statusId;
}

export function statusColor(project: Project, statusId: string): string {
  return project.statuses.find((s) => s.id === statusId)?.color ?? DEFAULT_STATUS_COLOR;
}

/** A que sub-pestana pertenece una actividad segun su estado/archivado. */
export function activitySubTab(activity: Activity, statusMap: Map<string, ProjectStatus>): ActivitySubTab {
  if (activity.isArchived) return 'archivados';
  const status = statusMap.get(activity.statusId);
  return status?.type === StatusType.CLOSED ? 'finalizados' : 'activos';
}

/** Conteos por sub-pestana, para los badges de las tabs. */
export function countBySubTab(activities: Activity[], statusMap: Map<string, ProjectStatus>) {
  const counts: Record<ActivitySubTab, number> = { activos: 0, finalizados: 0, archivados: 0 };
  for (const a of activities) counts[activitySubTab(a, statusMap)] += 1;
  return counts;
}

const MS_PER_DAY = 86_400_000;

/**
 * Fecha limite (deadline) de una actividad: su `scheduledDate` (programacion)
 * si existe; si no, `createdAt + defaultDurationDays` cuando el semaforo esta
 * habilitado y define una duracion por defecto. `null` si no hay deadline.
 */
export function computeDeadline(activity: Activity, project: Project): Date | null {
  if (activity.scheduledDate) return new Date(activity.scheduledDate);
  const c = project.compliance;
  if (c?.enabled && c.defaultDurationDays != null) {
    const d = new Date(activity.createdAt);
    d.setDate(d.getDate() + c.defaultDurationDays);
    return d;
  }
  return null;
}

/** Dias enteros restantes hasta la fecha limite (negativo si esta vencida). */
export function daysUntil(deadline: Date, now: Date = new Date()): number {
  return Math.ceil((deadline.getTime() - now.getTime()) / MS_PER_DAY);
}

/**
 * Nivel del semaforo de cumplimiento de una actividad, o `null` si no aplica
 * (semaforo deshabilitado, sin deadline, o actividad cerrada/archivada).
 */
export function computeComplianceLevel(
  activity: Activity,
  project: Project,
  statusMap: Map<string, ProjectStatus>,
): ComplianceLevel | null {
  const c = project.compliance;
  if (!c?.enabled) return null;
  if (activity.isArchived) return null;
  if (statusMap.get(activity.statusId)?.type === StatusType.CLOSED) return null;

  const deadline = computeDeadline(activity, project);
  if (!deadline) return null;

  const remaining = daysUntil(deadline);
  if (remaining <= c.criticalThresholdDays) return ComplianceLevel.CRITICAL;
  if (remaining <= c.attentionThresholdDays) return ComplianceLevel.ATTENTION;
  return ComplianceLevel.ON_TIME;
}

export const COMPLIANCE_COLOR: Record<ComplianceLevel, string> = {
  [ComplianceLevel.ON_TIME]: '#16a34a',
  [ComplianceLevel.ATTENTION]: '#f59e0b',
  [ComplianceLevel.CRITICAL]: '#dc2626',
};

export const COMPLIANCE_LABEL: Record<ComplianceLevel, string> = {
  [ComplianceLevel.ON_TIME]: 'A tiempo',
  [ComplianceLevel.ATTENTION]: 'Prioritario',
  [ComplianceLevel.CRITICAL]: 'Por expirar / vencido',
};

/**
 * Cuenta regresiva de una alerta de cumplimiento por estado (SLA) pendiente:
 * el estado objetivo que la actividad aun no ha alcanzado y la fecha limite
 * (`createdAt + daysFromCreation`) para alcanzarlo.
 */
export interface StatusAlertCountdown {
  statusId: string;
  statusName: string;
  deadline: Date;
  remainingDays: number;
  remainingLabel: string;
  overdue: boolean;
}

/**
 * Tiempo restante para alcanzar cada estado que tiene una alerta de
 * cumplimiento activa y que la actividad aun no ha alcanzado. Solo aplica con
 * el semaforo habilitado y para actividades abiertas (no cerradas/archivadas).
 * Replica el criterio del cron de alertas: la actividad "alcanzo" el estado si
 * el `order` de su estado actual es >= al del estado objetivo. Ordenado por
 * fecha limite ascendente (lo mas urgente primero).
 */
export function computeStatusAlertCountdowns(
  activity: Activity,
  project: Project,
  statusMap: Map<string, ProjectStatus>,
  now: Date = new Date(),
): StatusAlertCountdown[] {
  const c = project.compliance;
  if (!c?.enabled || activity.isArchived) return [];

  const currentStatus = statusMap.get(activity.statusId);
  if (currentStatus?.type === StatusType.CLOSED) return [];
  const currentOrder = currentStatus?.order ?? -1;

  const created = new Date(activity.createdAt);
  if (Number.isNaN(created.getTime())) return [];

  const out: StatusAlertCountdown[] = [];
  for (const alert of c.statusAlerts ?? []) {
    if (!alert.enabled) continue;
    const target = statusMap.get(alert.statusId);
    // Estado objetivo inexistente o ya alcanzado/superado: no aplica.
    if (!target || currentOrder >= target.order) continue;
    const deadline = new Date(created.getTime() + alert.daysFromCreation * MS_PER_DAY);
    const remainingDays = daysUntil(deadline, now);
    out.push({
      statusId: alert.statusId,
      statusName: target.name,
      deadline,
      remainingDays,
      remainingLabel: deadlineRemainingLabel(deadline, now),
      overdue: remainingDays < 0,
    });
  }
  out.sort((a, b) => a.deadline.getTime() - b.deadline.getTime());
  return out;
}

/** Texto humano del tiempo restante: "en 3 días", "vence hoy", "venció hace 2 días". */
export function deadlineRemainingLabel(deadline: Date, now: Date = new Date()): string {
  const d = daysUntil(deadline, now);
  if (d > 1) return `en ${d} días`;
  if (d === 1) return 'mañana';
  if (d === 0) return 'vence hoy';
  if (d === -1) return 'venció ayer';
  return `venció hace ${Math.abs(d)} días`;
}

/**
 * Valor de un campo (base o personalizado) de una actividad como string, para
 * ordenar y filtrar. Equivalente a `getFieldValue` de Motorola.
 */
export function getActivityFieldValue(activity: Activity, project: Project, key: string): string {
  switch (key) {
    case 'name':
      return activity.name ?? '';
    case 'status':
      return statusName(project, activity.statusId);
    case 'responsibles':
      return activity.responsibleIds.join(', ');
    case 'createdAt':
      return activity.createdAt ?? '';
    case 'scheduledDate':
      return activity.scheduledDate ?? '';
    default: {
      // Campos personalizados con prefijo `cf_`.
      if (key.startsWith('cf_')) {
        const fieldKey = key.slice(3);
        const v = activity.customFieldValues?.[fieldKey];
        return v == null ? '' : String(v);
      }
      return '';
    }
  }
}
