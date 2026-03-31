import { useState, useEffect } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { Bell } from 'lucide-react';
import Sidebar from './Sidebar';
import { connectSocket } from '../../utils/socket';
import './layout.css';

const PAGE_TITLES = {
  '/hospital': { title: 'Hospital Dashboard', sub: 'Manage emergency blood requests' },
  '/hospital/request': { title: 'New Emergency Request', sub: 'Submit a new blood request' },
  '/hospital/tracking': { title: 'Donor Tracking', sub: 'Live location of assigned donor' },
  '/hospital/history': { title: 'Request History', sub: 'Past emergency requests and outcomes' },
};

export default function HospitalLayout() {
  const [collapsed, setCollapsed] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [notifications, setNotifications] = useState([]);
  const [showNotifs, setShowNotifs] = useState(false);
  const location = useLocation();
  const page = PAGE_TITLES[location.pathname] || { title: 'Hospital', sub: '' };

  useEffect(() => {
    const socket = connectSocket();
    if (!socket) return;
    const handleEvent = (data) => {
      setUnreadCount(c => c + 1);
      const msg = (data && data.message) ? data.message : 'New update on your emergency request.';
      setNotifications(prev => [{ id: Date.now() + Math.random(), message: msg, time: Date.now(), read: false }, ...prev].slice(0, 10));
    };
    socket.on('donor_location_update', handleEvent);
    socket.on('donor_response', handleEvent);
    socket.on('request_status_change', handleEvent);
    socket.on('failover_alert', handleEvent);
    socket.on('EmergencyRequestCreated', handleEvent);

    return () => {
      socket.off('donor_location_update', handleEvent);
      socket.off('donor_response', handleEvent);
      socket.off('request_status_change', handleEvent);
      socket.off('failover_alert', handleEvent);
      socket.off('EmergencyRequestCreated', handleEvent);
    };
  }, []);

  return (
    <div className="app-shell" style={{ '--accent': 'var(--color-hospital)', '--accent-glow': 'var(--color-hospital-glow)' }}>
      <Sidebar role="hospital" collapsed={collapsed} onToggle={() => setCollapsed(p => !p)} />
      <div className={`app-content ${collapsed ? 'collapsed' : ''}`}>
        <header className="topbar">
          <div className="topbar-left">
            <div>
              <p className="topbar-title">{page.title}</p>
              <p className="topbar-sub">{page.sub}</p>
            </div>
          </div>
          <div className="topbar-right">
            <div style={{ position: 'relative' }}>
              <button className="notif-btn" onClick={() => { setUnreadCount(0); setShowNotifs(p => !p); }}>
                <Bell size={16} />
                <span className="notif-badge" style={{ display: unreadCount > 0 ? 'flex' : 'none' }}>{unreadCount}</span>
              </button>

              {showNotifs && (
                <div style={{ position: 'absolute', top: 48, right: 0, width: 320, background: 'var(--color-bg-2)', border: '1px solid var(--color-border)', borderRadius: 16, boxShadow: '0 12px 30px rgba(0,0,0,0.3)', zIndex: 100, overflow: 'hidden' }}>
                  <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--color-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <h3 style={{ fontSize: '1rem', fontWeight: 800 }}>Notifications</h3>
                    <button style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-hospital)', fontSize: '0.8rem', fontWeight: 600 }} onClick={() => setNotifications([])}>Clear All</button>
                  </div>
                  <div style={{ maxHeight: 360, overflowY: 'auto' }}>
                    {notifications.length === 0 ? (
                      <p style={{ padding: 30, textAlign: 'center', color: 'var(--color-muted)', fontSize: '0.9rem' }}>No new notifications</p>
                    ) : (
                      notifications.map(n => (
                        <div key={n.id} style={{ padding: '14px 20px', borderBottom: '1px solid var(--color-border)', display: 'flex', gap: 12, alignItems: 'flex-start', background: n.read ? 'transparent' : 'rgba(2,132,199,0.05)', cursor: 'pointer' }} onClick={() => setNotifications(p => p.map(x => x.id === n.id ? { ...x, read: true } : x))}>
                          <div style={{ padding: 8, borderRadius: '50%', background: 'rgba(2,132,199,0.1)', color: 'var(--color-hospital)', flexShrink: 0 }}><Bell size={14}/></div>
                          <div>
                            <p style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--color-text)', lineHeight: 1.4 }}>{n.message}</p>
                            <p style={{ fontSize: '0.72rem', color: 'var(--color-muted)', marginTop: 4 }}>{new Date(n.time).toLocaleTimeString()}</p>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>
            <div className="avatar" style={{ background: 'var(--color-hospital-dark)', color: 'white', width: 36, height: 36, fontSize: '0.75rem' }}>AH</div>
          </div>
        </header>
        <main className="page-wrapper fade-in">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
