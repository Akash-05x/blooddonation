import { useState, useEffect } from 'react';
import { adminAPI } from '../../utils/api';
import { useAuth } from '../../contexts/AuthContext';
import { CheckCircle, XCircle, Eye, Search, Filter } from 'lucide-react';

function StatusBadge({ status }) {
  const map = { approved: 'success', pending: 'warning', rejected: 'danger' };
  return <span className={`badge badge-${map[status] || 'muted'}`}>{status}</span>;
}

export default function HospitalVerification() {
  const [hospitals, setHospitals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [selected, setSelected] = useState(null);

  useEffect(() => {
    fetchHospitals();
  }, []);

  const fetchHospitals = async () => {
    setLoading(true);
    try {
      const [resHospitals, resPending] = await Promise.all([
        adminAPI.getHospitals(),
        adminAPI.getPendingHospitals()
      ]);
      
      const activeHospitals = resHospitals.data || [];
      const pendingHospitals = (resPending.data || []).map(h => ({ 
        ...h, 
        isPendingTable: true, 
        verified_status: 'pending' 
      }));
      
      setHospitals([...pendingHospitals, ...activeHospitals]);
    } catch (error) {
      console.error('Error fetching hospitals:', error);
    } finally {
      setLoading(false);
    }
  };

  const filtered = hospitals.filter(h => {
    const name = h.hospital_name || h.user?.name || '';
    const dist = h.district || '';
    const matchSearch = name.toLowerCase().includes(search.toLowerCase()) || 
                      dist.toLowerCase().includes(search.toLowerCase());
    
    if (filter === 'all') return matchSearch;
    if (filter === 'pending') return matchSearch && h.verified_status === 'pending';
    if (filter === 'verified') return matchSearch && h.verified_status === 'approved';
    if (filter === 'blocked') return matchSearch && h.user?.is_blocked;
    return matchSearch;
  });

  const changeStatus = async (id, status, isPendingTable) => {
    try {
      setLoading(true);
      if (isPendingTable) {
        if (status === 'approved') {
          await adminAPI.approveHospital(id);
        } else {
          await adminAPI.rejectHospital(id);
        }
      } else {
        await adminAPI.verifyHospital(id, status);
      }
      await fetchHospitals();
      setSelected(null);
    } catch (error) {
      console.error('Error changing hospital status:', error);
      alert(error.message || 'Failed to update hospital status');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Filters */}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
        <div className="input-icon-wrap" style={{ flex: 1, minWidth: 200 }}>
          <Search size={15} className="input-icon" />
          <input className="form-input input-with-icon" placeholder="Search hospitals..."
            value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          {['all', 'pending', 'verified', 'blocked'].map(s => (
            <button key={s} className={`btn btn-sm ${filter === s ? 'btn-primary' : 'btn-ghost'}`}
              style={filter === s ? { '--accent': 'var(--color-admin)' } : {}}
              onClick={() => setFilter(s)}>
              {s === 'all' ? 'All' : s.charAt(0).toUpperCase() + s.slice(1)}
              <span className="badge badge-muted" style={{ marginLeft: 4, padding: '1px 5px' }}>
                {hospitals.filter(h => s === 'all' ? true : h.status === s).length}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="table-container">
        {loading ? (
          <div style={{ padding: 40, textAlign: 'center' }}>Loading hospitals...</div>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Hospital</th>
                <th>Reg. No.</th>
                <th>District</th>
                <th>Type</th>
                <th>Joined</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(h => (
                <tr key={h.id}>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div className="avatar" style={{ background: 'var(--color-hospital-dark)', color: 'white', fontSize: '0.7rem' }}>
                        {(h.hospital_name || h.user?.name || '?').split(' ').map(w => w[0]).slice(0, 2).join('')}
                      </div>
                      <div>
                        <p style={{ fontWeight: 600, fontSize: '0.88rem' }}>{h.hospital_name || h.user?.name}</p>
                        <p style={{ fontSize: '0.72rem', color: 'var(--color-muted)' }}>{h.official_email || h.user?.email}</p>
                      </div>
                    </div>
                  </td>
                  <td><code style={{ fontSize: '0.78rem', color: 'var(--color-muted)', fontFamily: 'var(--font-mono)' }}>{h.clinical_reg_no || 'N/A'}</code></td>
                  <td style={{ fontSize: '0.85rem' }}>{h.district}</td>
                  <td style={{ fontSize: '0.88rem', fontWeight: 600 }}>{h.hospital_type}</td>
                  <td style={{ fontSize: '0.8rem', color: 'var(--color-muted)' }}>{new Date(h.created_at).toLocaleDateString()}</td>
                  <td><StatusBadge status={h.verified_status} /></td>
                  <td>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button className="btn btn-sm btn-ghost" onClick={() => setSelected(h)} title="View Details">
                        <Eye size={13} />
                      </button>
                      {h.verified_status === 'pending' && (
                        <>
                          <button className="btn btn-sm btn-success" onClick={() => changeStatus(h.id, 'approved', h.isPendingTable)}>
                            <CheckCircle size={13} /> Approve
                          </button>
                          <button className="btn btn-sm btn-danger" onClick={() => changeStatus(h.id, 'rejected', h.isPendingTable)}>
                            <XCircle size={13} /> Reject
                          </button>
                        </>
                      )}
                      {h.verified_status === 'approved' && (
                        <button className="btn btn-sm btn-danger" onClick={() => changeStatus(h.id, 'rejected', h.isPendingTable)}>Reject</button>
                      )}
                      {h.verified_status === 'rejected' && (
                        <button className="btn btn-sm btn-success" onClick={() => changeStatus(h.id, 'approved', h.isPendingTable)}>Approve</button>
                      )}
                      {!h.isPendingTable && (
                        <button className={`btn btn-sm ${h.user?.is_blocked ? 'btn-success' : 'btn-danger'}`}
                          onClick={async () => {
                            try {
                              setLoading(true);
                              await adminAPI.blockUser(h.user_id, h.user?.is_blocked ? 'unblock' : 'block');
                              await fetchHospitals();
                            } catch (err) {
                              alert(err.message);
                            } finally {
                              setLoading(false);
                            }
                          }}>
                          {h.user?.is_blocked ? 'Unblock' : 'Block'}
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Detail Modal */}
        {selected && (
          <div className="modal-backdrop" onClick={() => setSelected(null)}>
            <div className="modal" onClick={e => e.stopPropagation()}>
              <div className="modal-header">
                <h3 className="modal-title">Hospital Details</h3>
                <button className="modal-close" onClick={() => setSelected(null)}>✕</button>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div className="grid-2" style={{ gap: 12 }}>
                  {[
                    ['Name', selected.hospital_name || selected.user?.name], ['Reg. No.', selected.clinical_reg_no || 'N/A'],
                    ['Email', selected.official_email], ['Phone', selected.telephone],
                    ['District', selected.district], ['Type', selected.hospital_type],
                    ['Joined', new Date(selected.created_at).toLocaleDateString()],
                  ].map(([k, v]) => (
                    <div key={k}>
                      <p style={{ fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--color-muted)', marginBottom: 2 }}>{k}</p>
                      <p style={{ fontSize: '0.88rem', color: 'var(--color-text)' }}>{v}</p>
                    </div>
                  ))}
                </div>
                <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
                  {selected.verified_status === 'pending' && (
                    <>
                      <button className="btn btn-success flex-1" onClick={() => changeStatus(selected.id, 'approved', selected.isPendingTable)}>✓ Approve</button>
                      <button className="btn btn-danger flex-1" onClick={() => changeStatus(selected.id, 'rejected', selected.isPendingTable)}>✗ Reject</button>
                    </>
                  )}
                  {selected.verified_status === 'approved' && <button className="btn btn-danger flex-1" onClick={() => changeStatus(selected.id, 'rejected', selected.isPendingTable)}>Reject Hospital</button>}
                  {selected.verified_status === 'rejected' && <button className="btn btn-success flex-1" onClick={() => changeStatus(selected.id, 'approved', selected.isPendingTable)}>Approve Hospital</button>}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
      );
}
