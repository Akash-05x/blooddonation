import { useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { Bell, Menu } from 'lucide-react';
import Sidebar from './Sidebar';
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
  const location = useLocation();
  const page = PAGE_TITLES[location.pathname] || { title: 'Admin', sub: '' };

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
            <button className="notif-btn">
              <Bell size={16} />
              <span className="notif-badge">3</span>
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
