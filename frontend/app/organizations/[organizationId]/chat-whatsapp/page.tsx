'use client';

import { useParams } from 'next/navigation';
import { useState, useEffect, useRef } from 'react';
import { useWhatsappChats, useWhatsappMessages } from '../../../../hooks/useWhatsappChats';
import { whatsappApi } from '../../../../services/api/whatsapp.api';
import { TemplatesManager } from '../../../../components/whatsapp/TemplatesManager';

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
        <TemplatesManager organizationId={params.organizationId} />
      )}
    </main>
  );
}

function fmtDatetime(iso: string) {
  return new Date(iso).toLocaleString([], {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function ChatsView({ organizationId }: { organizationId: string }) {
  const { data: chats, loading, error: chatsError, reload: reloadChats } = useWhatsappChats(organizationId);
  const [selected, setSelected] = useState<string | null>(null);
  const { data: messages, loading: loadingMessages, error: messagesError, reload } = useWhatsappMessages(selected);
  const [draft, setDraft] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const selectedChat = chats?.find((c) => c.id === selected);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  async function send() {
    if (!selected || !draft.trim()) return;
    await whatsappApi.sendMessage(selected, draft.trim());
    setDraft('');
    reload();
  }

  async function toggleBot(chatId: string, enabled: boolean) {
    await whatsappApi.toggleBot(chatId, enabled);
    reloadChats();
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '280px 1fr', gap: 16 }}>
      <div className="gt-card" style={{ padding: 0 }}>
        {loading && <div style={{ padding: 12 }}>Cargando chats...</div>}
        {chatsError && (
          <div style={{ padding: 12, color: 'var(--mantine-color-red-6, #e03131)', fontSize: 13 }}>
            Error al cargar: {chatsError}
          </div>
        )}
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
              background: selected === c.id ? 'rgba(59, 130, 246, 0.18)' : 'transparent',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 4 }}>
              <strong style={{ fontSize: 13 }}>{c.phone}</strong>
              {c.lastMessageAt && (
                <span style={{ fontSize: 10, color: 'var(--text-dimmed, #888)', whiteSpace: 'nowrap' }}>
                  {fmtDatetime(c.lastMessageAt)}
                </span>
              )}
            </div>
            {c.lastMessagePreview && (
              <div style={{ fontSize: 12, color: 'var(--text-dimmed, #888)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {c.lastMessagePreview}
              </div>
            )}
            <div className="gt-muted" style={{ fontSize: 11, marginTop: 2 }}>
              {c.botEnabled ? 'Bot activo' : 'Modo manual'}
            </div>
          </button>
        ))}
        {!loading && !chatsError && chats && chats.length === 0 && (
          <div className="gt-muted" style={{ padding: 12 }}>
            Sin conversaciones.
          </div>
        )}
      </div>

      <div className="gt-card" style={{ display: 'grid', gap: 12 }}>
        {!selected && <span className="gt-muted">Selecciona un chat.</span>}
        {selected && (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <button
                onClick={() => toggleBot(selected, !(selectedChat?.botEnabled ?? true))}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '6px 14px',
                  border: 'none',
                  borderRadius: 20,
                  cursor: 'pointer',
                  fontWeight: 600,
                  fontSize: 13,
                  background: (selectedChat?.botEnabled ?? true) ? 'var(--mantine-color-green-6, #2f9e44)' : 'var(--mantine-color-gray-5, #adb5bd)',
                  color: '#fff',
                  transition: 'background 0.2s',
                }}
              >
                <span style={{
                  width: 10,
                  height: 10,
                  borderRadius: '50%',
                  background: '#fff',
                  opacity: (selectedChat?.botEnabled ?? true) ? 1 : 0.5,
                  display: 'inline-block',
                }} />
                {(selectedChat?.botEnabled ?? true) ? 'Bot activo' : 'Bot inactivo'}
              </button>
            </div>
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 8,
                maxHeight: 400,
                overflowY: 'auto',
                padding: '4px 2px',
              }}
            >
              {loadingMessages && (
                <span className="gt-muted" style={{ fontSize: 13, padding: 4 }}>Cargando mensajes...</span>
              )}
              {messagesError && (
                <span style={{ fontSize: 13, color: 'var(--mantine-color-red-6, #e03131)', padding: 4 }}>
                  Error al cargar mensajes: {messagesError}
                </span>
              )}
              {!loadingMessages && !messagesError && messages && messages.length === 0 && (
                <span className="gt-muted" style={{ fontSize: 13, padding: 4 }}>Sin mensajes aún.</span>
              )}
              {messages?.map((m) => {
                const isOut = m.direction === 'OUTBOUND';
                return (
                  <div
                    key={m.id}
                    style={{
                      display: 'flex',
                      justifyContent: isOut ? 'flex-end' : 'flex-start',
                    }}
                  >
                    <div
                      style={{
                        maxWidth: '70%',
                        padding: '8px 12px',
                        borderRadius: isOut ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
                        background: isOut ? '#2563eb' : '#f1f3f5',
                        color: isOut ? '#fff' : '#1a1a1a',
                        boxShadow: '0 1px 2px rgba(0,0,0,0.1)',
                      }}
                    >
                      <div style={{ fontSize: 10, marginBottom: 3, opacity: 0.7, fontWeight: 600 }}>
                        {m.senderType}
                      </div>
                      <div style={{ fontSize: 14, lineHeight: 1.4 }}>
                        {m.content ?? `[${m.messageType}]`}
                      </div>
                      <div style={{ fontSize: 10, marginTop: 4, opacity: 0.65, textAlign: isOut ? 'right' : 'left' }}>
                        {fmtDatetime(m.createdAt)}
                      </div>
                    </div>
                  </div>
                );
              })}
              <div ref={messagesEndRef} />
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
