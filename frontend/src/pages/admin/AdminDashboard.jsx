import { useState, useEffect } from 'react';
import { adminAPI } from '../../utils/api';
import { io } from 'socket.io-client';
// Keeping mock for Admin Logs until an API is available, if needed
import { MOCK_ADMIN_LOGS } from '../../data/mockData';
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { Activity, Hospital, Users, CheckCircle, Clock, TrendingUp, AlertTriangle, Shield } from 'lucide-react';

const CustomTooltip = ({ active, payload, label }) => {
  if (active && payload?.length) {
    return (
      <div style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 8, padding: '10px 14px', fontSize: '0.82rem' }}>
        <p style={{ color: 'var(--color-muted)', marginBottom: 4 }}>{label}</p>
        {payload.map(p => <p key={p.name} style={{ color: p.color }}>{p.name}: {p.value}</p>)}
      </div>
    );
  }
  return null;
};

function StatusBadge({ status }) {
  const map = {
    assigned: 'info', pending: 'warning', completed: 'success',
    in_transit: 'info', cancelled: 'danger'
  };
  return <span className={`badge badge-${map[status] || 'muted'}`}>{status.replace('_', ' ')}</span>;
}

function UrgencyBadge({ urgency }) {
  const map = { critical: 'danger', high: 'warning', medium: 'info' };
  return <span className={`badge badge-${map[urgency] || 'muted'}`}>{urgency}</span>;
}

