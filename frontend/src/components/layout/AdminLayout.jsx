import { useState, useEffect } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { Bell, Menu } from 'lucide-react';
import Sidebar from './Sidebar';
import { connectSocket } from '../../utils/socket';
import './layout.css';

const PAGE_TITLES = {
  '/admin': { title: 'Dashboard', sub: 'System overview and live stats' },
  '/admin/hospitals': { title: 'Hospital Management', sub: 'Monitor and manage hospital accounts' },
  '/admin/donors': { title: 'Donor Management', sub: 'Monitor and manage donor accounts' },
  '/admin/requests': { title: 'Emergency Monitoring', sub: 'Live emergency request tracking' },
  '/admin/analytics': { title: 'Analytics & Reports', sub: 'System performance and insights' },
  '/admin/config': { title: 'System Configuration', sub: 'Configure AI weights and rules' },
};

export default function AdminLayout() {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const location = useLocation();
  const page = PAGE_TITLES[location.pathname] || { title: 'Admin', sub: '' };

  useEffect(() => {
    const socket = connectSocket();
    if (!socket) return;
    
    const handleEvent = () => setUnreadCount(c => c + 1);
    
    socket.on('new_emergency_request', handleEvent);
    socket.on('failover_alert', handleEvent);
    socket.on('new_registration', handleEvent);
    socket.on('donor_location_update', handleEvent);

    return () => {
      socket.off('new_emergency_request', handleEvent);
      socket.off('failover_alert', handleEvent);
      socket.off('new_registration', handleEvent);
      socket.off('donor_location_update', handleEvent);
    };
  }, []);

  return (
    <div className="app-shell" style={{ '--accent': 'var(--color-admin)', '--accent-glow': 'var(--color-admin-glow)' }}>
      <Sidebar role="admin" collapsed={collapsed} onToggle={() => setCollapsed(p => !p)} />
      <div className={`app-content ${collapsed ? 'collapsed' : ''}`}>
        {/* Topbar */}
        <header className="topbar">
          <div className="topbar-left">
            <button className="btn-icon btn-ghost" style={{ display: 'none' }} onClick={() => setMobileOpen(p => !p)}>
              <Menu size={18} />
            </button>
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
            <div className="avatar" style={{ background: 'var(--color-admin-dark)', color: 'white', width: 36, height: 36, fontSize: '0.75rem' }}>AS</div>
          </div>
        </header>
        <main className="page-wrapper fade-in">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
