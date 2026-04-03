import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { hospitalAPI } from '../../utils/api';
import { connectSocket } from '../../utils/socket';
import { Droplets, MapPin, Clock, CheckCircle, AlertTriangle, ArrowRight, Activity, X, Phone, Mail, Shield, User } from 'lucide-react';

const STATUS_CONFIG = {
  pending:               { label: 'Pending',         color: '#f59e0b', icon: Clock },
  awaiting_confirmation: { label: 'Searching Donors',color: '#8b5cf6', icon: Activity },
  donor_search:          { label: 'Searching...',    color: '#8b5cf6', icon: Activity },
  assigned:              { label: 'Donor Assigned',  color: '#3b82f6', icon: Activity },
  in_transit:            { label: 'Donor In Transit',color: '#06b6d4', icon: MapPin },
  completed:             { label: 'Completed',       color: '#22c55e', icon: CheckCircle },
  cancelled:             { label: 'Cancelled',       color: '#ef4444', icon: AlertTriangle },
  failed:                { label: 'Failed',          color: '#ef4444', icon: AlertTriangle },
  closed:                { label: 'Closed',          color: '#22c55e', icon: CheckCircle },
};

const formatBG = key => key?.replace('_POS', '+').replace('_NEG', '-') || key;

export default function HospitalDashboard() {
  const [loading,          setLoading]        = useState(true);
  const [selectedDonor,    setSelectedDonor]  = useState(null);
  const [requests,         setRequests]       = useState([]);
  const [nearDonors,       setNearDonors]     = useState([]);
  const [filterBloodGroup, setFilterBG]       = useState('');
  const [filterSearch,     setFilterSearch]   = useState('');
  const [responses,        setResponses]      = useState([]);
  const [finalizing,       setFinalizing]     = useState(false);
  const [liveAlerts,       setLiveAlerts]     = useState([]);
  const [syncing,          setSyncing]        = useState(false);
  const [history,          setHistory]        = useState([]);
  const socketRef = useRef(null);

  useEffect(() => {
    fetchData();
    setupSocket();
    return () => {
      if (socketRef.current) {
        socketRef.current.off('donor_confirmed');
        socketRef.current.off('donor_accepted');
        socketRef.current.off('request_status_update');
        socketRef.current.off('failover_alert');
        socketRef.current.off('request_failed');
        socketRef.current.off('donor_rejected');
        socketRef.current.off('backup_promoted');
        socketRef.current.off('request_finalized');
      }
    };
  }, []);

  const setupSocket = () => {
    const socket = connectSocket();
    if (!socket) return;
    socketRef.current = socket;
    socket.on('donor_confirmed', (data) => {
      setResponses(prev => [...prev, data]);
      setLiveAlerts(prev => [{ type: 'confirmed', ...data, time: Date.now() }, ...prev.slice(0, 4)]);
    });
    socket.on('donor_accepted', (data) => {
      setLiveAlerts(prev => [{ type: 'accepted', ...data, time: Date.now() }, ...prev.slice(0, 4)]);
      fetchData();
    });
    socket.on('request_status_update', () => fetchData());
    socket.on('failover_alert', (data) => {
      setLiveAlerts(prev => [{ type: 'failover', ...data, time: Date.now() }, ...prev.slice(0, 4)]);
      fetchData();
    });
    socket.on('request_failed', (data) => {
      setLiveAlerts(prev => [{ type: 'failed', ...data, time: Date.now() }, ...prev.slice(0, 4)]);
      fetchData();
    });
    socket.on('donor_rejected', (data) => {
      setLiveAlerts(prev => [{ type: 'rejected', ...data, time: Date.now() }, ...prev.slice(0, 4)]);
      fetchData();
    });
    socket.on('backup_promoted', (data) => {
      setLiveAlerts(prev => [{ type: 'promoted', ...data, time: Date.now() }, ...prev.slice(0, 4)]);
      fetchData();
    });
    socket.on('request_finalized', (data) => {
      setLiveAlerts(prev => [{ type: 'finalized', ...data, time: Date.now() }, ...prev.slice(0, 4)]);
      fetchData();
    });
  };

  const fetchData = async () => {
    try {
      setLoading(true);
      const [reqRes, donorsRes, historyRes] = await Promise.all([
        hospitalAPI.getRequests({ limit: 50 }),
        hospitalAPI.getNearbyDonors({ radius: 150 }),
        hospitalAPI.getHistory({ limit: 10 })
      ]);
      setRequests(reqRes.data || []);
      setNearDonors(donorsRes.data || []);
      setHistory(historyRes.data || []);
    } catch (err) {
      console.error('Failed to fetch hospital dashboard data', err);
    } finally {
      setLoading(false);
    }
  };

  const activeReq = requests.find(r =>
    ['assigned','in_transit','pending','awaiting_confirmation','donor_search'].includes(r.status)
  );

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

  const handleSyncLocation = async () => {
    if (!navigator.geolocation) return alert('GPS not supported');
    try {
      setSyncing(true);
      navigator.geolocation.getCurrentPosition(async (pos) => {
        try {
          await hospitalAPI.updateProfile({
            latitude: pos.coords.latitude,
            longitude: pos.coords.longitude
          });
          alert('Hospital location synced to your current GPS position!');
          fetchData();
        } catch (e) {
          alert('Failed to sync: ' + e.message);
        } finally {
          setSyncing(false);
        }
      }, (err) => {
        alert('GPS error: ' + err.message);
        setSyncing(false);
      }, { enableHighAccuracy: true });
    } catch (err) {
      setSyncing(false);
    }
  };

  // Filter donors
  const filteredDonors = nearDonors.filter(d => {
    const bgOk     = !filterBloodGroup || d.blood_group === filterBloodGroup;
    const searchLo = filterSearch.toLowerCase();
    const nameOk   = !filterSearch ||
      (d.user?.name || '').toLowerCase().includes(searchLo) ||
      (d.district || '').toLowerCase().includes(searchLo);
    return bgOk && nameOk;
  });

  const sameDistrictDonors = filteredDonors.filter(d => d.is_same_district);
  const otherDonors        = filteredDonors.filter(d => !d.is_same_district);

  if (loading) return <div style={{ padding: 40, textAlign: 'center' }}>Loading dashboard...</div>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>

      {/* Live alerts feed */}
      {liveAlerts.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {liveAlerts.map((a, i) => (
            <div key={i} style={{ background: a.type === 'accepted' ? 'rgba(34,197,94,0.08)' : 'rgba(2,132,199,0.08)', border: `1px solid ${a.type === 'accepted' ? 'rgba(34,197,94,0.3)' : 'rgba(2,132,199,0.3)'}`, borderRadius: 12, padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 10, fontSize: '0.84rem' }}>
              <span style={{ fontSize: '1.1rem' }}>{a.type === 'accepted' ? '🏃' : a.type === 'failover' ? '🚨' : a.type === 'failed' ? '❌' : '✅'}</span>
              <span>
                {a.type === 'failover' ? (
                  <><strong>Failover:</strong> {a.message} {a.newPrimaryName && `New primary: ${a.newPrimaryName}`}</>
                ) : a.type === 'failed' ? (
                  <><strong>Request Failed:</strong> {a.message}</>
                ) : (
                  <><strong>{a.donorName || 'A donor'}</strong> {a.type === 'accepted' ? 'accepted and is heading to you!' : 'confirmed availability.'}</>
                )}
              </span>
              <button style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-muted)' }} onClick={() => setLiveAlerts(p => p.filter((_, j) => j !== i))}><X size={14}/></button>
            </div>
          ))}
        </div>
      )}

      {/* Active Request Banner */}
      {activeReq && (
        <div className="card" style={{ borderLeft: '4px solid var(--color-hospital)', padding: '20px 24px', background: 'rgba(2,132,199,0.06)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <div style={{ position: 'relative' }}>
                <div className="blood-badge" style={{ width: 52, height: 52, fontSize: '0.9rem' }}>{formatBG(activeReq.blood_group)}</div>
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
                  <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {activeReq.assignments.map(a => (
                      <p key={a.id} style={{ fontSize: '0.82rem', display: 'flex', alignItems: 'center', gap: 6 }}>
                        {a.role === 'primary' ? '🚗' : '🛡️'} 
                        <strong>{a.donor?.user?.name || 'A donor'}</strong> 
                        <span className={`badge badge-${a.role === 'primary' ? 'success' : 'info'}`} style={{ fontSize: '0.65rem' }}>
                          {a.role.toUpperCase()}
                        </span>
                        {a.status === 'in_transit' && a.role === 'primary' && <span className="pulse-dot" style={{ width: 8, height: 8 }} />}
                      </p>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              {activeReq.status === 'awaiting_confirmation' && (
                <button
                  className="btn btn-success"
                  onClick={handleFinalize}
                  disabled={finalizing}
                >
                  {finalizing ? 'Finalizing...' : `Finalize (${Math.max(responses.length, activeReq?._count?.notificationTokens || 0)} responded)`}
                </button>
              )}
              <Link to="/hospital/tracking" className="btn btn-primary">
                <MapPin size={15} /> Track Donor <ArrowRight size={14} />
              </Link>
            </div>
          </div>
        </div>
      )}

      {/* KPI row */}
      <div className="grid-4">
        {[
          { label: 'Total Requests',  value: requests.length,                                          color: 'var(--color-hospital)' },
          { label: 'Completed',       value: requests.filter(r => ['completed','closed'].includes(r.status)).length, color: 'var(--color-success)' },
          { label: 'Pending',         value: requests.filter(r => r.status === 'pending').length,      color: 'var(--color-warning)' },
          { label: 'Nearby Donors',   value: nearDonors.length,                                        color: 'var(--color-blood)' },
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
        <Link to="/hospital/request" className="card"
          style={{ cursor: 'pointer', border: '1px dashed var(--color-hospital)', textAlign: 'center', padding: '32px', textDecoration: 'none', transition: 'all 0.2s', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}
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

        {/* Nearby Donors Panel */}
        <div className="card">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
            <h3 style={{ fontSize: '0.9rem', fontWeight: 700 }}>Donors in Your Area</h3>
            <div style={{ display: 'flex', gap: 6 }}>
              <button 
                className="btn btn-ghost btn-sm" 
                onClick={handleSyncLocation}
                disabled={syncing}
                style={{ fontSize: '0.7rem', display: 'flex', alignItems: 'center', gap: 4 }}
              >
                <MapPin size={12} /> {syncing ? 'Syncing...' : 'Sync GPS'}
              </button>
              {sameDistrictDonors.length > 0 && (
                <span style={{ background: 'rgba(2,132,199,0.15)', color: 'var(--color-hospital)', padding: '3px 8px', borderRadius: 8, fontSize: '0.72rem', fontWeight: 700 }}>
                  {sameDistrictDonors.length} same district
                </span>
              )}
              <span className="badge badge-info">{nearDonors.length} total</span>
            </div>
          </div>

          {/* Filters */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
            <select
              value={filterBloodGroup}
              onChange={e => setFilterBG(e.target.value)}
              style={{ padding: '7px 10px', borderRadius: 8, border: '1px solid var(--color-border)', fontSize: '0.8rem', background: 'var(--color-bg-3)', color: 'var(--text-1)', flex: 1 }}
            >
              <option value="">All Blood Groups</option>
              {['A_POS','A_NEG','B_POS','B_NEG','O_POS','O_NEG','AB_POS','AB_NEG'].map(g => (
                <option key={g} value={g}>{formatBG(g)}</option>
              ))}
            </select>
            <input
              type="text"
              placeholder="Search by name or district..."
              value={filterSearch}
              onChange={e => setFilterSearch(e.target.value)}
              style={{ padding: '7px 10px', borderRadius: 8, border: '1px solid var(--color-border)', fontSize: '0.8rem', background: 'var(--color-bg-3)', color: 'var(--text-1)', flex: 2 }}
            />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 380, overflowY: 'auto', paddingRight: 4 }}>
            {/* Same district — primary group */}
            {sameDistrictDonors.length > 0 && (
              <>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0' }}>
                  <div style={{ flex: 1, height: 1, background: 'var(--color-border)' }} />
                  <span style={{ fontSize: '0.68rem', fontWeight: 700, color: 'var(--color-hospital)', whiteSpace: 'nowrap' }}>YOUR DISTRICT</span>
                  <div style={{ flex: 1, height: 1, background: 'var(--color-border)' }} />
                </div>
                {sameDistrictDonors.map(d => <DonorRow key={d.id} donor={d} onClick={() => setSelectedDonor(d)} />)}
              </>
            )}

            {/* Other nearby donors */}
            {otherDonors.length > 0 && (
              <>
                {sameDistrictDonors.length > 0 && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0', marginTop: 4 }}>
                    <div style={{ flex: 1, height: 1, background: 'var(--color-border)' }} />
                    <span style={{ fontSize: '0.68rem', fontWeight: 700, color: 'var(--color-muted)', whiteSpace: 'nowrap' }}>OTHER NEARBY</span>
                    <div style={{ flex: 1, height: 1, background: 'var(--color-border)' }} />
                  </div>
                )}
                {otherDonors.map(d => <DonorRow key={d.id} donor={d} onClick={() => setSelectedDonor(d)} />)}
              </>
            )}

            {filteredDonors.length === 0 && (
              <p style={{ fontSize: '0.85rem', color: 'var(--color-muted)', padding: '20px 0', textAlign: 'center' }}>
                No donors found. Try expanding your filters.
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Donor Detail Modal */}
      {selectedDonor && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 20, backdropFilter: 'blur(4px)' }}
          onClick={() => setSelectedDonor(null)}
        >
          <div className="card" style={{ width: '100%', maxWidth: 420, padding: 28, borderRadius: 24 }} onClick={e => e.stopPropagation()}>
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                <div style={{ position: 'relative' }}>
                  <div className="blood-badge" style={{ width: 52, height: 52, fontSize: '0.9rem' }}>{formatBG(selectedDonor.blood_group)}</div>
                  {selectedDonor.is_same_district && (
                    <div style={{ position: 'absolute', bottom: -2, right: -2, width: 18, height: 18, background: 'var(--color-hospital)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, border: '2px solid white' }}>🏙️</div>
                  )}
                </div>
                <div>
                  <h3 style={{ fontSize: '1.1rem', fontWeight: 800 }}>{selectedDonor.user?.name || 'Unknown Donor'}</h3>
                  <div style={{ display: 'flex', gap: 6, marginTop: 4, flexWrap: 'wrap' }}>
                    {selectedDonor.is_same_district && <span className="badge badge-info">YOUR DISTRICT</span>}
                    <span className="badge badge-success">
                      {Math.round((selectedDonor.distance_km || 0) * 10) / 10} km away
                    </span>
                  </div>
                </div>
              </div>
              <button className="btn btn-ghost btn-sm" onClick={() => setSelectedDonor(null)} style={{ padding: 6 }}>
                <X size={18} />
              </button>
            </div>

            {/* Status details */}
            <div style={{ background: 'var(--color-bg-3)', borderRadius: 14, padding: '14px 16px', marginBottom: 16 }}>
              <DetailRow
                icon={<Shield size={14}/>}
                label="Account Status"
                value={selectedDonor.user?.is_blocked ? 'Blocked' : 'Active'}
                valueColor={selectedDonor.user?.is_blocked ? 'var(--color-danger)' : 'var(--color-success)'}
              />
              <DetailRow
                icon={<Activity size={14}/>}
                label="Available for Donation"
                value={selectedDonor.availability_status ? 'Yes — Available' : 'No — Unavailable'}
                valueColor={selectedDonor.availability_status ? 'var(--color-success)' : 'var(--color-danger)'}
              />
              <DetailRow
                icon={<Phone size={14}/>}
                label="Phone"
                value={selectedDonor.user?.phone || 'Not available'}
              />
              <DetailRow
                icon={<Mail size={14}/>}
                label="Email"
                value={selectedDonor.user?.email || 'Not available'}
                noBorder
              />
            </div>

            {/* Location */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', background: 'var(--color-bg-3)', borderRadius: 12, marginBottom: 14 }}>
              <MapPin size={16} color="var(--color-hospital)" />
              <span style={{ fontSize: '0.83rem', color: 'var(--color-text-2)' }}>
                {selectedDonor.address || selectedDonor.district || 'Location not set'}
              </span>
            </div>

            {/* Stats */}
            <div style={{ display: 'flex', gap: 10, marginBottom: 20 }}>
              <div style={{ flex: 1, padding: '12px', background: 'var(--color-bg-3)', borderRadius: 12, textAlign: 'center' }}>
                <p style={{ fontSize: '0.68rem', color: 'var(--color-muted)', marginBottom: 4 }}>Donations</p>
                <p style={{ fontSize: '1.2rem', fontWeight: 800 }}>{selectedDonor.donation_count || 0}</p>
              </div>
              <div style={{ flex: 1, padding: '12px', background: 'var(--color-bg-3)', borderRadius: 12, textAlign: 'center' }}>
                <p style={{ fontSize: '0.68rem', color: 'var(--color-muted)', marginBottom: 4 }}>Score</p>
                <p style={{ fontSize: '1.2rem', fontWeight: 800, color: 'var(--color-success)' }}>{selectedDonor.reliability_score || 100}</p>
              </div>
              <div style={{ flex: 1, padding: '12px', background: 'var(--color-bg-3)', borderRadius: 12, textAlign: 'center' }}>
                <p style={{ fontSize: '0.68rem', color: 'var(--color-muted)', marginBottom: 4 }}>Age</p>
                <p style={{ fontSize: '1.2rem', fontWeight: 800 }}>{selectedDonor.age || '—'}</p>
              </div>
            </div>

            <Link to="/hospital/request" className="btn btn-primary" style={{ width: '100%', justifyContent: 'center', gap: 8 }} onClick={() => setSelectedDonor(null)}>
              <Droplets size={16} /> Create Emergency Request <ArrowRight size={14} />
            </Link>
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
                <div className="blood-badge">{formatBG(r.blood_group)}</div>
                <div style={{ flex: 1 }}>
                  <p style={{ fontSize: '0.88rem', fontWeight: 600 }}>{r.notes || `${formatBG(r.blood_group)} emergency`}</p>
                  <p style={{ fontSize: '0.75rem', color: 'var(--color-muted)' }}>{new Date(r.created_at).toLocaleString()}</p>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 6, color: cfg.color, fontSize: '0.78rem', fontWeight: 700 }}>
                    <Icon size={13} />{cfg.label}
                  </span>
                  <button 
                    onClick={async () => {
                      if (!window.confirm('Are you sure you want to delete this request?')) return;
                      try {
                        await hospitalAPI.deleteRequest(r.id);
                        fetchData();
                      } catch (e) {
                        alert(e.message || 'Failed to delete');
                      }
                    }}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, color: 'var(--color-muted)', display: 'flex' }}
                    title="Delete Request"
                  >
                    <X size={16} />
                  </button>
                </div>
              </div>
            );
          })}
          {requests.length === 0 && <p style={{ fontSize: '0.8rem', color: 'var(--color-muted)' }}>No active requests yet.</p>}
        </div>
      </div>

      {/* Donation History */}
      <div className="card">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <h3 style={{ fontSize: '0.95rem', fontWeight: 700 }}>Donation History</h3>
          <Link to="/hospital/history" className="btn btn-ghost btn-sm">View All</Link>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
            <thead>
              <tr style={{ textAlign: 'left', borderBottom: '1px solid var(--color-border)' }}>
                <th style={{ padding: '12px 8px', color: 'var(--color-muted)' }}>Date</th>
                <th style={{ padding: '12px 8px', color: 'var(--color-muted)' }}>Donor</th>
                <th style={{ padding: '12px 8px', color: 'var(--color-muted)' }}>Blood</th>
                <th style={{ padding: '12px 8px', color: 'var(--color-muted)' }}>Status</th>
                <th style={{ padding: '12px 8px', color: 'var(--color-muted)' }}>Details</th>
              </tr>
            </thead>
            <tbody>
              {history.map(h => (
                <tr key={h.id} style={{ borderBottom: '1px solid var(--color-bg-2)' }}>
                  <td style={{ padding: '12px 8px' }}>{new Date(h.donation_date).toLocaleDateString()}</td>
                  <td style={{ padding: '12px 8px' }}>
                    <strong>{h.donor?.user?.name || 'Primary Donor'}</strong>
                    {h.request?.assignments?.some(a => a.role === 'backup') && (
                      <p style={{ fontSize: '0.65rem', color: 'var(--color-muted)', marginTop: 4 }}>
                        Secondary: {h.request.assignments.find(a => a.role === 'backup')?.donor?.user?.name || 'Assigned'}
                      </p>
                    )}
                  </td>
                  <td style={{ padding: '12px 8px' }}><span className="badge badge-blood">{formatBG(h.request?.blood_group)}</span></td>
                  <td style={{ padding: '12px 8px' }}>
                    <span className={`badge badge-${h.status === 'successful' ? 'success' : 'danger'}`}>
                      {h.status.toUpperCase()}
                    </span>
                  </td>
                  <td style={{ padding: '12px 8px', color: 'var(--color-muted)', fontSize: '0.75rem' }}>{h.notes || '—'}</td>
                </tr>
              ))}
              {history.length === 0 && (
                <tr>
                  <td colSpan="5" style={{ padding: '24px', textAlign: 'center', color: 'var(--color-muted)' }}>No donation history found.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ── Sub-components ──────────────────────────────────────────────────────────────
function DonorRow({ donor, onClick }) {
  return (
    <div
      onClick={onClick}
      style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', background: 'var(--color-bg-3)', borderRadius: 10, cursor: 'pointer', transition: 'background 0.15s', borderLeft: donor.is_same_district ? '3px solid var(--color-hospital)' : '3px solid transparent' }}
      onMouseEnter={e => e.currentTarget.style.background='var(--color-bg-2)'}
      onMouseLeave={e => e.currentTarget.style.background='var(--color-bg-3)'}
    >
      <div className="blood-badge" style={{ width: 34, height: 34, fontSize: '0.72rem' }}>
        {donor.blood_group?.replace('_POS','+').replace('_NEG','-') || 'UNK'}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <p style={{ fontSize: '0.875rem', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{donor.user?.name || 'Donor'}</p>
        </div>
        <p style={{ fontSize: '0.74rem', color: 'var(--color-muted)' }}>
          {donor.district || 'Nearby'} · {Math.round((donor.distance_km || 0) * 10) / 10} km
        </p>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
        <div style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--color-success)', animation: 'pulse-dot 2s infinite' }} />
        <span style={{ fontSize: '0.72rem', color: 'var(--color-success)', fontWeight: 600 }}>Avail.</span>
      </div>
    </div>
  );
}

function DetailRow({ icon, label, value, valueColor, noBorder }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', ...(noBorder ? {} : { borderBottom: '1px solid var(--color-border)' }) }}>
      <span style={{ fontSize: '0.8rem', color: 'var(--color-muted)', display: 'flex', alignItems: 'center', gap: 6 }}>
        {icon}{label}
      </span>
      <span style={{ fontSize: '0.84rem', fontWeight: 700, color: valueColor || 'var(--color-text)', maxWidth: 180, textAlign: 'right', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {value}
      </span>
    </div>
  );
}
