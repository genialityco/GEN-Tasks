'use client';

import { useMemo, useState } from 'react';
import {
  ConditionOperator,
  LogicalOperator,
  type Project,
} from '@gen-task/shared';
import { gestoresApi } from '../../services/api/gestores.api';
import type {
  AllowedTransitionInput,
} from '../../services/api/gestores.api';
import type { RuleConditionInput } from '../../services/api/rules.api';
import { usersApi } from '../../services/api/users.api';
import { useAsync } from '../../hooks/useAsync';

/**
 * Gestion de gestores de la organizacion y sus reglas de acceso sobre el
 * proyecto: condiciones de visibilidad (que actividades ve) y transiciones de
 * estado permitidas. Las condiciones EQUALS tambien definen valores por defecto
 * al crear actividades.
 */
export function GestoresPanel({
  organizationId,
  project,
}: {
  organizationId: string;
  project: Project;
}) {
  const { data: gestores, reload } = useAsync(
    () => gestoresApi.list(organizationId),
    [organizationId],
  );
  const { data: rules, reload: reloadRules } = useAsync(
    () => gestoresApi.rulesByProject(organizationId, project.id),
    [organizationId, project.id],
  );

  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [phone, setPhone] = useState('');
  const [busy, setBusy] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);

  async function removeGestor(membershipId: string) {
    if (!confirm('¿Eliminar este gestor de la organización?')) return;
    setRemovingId(membershipId);
    setError(null);
    try {
      await usersApi.archiveMembership(membershipId);
      reload();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setRemovingId(null);
    }
  }

  async function createGestor(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await gestoresApi.create(organizationId, {
        email: email.trim(),
        name: name.trim(),
        password: password.trim(),
        phone: phone.trim() || undefined,
        projectIds: [project.id],
      });
      setEmail('');
      setName('');
      setPassword('');
      setPhone('');
      reload();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const projectGestores = gestores?.filter(
    (g) => g.projectIds?.includes(project.id),
  );

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <div className="gt-card" style={{ display: 'grid', gap: 12 }}>
        <strong>Gestores</strong>
        {error && <div className="gt-error">{error}</div>}
        <div style={{ display: 'grid', gap: 6 }}>
          {projectGestores?.map((g) => (
            <div
              key={g.id}
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
                {g.name || g.email || 'Gestor'}
                {g.name && g.email && (
                  <span className="gt-muted"> · {g.email}</span>
                )}
              </span>
              <div style={{ display: 'flex', gap: 6 }}>
                <button
                  className="gt-btn"
                  style={{ padding: '4px 10px' }}
                  onClick={() => setSelected(g.userId)}
                >
                  Configurar acceso
                </button>
                <button
                  className="gt-btn"
                  style={{ padding: '4px 10px', background: 'var(--mantine-color-red-6)', color: '#fff', opacity: removingId === g.id ? 0.6 : 1 }}
                  disabled={removingId === g.id}
                  onClick={() => removeGestor(g.id)}
                >
                  {removingId === g.id ? '...' : 'Eliminar'}
                </button>
              </div>
            </div>
          ))}
          {projectGestores && projectGestores.length === 0 && (
            <span className="gt-muted">No hay gestores aun.</span>
          )}
        </div>

        <form onSubmit={createGestor} style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <input
            className="gt-input"
            style={{ flex: 1, minWidth: 150 }}
            type="email"
            placeholder="Correo del gestor"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <input
            className="gt-input"
            style={{ flex: 1, minWidth: 150 }}
            placeholder="Nombre"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
          <input
            className="gt-input"
            style={{ flex: 1, minWidth: 150 }}
            type="password"
            placeholder="Contraseña (mín. 6)"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            minLength={6}
            required
            autoComplete="new-password"
          />
          <input
            className="gt-input"
            style={{ flex: 1, minWidth: 150 }}
            placeholder="Celular (opcional, WhatsApp)"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />
          <button className="gt-btn" type="submit" disabled={busy}>
            Agregar gestor
          </button>
        </form>
        <span className="gt-muted" style={{ fontSize: 12 }}>
          El gestor inicia sesión en el login con su correo y esta contraseña. El
          celular es opcional y solo se usa para notificaciones por WhatsApp.
        </span>
      </div>

      {selected && (
        <GestorRuleEditor
          organizationId={organizationId}
          project={project}
          gestorId={selected}
          existing={rules?.find((r) => r.gestorId === selected) ?? null}
          onSaved={() => {
            reloadRules();
            setSelected(null);
          }}
          onCancel={() => setSelected(null)}
        />
      )}
    </div>
  );
}

