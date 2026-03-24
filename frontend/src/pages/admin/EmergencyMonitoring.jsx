import { useState, useEffect } from 'react';
import { MOCK_REQUESTS } from '../../data/mockData';
import { Activity, Clock, CheckCircle, AlertTriangle, XCircle, RotateCw } from 'lucide-react';

const STATUS_CONFIG = {
  pending:    { label: 'Pending',    color: '#f59e0b', icon: Clock },
  assigned:   { label: 'Assigned',   color: '#3b82f6', icon: Activity },
  in_transit: { label: 'In Transit', color: '#06b6d4', icon: Activity },
  completed:  { label: 'Completed',  color: '#22c55e', icon: CheckCircle },
  cancelled:  { label: 'Cancelled',  color: '#ef4444', icon: XCircle },
};

const URGENCY_COLOR = { critical: '#ef4444', high: '#f59e0b', medium: '#3b82f6' };

function LiveIndicator({ status }) {
  if (!['pending', 'assigned', 'in_transit'].includes(status)) return null;
  return <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.7rem', color: 'var(--color-success)' }}><span className="pulse-dot" style={{ width: 7, height: 7 }} />LIVE</span>;
}

export default function EmergencyMonitoring() {
  const [requests, setRequests] = useState(MOCK_REQUESTS);
  const [filter, setFilter]     = useState('all');
  const [tick, setTick]         = useState(0);

  // Simulate live ticker
  useEffect(() => {
    const t = setInterval(() => setTick(p => p + 1), 5000);
    return () => clearInterval(t);
  }, []);

  const filtered = requests.filter(r => filter === 'all' || r.status === filter);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Status Count Tabs */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {['all', 'pending', 'assigned', 'in_transit', 'completed', 'cancelled'].map(s => {
          const cfg = STATUS_CONFIG[s] || { label: 'All', color: 'var(--color-muted)' };
          const count = s === 'all' ? requests.length : requests.filter(r => r.status === s).length;
          return (
            <button key={s} onClick={() => setFilter(s)}
              className={`btn btn-sm ${filter === s ? 'btn-primary' : 'btn-ghost'}`}
              style={filter === s ? { '--accent': cfg.color, boxShadow: `0 4px 14px ${cfg.color}44` } : {}}>
              {s === 'all' ? 'All Requests' : cfg.label}
              <span className="badge badge-muted" style={{ marginLeft: 4, padding: '1px 6px', background: `${cfg.color}22`, color: cfg.color }}>{count}</span>
            </button>
          );
        })}
        <button className="btn btn-ghost btn-sm" onClick={() => setTick(p => p + 1)} style={{ marginLeft: 'auto' }}>
          <RotateCw size={13} /> Refresh
        </button>
      </div>

      {/* Request Cards */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {filtered.map(r => {
          const cfg = STATUS_CONFIG[r.status] || STATUS_CONFIG.pending;
          const StatusIcon = cfg.icon;
          const age = Math.round((Date.now() - new Date(r.createdAt)) / 60000);

          return (
            <div key={r.id} className="card" style={{ borderLeft: `3px solid ${cfg.color}`, padding: '18px 20px' }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                {/* Left Info */}
                <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
                  <div className="blood-badge" style={{ width: 44, height: 44, fontSize: '0.8rem', flexShrink: 0 }}>{r.bloodGroup}</div>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                      <span style={{ fontWeight: 700, fontSize: '0.95rem' }}>{r.hospitalName}</span>
                      <LiveIndicator status={r.status} />
                    </div>
                    <p style={{ fontSize: '0.82rem', color: 'var(--color-muted)' }}>
                      Patient: <strong style={{ color: 'var(--color-text)' }}>{r.patientName}</strong> · {r.reason}
                    </p>
                    <p style={{ fontSize: '0.78rem', color: 'var(--color-muted)', marginTop: 4 }}>
                      Units needed: <strong style={{ color: 'var(--color-text)' }}>{r.unitsNeeded}</strong>
                      &nbsp;·&nbsp;Created {age} min ago
                    </p>
                  </div>
                </div>

                {/* Right Status */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-end' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: `${cfg.color}20`, color: cfg.color, padding: '4px 10px', borderRadius: 20, fontSize: '0.78rem', fontWeight: 700 }}>
                    <StatusIcon size={13} />{cfg.label}
                  </div>
                  <span style={{ background: `${URGENCY_COLOR[r.urgency]}20`, color: URGENCY_COLOR[r.urgency], padding: '3px 10px', borderRadius: 20, fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase' }}>
                    {r.urgency}
                  </span>
                </div>
              </div>

              {/* Donor Assignment Row */}
              {(r.primaryDonorName || r.backupDonorName) && (
                <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px solid var(--color-border)', display: 'flex', gap: 24, flexWrap: 'wrap' }}>
                  {r.primaryDonorName && (
                    <div>
                      <p style={{ fontSize: '0.68rem', text: 'uppercase', letterSpacing: '0.06em', color: 'var(--color-muted)', marginBottom: 3 }}>PRIMARY DONOR</p>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <div className="avatar" style={{ width: 24, height: 24, fontSize: '0.6rem', background: 'var(--color-donor-dark)', color: 'white' }}>
                          {r.primaryDonorName.split(' ').map(w=>w[0]).join('')}
                        </div>
                        <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>{r.primaryDonorName}</span>
                        {r.eta && <span style={{ fontSize: '0.75rem', color: 'var(--color-success)' }}>· ETA {r.eta}</span>}
                      </div>
                    </div>
                  )}
                  {r.backupDonorName && (
                    <div>
                      <p style={{ fontSize: '0.68rem', textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--color-muted)', marginBottom: 3 }}>BACKUP DONOR</p>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <div className="avatar" style={{ width: 24, height: 24, fontSize: '0.6rem' }}>
                          {r.backupDonorName.split(' ').map(w=>w[0]).join('')}
                        </div>
                        <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>{r.backupDonorName}</span>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
        {filtered.length === 0 && (
          <div style={{ textAlign: 'center', padding: '48px 0', color: 'var(--color-muted)' }}>
            No requests found.
          </div>
        )}
      </div>
    </div>
  );
}
