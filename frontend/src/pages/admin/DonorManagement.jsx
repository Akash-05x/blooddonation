import { useState, useEffect, useMemo } from 'react';
import { adminAPI } from '../../utils/api';
import { Search, Ban, CheckCircle, Loader2 } from 'lucide-react';

function StatusBadge({ status }) {
  const map = { available: 'success', on_request: 'info', blocked: 'danger' };
  return <span className={`badge badge-${map[status] || 'muted'}`}>{status.replace('_', ' ')}</span>;
}

function ScoreBar({ value, color = '#e63946' }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <div className="progress-bar" style={{ width: 80 }}>
        <div className="progress-fill" style={{ width: `${value}%`, '--from': color, '--to': color }} />
      </div>
      <span style={{ fontSize: '0.8rem', fontWeight: 700, color }}>{Math.round(value)}</span>
    </div>
  );
}

export default function DonorManagement() {
  const [donors, setDonors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [bgFilter, setBgFilter] = useState('All');

  useEffect(() => {
    fetchDonors();
  }, []);

  const fetchDonors = async () => {
    setLoading(true);
    try {
      const res = await adminAPI.getDonors();
      if (res.success) {
        // Map backend data to frontend structure
        const mapped = res.data.map(d => ({
          id: d.id,
          userId: d.user_id,
          name: d.user?.name || d.name,
          email: d.user?.email,
          bloodGroup: d.blood_group,
          city: d.district || 'N/A',
          donations: d.donation_count || d._count?.donationHistory || 0,
          reliabilityScore: d.reliability_score,
          acceptanceRate: d.acceptance_rate || 0,
          responseTime: d.response_time_avg || 0,
          status: d.user?.is_blocked ? 'blocked' : (d.availability_status ? 'available' : 'on_request'),
          vacationMode: d.vacation_mode,
          avatar: (d.user?.name || d.name || '?').split(' ').map(n => n[0]).join('').slice(0, 2)
        }));
        setDonors(mapped);
      }
    } catch (err) {
      console.error('Failed to fetch donors:', err);
    } finally {
      setLoading(false);
    }
  };

  const bloodGroups = useMemo(() => {
    const groups = ['All', ...new Set(donors.map(d => d.bloodGroup))];
    return groups.sort();
  }, [donors]);

  const filtered = donors.filter(d => {
    const matchSearch = d.name.toLowerCase().includes(search.toLowerCase()) || 
                       d.city.toLowerCase().includes(search.toLowerCase()) ||
                       d.email?.toLowerCase().includes(search.toLowerCase());
    const matchBg = bgFilter === 'All' || d.bloodGroup === bgFilter;
    return matchSearch && matchBg;
  });

  const toggleBlock = async (donor) => {
    const action = donor.status === 'blocked' ? 'unblock' : 'block';
    try {
      const res = await adminAPI.blockUser(donor.userId, action);
      if (res.success) {
        setDonors(prev => prev.map(d => 
          d.id === donor.id ? { ...d, status: action === 'block' ? 'blocked' : 'available' } : d
        ));
      }
    } catch (err) {
      console.error(`Failed to ${action} user:`, err);
      alert(err.message || `Failed to ${action} user`);
    }
  };

  if (loading && donors.length === 0) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '300px', flexDirection: 'column', gap: 12 }}>
        <Loader2 className="animate-spin" size={32} color="var(--color-admin)" />
        <p style={{ color: 'var(--color-muted)' }}>Loading donors...</p>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Filters */}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
        <div className="input-icon-wrap" style={{ flex: 1, minWidth: 200 }}>
          <Search size={15} className="input-icon" />
          <input className="form-input input-with-icon" placeholder="Search by name, email, or city..."
            value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {bloodGroups.map(bg => (
            <button key={bg} className={`btn btn-sm ${bgFilter === bg ? 'btn-primary' : 'btn-ghost'}`}
              style={bgFilter === bg ? { '--accent': 'var(--color-admin)' } : {}}
              onClick={() => setBgFilter(bg)}>{bg}</button>
          ))}
        </div>
      </div>

      <div className="table-container">
        <table className="table">
          <thead>
            <tr>
              <th>Donor</th>
              <th>Blood</th>
              <th>City</th>
              <th>Donations</th>
              <th>Reliability</th>
              <th>Accept%</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length > 0 ? filtered.map(d => (
              <tr key={d.id}>
                <td>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div className="avatar" style={{ background: d.status === 'blocked' ? 'var(--color-bg-3)' : 'var(--color-donor-dark)', color: 'white', fontSize: '0.7rem' }}>
                      {d.avatar}
                    </div>
                    <div>
                      <p style={{ fontWeight: 600, fontSize: '0.88rem' }}>{d.name}</p>
                      <p style={{ fontSize: '0.7rem', color: 'var(--color-muted)' }}>{d.email}</p>
                    </div>
                  </div>
                </td>
                <td><div className="blood-badge">{d.bloodGroup}</div></td>
                <td style={{ fontSize: '0.85rem' }}>{d.city}</td>
                <td style={{ fontSize: '0.88rem', fontWeight: 700, textAlign: 'center' }}>{d.donations}</td>
                <td><ScoreBar value={d.reliabilityScore} color={d.reliabilityScore > 85 ? '#22c55e' : d.reliabilityScore > 70 ? '#f59e0b' : '#ef4444'} /></td>
                <td style={{ fontSize: '0.85rem' }}>{Math.round(d.acceptanceRate)}%</td>
                <td>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                    <StatusBadge status={d.status} />
                    {d.vacationMode && <span className="badge badge-muted">🏖 Vacation</span>}
                  </div>
                </td>
                <td>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button className={`btn btn-sm ${d.status === 'blocked' ? 'btn-success' : 'btn-danger'}`}
                      onClick={() => toggleBlock(d)}>
                      {d.status === 'blocked' ? <><CheckCircle size={12} /> Unblock</> : <><Ban size={12} /> Block</>}
                    </button>
                  </div>
                </td>
              </tr>
            )) : (
              <tr>
                <td colSpan="8" style={{ textAlign: 'center', padding: '40px', color: 'var(--color-muted)' }}>
                  No donors found matching your criteria.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Summary Cards */}
      <div className="grid-4">
        {[
          { label: 'Total Donors', value: donors.length, color: 'var(--color-blood)' },
          { label: 'Available', value: donors.filter(d => d.status === 'available').length, color: 'var(--color-success)' },
          { label: 'On Request', value: donors.filter(d => d.status === 'on_request').length, color: 'var(--color-info)' },
          { label: 'Blocked', value: donors.filter(d => d.status === 'blocked').length, color: 'var(--color-danger)' },
        ].map(c => (
          <div key={c.label} className="card" style={{ textAlign: 'center', padding: '16px' }}>
            <p style={{ fontSize: '1.6rem', fontWeight: 800, color: c.color }}>{c.value}</p>
            <p style={{ fontSize: '0.78rem', color: 'var(--color-muted)', marginTop: 4 }}>{c.label}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

