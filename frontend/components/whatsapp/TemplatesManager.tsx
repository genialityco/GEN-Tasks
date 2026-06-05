'use client';

import { useState } from 'react';
import { NotificationChannel } from '@gen-task/shared';
import { templatesApi } from '../../services/api/templates.api';
import { useAsync } from '../../hooks/useAsync';

/** Etiquetas legibles de cada medio de entrega de notificacion. */
const CHANNEL_LABELS: Record<NotificationChannel, string> = {
  [NotificationChannel.WHATSAPP]: 'WhatsApp',
  [NotificationChannel.EMAIL]: 'Correo electrónico',
  [NotificationChannel.BOTH]: 'WhatsApp y correo',
};

/**
 * Gestion de plantillas de mensajes del bot (Fase 8). Permite crear, editar el
 * cuerpo y eliminar plantillas reutilizables (cambio de estado, solicitud de
 * info, confirmacion, error, etc.) usando la `key` como identificador logico.
 */
export function TemplatesManager({ organizationId }: { organizationId: string }) {
  const { data: templates, loading, reload } = useAsync(
    () => templatesApi.list(organizationId),
    [organizationId],
  );

  const [key, setKey] = useState('');
  const [name, setName] = useState('');
  const [body, setBody] = useState('');
  const [channel, setChannel] = useState<NotificationChannel>(
    NotificationChannel.WHATSAPP,
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await templatesApi.create(organizationId, {
        key: key.trim(),
        name: name.trim(),
        body: body.trim(),
        channel,
      });
      setKey('');
      setName('');
      setBody('');
      setChannel(NotificationChannel.WHATSAPP);
      reload();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    if (!confirm('Eliminar esta plantilla?')) return;
    await templatesApi.remove(id);
    reload();
  }

  return (
    <div style={{ display: 'grid', gap: 16, maxWidth: 700 }}>
      <div className="gt-card" style={{ display: 'grid', gap: 6 }}>
        <strong>Notificaciones automáticas</strong>
        <span className="gt-muted">
          Para personalizar el mensaje que reciben los responsables al ser
          asignados a una actividad, crea una plantilla con la clave{' '}
          <code>RESPONSIBLE_ASSIGNED</code>. Si no existe, se usa un texto por
          defecto. Puedes elegir el <strong>medio de envío</strong> (WhatsApp,
          correo o ambos); si no se define, se envía por WhatsApp. Placeholders
          disponibles:
        </span>
        <span className="gt-muted" style={{ fontSize: 13 }}>
          <code>{'{{responsibleName}}'}</code>{' '}
          <code>{'{{activityName}}'}</code>{' '}
          <code>{'{{statusName}}'}</code>{' '}
          <code>{'{{projectName}}'}</code>{' '}
          <code>{'{{organizationName}}'}</code>
        </span>
      </div>

      <div className="gt-card" style={{ display: 'grid', gap: 8 }}>
        <strong>Plantillas existentes</strong>
        {loading && <p>Cargando...</p>}
        {templates?.map((t) => (
          <TemplateRow key={t.id} template={t} onChanged={reload} onRemove={() => remove(t.id)} />
        ))}
        {templates && templates.length === 0 && (
          <span className="gt-muted">No hay plantillas configuradas.</span>
        )}
      </div>

      <form onSubmit={create} className="gt-card" style={{ display: 'grid', gap: 8 }}>
        <strong>Nueva plantilla</strong>
        {error && <div className="gt-error">{error}</div>}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <input
            className="gt-input"
            style={{ flex: 1, minWidth: 140 }}
            placeholder="Clave (ej: STATUS_CHANGED)"
            value={key}
            onChange={(e) => setKey(e.target.value)}
            required
          />
          <input
            className="gt-input"
            style={{ flex: 1, minWidth: 140 }}
            placeholder="Nombre"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
        </div>
        <textarea
          className="gt-input"
          rows={3}
          placeholder="Cuerpo del mensaje. Usa {{placeholders}} para variables."
          value={body}
          onChange={(e) => setBody(e.target.value)}
          required
        />
        <label style={{ display: 'grid', gap: 4 }}>
          <span className="gt-muted" style={{ fontSize: 13 }}>
            Medio de envío
          </span>
          <select
            className="gt-input"
            value={channel}
            onChange={(e) => setChannel(e.target.value as NotificationChannel)}
            style={{ maxWidth: 240 }}
          >
            {Object.values(NotificationChannel).map((c) => (
              <option key={c} value={c}>
                {CHANNEL_LABELS[c]}
              </option>
            ))}
          </select>
        </label>
        <button className="gt-btn" type="submit" disabled={busy} style={{ justifySelf: 'start' }}>
          Crear plantilla
        </button>
      </form>
    </div>
  );
}

function TemplateRow({
  template,
  onChanged,
  onRemove,
}: {
  template: import('@gen-task/shared').MessageTemplate;
  onChanged: () => void;
  onRemove: () => void;
}) {
  const [body, setBody] = useState(template.body);
  const currentChannel = template.channel ?? NotificationChannel.WHATSAPP;
  const [channel, setChannel] = useState<NotificationChannel>(currentChannel);
  const [saving, setSaving] = useState(false);
  const dirty = body !== template.body || channel !== currentChannel;

  async function save() {
    setSaving(true);
    try {
      await templatesApi.update(template.id, { body, channel });
      onChanged();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      style={{
        display: 'grid',
        gap: 6,
        padding: 8,
        border: '1px solid var(--border)',
        borderRadius: 6,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        <span>
          <strong>{template.name}</strong>{' '}
          <span className="gt-muted">[{template.key}]</span>
        </span>
        <button
          className="gt-btn"
          style={{ background: 'var(--danger)', padding: '2px 8px' }}
          onClick={onRemove}
        >
          Eliminar
        </button>
      </div>
      <textarea
        className="gt-input"
        rows={2}
        value={body}
        onChange={(e) => setBody(e.target.value)}
      />
      <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span className="gt-muted" style={{ fontSize: 13 }}>
          Medio de envío
        </span>
        <select
          className="gt-input"
          value={channel}
          onChange={(e) => setChannel(e.target.value as NotificationChannel)}
          style={{ maxWidth: 240 }}
        >
          {Object.values(NotificationChannel).map((c) => (
            <option key={c} value={c}>
              {CHANNEL_LABELS[c]}
            </option>
          ))}
        </select>
      </label>
      {dirty && (
        <button
          className="gt-btn"
          style={{ justifySelf: 'start', padding: '4px 10px' }}
          onClick={save}
          disabled={saving}
        >
          Guardar
        </button>
      )}
    </div>
  );
}