export default function AdminDashboard() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [notifications, setNotifications] = useState([]);

  useEffect(() => {
    fetchData();

    // ── Real-time Notifications ──────────────────────────────────────────────
    const token = localStorage.getItem('bl_token');
    const socket = io('/', { auth: { token } });

    socket.on('connect', () => console.log('[Socket] Connected to admin notification channel'));

    socket.on('new_registration', (reg) => {
      console.log('[Socket] New registration notification:', reg);
      const newNotif = {
        id: Date.now(),
        action: `New ${reg.type} registration`,
        target: `${reg.name} (${reg.email || reg.phone || 'N/A'})`,
        admin: 'System',
        at: new Date().toISOString(),
        isRealtime: true
      };
      setNotifications(prev => [newNotif, ...prev]);
    });

    return () => socket.disconnect();
  }, []);

  const fetchData = async () => {
    try {
      const res = await adminAPI.getReports();
      setData(res.data);
    } catch (err) {
      console.error('Failed to fetch admin reports', err);
    } finally {
      setLoading(false);
    }
  };

  if (loading || !data) {
    return <div style={{ padding: 40, textAlign: 'center' }}>Loading dashboard data...</div>;
  }

  const { overview, requests, donations, topDonors, recentHospitals, bloodGroupDistribution } = data;

  // Derive charts purely as examples for now (they will need real timeseries later)
  const fakeWeeklyData = [
    { day: 'Mon', Requests: 12, 'Success%': 88 },
    { day: 'Tue', Requests: 8, 'Success%': 92 },
    { day: 'Wed', Requests: Math.max(0, requests.total - 20), 'Success%': requests.total > 0 ? Math.round((requests.completed/requests.total)*100) : 0 },
  ];

  const overallSuccess = requests.total > 0 ? Math.round((requests.completed / requests.total) * 100) : 0;

  const KPI_CARDS = [
    { label: 'Total Requests',  value: requests.total.toLocaleString(), icon: Activity,    color: '#e63946', change: '+12%', up: true },
    { label: 'Success Rate',    value: `${overallSuccess}%`,             icon: CheckCircle,  color: '#22c55e', change: '+2.1%', up: true },
    { label: 'Active Donors',   value: overview.totalDonors.toLocaleString(), icon: Users,        color: '#7c3aed', change: '+8%',   up: true },
    { label: 'Active Hospitals',value: overview.totalHospitals.toLocaleString(),               icon: Hospital,     color: '#0284c7', change: '+3',    up: true },
    { label: "Verified Hosps.", value: overview.verifiedHospitals,                 icon: Shield,        color: '#f59e0b', change: `${data.pendingHospitalsCount || 0} pending`, up: (data.pendingHospitalsCount || 0) > 0 },
    { label: 'Pending Req',     value: requests.active,      icon: Clock,   color: '#06b6d4', change: 'Current', up: true },
    { label: 'Recent Donations',  value: donations.last30Days,           icon: Activity,color: '#f59e0b', change: 'Last 30 days', up: true },
    { label: 'Total Users',      value: overview.totalUsers.toLocaleString(),                           icon: Users,       color: '#8b5cf6', change: 'Overall', up: true },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {/* KPI Cards */}
      <div className="kpi-grid">
        {KPI_CARDS.map((k, i) => (
          <div key={i} className="kpi-card" style={{ '--kpi-color': k.color }}>
            <div className="kpi-card-top">
              <span className="kpi-label">{k.label}</span>
              <div className="kpi-icon"><k.icon size={18} /></div>
            </div>
            <div className="kpi-value">{k.value}</div>
            <div className={`kpi-change ${k.up ? 'up' : 'down'}`}>
              {k.up ? '↑' : '→'} {k.change}
            </div>
          </div>
        ))}
      </div>

      {/* Charts Row */}
      <div className="grid-2">
        <div className="card">
          <h3 style={{ fontSize: '0.95rem', fontWeight: 700, marginBottom: 16 }}>Weekly Emergency Requests (Placeholder)</h3>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={fakeWeeklyData}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
              <XAxis dataKey="day" tick={{ fill: 'var(--color-muted)', fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: 'var(--color-muted)', fontSize: 11 }} axisLine={false} tickLine={false} />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="Requests" fill="#7c3aed" radius={[4,4,0,0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="card">
          <h3 style={{ fontSize: '0.95rem', fontWeight: 700, marginBottom: 16 }}>Success Rate (%)</h3>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={fakeWeeklyData}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
              <XAxis dataKey="day" tick={{ fill: 'var(--color-muted)', fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis domain={[0, 100]} tick={{ fill: 'var(--color-muted)', fontSize: 11 }} axisLine={false} tickLine={false} />
              <Tooltip content={<CustomTooltip />} />
              <Line dataKey="Success%" stroke="#22c55e" strokeWidth={2.5} dot={{ fill: '#22c55e', r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Bottom Row: Donors & Hospitals */}
      <div className="grid-2">
        {/* Top Donors */}
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <h3 style={{ fontSize: '0.95rem', fontWeight: 700 }}>Top Donors</h3>
            <a href="/admin/donors" style={{ fontSize: '0.72rem', color: 'var(--color-admin)', fontWeight: 600, textDecoration: 'none' }}>View All →</a>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {topDonors?.length > 0 ? topDonors.map(d => (
              <div key={d.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 12px', background: 'var(--color-bg-3)', borderRadius: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div className="blood-badge">{d.blood_group.replace('_POS','+').replace('_NEG','-')}</div>
                  <div>
                    <p style={{ fontSize: '0.85rem', fontWeight: 600 }}>{d.user?.name || d.name}</p>
                    <p style={{ fontSize: '0.72rem', color: 'var(--color-muted)' }}>Reliability: {Math.round(d.reliability_score)}%</p>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 6, flexDirection: 'column', alignItems: 'flex-end' }}>
                  <span className="badge badge-success">{d._count?.donationHistory || 0} Donations</span>
                </div>
              </div>
            )) : <p style={{ fontSize: '0.8rem', color: 'var(--color-muted)' }}>No donors found.</p>}
          </div>
        </div>

        {/* Recent Hospitals */}
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <h3 style={{ fontSize: '0.95rem', fontWeight: 700 }}>Recent Hospitals</h3>
            <a href="/admin/hospitals" style={{ fontSize: '0.72rem', color: 'var(--color-admin)', fontWeight: 600, textDecoration: 'none' }}>View All →</a>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {recentHospitals?.length > 0 ? recentHospitals.map(h => (
              <div key={h.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 12px', background: 'var(--color-bg-3)', borderRadius: 10 }}>
                 <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div className="avatar" style={{ background: 'var(--color-hospital-dark)', color: 'white', fontSize: '0.65rem', width: 32, height: 32 }}>
                    {(h.hospital_name || h.user?.name || '?').split(' ').map(w => w[0]).slice(0, 2).join('')}
                  </div>
                  <div>
                    <p style={{ fontSize: '0.85rem', fontWeight: 600 }}>{h.hospital_name || h.user?.name}</p>
                    <p style={{ fontSize: '0.72rem', color: 'var(--color-muted)' }}>{h.district}</p>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 6, flexDirection: 'column', alignItems: 'flex-end' }}>
                   {h.user?.is_blocked ? <span className="badge badge-danger">Blocked</span> : <span className="badge badge-success">Active</span>}
                </div>
              </div>
            )) : <p style={{ fontSize: '0.8rem', color: 'var(--color-muted)' }}>No hospitals recently added.</p>}
          </div>
        </div>
      </div>

      {/* Activity Log */}
      <div className="card">
        <h3 style={{ fontSize: '0.95rem', fontWeight: 700, marginBottom: 16 }}>Admin Activity Log</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {[...notifications, ...MOCK_ADMIN_LOGS].slice(0, 10).map(l => (
            <div key={l.id} style={{ display: 'flex', gap: 12, padding: '10px 0', borderBottom: '1px solid var(--color-border)' }}>
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: l.isRealtime ? 'var(--color-admin)' : 'var(--color-muted)', marginTop: 6, flexShrink: 0 }} />
              <div style={{ flex: 1 }}>
                <p style={{ fontSize: '0.82rem', fontWeight: 600, color: l.isRealtime ? 'var(--color-admin)' : 'inherit' }}>{l.action}</p>
                <p style={{ fontSize: '0.72rem', color: 'var(--color-muted)' }}>{l.target}</p>
                <p style={{ fontSize: '0.7rem', color: 'var(--color-muted)', marginTop: 2 }}>{l.admin} · {new Date(l.at).toLocaleString()}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
