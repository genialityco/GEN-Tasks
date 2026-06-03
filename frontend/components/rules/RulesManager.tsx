'use client';

import { useState } from 'react';
import {
  ConditionOperator,
  LogicalOperator,
  RuleActionType,
  RuleEvent,
  type ActivityCustomField,
  type ProjectStatus,
} from '@gen-task/shared';
import { rulesApi } from '../../services/api/rules.api';
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
  ASSIGN_RESPONSIBLE: 'Asignar responsable',
  REGISTER_HISTORY_EVENT: 'Registrar en historial',
};

/**
 * Editor de condiciones y triggers del proyecto (Fase 6). Crea reglas con un
 * evento, una condicion sobre un campo y una accion. La evaluacion y ejecucion
 * la realiza el motor de reglas del backend al crear/cambiar estado.
 */
export function RulesManager({
  projectId,
  fields,
  statuses,
}: {
  projectId: string;
  fields: ActivityCustomField[];
  statuses: ProjectStatus[];
}) {
  const { data: rules, reload } = useAsync(() => rulesApi.list(projectId), [projectId]);

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
      await rulesApi.create(projectId, {
        name: name.trim(),
        event,
        conditions,
        logicalOperator: LogicalOperator.AND,
        actions: [{ type: actionType, payload }],
      });
      setName('');
      setValue('');
      setActionMessage('');
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
                {EVENT_LABELS[r.event]} ·{' '}
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
          ) : (
            <input
              className="gt-input"
              style={{ flex: 1, minWidth: 140 }}
              placeholder="Mensaje / comentario"
              value={actionMessage}
              onChange={(e) => setActionMessage(e.target.value)}
            />
          )}
        </div>

        <button className="gt-btn" type="submit" disabled={busy} style={{ justifySelf: 'start' }}>
          Crear regla
        </button>
      </form>
    </div>
  );
}
