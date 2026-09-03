import React, { useEffect, useState } from 'react';
import { apiFetch, Conversation } from '../types';

function sidebarTime(dateStr?: string): string {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return '';
  const now = new Date();
  const yest = new Date(now); yest.setDate(now.getDate() - 1);
  const eq = (x: Date, y: Date) => x.getFullYear() === y.getFullYear() && x.getMonth() === y.getMonth() && x.getDate() === y.getDate();
  if (eq(d, now)) return d.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
  if (eq(d, yest)) return 'Ayer';
  return d.toLocaleDateString('es-MX', { day: '2-digit', month: '2-digit', year: '2-digit' });
}

function previewText(conv: Conversation): string {
  const type = conv.lastMessageType;
  let body = '';
  if (type === 'image') body = '📷 Foto';
  else if (type === 'document') body = '📄 Documento';
  else if (type === 'template') body = '📋 Plantilla';
  else if (type === 'audio') body = '🎤 Audio';
  else if (type === 'location') body = '📍 Ubicación';
  else body = (conv.lastMessageText || '').replace(/\n/g, ' ').trim();
  if (!body) body = '—';
  const prefix = conv.lastMessageDirection === 'outgoing' ? 'Tú: ' : '';
  return prefix + body;
}

interface SidebarProps {
  onSelectConversation: (conversation: Conversation) => void;
  selectedConversationId?: string;
  authToken: string;
  onUnauthorized: () => void;
  onLogout: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ onSelectConversation, selectedConversationId, authToken, onUnauthorized, onLogout }) => {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    const fetchConvs = () => {
      apiFetch('/api/conversations', { token: authToken })
        .then(async (res) => {
          if (res.status === 401) {
            onUnauthorized();
            return;
          }
          const data = (await res.json()) as Conversation[];
          setConversations(data);
          setLoading(false);
        })
        .catch(() => setLoading(false));
    };

    fetchConvs();
    const interval = setInterval(fetchConvs, 5000); // Polling cada 5s para ver cambios de estado
    return () => clearInterval(interval);
  }, [authToken, onUnauthorized]);

  if (loading) return <div className="sidebar">Loading...</div>;

  const query = searchTerm.replace(/\D/g, '');
  const filteredConversations = query
    ? conversations.filter((conv) => {
        const digits = String(conv.waId || '').replace(/\D/g, '');
        const noCountry = digits.startsWith('52') ? digits.slice(2) : digits;
        return digits.includes(query) || noCountry.includes(query);
      })
    : conversations;

  return (
    <div className="sidebar">
      <div className="sidebar-header" style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        <h2>Chats</h2>
        <button
          onClick={onLogout}
          style={{
            marginLeft: 'auto',
            padding: '6px 10px',
            borderRadius: '8px',
            border: '1px solid #e6e8ee',
            background: 'white',
            cursor: 'pointer',
            fontSize: '12px',
            fontWeight: 700
          }}
          aria-label="Cerrar sesión"
          title="Cerrar sesión"
        >
          Cerrar sesión
        </button>
      </div>
      <div className="sidebar-search">
        <input
          type="text"
          className="sidebar-search-input"
          placeholder="Buscar por número…"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
      </div>
      <div className="sidebar-content">
        {filteredConversations.map(conv => (
          <div 
            key={conv._id} 
            className={`conversation-item ${selectedConversationId === conv._id ? 'active' : ''}`}
            onClick={() => onSelectConversation(conv)}
          >
            <div className="avatar">👤</div>
            <div className="conversation-info">
              <div className="conversation-row">
                <div className="conversation-name">{conv.waId}</div>
                <div className="conversation-time">{sidebarTime(conv.lastMessageAt || conv.updatedAt)}</div>
              </div>
              <div className="conversation-preview">{previewText(conv)}</div>
              <div className="conversation-badges">
                <span className={`status-badge ${conv.stage === 'ASESOR' ? 'status-asesor' : ''}`}>
                  {conv.stage}
                </span>
                {conv.verificationStatus === 'PRE_SOLICITUD_COMPLETA' && (
                  <span className="mini-badge mini-badge--ok">✅ PRE-SOL COMPLETA</span>
                )}
                {conv.subscriptionStatus === 'SUSCRITO' && (
                  <span className="mini-badge mini-badge--sub">🔔 Suscrito</span>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