function GestorRuleEditor({
  organizationId,
  project,
  gestorId,
  existing,
  onSaved,
  onCancel,
}: {
  organizationId: string;
  project: Project;
  gestorId: string;
  existing: import('@gen-task/shared').GestorAccessRule | null;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const [conditions, setConditions] = useState<RuleConditionInput[]>(
    (existing?.conditions as RuleConditionInput[]) ?? [],
  );
  const [logicalOperator, setLogicalOperator] = useState<LogicalOperator>(
    existing?.logicalOperator ?? LogicalOperator.AND,
  );
  const [allowAny, setAllowAny] = useState(
    existing?.allowAnyStatusTransition ?? false,
  );
  const [transitions, setTransitions] = useState<AllowedTransitionInput[]>(
    existing?.allowedStatusTransitions ?? [],
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fields = useMemo(
    () => project.customFields.filter((f) => !f.isArchived),
    [project],
  );
  const statuses = useMemo(
    () => project.statuses.filter((s) => !s.isArchived),
    [project],
  );

  function addCondition() {
    setConditions((c) => [
      ...c,
      { fieldKey: fields[0]?.key ?? '', operator: ConditionOperator.EQUALS, value: '' },
    ]);
  }
  function updateCondition(i: number, patch: Partial<RuleConditionInput>) {
    setConditions((c) => c.map((cond, idx) => (idx === i ? { ...cond, ...patch } : cond)));
  }
  function removeCondition(i: number) {
    setConditions((c) => c.filter((_, idx) => idx !== i));
  }

  function addTransition() {
    setTransitions((t) => [
      ...t,
      { fromStatusId: statuses[0]?.id ?? '', toStatusId: statuses[0]?.id ?? '' },
    ]);
  }
  function updateTransition(i: number, patch: Partial<AllowedTransitionInput>) {
    setTransitions((t) => t.map((tr, idx) => (idx === i ? { ...tr, ...patch } : tr)));
  }
  function removeTransition(i: number) {
    setTransitions((t) => t.filter((_, idx) => idx !== i));
  }

  async function save() {
    setBusy(true);
    setError(null);
    try {
      await gestoresApi.upsertRule(organizationId, {
        projectId: project.id,
        gestorId,
        conditions,
        logicalOperator,
        allowAnyStatusTransition: allowAny,
        allowedStatusTransitions: allowAny ? [] : transitions,
      });
      onSaved();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="gt-card" style={{ display: 'grid', gap: 12 }}>
      <strong>Reglas de acceso del gestor</strong>
      {error && <div className="gt-error">{error}</div>}

      <div style={{ display: 'grid', gap: 8 }}>
        <span className="gt-muted">
          Condiciones de visibilidad (EQUALS tambien autocompleta al crear)
        </span>
        {conditions.map((c, i) => (
          <div key={i} style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <select
              className="gt-input"
              style={{ flex: 1, minWidth: 120 }}
              value={c.fieldKey}
              onChange={(e) => updateCondition(i, { fieldKey: e.target.value })}
            >
              {fields.map((f) => (
                <option key={f.id} value={f.key}>
                  {f.label}
                </option>
              ))}
            </select>
            <select
              className="gt-input"
              style={{ width: 120 }}
              value={c.operator}
              onChange={(e) =>
                updateCondition(i, { operator: e.target.value as ConditionOperator })
              }
            >
              {Object.values(ConditionOperator).map((op) => (
                <option key={op} value={op}>
                  {op}
                </option>
              ))}
            </select>
            <input
              className="gt-input"
              style={{ flex: 1, minWidth: 100 }}
              placeholder="Valor"
              value={(c.value as string) ?? ''}
              onChange={(e) => updateCondition(i, { value: e.target.value })}
            />
            <button
              type="button"
              className="gt-btn"
              style={{ background: 'var(--border)', color: 'var(--text)' }}
              onClick={() => removeCondition(i)}
            >
              ✕
            </button>
          </div>
        ))}
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button type="button" className="gt-btn" style={{ padding: '4px 10px' }} onClick={addCondition}>
            + Condicion
          </button>
          {conditions.length > 1 && (
            <select
              className="gt-input"
              style={{ width: 100 }}
              value={logicalOperator}
              onChange={(e) => setLogicalOperator(e.target.value as LogicalOperator)}
            >
              <option value={LogicalOperator.AND}>AND</option>
              <option value={LogicalOperator.OR}>OR</option>
            </select>
          )}
        </div>
      </div>

      <div style={{ display: 'grid', gap: 8 }}>
        <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <input
            type="checkbox"
            checked={allowAny}
            onChange={(e) => setAllowAny(e.target.checked)}
          />
          Permitir cualquier cambio de estado
        </label>
        {!allowAny && (
          <>
            <span className="gt-muted">Transiciones de estado permitidas</span>
            {transitions.map((t, i) => (
              <div key={i} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <select
                  className="gt-input"
                  value={t.fromStatusId}
                  onChange={(e) => updateTransition(i, { fromStatusId: e.target.value })}
                >
                  {statuses.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
                <span>→</span>
                <select
                  className="gt-input"
                  value={t.toStatusId}
                  onChange={(e) => updateTransition(i, { toStatusId: e.target.value })}
                >
                  {statuses.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  className="gt-btn"
                  style={{ background: 'var(--border)', color: 'var(--text)' }}
                  onClick={() => removeTransition(i)}
                >
                  ✕
                </button>
              </div>
            ))}
            <button
              type="button"
              className="gt-btn"
              style={{ padding: '4px 10px', justifySelf: 'start' }}
              onClick={addTransition}
            >
              + Transicion
            </button>
          </>
        )}
      </div>

      <div style={{ display: 'flex', gap: 8 }}>
        <button className="gt-btn" onClick={save} disabled={busy}>
          {busy ? 'Guardando...' : 'Guardar reglas'}
        </button>
        <button
          className="gt-btn"
          style={{ background: 'var(--border)', color: 'var(--text)' }}
          onClick={onCancel}
        >
          Cancelar
        </button>
      </div>
    </div>
  );
}
