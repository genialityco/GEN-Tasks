'use client';

import { useParams } from 'next/navigation';
import { useState } from 'react';
import { useWhatsappChats, useWhatsappMessages } from '../../../../hooks/useWhatsappChats';
import { whatsappApi } from '../../../../services/api/whatsapp.api';

/**
 * Seccion ChatWhatsapp. Tab "Chats": lista de conversaciones, historial de
 * mensajes, envio manual y toma de control (bot ON/OFF por chat).
 * Tab "Gestion de mensajes": plantillas (Fase 8).
 */
export default function ChatWhatsappPage() {
  const params = useParams<{ organizationId: string }>();
  const [tab, setTab] = useState<'chats' | 'templates'>('chats');

  return (
    <main style={{ padding: 24, display: 'grid', gap: 16 }}>
      <h1 style={{ margin: 0 }}>ChatWhatsapp</h1>
      <nav style={{ display: 'flex', gap: 8, borderBottom: '1px solid var(--border)' }}>
        <TabButton active={tab === 'chats'} onClick={() => setTab('chats')}>
          Chats
        </TabButton>
        <TabButton
          active={tab === 'templates'}
          onClick={() => setTab('templates')}
        >
          Gestion de mensajes
        </TabButton>
      </nav>

      {tab === 'chats' ? (
        <ChatsView organizationId={params.organizationId} />
      ) : (
        <div className="gt-card gt-muted">
          Gestion de plantillas y mensajes automaticos (Fase 8).
        </div>
      )}
    </main>
  );
}

function ChatsView({ organizationId }: { organizationId: string }) {
  const { data: chats, loading } = useWhatsappChats(organizationId);
  const [selected, setSelected] = useState<string | null>(null);
  const { data: messages, reload } = useWhatsappMessages(selected);
  const [draft, setDraft] = useState('');

  async function send() {
    if (!selected || !draft.trim()) return;
    await whatsappApi.sendMessage(selected, draft.trim());
    setDraft('');
    reload();
  }

  async function toggleBot(chatId: string, enabled: boolean) {
    await whatsappApi.toggleBot(chatId, enabled);
    reload();
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '280px 1fr', gap: 16 }}>
      <div className="gt-card" style={{ padding: 0 }}>
        {loading && <div style={{ padding: 12 }}>Cargando chats...</div>}
        {chats?.map((c) => (
          <button
            key={c.id}
            onClick={() => setSelected(c.id)}
            style={{
              display: 'block',
              width: '100%',
              textAlign: 'left',
              padding: 12,
              border: 'none',
              borderBottom: '1px solid var(--border)',
              background: selected === c.id ? '#eef2ff' : 'transparent',
            }}
          >
            <strong>{c.phone}</strong>
            <div className="gt-muted">
              {c.botEnabled ? 'Bot activo' : 'Modo manual'}
            </div>
          </button>
        ))}
        {chats && chats.length === 0 && (
          <div className="gt-muted" style={{ padding: 12 }}>
            Sin conversaciones.
          </div>
        )}
      </div>

      <div className="gt-card" style={{ display: 'grid', gap: 12 }}>
        {!selected && <span className="gt-muted">Selecciona un chat.</span>}
        {selected && (
          <>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button
                className="gt-btn"
                onClick={() => toggleBot(selected, false)}
              >
                Tomar control (bot OFF)
              </button>
              <button
                className="gt-btn"
                onClick={() => toggleBot(selected, true)}
              >
                Devolver al bot (bot ON)
              </button>
            </div>
            <div
              style={{
                display: 'grid',
                gap: 8,
                maxHeight: 360,
                overflowY: 'auto',
              }}
            >
              {messages?.map((m) => (
                <div
                  key={m.id}
                  style={{
                    justifySelf:
                      m.direction === 'OUTBOUND' ? 'end' : 'start',
                    background:
                      m.direction === 'OUTBOUND' ? '#dbeafe' : '#f1f5f9',
                    padding: '6px 10px',
                    borderRadius: 8,
                    maxWidth: '70%',
                  }}
                >
                  <div className="gt-muted" style={{ fontSize: 11 }}>
                    {m.senderType}
                  </div>
                  {m.content ?? `[${m.messageType}]`}
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                className="gt-input"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="Escribe un mensaje..."
                onKeyDown={(e) => e.key === 'Enter' && send()}
              />
              <button className="gt-btn" onClick={send}>
                Enviar
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        background: 'none',
        border: 'none',
        borderBottom: active
          ? '2px solid var(--primary)'
          : '2px solid transparent',
        padding: '8px 12px',
        color: active ? 'var(--primary)' : 'var(--text)',
      }}
    >
      {children}
    </button>
  );
}
