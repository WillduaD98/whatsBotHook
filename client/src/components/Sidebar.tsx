import React, { useEffect, useState } from 'react';
import { apiFetch, Conversation } from '../types';

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
              <div className="conversation-name">{conv.waId}</div>
              <div className="conversation-last-msg">
                {/* Mostramos el ESTADO (stage) para que el asesor vea dónde está el cliente */}
                <span className={`status-badge ${conv.stage === 'ASESOR' ? 'status-asesor' : ''}`}>
                  {conv.stage}
                </span>
                {conv.verificationStatus === 'PRE_SOLICITUD_COMPLETA' && (
                  <span style={{ marginLeft: '8px', padding: '2px 6px', borderRadius: '4px', backgroundColor: '#4caf50', color: 'white', fontSize: '0.85em', fontWeight: 'bold' }}>
                    ✅ PRE-SOLICITUD COMPLETA
                  </span>
                )}
                {conv.subscriptionStatus === 'SUSCRITO' && (
                  <span style={{ marginLeft: '8px', padding: '2px 6px', borderRadius: '4px', backgroundColor: '#1976d2', color: 'white', fontSize: '0.85em', fontWeight: 'bold' }}>
                    Suscrito
                  </span>
                )}
                {conv.lastIntent && <span style={{fontSize:'0.85em', marginLeft:'6px', color:'#888'}}>({conv.lastIntent})</span>}
              </div>
            </div>
            <div className="conversation-meta">
              {new Date(conv.updatedAt).toLocaleDateString()}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
