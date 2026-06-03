'use client';

import { useState } from 'react';
import {
  ConditionOperator,
  CustomFieldType,
  LogicalOperator,
  RuleActionType,
  RuleEvent,
  UserRole,
  type ActivityCustomField,
  type ProjectStatus,
} from '@gen-task/shared';
import { rulesApi } from '../../services/api/rules.api';
import { organizationsApi } from '../../services/api/organizations.api';
import { useAsync } from '../../hooks/useAsync';

const EVENT_LABELS: Record<RuleEvent, string> = {
  ON_ACTIVITY_CREATED: 'Al crear actividad',
  ON_FIELD_UPDATED: 'Al actualizar campo',
  ON_STATUS_CHANGED: 'Al cambiar estado',
};

const ACTION_LABELS: Record<RuleActionType, string> = {
  SEND_WHATSAPP: 'Enviar WhatsApp',
  CHANGE_STATUS: 'Cambiar estado',
  REQUEST_HOST_INFORMATION: 'Solicitar info al host',
  ASSIGN_RESPONSIBLE: 'Notificar a',
  REGISTER_HISTORY_EVENT: 'Registrar en historial',
  CREATE_CUSTOM_FIELD: 'Crear campo personalizado',
};

/** Etiquetas de los tipos de campo (igual que en el gestor de campos). */
const FIELD_TYPE_LABELS: Record<CustomFieldType, string> = {
  TEXT: 'Texto',
  NUMBER: 'Numero',
  DATE: 'Fecha',
  FILE: 'Archivo',
  IMAGE: 'Imagen',
  VIDEO: 'Video',
  LIST: 'Lista',
};

/** Borrador de un campo a crear por la accion CREATE_CUSTOM_FIELD. */
interface FieldDraft {
  label: string;
  type: CustomFieldType;
  required: boolean;
  optionsText: string;
}

function emptyFieldDraft(): FieldDraft {
  return { label: '', type: CustomFieldType.TEXT, required: false, optionsText: '' };
}

/**
 * Editor de condiciones y triggers del proyecto (Fase 6). Crea reglas con un
 * evento, una condicion sobre un campo y una accion. La evaluacion y ejecucion
 * la realiza el motor de reglas del backend al crear/cambiar estado.
 */
