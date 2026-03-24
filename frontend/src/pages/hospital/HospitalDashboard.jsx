import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { hospitalAPI } from '../../utils/api';
import { Droplets, MapPin, Clock, CheckCircle, AlertTriangle, ArrowRight, Activity } from 'lucide-react';

const STATUS_CONFIG = {
  pending:    { label: 'Pending Donors',  color: '#f59e0b', icon: Clock },
  assigned:   { label: 'Donor Assigned',  color: '#3b82f6', icon: Activity },
  in_transit: { label: 'Donor In Transit',color: '#06b6d4', icon: MapPin },
  completed:  { label: 'Completed',       color: '#22c55e', icon: CheckCircle },
  cancelled:  { label: 'Cancelled',       color: '#ef4444', icon: AlertTriangle },
};

export default function HospitalDashboard() {
  const [showNearby, setShowNearby] = useState(false);
  const [requests, setRequests] = useState([]);
  const [nearDonors, setNearDonors] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [reqRes, donorsRes] = await Promise.all([
        hospitalAPI.getRequests({ limit: 50 }),
        hospitalAPI.getNearbyDonors({ radius: 25 })
      ]);
      setRequests(reqRes.data || []);
      setNearDonors(donorsRes.data || []);
    } catch (err) {
      console.error('Failed to fetch hospital dashboard data', err);
    } finally {
      setLoading(false);
    }
  };

  const activeReq = requests.find(r => ['assigned','in_transit','pending'].includes(r.status));

  if (loading) {
    return <div style={{ padding: 40, textAlign: 'center' }}>Loading dashboard...</div>;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>

      {/* Active Request Banner */}
      {activeReq && (
        <div className="card" style={{ borderLeft: '4px solid var(--color-hospital)', padding: '20px 24px', background: 'rgba(2,132,199,0.06)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <div style={{ position: 'relative' }}>
                <div className="blood-badge" style={{ width: 52, height: 52, fontSize: '0.9rem' }}>{activeReq.blood_group?.replace('_POS','+').replace('_NEG','-')}</div>
                <div style={{ position: 'absolute', top: -4, right: -4 }}>
                  <div className="pulse-dot" style={{ background: '#06b6d4' }} />
                </div>
              </div>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                  <span style={{ fontWeight: 700, fontSize: '1rem' }}>Active Emergency Request</span>
                  <span className="badge badge-info">LIVE</span>
                  <span className={`badge badge-${activeReq.emergency_level === 'critical' ? 'danger' : 'warning'}`}>{activeReq.emergency_level}</span>
                </div>
                <p style={{ fontSize: '0.85rem', color: 'var(--color-muted)', marginTop: 4 }}>
                  {activeReq.notes || 'No additional details provided.'}
                </p>
                {activeReq.assignments?.length > 0 && (
                  <p style={{ fontSize: '0.82rem', marginTop: 4 }}>
                    🚗 <strong>{activeReq.assignments[0]?.donor?.user?.name || 'A donor'}</strong> is assigned
                  </p>
                )}
              </div>
            </div>
            <Link to="/hospital/tracking" className="btn btn-primary" style={{ '--accent': 'var(--color-hospital)', '--accent-glow': 'var(--color-hospital-glow)' }}>
              <MapPin size={15} /> Track Donor <ArrowRight size={14} />
            </Link>
          </div>
        </div>
      )}

      {/* KPI row */}
      <div className="grid-4">
        {[
          { label: 'Total Requests',    value: requests.length, color: 'var(--color-hospital)' },
          { label: 'Completed',         value: requests.filter(r => r.status === 'completed').length, color: 'var(--color-success)' },
          { label: 'Pending',           value: requests.filter(r => r.status === 'pending').length, color: 'var(--color-warning)' },
          { label: 'Nearby Donors',     value: nearDonors.length, color: 'var(--color-blood)' },
        ].map(k => (
          <div key={k.label} className="kpi-card" style={{ '--kpi-color': k.color }}>
            <div className="kpi-card-top">
              <span className="kpi-label">{k.label}</span>
              <div className="kpi-icon"><Droplets size={18} /></div>
            </div>
            <div className="kpi-value">{k.value}</div>
          </div>
        ))}
      </div>

      {/* Quick Actions */}
      <div className="grid-2">
        <Link to="/hospital/request" className="card" style={{ cursor: 'pointer', border: '1px dashed var(--color-hospital)', textAlign: 'center', padding: '32px', textDecoration: 'none', transition: 'all 0.2s', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}
          onMouseEnter={e => e.currentTarget.style.background='rgba(2,132,199,0.06)'}
          onMouseLeave={e => e.currentTarget.style.background=''}>
          <div style={{ width: 56, height: 56, borderRadius: 16, background: 'rgba(2,132,199,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Droplets size={24} color="var(--color-hospital)" />
          </div>
          <div>
            <p style={{ fontWeight: 700, fontSize: '1rem', color: 'var(--color-hospital)' }}>New Emergency Request</p>
            <p style={{ fontSize: '0.82rem', color: 'var(--color-muted)', marginTop: 4 }}>Find nearby donors now</p>
          </div>
        </Link>

        <div className="card">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
            <h3 style={{ fontSize: '0.9rem', fontWeight: 700 }}>Nearby Available Donors</h3>
            <button className="btn btn-ghost btn-sm" onClick={() => setShowNearby(p => !p)}>
              {showNearby ? 'Hide' : 'Show All'}
            </button>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {nearDonors.slice(0, showNearby ? undefined : 3).map(d => (
              <div key={d.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', background: 'var(--color-bg-3)', borderRadius: 8 }}>
                <div className="blood-badge" style={{ width: 30, height: 30, fontSize: '0.62rem' }}>{d.bloodGroup || 'UNK'}</div>
                <div style={{ flex: 1 }}>
                  <p style={{ fontSize: '0.85rem', fontWeight: 600 }}>{d.name}</p>
                  <p style={{ fontSize: '0.7rem', color: 'var(--color-muted)' }}>Distance: {Math.round(d.distance*10)/10} km</p>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <div style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--color-success)' }} />
                  <span style={{ fontSize: '0.72rem', color: 'var(--color-success)', fontWeight: 600 }}>Available</span>
                </div>
              </div>
            ))}
            {nearDonors.length === 0 && <p style={{ fontSize: '0.8rem', color: 'var(--color-muted)' }}>No recent donors found nearby.</p>}
          </div>
        </div>
      </div>

      {/* Recent Requests */}
      <div className="card">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <h3 style={{ fontSize: '0.95rem', fontWeight: 700 }}>My Recent Requests</h3>
          <Link to="/hospital/history" className="btn btn-ghost btn-sm">View All</Link>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {requests.slice(0, 5).map(r => {
            const cfg = STATUS_CONFIG[r.status] || STATUS_CONFIG.pending;
            const Icon = cfg.icon;
            return (
              <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', background: 'var(--color-bg-3)', borderRadius: 10, borderLeft: `3px solid ${cfg.color}` }}>
                <div className="blood-badge">{r.blood_group?.replace('_POS','+').replace('_NEG','-')}</div>
                <div style={{ flex: 1 }}>
                  <p style={{ fontSize: '0.88rem', fontWeight: 600 }}>{r.patient_name} · {r.reason}</p>
                  <p style={{ fontSize: '0.75rem', color: 'var(--color-muted)' }}>{new Date(r.created_at).toLocaleString()}</p>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: cfg.color, fontSize: '0.78rem', fontWeight: 700 }}>
                  <Icon size={13} />{cfg.label}
                </div>
              </div>
            );
          })}
          {requests.length === 0 && <p style={{ fontSize: '0.8rem', color: 'var(--color-muted)' }}>No active requests yet.</p>}
        </div>
      </div>
    </div>
  );
}
