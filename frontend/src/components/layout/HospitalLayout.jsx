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
  const [selectedNotif, setSelectedNotif] = useState(null);
  const location = useLocation();
  const page = PAGE_TITLES[location.pathname] || { title: 'Hospital', sub: '' };

  useEffect(() => {
    const socket = connectSocket();
    if (!socket) return;
    const handleEvent = (data) => {
      setUnreadCount(c => c + 1);
      const msg = (data && data.message) ? data.message : 'New update on your emergency request.';
      setNotifications(prev => [{ 
        id: Date.now() + Math.random(), 
        message: msg, 
        time: Date.now(), 
        read: false,
        requestId: data?.requestId || null,
        type: data?.type || 'update'
      }, ...prev].slice(0, 20));
    };
    socket.on('donor_location_update', handleEvent);
    socket.on('donor_response', (data) => handleEvent({ ...data, type: 'response' }));
    socket.on('request_status_change', handleEvent);
    socket.on('failover_alert', handleEvent);
    socket.on('EmergencyRequestCreated', handleEvent);
    socket.on('request_timeout', (data) => handleEvent({ ...data, type: 'timeout' }));

    return () => {
      socket.off('donor_location_update', handleEvent);
      socket.off('donor_response');
      socket.off('request_status_change', handleEvent);
      socket.off('failover_alert', handleEvent);
      socket.off('EmergencyRequestCreated', handleEvent);
      socket.off('request_timeout');
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
                    {notifications.filter(n => !n.read).length === 0 ? (
                      <p style={{ padding: 30, textAlign: 'center', color: 'var(--color-muted)', fontSize: '0.9rem' }}>No new notifications</p>
                    ) : (
                      notifications.filter(n => !n.read).map(n => (
                        <div key={n.id} style={{ padding: '14px 20px', borderBottom: '1px solid var(--color-border)', display: 'flex', gap: 12, alignItems: 'flex-start', background: 'rgba(2,132,199,0.05)', cursor: 'pointer' }} 
                          onClick={() => {
                            setNotifications(p => p.map(x => x.id === n.id ? { ...x, read: true } : x));
                            setSelectedNotif(n);
                            setShowNotifs(false);
                          }}>
                          <div style={{ padding: 8, borderRadius: '50%', background: n.type === 'timeout' ? 'rgba(239,68,68,0.1)' : 'rgba(2,132,199,0.1)', color: n.type === 'timeout' ? '#ef4444' : 'var(--color-hospital)', flexShrink: 0 }}><Bell size={14}/></div>
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

        {selectedNotif && (
          <div className="modal-overlay" style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }} onClick={() => setSelectedNotif(null)}>
            <div className="modal-content" style={{ background: 'var(--color-bg-2)', border: '1px solid var(--color-border)', borderRadius: 24, padding: 32, width: '90%', maxWidth: 450, boxShadow: '0 20px 50px rgba(0,0,0,0.5)', position: 'relative' }} onClick={e => e.stopPropagation()}>
              <div style={{ position: 'absolute', top: 20, right: 24, fontSize: '1.5rem', cursor: 'pointer', color: 'var(--color-muted)' }} onClick={() => setSelectedNotif(null)}>&times;</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 20, alignItems: 'center', textAlign: 'center' }}>
                <div style={{ width: 64, height: 64, borderRadius: '50%', background: selectedNotif.type === 'timeout' ? 'rgba(239,68,68,0.1)' : 'rgba(2,132,199,0.1)', color: selectedNotif.type === 'timeout' ? '#ef4444' : 'var(--color-hospital)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Bell size={28} />
                </div>
                <div>
                  <h2 style={{ fontSize: '1.25rem', fontWeight: 800, marginBottom: 8 }}>Notification Detail</h2>
                  <p style={{ fontSize: '0.9rem', color: 'var(--color-muted)' }}>{new Date(selectedNotif.time).toLocaleString()}</p>
                </div>
                <div style={{ padding: 20, background: 'var(--color-bg-1)', borderRadius: 16, width: '100%', border: '1px solid var(--color-border)' }}>
                  <p style={{ fontSize: '1rem', lineHeight: 1.6, color: 'var(--color-text)' }}>{selectedNotif.message}</p>
                  {selectedNotif.requestId && (
                    <p style={{ marginTop: 12, fontSize: '0.8rem', color: 'var(--color-hospital)', fontWeight: 600 }}>Request ID: {selectedNotif.requestId}</p>
                  )}
                </div>
                <button className="primary-btn" style={{ width: '100%', marginTop: 8 }} onClick={() => setSelectedNotif(null)}>Close</button>
              </div>
            </div>
          </div>
        )}

        <main className="page-wrapper fade-in">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
