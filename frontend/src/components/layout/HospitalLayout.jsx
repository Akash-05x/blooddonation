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
  const location = useLocation();
  const page = PAGE_TITLES[location.pathname] || { title: 'Hospital', sub: '' };

  useEffect(() => {
    const socket = connectSocket();
    if (!socket) return;
    
    const handleEvent = () => setUnreadCount(c => c + 1);
    
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
            <button className="notif-btn" onClick={() => setUnreadCount(0)}>
              <Bell size={16} />
              <span className="notif-badge" style={{ display: unreadCount > 0 ? 'flex' : 'none' }}>{unreadCount}</span>
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
