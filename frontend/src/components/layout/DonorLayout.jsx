import { useState, useEffect } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { Bell } from 'lucide-react';
import Sidebar from './Sidebar';
import { connectSocket } from '../../utils/socket';
import './layout.css';

const PAGE_TITLES = {
  '/donor': { title: 'Donor Dashboard', sub: 'Your donation activity and status' },
  '/donor/alerts': { title: 'Emergency Alerts', sub: 'Incoming blood requests near you' },
  '/donor/profile': { title: 'Profile & Medical Info', sub: 'Update your blood group and health data' },
  '/donor/achievements': { title: 'Achievements', sub: 'Your donation journey and rewards' },
};

export default function DonorLayout() {
  const [collapsed, setCollapsed] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const location = useLocation();
  const page = PAGE_TITLES[location.pathname] || { title: 'Donor', sub: '' };

  useEffect(() => {
    const socket = connectSocket();
    if (!socket) return;
    
    const handleEvent = () => setUnreadCount(c => c + 1);
    
    socket.on('new_emergency', handleEvent);
    socket.on('assignment_confirmed', handleEvent);
    socket.on('promoted_to_primary', handleEvent);

    return () => {
      socket.off('new_emergency', handleEvent);
      socket.off('assignment_confirmed', handleEvent);
      socket.off('promoted_to_primary', handleEvent);
    };
  }, []);

  return (
    <div className="app-shell" style={{ '--accent': 'var(--color-donor)', '--accent-glow': 'rgba(220,38,38,0.25)' }}>
      <Sidebar role="donor" collapsed={collapsed} onToggle={() => setCollapsed(p => !p)} />
      <div className={`app-content ${collapsed ? 'collapsed' : ''}`}>
        <header className="topbar">
          <div className="topbar-left">
            <div>
              <p className="topbar-title">{page.title}</p>
              <p className="topbar-sub">{page.sub}</p>
            </div>
          </div>
          <div className="topbar-right">
            <button className="notif-btn" onClick={() => setUnreadCount(0)}>
              <Bell size={16} />
              <span className="notif-badge" style={{ display: unreadCount > 0 ? 'flex' : 'none' }}>{unreadCount}</span>
            </button>
            <div className="avatar" style={{ background: 'var(--color-donor-dark)', color: 'white', width: 36, height: 36, fontSize: '0.75rem' }}>RK</div>
          </div>
        </header>
        <main className="page-wrapper fade-in">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
