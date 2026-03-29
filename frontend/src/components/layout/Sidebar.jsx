import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, Hospital, Users, Activity, BarChart3, Settings,
  Bell, Heart, User, Trophy, LogOut, X, Menu, Droplets, ChevronRight
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useState, useEffect } from 'react';
import { connectSocket } from '../../utils/socket';

const NAV_CONFIG = {
  admin: {
    label: 'Admin Panel',
    accent: 'var(--color-admin)',
    accentGlow: 'var(--color-admin-glow)',
    links: [
      { to: '/admin',           icon: LayoutDashboard, label: 'Dashboard'     },
      { to: '/admin/hospitals', icon: Hospital,         label: 'Hospitals'     },
      { to: '/admin/donors',    icon: Users,            label: 'Donors'        },
      { to: '/admin/requests',  icon: Activity,         label: 'Emergencies'   },
      { to: '/admin/analytics', icon: BarChart3,        label: 'Analytics'     },
      { to: '/admin/config',    icon: Settings,         label: 'Configuration' },
    ],
  },
  hospital: {
    label: 'Hospital Portal',
    accent: 'var(--color-hospital)',
    accentGlow: 'var(--color-hospital-glow)',
    links: [
      { to: '/hospital',          icon: LayoutDashboard, label: 'Dashboard'      },
      { to: '/hospital/request',  icon: Droplets,        label: 'New Request'    },
      { to: '/hospital/tracking', icon: Activity,        label: 'Track Donor'    },
      { to: '/hospital/history',  icon: BarChart3,       label: 'History'        },
    ],
  },
  donor: {
    label: 'Donor Portal',
    accent: 'var(--color-donor)',
    accentGlow: 'rgba(220,38,38,0.25)',
    links: [
      { to: '/donor',             icon: LayoutDashboard, label: 'Dashboard'      },
      { to: '/donor/alerts',      icon: Bell,            label: 'Alerts'         },
      { to: '/donor/profile',     icon: User,            label: 'Profile'        },
      { to: '/donor/achievements',icon: Trophy,          label: 'Achievements'   },
    ],
  },
};

export default function Sidebar({ role, collapsed, onToggle }) {
  const { logout, user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const config = NAV_CONFIG[role] || NAV_CONFIG.admin;
  const [hasAlert, setHasAlert] = useState(false);

  useEffect(() => {
    if (role === 'donor') {
      const socket = connectSocket();
      if (socket) {
        const handler = () => setHasAlert(true);
        socket.on('new_emergency', handler);
        return () => socket.off('new_emergency', handler);
      }
    }
  }, [role]);

  useEffect(() => {
    if (location.pathname === '/donor/alerts') setHasAlert(false);
  }, [location.pathname]);

  const handleLogout = () => { logout(); navigate('/login'); };

  return (
    <aside className={`sidebar ${collapsed ? 'collapsed' : ''}`}
      style={{ '--accent': config.accent, '--accent-glow': config.accentGlow }}>

      {/* Logo */}
      <div className="sidebar-logo">
        <div className="logo-icon">
          <Heart size={20} fill="currentColor" />
        </div>
        {!collapsed && (
          <div className="logo-text">
            <span className="logo-brand">BloodLink</span>
            <span className="logo-role">{config.label}</span>
          </div>
        )}
        <button className="sidebar-toggle" onClick={onToggle} title="Toggle sidebar">
          {collapsed ? <ChevronRight size={16} /> : <X size={16} />}
        </button>
      </div>

      {/* Nav */}
      <nav className="sidebar-nav">
        {config.links.map(({ to, icon: Icon, label }) => {
          const isActive = location.pathname === to ||
            (to !== `/${role}` && location.pathname.startsWith(to));
          return (
            <Link key={to} to={to} className={`nav-link ${isActive ? 'active' : ''}`}
              title={collapsed ? label : undefined}>
              <Icon size={18} />
              {!collapsed && <span>{label}</span>}
              {to === '/donor/alerts' && hasAlert && (
                <div style={{ position: 'absolute', right: 16, top: '50%', transform: 'translateY(-50%)', width: 10, height: 10, borderRadius: '50%', background: 'var(--color-danger)', animation: 'pulse-dot 1.5s infinite', border: '2px solid var(--color-bg-2)' }} />
              )}
              {isActive && !collapsed && <div className="nav-active-bar" />}
            </Link>
          );
        })}
      </nav>

      {/* User footer */}
      <div className="sidebar-footer">
        <div className="sidebar-user">
          <div className="avatar" style={{ background: 'var(--color-surface-2)' }}>
            {user?.avatar || '??'}
          </div>
          {!collapsed && (
            <div className="sidebar-user-info">
              <p className="sidebar-user-name">{user?.name?.split(' ').slice(0,2).join(' ') || 'User'}</p>
              <p className="sidebar-user-role">{user?.role}</p>
            </div>
          )}
          <button className="btn-icon btn-ghost logout-btn" onClick={handleLogout} title="Logout">
            <LogOut size={15} />
          </button>
        </div>
      </div>
    </aside>
  );
}
