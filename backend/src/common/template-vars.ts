import {
  Activity,
  ActivityCustomField,
  ActivityFileAttachment,
  CustomFieldType,
  Project,
} from '@gen-task/shared';

/**
 * Variables adicionales (de contexto) para construir el mapa de interpolacion de
 * un mensaje de notificacion. Las basicas (actividad, estado, proyecto, campos
 * personalizados) se derivan de la actividad/proyecto; estas las aporta quien
 * dispara la notificacion segun el evento.
 */
export interface ActivityVarOptions {
  /** Nombre de la organizacion ({{organizationName}}). */
  organizationName?: string;
  /** Origen del frontend para construir {{link}} (sin barra final). */
  frontendOrigin?: string;
  /** Nombre del responsable destinatario ({{responsibleName}}). */
  responsibleName?: string;
  /** Solo ON_STATUS_CHANGED: estado origen ({{fromStatusName}}). */
  fromStatusName?: string;
  /** Solo ON_STATUS_CHANGED: estado destino ({{toStatusName}}). */
  toStatusName?: string;
  /** Solo ON_FIELD_UPDATED: etiquetas de los campos que cambiaron ({{updatedFields}}). */
  updatedFieldLabels?: string[];
}

/**
 * Construye el mapa de variables interpolables de una actividad para las
 * plantillas de notificacion. Incluye las variables del sistema (actividad,
 * estado actual, proyecto, organizacion, enlace), los valores de los campos
 * personalizados indexados por su `key`, y las variables de contexto del evento
 * (estado origen/destino, campos actualizados) que aporte el llamador.
 *
 * Los campos personalizados se agregan primero para que las variables del
 * sistema tengan prioridad ante una colision de nombres.
 */
export function buildActivityVars(
  activity: Activity,
  project: Project,
  opts: ActivityVarOptions = {},
): Record<string, string> {
  const statusName =
    project.statuses.find((s) => s.id === activity.statusId)?.name ?? '';

  const vars: Record<string, string> = {
    ...customFieldVars(activity, project),
    activityName: activity.name,
    statusName,
    projectName: project.name,
    organizationName: opts.organizationName ?? '',
    link: activityLink(opts.frontendOrigin, activity),
  };

  if (opts.responsibleName !== undefined) {
    vars.responsibleName = opts.responsibleName;
  }
  if (opts.fromStatusName !== undefined) {
    vars.fromStatusName = opts.fromStatusName;
  }
  if (opts.toStatusName !== undefined) {
    vars.toStatusName = opts.toStatusName;
  }
  if (opts.updatedFieldLabels) {
    vars.updatedFields = opts.updatedFieldLabels.join(', ');
  }

  return vars;
}

/** Reemplaza los placeholders `{{clave}}` de una plantilla por sus valores. */
export function interpolate(
  template: string,
  vars: Record<string, string>,
): string {
  return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, key: string) =>
    vars[key] !== undefined ? vars[key] : `{{${key}}}`,
  );
}

/** Enlace directo al detalle de la actividad en el frontend (vacio si no hay origen). */
function activityLink(frontendOrigin: string | undefined, activity: Activity): string {
  const base = (frontendOrigin ?? '').replace(/\/$/, '');
  if (!base) return '';
  return (
    `${base}/organizations/${activity.organizationId}` +
    `/projects/${activity.projectId}/activities/${activity.id}`
  );
}

/**
 * Variables de plantilla a partir de los campos personalizados de la actividad.
 * Cada campo se expone bajo su `key` (la misma que ve el admin en los chips de
 * variables, p. ej. `{{prioridad}}`) con su valor ya formateado para texto. Solo
 * se incluyen campos activos (no archivados) que tengan valor.
 */
function customFieldVars(
  activity: Activity,
  project: Project,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const field of project.customFields ?? []) {
    if (field.isArchived) continue;
    const raw = activity.customFieldValues?.[field.key];
    const formatted = formatCustomFieldValue(field, raw);
    if (formatted !== null) out[field.key] = formatted;
  }
  return out;
}

/**
 * Formatea el valor de un campo personalizado a texto legible segun su tipo.
 * Devuelve `null` cuando el campo no tiene valor (asi la variable cae al
 * placeholder por defecto en lugar de mostrar un texto vacio confuso).
 */
function formatCustomFieldValue(
  field: ActivityCustomField,
  raw: unknown,
): string | null {
  if (raw === undefined || raw === null || raw === '') return null;

  switch (field.type) {
    case CustomFieldType.LIST: {
      // El valor guardado es el `value` de la opcion; se muestra su `label`.
      const values = Array.isArray(raw) ? raw : [raw];
      const labels = values.map((v) => {
        const opt = field.options?.find((o) => o.value === v);
        return opt?.label ?? String(v);
      });
      return labels.join(', ') || null;
    }

    case CustomFieldType.FILE:
    case CustomFieldType.IMAGE:
    case CustomFieldType.VIDEO: {
      // Adjuntos: se listan los nombres de archivo (no las URLs firmadas).
      const files = Array.isArray(raw) ? (raw as ActivityFileAttachment[]) : [];
      const names = files.map((f) => f?.name).filter(Boolean);
      return names.length > 0 ? names.join(', ') : null;
    }

    case CustomFieldType.DATE: {
      const date = new Date(String(raw));
      if (Number.isNaN(date.getTime())) return String(raw);
      // Fecha local en formato es-CO (dd/mm/aaaa).
      return date.toLocaleDateString('es-CO');
    }

    default:
      return String(raw);
  }
}
