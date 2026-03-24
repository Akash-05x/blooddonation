import { useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { Bell } from 'lucide-react';
import Sidebar from './Sidebar';
import './layout.css';

const PAGE_TITLES = {
  '/hospital': { title: 'Hospital Dashboard', sub: 'Manage emergency blood requests' },
  '/hospital/request': { title: 'New Emergency Request', sub: 'Submit a new blood request' },
  '/hospital/tracking': { title: 'Donor Tracking', sub: 'Live location of assigned donor' },
  '/hospital/history': { title: 'Request History', sub: 'Past emergency requests and outcomes' },
};

export default function HospitalLayout() {
  const [collapsed, setCollapsed] = useState(false);
  const location = useLocation();
  const page = PAGE_TITLES[location.pathname] || { title: 'Hospital', sub: '' };

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
            <button className="notif-btn">
              <Bell size={16} />
              <span className="notif-badge">1</span>
            </button>
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
