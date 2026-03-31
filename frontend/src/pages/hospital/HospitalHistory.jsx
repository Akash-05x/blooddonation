import { useState, useEffect } from 'react';
import { hospitalAPI } from '../../utils/api';

const STATUS_CONFIG = {
  assigned:   { label: 'Assigned',    color: '#3b82f6' },
  in_transit: { label: 'In Transit',  color: '#06b6d4' },
  completed:  { label: 'Completed',   color: '#22c55e' },
  pending:    { label: 'Pending',     color: '#f59e0b' },
  cancelled:  { label: 'Cancelled',   color: '#ef4444' },
  failed:     { label: 'Failed',      color: '#ef4444' },
  expired:    { label: 'Expired',     color: '#71717a' },
};
const URGENCY_COLOR = { critical: '#ef4444', high: '#f59e0b', medium: '#3b82f6' };

export default function HospitalHistory() {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchHistory();
  }, []);

  const fetchHistory = async () => {
    try {
      const res = await hospitalAPI.getRequests({ limit: 100 });
      setRequests(res.data || []);
    } catch (err) {
      console.error('Failed to fetch request history', err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <div style={{ padding: 40, textAlign: 'center' }}>Loading history...</div>;
  }

  const completedCount = requests.filter(r => r.status === 'completed').length;
  const cancelledCount = requests.filter(r => r.status === 'cancelled').length;
  const successRate = requests.length > 0 ? Math.round((completedCount / requests.length) * 100) : 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

      {/* Summary Row */}
      <div className="grid-4">
        {[
          { label: 'Total Requests', value: requests.length,                                       color: 'var(--color-hospital)' },
          { label: 'Completed',      value: completedCount, color: 'var(--color-success)' },
          { label: 'Cancelled',      value: cancelledCount, color: 'var(--color-danger)' },
          { label: 'Success Rate',   value: `${successRate}%`, color: 'var(--color-success)' },
        ].map(k => (
          <div key={k.label} className="card" style={{ padding: '16px 20px', borderTop: `3px solid ${k.color}` }}>
            <p style={{ fontSize: '1.6rem', fontWeight: 800, color: k.color }}>{k.value}</p>
            <p style={{ fontSize: '0.78rem', color: 'var(--color-muted)', marginTop: 4 }}>{k.label}</p>
          </div>
        ))}
      </div>

      {/* Table */}
      <div className="table-container">
        <table className="table">
          <thead>
            <tr>
              <th>Date & Time</th>
              <th>Blood Group</th>
              <th>Patient</th>
              <th>Reason</th>
              <th>Units</th>
              <th>Primary Donor</th>
              <th>Backup Donor</th>
              <th>Urgency</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {requests.map(r => {
              const cfg = STATUS_CONFIG[r.status] || STATUS_CONFIG.pending;
              const primaryDonor = r.assignments?.find(a => a.is_backup === false)?.donor?.user?.name;
              const backupDonor = r.assignments?.find(a => a.is_backup === true)?.donor?.user?.name;
              
              return (
                <tr key={r.id}>
                  <td style={{ fontSize: '0.8rem', color: 'var(--color-muted)' }}>{new Date(r.created_at).toLocaleString()}</td>
                  <td><div className="blood-badge">{r.blood_group?.replace('_POS','+').replace('_NEG','-')}</div></td>
                  <td style={{ fontWeight: 600, fontSize: '0.88rem' }}>{r.patient_name}</td>
                  <td style={{ fontSize: '0.83rem', color: 'var(--color-text-2)' }}>{r.reason}</td>
                  <td style={{ textAlign: 'center', fontWeight: 700 }}>{r.units_needed}</td>
                  <td style={{ fontSize: '0.85rem' }}>{primaryDonor || <span style={{ color: 'var(--color-muted)' }}>—</span>}</td>
                  <td style={{ fontSize: '0.85rem' }}>{backupDonor  || <span style={{ color: 'var(--color-muted)' }}>—</span>}</td>
                  <td><span style={{ background: `${URGENCY_COLOR[r.emergency_level]}20`, color: URGENCY_COLOR[r.emergency_level], padding: '3px 10px', borderRadius: 20, fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase' }}>{r.emergency_level}</span></td>
                  <td><span style={{ background: `${cfg.color}20`, color: cfg.color, padding: '3px 10px', borderRadius: 20, fontSize: '0.75rem', fontWeight: 700 }}>{cfg.label}</span></td>
                </tr>
              );
            })}
            {requests.length === 0 && (
              <tr>
                <td colSpan="9" style={{ textAlign: 'center', padding: '20px 0', color: 'var(--color-muted)' }}>No request history found.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
