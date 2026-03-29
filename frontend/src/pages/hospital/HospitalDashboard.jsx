import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { hospitalAPI } from '../../utils/api';
import { Droplets, MapPin, Clock, CheckCircle, AlertTriangle, ArrowRight, Activity, X, Phone, Mail } from 'lucide-react';

const STATUS_CONFIG = {
  pending:    { label: 'Pending Donors',  color: '#f59e0b', icon: Clock },
  assigned:   { label: 'Donor Assigned',  color: '#3b82f6', icon: Activity },
  in_transit: { label: 'Donor In Transit',color: '#06b6d4', icon: MapPin },
  completed:  { label: 'Completed',       color: '#22c55e', icon: CheckCircle },
  cancelled:  { label: 'Cancelled',       color: '#ef4444', icon: AlertTriangle },
};

export default function HospitalDashboard() {
  const [loading, setLoading] = useState(true);
  const [showNearby, setShowNearby] = useState(false);
  const [selectedDonor, setSelectedDonor] = useState(null);
  const [requests, setRequests] = useState([]);
  const [nearDonors, setNearDonors] = useState([]);
  const [filterBloodGroup, setFilterBloodGroup] = useState('');
  const [filterSearch, setFilterSearch] = useState('');
  const [responses, setResponses] = useState([]);
  const [finalizing, setFinalizing] = useState(false);

  useEffect(() => {
    fetchData();
    
    // Socket listener for donor responses
    const handleDonorConfirmed = (data) => {
      setResponses(prev => [...prev, data]);
      // Also refresh data to update status if needed
      fetchData();
    };

    // Assuming we have access to socket via some context or global
    // Current codebase seems to use a socket pattern. Let's find where it is.
    // I'll add the listener if a socket is available.
    if (window.socket) {
      window.socket.on('donor_confirmed', handleDonorConfirmed);
      return () => {
        window.socket.off('donor_confirmed', handleDonorConfirmed);
      };
    }
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [reqRes, donorsRes] = await Promise.all([
        hospitalAPI.getRequests({ limit: 50 }),
        hospitalAPI.getNearbyDonors({ radius: 150 })
      ]);
      setRequests(reqRes.data || []);
      setNearDonors(donorsRes.data || []);
    } catch (err) {
      console.error('Failed to fetch hospital dashboard data', err);
    } finally {
      setLoading(false);
    }
  };

  const activeReq = requests.find(r => ['assigned','in_transit','pending','awaiting_confirmation','donor_search'].includes(r.status));

  const handleFinalize = async () => {
    if (!activeReq) return;
    try {
      setFinalizing(true);
      await hospitalAPI.finalizeAssignment(activeReq.id);
      fetchData();
    } catch (err) {
      alert('Failed to finalize: ' + err.message);
    } finally {
      setFinalizing(false);
    }
  };

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
            <div style={{ display: 'flex', gap: 10 }}>
              {activeReq.status === 'awaiting_confirmation' && (
                <button 
                  className="btn btn-success" 
                  onClick={handleFinalize} 
                  disabled={finalizing}
                  style={{ '--accent': 'var(--color-success)', '--accent-glow': 'var(--color-success-glow)' }}
                >
                  {finalizing ? 'Finalizing...' : `Finalize (${responses.length} Responded)`}
                </button>
              )}
              <Link to="/hospital/tracking" className="btn btn-primary" style={{ '--accent': 'var(--color-hospital)', '--accent-glow': 'var(--color-hospital-glow)' }}>
                <MapPin size={15} /> Track Donor <ArrowRight size={14} />
              </Link>
            </div>
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
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <h3 style={{ fontSize: '0.9rem', fontWeight: 700 }}>Available Donors in Area</h3>
            <span className="badge badge-info">{nearDonors.length} found</span>
          </div>

          {/* Filters */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
            <select 
              value={filterBloodGroup} 
              onChange={e => setFilterBloodGroup(e.target.value)}
              style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid var(--color-border)', fontSize: '0.82rem', background: 'var(--color-bg-3)', color: 'var(--text-1)', flex: 1 }}
            >
              <option value="">All Blood Groups</option>
              <option value="A_POS">A+</option>
              <option value="A_NEG">A-</option>
              <option value="B_POS">B+</option>
              <option value="B_NEG">B-</option>
              <option value="O_POS">O+</option>
              <option value="O_NEG">O-</option>
              <option value="AB_POS">AB+</option>
              <option value="AB_NEG">AB-</option>
            </select>
            <input 
              type="text" 
              placeholder="Search by name..." 
              value={filterSearch}
              onChange={e => setFilterSearch(e.target.value)}
              style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid var(--color-border)', fontSize: '0.82rem', background: 'var(--color-bg-3)', color: 'var(--text-1)', flex: 2 }}
            />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 350, overflowY: 'auto', paddingRight: 4 }}>
            {nearDonors
              .filter(d => {
                const bgMatches = !filterBloodGroup || (d.blood_group === filterBloodGroup);
                const searchLower = filterSearch.toLowerCase();
                const nameMatches = !filterSearch || 
                  (d.user?.name || '').toLowerCase().includes(searchLower) ||
                  (d.district || '').toLowerCase().includes(searchLower);
                return bgMatches && nameMatches;
              })
              .map(d => (
                <div key={d.id} 
                     onClick={() => setSelectedDonor(d)}
                     style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', background: 'var(--color-bg-3)', borderRadius: 10, cursor: 'pointer', transition: 'background 0.2s' }}
                     onMouseEnter={e => e.currentTarget.style.background='var(--color-bg-2)'}
                     onMouseLeave={e => e.currentTarget.style.background='var(--color-bg-3)'}>
                  <div className="blood-badge" style={{ width: 34, height: 34, fontSize: '0.75rem' }}>{d.blood_group?.replace('_POS','+').replace('_NEG','-') || 'UNK'}</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <p style={{ fontSize: '0.9rem', fontWeight: 600 }}>{d.user?.name || 'Donor'}</p>
                      {d.is_same_district && <span style={{ background: 'rgba(2,132,199,0.15)', color: 'var(--color-hospital)', padding: '2px 6px', borderRadius: 4, fontSize: '0.65rem', fontWeight: 700 }}>YOUR DISTRICT</span>}
                    </div>
                    <p style={{ fontSize: '0.75rem', color: 'var(--color-muted)' }}>{d.district || 'Nearby'} · {Math.round((d.distance_km || 0)*10)/10} km</p>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <div style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--color-success)', animation: 'pulse-dot 2s infinite' }} />
                    <span style={{ fontSize: '0.75rem', color: 'var(--color-success)', fontWeight: 600 }}>Avail.</span>
                  </div>
                </div>
              ))}
            {nearDonors.length === 0 && <p style={{ fontSize: '0.85rem', color: 'var(--color-muted)', padding: '20px 0', textAlign: 'center' }}>No donors found in this area.</p>}
          </div>
        </div>
      </div>

      {/* Selected Donor Modal */}
      {selectedDonor && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 20, backdropFilter: 'blur(4px)' }} onClick={() => setSelectedDonor(null)}>
          <div className="card" style={{ width: '100%', maxWidth: 400, transform: 'scale(1)', animation: 'pop-in 0.2s ease-out' }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
               <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                 <div className="blood-badge" style={{ width: 44, height: 44, fontSize: '0.85rem' }}>{selectedDonor.bloodGroup || selectedDonor.blood_group || 'UNK'}</div>
                 <div>
                   <h3 style={{ fontSize: '1.05rem', fontWeight: 700 }}>{selectedDonor.name || selectedDonor.user?.name || 'Unknown Donor'}</h3>
                   <span className="badge badge-success" style={{ marginTop: 4 }}>Available • {Math.round((selectedDonor.distance || selectedDonor.distance_km || 0)*10)/10} km away</span>
                 </div>
               </div>
               <button className="btn btn-ghost btn-sm" onClick={() => setSelectedDonor(null)} style={{ padding: 4 }}><X size={18} /></button>
            </div>
            
             <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {/* Requested specific details */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '12px 16px', background: 'var(--color-bg-3)', borderRadius: 10 }}>
                 
                 <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                   <span style={{ fontSize: '0.8rem', color: 'var(--color-muted)' }}>Active Status</span>
                   <span style={{ fontSize: '0.82rem', fontWeight: 600, color: selectedDonor.user?.is_blocked ? 'var(--color-danger)' : 'var(--color-success)' }}>
                     {selectedDonor.user?.is_blocked ? 'Blocked' : 'Active Account'}
                   </span>
                 </div>
                 
                 <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                   <span style={{ fontSize: '0.8rem', color: 'var(--color-muted)' }}>Available Status</span>
                   <span style={{ fontSize: '0.82rem', fontWeight: 600, color: selectedDonor.availability_status ? 'var(--color-success)' : 'var(--color-danger)' }}>
                     {selectedDonor.availability_status ? 'Available for Donation' : 'Currently Unavailable'}
                   </span>
                 </div>

                 <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: 8, borderTop: '1px solid var(--color-border)' }}>
                   <span style={{ fontSize: '0.8rem', color: 'var(--color-muted)' }}><Phone size={14} style={{ display: 'inline', marginRight: 4, verticalAlign: 'middle' }}/>Phone No</span>
                   <span style={{ fontSize: '0.88rem', fontWeight: 600 }}>{selectedDonor.user?.phone || 'Not available'}</span>
                 </div>

                 <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                   <span style={{ fontSize: '0.8rem', color: 'var(--color-muted)' }}><Mail size={14} style={{ display: 'inline', marginRight: 4, verticalAlign: 'middle' }}/>Email ID</span>
                   <span style={{ fontSize: '0.88rem', fontWeight: 600 }}>{selectedDonor.user?.email || 'Not available'}</span>
                 </div>

              </div>

              {/* Extra context */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px', background: 'var(--color-bg-3)', borderRadius: 10 }}>
                 <MapPin size={16} color="var(--color-hospital)" />
                 <span style={{ fontSize: '0.82rem' }}>{selectedDonor.address || `${selectedDonor.district || 'Unknown District'}`}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ flex: 1, padding: '10px 16px', background: 'var(--color-bg-3)', borderRadius: 10, textAlign: 'center' }}>
                  <p style={{ fontSize: '0.7rem', color: 'var(--color-muted)', marginBottom: 2 }}>Total Donations</p>
                  <p style={{ fontSize: '1rem', fontWeight: 700 }}>{selectedDonor.donation_count || 0}</p>
                </div>
                <div style={{ flex: 1, padding: '10px 16px', background: 'var(--color-bg-3)', borderRadius: 10, textAlign: 'center' }}>
                  <p style={{ fontSize: '0.7rem', color: 'var(--color-muted)', marginBottom: 2 }}>Reliability Score</p>
                  <p style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--color-success)' }}>{selectedDonor.reliability_score || 100}%</p>
                </div>
              </div>
            </div>
            <p style={{ fontSize: '0.75rem', color: 'var(--color-muted)', marginTop: 16, textAlign: 'center' }}>
              Create an emergency request to officially dispatch this donor.
            </p>
          </div>
        </div>
      )}

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