export function RulesManager({
  projectId,
  organizationId,
  fields,
  statuses,
}: {
  projectId: string;
  organizationId: string;
  fields: ActivityCustomField[];
  statuses: ProjectStatus[];
}) {
  const { data: rules, reload } = useAsync(() => rulesApi.list(projectId), [projectId]);
  // Miembros (Admin/Gestor) de la organizacion, para la accion "Asignar responsable".
  const { data: members } = useAsync(
    () => organizationsApi.members(organizationId),
    [organizationId],
  );

  /** Nombre legible de un estado por id (vacio si no se especifica). */
  const statusName = (id?: string) =>
    id ? statuses.find((s) => s.id === id)?.name ?? id : '';

  const [name, setName] = useState('');
  const [event, setEvent] = useState<RuleEvent>(RuleEvent.ON_STATUS_CHANGED);
  const [fieldKey, setFieldKey] = useState('');
  const [operator, setOperator] = useState<ConditionOperator>(ConditionOperator.EQUALS);
  const [value, setValue] = useState('');
  const [actionType, setActionType] = useState<RuleActionType>(
    RuleActionType.REGISTER_HISTORY_EVENT,
  );
  const [actionMessage, setActionMessage] = useState('');
  const [actionStatusId, setActionStatusId] = useState('');
  const [actionResponsibleId, setActionResponsibleId] = useState('');
  // Transicion opcional para el evento "Al cambiar de estado".
  const [fromStatusId, setFromStatusId] = useState('');
  const [toStatusId, setToStatusId] = useState('');
  // Configuracion de los campos a crear (accion CREATE_CUSTOM_FIELD): permite
  // definir uno o varios campos por accion, con la misma logica que el gestor
  // de campos personalizados.
  const [cfDrafts, setCfDrafts] = useState<FieldDraft[]>([emptyFieldDraft()]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const conditions = fieldKey
        ? [{ fieldKey, operator, value: value || undefined }]
        : [];
      const payload: Record<string, unknown> = {};
      if (
        actionType === RuleActionType.SEND_WHATSAPP ||
        actionType === RuleActionType.REQUEST_HOST_INFORMATION ||
        actionType === RuleActionType.REGISTER_HISTORY_EVENT
      ) {
        payload.message = actionMessage;
      }
      if (actionType === RuleActionType.CHANGE_STATUS) {
        payload.statusId = actionStatusId;
      }
      if (actionType === RuleActionType.ASSIGN_RESPONSIBLE) {
        payload.responsibleId = actionResponsibleId;
        // Mensaje que se notificara al responsable cuando exista el servicio
        // de notificaciones.
        payload.message = actionMessage;
      }
      if (actionType === RuleActionType.CREATE_CUSTOM_FIELD) {
        payload.fields = cfDrafts
          .filter((d) => d.label.trim())
          .map((d) => ({
            label: d.label.trim(),
            type: d.type,
            required: d.required,
            ...(d.type === CustomFieldType.LIST
              ? {
                  options: d.optionsText
                    .split(',')
                    .map((o) => o.trim())
                    .filter(Boolean)
                    .map((o) => ({ label: o, value: o })),
                }
              : {}),
          }));
      }
      await rulesApi.create(projectId, {
        name: name.trim(),
        event,
        conditions,
        logicalOperator: LogicalOperator.AND,
        actions: [{ type: actionType, payload }],
        // La transicion solo aplica al evento de cambio de estado.
        ...(event === RuleEvent.ON_STATUS_CHANGED
          ? {
              fromStatusId: fromStatusId || undefined,
              toStatusId: toStatusId || undefined,
            }
          : {}),
      });
      setName('');
      setValue('');
      setActionMessage('');
      setActionResponsibleId('');
      setFromStatusId('');
      setToStatusId('');
      setCfDrafts([emptyFieldDraft()]);
      reload();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function remove(ruleId: string) {
    await rulesApi.remove(projectId, ruleId);
    reload();
  }

  // --- Borradores de campos (accion CREATE_CUSTOM_FIELD) ---
  function updateDraft(index: number, patch: Partial<FieldDraft>) {
    setCfDrafts((prev) => prev.map((d, i) => (i === index ? { ...d, ...patch } : d)));
  }
  function addDraft() {
    setCfDrafts((prev) => [...prev, emptyFieldDraft()]);
  }
  function removeDraft(index: number) {
    setCfDrafts((prev) => (prev.length > 1 ? prev.filter((_, i) => i !== index) : prev));
  }

  return (
    <div className="gt-card" style={{ display: 'grid', gap: 12 }}>
      <strong>Condiciones y triggers</strong>
      {error && <div className="gt-error">{error}</div>}

      <div style={{ display: 'grid', gap: 6 }}>
        {rules?.map((r) => (
          <div
            key={r.id}
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              gap: 8,
              padding: '6px 8px',
              border: '1px solid var(--border)',
              borderRadius: 6,
            }}
          >
            <span>
              <strong>{r.name}</strong>{' '}
              <span className="gt-muted">
                {EVENT_LABELS[r.event]}
                {r.event === RuleEvent.ON_STATUS_CHANGED && (r.fromStatusId || r.toStatusId)
                  ? ` (${statusName(r.fromStatusId) || 'cualquiera'} → ${statusName(r.toStatusId) || 'cualquiera'})`
                  : ''}{' '}
                ·{' '}
                {r.actions.map((a) => ACTION_LABELS[a.type]).join(', ')}
              </span>
            </span>
            <button
              className="gt-btn"
              style={{ background: '#e2e8f0', color: 'var(--text)', padding: '4px 10px' }}
              onClick={() => remove(r.id)}
            >
              Eliminar
            </button>
          </div>
        ))}
        {rules && rules.length === 0 && (
          <span className="gt-muted">Sin reglas configuradas.</span>
        )}
      </div>

      <form onSubmit={create} style={{ display: 'grid', gap: 8 }}>
        <input
          className="gt-input"
          placeholder="Nombre de la regla"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
        />
        <label style={{ display: 'grid', gap: 4 }}>
          <span className="gt-muted">Evento</span>
          <select
            className="gt-input"
            value={event}
            onChange={(e) => setEvent(e.target.value as RuleEvent)}
          >
            {(Object.keys(EVENT_LABELS) as RuleEvent[]).map((ev) => (
              <option key={ev} value={ev}>
                {EVENT_LABELS[ev]}
              </option>
            ))}
          </select>
        </label>

        {event === RuleEvent.ON_STATUS_CHANGED && (
          <div style={{ display: 'grid', gap: 4 }}>
            <span className="gt-muted">Transición (opcional)</span>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              <select
                className="gt-input"
                style={{ flex: 1, minWidth: 140 }}
                value={fromStatusId}
                onChange={(e) => setFromStatusId(e.target.value)}
              >
                <option value="">Desde: cualquier estado</option>
                {statuses
                  .filter((s) => !s.isArchived)
                  .map((s) => (
                    <option key={s.id} value={s.id}>
                      Desde: {s.name}
                    </option>
                  ))}
              </select>
              <span aria-hidden>→</span>
              <select
                className="gt-input"
                style={{ flex: 1, minWidth: 140 }}
                value={toStatusId}
                onChange={(e) => setToStatusId(e.target.value)}
              >
                <option value="">Hacia: cualquier estado</option>
                {statuses
                  .filter((s) => !s.isArchived)
                  .map((s) => (
                    <option key={s.id} value={s.id}>
                      Hacia: {s.name}
                    </option>
                  ))}
              </select>
            </div>
          </div>
        )}

        <span className="gt-muted">Condicion (opcional)</span>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <select
            className="gt-input"
            style={{ flex: 1, minWidth: 120 }}
            value={fieldKey}
            onChange={(e) => setFieldKey(e.target.value)}
          >
            <option value="">— sin condicion —</option>
            {fields
              .filter((f) => !f.isArchived)
              .map((f) => (
                <option key={f.id} value={f.key}>
                  {f.label}
                </option>
              ))}
          </select>
          <select
            className="gt-input"
            style={{ width: 130 }}
            value={operator}
            onChange={(e) => setOperator(e.target.value as ConditionOperator)}
          >
            {Object.values(ConditionOperator).map((op) => (
              <option key={op} value={op}>
                {op}
              </option>
            ))}
          </select>
          <input
            className="gt-input"
            style={{ flex: 1, minWidth: 120 }}
            placeholder="Valor"
            value={value}
            onChange={(e) => setValue(e.target.value)}
          />
        </div>

        <span className="gt-muted">Accion</span>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <select
            className="gt-input"
            style={{ width: 200 }}
            value={actionType}
            onChange={(e) => setActionType(e.target.value as RuleActionType)}
          >
            {(Object.keys(ACTION_LABELS) as RuleActionType[]).map((a) => (
              <option key={a} value={a}>
                {ACTION_LABELS[a]}
              </option>
            ))}
          </select>
          {actionType === RuleActionType.CHANGE_STATUS ? (
            <select
              className="gt-input"
              style={{ flex: 1, minWidth: 140 }}
              value={actionStatusId}
              onChange={(e) => setActionStatusId(e.target.value)}
            >
              <option value="">Estado destino...</option>
              {statuses
                .filter((s) => !s.isArchived)
                .map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
            </select>
          ) : actionType === RuleActionType.ASSIGN_RESPONSIBLE ? (
            <select
              className="gt-input"
              style={{ flex: 1, minWidth: 140 }}
              value={actionResponsibleId}
              onChange={(e) => setActionResponsibleId(e.target.value)}
            >
              <option value="">Seleccionar usuario a notificar...</option>
              {(members ?? []).map((m) => (
                <option key={m.userId} value={m.userId}>
                  {m.name} · {m.role === UserRole.ADMIN ? 'Admin' : 'Gestor'}
                </option>
              ))}
            </select>
          ) : actionType === RuleActionType.CREATE_CUSTOM_FIELD ? null : (
            <input
              className="gt-input"
              style={{ flex: 1, minWidth: 140 }}
              placeholder="Mensaje / comentario"
              value={actionMessage}
              onChange={(e) => setActionMessage(e.target.value)}
            />
          )}
        </div>

        {actionType === RuleActionType.ASSIGN_RESPONSIBLE && (
          <input
            className="gt-input"
            placeholder="Mensaje a notificar (se enviará al activarse las notificaciones)"
            value={actionMessage}
            onChange={(e) => setActionMessage(e.target.value)}
          />
        )}

        {actionType === RuleActionType.CREATE_CUSTOM_FIELD && (
          <div style={{ display: 'grid', gap: 8 }}>
            <span className="gt-muted">Campos a crear</span>
            {cfDrafts.map((draft, i) => (
              <div
                key={i}
                style={{
                  display: 'grid',
                  gap: 8,
                  padding: 8,
                  border: '1px solid var(--border)',
                  borderRadius: 6,
                }}
              >
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <input
                    className="gt-input"
                    style={{ flex: 1 }}
                    placeholder={`Etiqueta del campo ${i + 1} (ej: Evidencia)`}
                    value={draft.label}
                    onChange={(e) => updateDraft(i, { label: e.target.value })}
                  />
                  {cfDrafts.length > 1 && (
                    <button
                      type="button"
                      className="gt-btn"
                      style={{ background: '#e2e8f0', color: 'var(--text)', padding: '4px 10px' }}
                      onClick={() => removeDraft(i)}
                    >
                      Quitar
                    </button>
                  )}
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                  <select
                    className="gt-input"
                    style={{ width: 160 }}
                    value={draft.type}
                    onChange={(e) =>
                      updateDraft(i, { type: e.target.value as CustomFieldType })
                    }
                  >
                    {(Object.keys(FIELD_TYPE_LABELS) as CustomFieldType[]).map((t) => (
                      <option key={t} value={t}>
                        {FIELD_TYPE_LABELS[t]}
                      </option>
                    ))}
                  </select>
                  <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    <input
                      type="checkbox"
                      checked={draft.required}
                      onChange={(e) => updateDraft(i, { required: e.target.checked })}
                    />
                    <span className="gt-muted">Obligatorio</span>
                  </label>
                </div>
                {draft.type === CustomFieldType.LIST && (
                  <input
                    className="gt-input"
                    placeholder="Opciones separadas por coma (ej: Electrico, Fisico, Software)"
                    value={draft.optionsText}
                    onChange={(e) => updateDraft(i, { optionsText: e.target.value })}
                  />
                )}
              </div>
            ))}
            <button
              type="button"
              className="gt-btn"
              style={{ background: '#e2e8f0', color: 'var(--text)', justifySelf: 'start', padding: '4px 10px' }}
              onClick={addDraft}
            >
              + Agregar otro campo
            </button>
          </div>
        )}

        <button className="gt-btn" type="submit" disabled={busy} style={{ justifySelf: 'start' }}>
          Crear regla
        </button>
      </form>
    </div>
  );
}
