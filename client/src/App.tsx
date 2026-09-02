import { useCallback, useEffect, useState } from 'react';
import { Sidebar } from './components/Sidebar';
import { ChatWindow } from './components/ChatWindow';
import { StatsPanel } from './components/StatsPanel';
import { BulkBroadcastPanel } from './components/BulkBroadcastPanel';
import { WeeklyTipAdminPanel } from './components/WeeklyTipAdminPanel';
import { apiFetch, Conversation } from './types';
import './index.css';

const IDLE_TIMEOUT_MS = 15 * 60 * 1000;
const ABSOLUTE_SESSION_TIMEOUT_MS = 8 * 60 * 60 * 1000;

function App() {
  const [selectedConversation, setSelectedConversation] = useState<Conversation | null>(null);
  const [path, setPath] = useState(() => window.location.pathname || '/');
  const [authToken, setAuthToken] = useState<string | null>(() => localStorage.getItem('authToken'));
  const [loginUsername, setLoginUsername] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginError, setLoginError] = useState<string | null>(null);
  const [loginLoading, setLoginLoading] = useState(false);
  const [loginCooldownUntil, setLoginCooldownUntil] = useState<number | null>(null);

  useEffect(() => {
    const onPopState = () => setPath(window.location.pathname || '/');
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  const navigate = useCallback((nextPath: string) => {
    const target = nextPath.startsWith('/') ? nextPath : `/${nextPath}`;
    if (window.location.pathname === target) return;
    window.history.pushState({}, '', target);
    setPath(target);
  }, []);

  const handleUnauthorized = useCallback(() => {
    localStorage.removeItem('authToken');
    localStorage.removeItem('authLoginAt');
    localStorage.removeItem('authLastActivityAt');
    setAuthToken(null);
    setSelectedConversation(null);
    setLoginPassword('');
    navigate('/login');
  }, [navigate]);

  useEffect(() => {
    if (!authToken && path !== '/login') navigate('/login');
    if (authToken && path === '/login') navigate('/');
  }, [authToken, navigate, path]);

  useEffect(() => {
    if (!authToken) return;

    const now = Date.now();
    const loginAtRaw = localStorage.getItem('authLoginAt');
    const lastActivityAtRaw = localStorage.getItem('authLastActivityAt');

    const loginAt = loginAtRaw ? Number(loginAtRaw) : now;
    const lastActivityAt = lastActivityAtRaw ? Number(lastActivityAtRaw) : now;

    if (!loginAtRaw) localStorage.setItem('authLoginAt', String(loginAt));
    if (!lastActivityAtRaw) localStorage.setItem('authLastActivityAt', String(lastActivityAt));

    let lastActivity = Number.isFinite(lastActivityAt) ? lastActivityAt : now;
    let lastWrite = 0;

    const markActivity = () => {
      const t = Date.now();
      lastActivity = t;
      if (t - lastWrite > 5_000) {
        localStorage.setItem('authLastActivityAt', String(t));
        lastWrite = t;
      }
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') markActivity();
    };

    const interval = window.setInterval(() => {
      const t = Date.now();
      const effectiveLoginAt = Number(localStorage.getItem('authLoginAt')) || loginAt;
      const effectiveLastActivity =
        Number(localStorage.getItem('authLastActivityAt')) || lastActivity;

      if (t - effectiveLastActivity > IDLE_TIMEOUT_MS) {
        handleUnauthorized();
        return;
      }

      if (t - effectiveLoginAt > ABSOLUTE_SESSION_TIMEOUT_MS) {
        handleUnauthorized();
        return;
      }
    }, 10_000);

    window.addEventListener('mousemove', markActivity, { passive: true });
    window.addEventListener('mousedown', markActivity, { passive: true });
    window.addEventListener('keydown', markActivity);
    window.addEventListener('scroll', markActivity, { passive: true });
    window.addEventListener('touchstart', markActivity, { passive: true });
    window.addEventListener('focus', markActivity);
    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      window.clearInterval(interval);
      window.removeEventListener('mousemove', markActivity);
      window.removeEventListener('mousedown', markActivity);
      window.removeEventListener('keydown', markActivity);
      window.removeEventListener('scroll', markActivity);
      window.removeEventListener('touchstart', markActivity);
      window.removeEventListener('focus', markActivity);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [authToken, handleUnauthorized]);

  const onLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loginLoading) return;
    setLoginLoading(true);
    setLoginError(null);
    try {
      const res = await apiFetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: loginUsername.trim(), password: loginPassword })
      });
      if (res.status === 429) {
        setLoginError('Demasiados intentos. Intenta más tarde.');
        setLoginCooldownUntil(Date.now() + 30_000);
        return;
      }
      if (!res.ok) {
        setLoginError('Usuario o contraseña incorrectos');
        return;
      }
      const json = (await res.json()) as { token?: unknown };
      if (typeof json.token !== 'string' || !json.token) {
        setLoginError('Respuesta inválida del servidor');
        return;
      }
      const now = Date.now();
      localStorage.setItem('authToken', json.token);
      localStorage.setItem('authLoginAt', String(now));
      localStorage.setItem('authLastActivityAt', String(now));
      setAuthToken(json.token);
      setLoginPassword('');
      navigate('/');
    } catch {
      setLoginError('Error de conexión al iniciar sesión');
    } finally {
      setLoginLoading(false);
    }
  };

  if (!authToken) {
    return (
      <div
        className="app-container"
        style={{
          alignItems: 'center',
          justifyContent: 'center',
          padding: '20px'
        }}
      >
        <form
          onSubmit={onLogin}
          style={{
            width: '100%',
            maxWidth: '420px',
            border: '1px solid #e6e8ee',
            borderRadius: '12px',
            padding: '18px',
            background: 'white'
          }}
        >
          <div style={{ fontSize: '20px', fontWeight: 700, marginBottom: '6px' }}>Login</div>
          <div style={{ color: '#576071', marginBottom: '14px' }}>Ingresa tus credenciales para continuar</div>

          <div style={{ display: 'grid', gap: '10px' }}>
            <div style={{ display: 'grid', gap: '6px' }}>
              <label style={{ fontSize: '12px', color: '#576071' }}>Usuario</label>
              <input
                type="text"
                value={loginUsername}
                onChange={(e) => setLoginUsername(e.target.value)}
                autoComplete="username"
                required
                disabled={loginLoading}
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  borderRadius: '10px',
                  border: '1px solid #dfe3ea'
                }}
              />
            </div>

            <div style={{ display: 'grid', gap: '6px' }}>
              <label style={{ fontSize: '12px', color: '#576071' }}>Contraseña</label>
              <input
                type="password"
                value={loginPassword}
                onChange={(e) => setLoginPassword(e.target.value)}
                autoComplete="current-password"
                required
                disabled={loginLoading}
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  borderRadius: '10px',
                  border: '1px solid #dfe3ea'
                }}
              />
            </div>
          </div>

          {loginError && (
            <div style={{ marginTop: '12px', color: '#b00020', fontSize: '14px' }}>{loginError}</div>
          )}

          <button
            type="submit"
            disabled={loginLoading || (loginCooldownUntil !== null && Date.now() < loginCooldownUntil)}
            style={{
              marginTop: '14px',
              width: '100%',
              padding: '10px 12px',
              borderRadius: '10px',
              border: 'none',
              background: '#008069',
              color: 'white',
              fontWeight: 700,
              cursor: loginLoading || (loginCooldownUntil !== null && Date.now() < loginCooldownUntil) ? 'not-allowed' : 'pointer'
            }}
          >
            {loginLoading ? 'Ingresando...' : 'Login'}
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className={`app-container ${selectedConversation || path !== '/' ? 'has-selection' : ''}`}>
      <Sidebar 
        onSelectConversation={setSelectedConversation} 
        selectedConversationId={selectedConversation?._id}
        authToken={authToken}
        onUnauthorized={handleUnauthorized}
        onLogout={handleUnauthorized}
      />
      {path === '/stats' ? (
        <StatsPanel onNavigate={navigate} authToken={authToken} onUnauthorized={handleUnauthorized} />
      ) : path === '/broadcast' ? (
        <BulkBroadcastPanel onNavigate={navigate} authToken={authToken} onUnauthorized={handleUnauthorized} />
      ) : path === '/weekly-tip' ? (
        <WeeklyTipAdminPanel onNavigate={navigate} authToken={authToken} onUnauthorized={handleUnauthorized} />
      ) : (
        <ChatWindow conversation={selectedConversation} authToken={authToken} onUnauthorized={handleUnauthorized} onBack={() => setSelectedConversation(null)} />
      )}
      <button
        className="floating-action-button floating-stats-button"
        onClick={() => navigate('/stats')}
        aria-label="Abrir estadísticas"
        title="Estadísticas"
      >
        📊
      </button>
      <button
        className="floating-action-button floating-broadcast-button"
        onClick={() => navigate('/broadcast')}
        aria-label="Abrir envío masivo"
        title="Envío masivo"
      >
        📣
      </button>
      <button
        className="floating-action-button floating-weekly-tip-button"
        onClick={() => navigate('/weekly-tip')}
        aria-label="Abrir consejo activo"
        title="Consejo activo"
      >
        💡
      </button>
    </div>
  );
}

export default App;
