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
  const [searchBG,         setSearchBG]       = useState('');
  const [searchDist,       setSearchDist]     = useState('');
  const [discoveryResults, setDiscoveryResults] = useState([]);
  const [searching,        setSearching]      = useState(false);
  const [activeTab,        setActiveTab]      = useState('overview'); // 'overview' | 'discovery'
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
        socketRef.current.off('request_completed');
        socketRef.current.off('request_cancelled');
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
    socket.on('request_completed', () => fetchData());
    socket.on('request_cancelled', () => fetchData());
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

      // Requirement 167: Initialize responses from persistent notificationTokens
      const active = (reqRes.data || []).find(r => 
        ['awaiting_confirmation', 'donor_search', 'assigned', 'in_transit'].includes(r.status)
      );
      if (active && active.notificationTokens) {
        const confirmedResponses = active.notificationTokens.map(t => ({
          requestId: active.id,
          donorId: t.donor_id,
          donorName: t.donor?.user?.name || 'A donor',
          token: t.token,
          time: t.responded_at
        }));
        setResponses(confirmedResponses);
      }
    } catch (err) {
      console.error('Failed to fetch hospital dashboard data', err);
    } finally {
      setSyncing(false);
    }
  };

  const handleSearchDonors = async (e) => {
    e.preventDefault();
    if (!searchBG) return alert('Please select a blood group');
    try {
      setSearching(true);
      const res = await hospitalAPI.searchDonors({ bloodGroup: searchBG, district: searchDist });
      setDiscoveryResults(res.data || []);
    } catch (err) {
      alert('Search failed: ' + err.message);
    } finally {
      setSearching(false);
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
      }, { enableHighAccuracy: true, timeout: 10000 });
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

  if (loading) return <div style={{ padding: 40, textAlign: 'center' }}>Loading dashboard...</div>;

  return (
    <div className="dashboard-container">
      {/* ─── TAB NAVIGATION ────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: 30, marginBottom: 24, borderBottom: '1px solid var(--color-border)' }}>
        <button 
          onClick={() => setActiveTab('overview')} 
          style={{ padding: '12px 4px', background: 'none', border: 'none', borderBottom: activeTab === 'overview' ? '3px solid var(--color-hospital)' : '3px solid transparent', color: activeTab === 'overview' ? 'var(--color-hospital)' : 'var(--color-muted)', fontWeight: 700, cursor: 'pointer', transition: '0.2s' }}
        >
          Overview
        </button>
        <button 
          onClick={() => setActiveTab('discovery')} 
          style={{ padding: '12px 4px', background: 'none', border: 'none', borderBottom: activeTab === 'discovery' ? '3px solid var(--color-hospital)' : '3px solid transparent', color: activeTab === 'discovery' ? 'var(--color-hospital)' : 'var(--color-muted)', fontWeight: 700, cursor: 'pointer', transition: '0.2s' }}
        >
          Donor Discovery
        </button>
      </div>

      {activeTab === 'overview' ? (
        <div className="fade-in" style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          {/* Live Alerts Feed */}
          {liveAlerts.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {liveAlerts.map((a, i) => (
                <div key={i} style={{ background: a.type === 'accepted' ? 'rgba(34,197,94,0.08)' : 'rgba(2,132,199,0.08)', border: `1px solid ${a.type === 'accepted' ? 'rgba(34,197,94,0.3)' : 'rgba(2,132,199,0.3)'}`, borderRadius: 12, padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12, fontSize: '0.85rem' }}>
                  <span style={{ fontSize: '1.2rem' }}>{a.type === 'accepted' ? '🏃' : a.type === 'failover' ? '🚨' : a.type === 'failed' ? '❌' : '✅'}</span>
                  <div style={{ flex: 1 }}>
                    {a.type === 'failover' ? (
                      <p><strong>Emergency Alert:</strong> {a.message} {a.newPrimaryName && <span>New Primary: <strong>{a.newPrimaryName}</strong></span>}</p>
                    ) : (
                      <p><strong>{a.donorName || 'A Donor'}</strong> {a.type === 'accepted' ? 'is en route to the hospital!' : 'confirmed availability.'}</p>
                    )}
                  </div>
                  <button onClick={() => setLiveAlerts(p => p.filter((_, j) => j !== i))} style={{ background: 'none', border: 'none', cursor: 'pointer', opacity: 0.5 }}><X size={16}/></button>
                </div>
              ))}
            </div>
          )}

          {/* Active Request View */}
          {activeReq && (
            <div className="card" style={{ borderLeft: '5px solid var(--color-hospital)', background: 'rgba(255,255,255,0.02)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 20 }}>
                <div style={{ display: 'flex', gap: 16 }}>
                  <div className="blood-badge" style={{ width: 60, height: 60, fontSize: '1.1rem' }}>{formatBG(activeReq.blood_group)}</div>
                  <div>
                    <h3 style={{ fontSize: '1.1rem', fontWeight: 800 }}>Active Emergency Request</h3>
                    <p style={{ color: 'var(--color-muted)', fontSize: '0.85rem', marginTop: 4 }}>{activeReq.location_name || activeReq.notes || 'Emergency in progress'}</p>
                    <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                       <span className={`badge badge-${activeReq.emergency_level === 'critical' ? 'danger' : 'warning'}`}>{activeReq.emergency_level.toUpperCase()}</span>
                       <span className="badge badge-info">{activeReq.status.replace(/_/g, ' ')}</span>
                    </div>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 12 }}>
                  {activeReq.status === 'awaiting_confirmation' && (
                    <button className="btn btn-success" onClick={handleFinalize} disabled={finalizing}>
                      {finalizing ? 'Finalizing...' : `Finalize (${Math.max(responses.length, activeReq?._count?.notificationTokens || 0)})`}
                    </button>
                  )}
                  <Link to="/hospital/tracking" className="btn btn-primary" style={{ gap: 8 }}>
                    <MapPin size={18} /> Track Donor
                  </Link>
                </div>
              </div>
            </div>
          )}

          <div className="grid-2">
            <div>
              {/* KPI Section */}
              <div className="grid-2" style={{ gap: 16, marginBottom: 16 }}>
                 <div className="card kpi-card" style={{ '--kpi-color': 'var(--color-hospital)' }}>
                    <p className="kpi-label">Active</p>
                    <p className="kpi-value">{requests.filter(r => !['completed','cancelled','failed'].includes(r.status)).length}</p>
                 </div>
                 <div className="card kpi-card" style={{ '--kpi-color': 'var(--color-success)' }}>
                    <p className="kpi-label">Completed</p>
                    <p className="kpi-value">{requests.filter(r => r.status === 'completed').length}</p>
                 </div>
              </div>
              
              {/* Quick Actions */}
              <Link to="/hospital/request" className="card" style={{ display: 'flex', alignItems: 'center', gap: 20, border: '2px dashed var(--color-border)', textDecoration: 'none', transition: '0.2s' }} onMouseEnter={e => e.currentTarget.style.borderColor='var(--color-hospital)'} onMouseLeave={e => e.currentTarget.style.borderColor='var(--color-border)'}>
                 <div style={{ width: 60, height: 60, borderRadius: 16, background: 'rgba(239,68,68,0.1)', color: '#ef4444', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Droplets size={28}/></div>
                 <div>
                    <h3 style={{ fontSize: '1.1rem', fontWeight: 800, color: 'var(--color-text)' }}>New Emergency Request</h3>
                    <p style={{ color: 'var(--color-muted)', fontSize: '0.85rem' }}>Broadcast to nearby donors</p>
                 </div>
              </Link>
            </div>

            {/* Nearby Sidebar */}
            <div className="card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                <h3 style={{ fontSize: '1rem', fontWeight: 800 }}>Donors Nearby</h3>
                <button onClick={handleSyncLocation} disabled={syncing} className="btn btn-ghost btn-sm" style={{ fontSize: '0.75rem', gap: 6 }}>
                  <MapPin size={14} /> {syncing ? 'Syncing...' : 'Sync Location'}
                </button>
              </div>
              <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
                 <select value={filterBloodGroup} onChange={e => setFilterBG(e.target.value)} className="input" style={{ flex: 1, padding: 8, fontSize: '0.85rem' }}>
                    <option value="">All Groups</option>
                    {['A_POS','A_NEG','B_POS','B_NEG','O_POS','O_NEG','AB_POS','AB_NEG'].map(g => <option key={g} value={g}>{formatBG(g)}</option>)}
                 </select>
              </div>
              <div style={{ maxHeight: 300, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8 }}>
                {filteredDonors.map(d => <DonorRow key={d.id} donor={d} onClick={() => setSelectedDonor(d)} />)}
              </div>
            </div>
          </div>

          {/* History */}
          <div className="card">
            <h3 style={{ fontSize: '1.1rem', fontWeight: 800, marginBottom: 20 }}>Recent Emergency History</h3>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ textAlign: 'left', color: 'var(--color-muted)', fontSize: '0.85rem', borderBottom: '1px solid var(--color-border)' }}>
                    <th style={{ padding: '12px 8px' }}>Date</th>
                    <th style={{ padding: '12px 8px' }}>Blood Group</th>
                    <th style={{ padding: '12px 8px' }}>Status</th>
                    <th style={{ padding: '12px 8px' }}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {requests.slice(0, 5).map(r => (
                    <tr key={r.id} style={{ borderBottom: '1px solid var(--color-bg-3)', fontSize: '0.9rem' }}>
                      <td style={{ padding: '14px 8px' }}>{new Date(r.created_at).toLocaleDateString()}</td>
                      <td style={{ padding: '14px 8px' }}><span className="badge badge-blood">{formatBG(r.blood_group)}</span></td>
                      <td style={{ padding: '14px 8px' }}>
                         <span style={{ fontWeight: 700, fontSize: '0.8rem', color: STATUS_CONFIG[r.status]?.color }}>{STATUS_CONFIG[r.status]?.label.toUpperCase()}</span>
                      </td>
                      <td style={{ padding: '14px 8px' }}>
                        <Link to="/hospital/history" style={{ color: 'var(--color-hospital)', textDecoration: 'none', fontWeight: 700 }}>View Details</Link>
                      </td>
                    </tr>
                  ))}
                  {requests.length === 0 && (
                    <tr>
                      <td colSpan="4" style={{ padding: '24px', textAlign: 'center', color: 'var(--color-muted)' }}>No requests found.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : (
        /* ─── DONOR DISCOVERY TAB ─────────────────────────── */
        <div className="fade-in">
           <div className="card" style={{ marginBottom: 24, padding: 32 }}>
              <div style={{ maxWidth: 800 }}>
                <h2 style={{ fontSize: '1.5rem', fontWeight: 900, marginBottom: 8 }}>Donor Discovery Tool</h2>
                <p style={{ color: 'var(--color-muted)', marginBottom: 28 }}>Search for potential donors in your area for scheduled operations or stock maintenance.</p>
                <form onSubmit={handleSearchDonors} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: 20, alignItems: 'flex-end' }}>
                   <div>
                      <label style={{ fontSize: '0.75rem', fontWeight: 800, color: 'var(--color-muted)', textTransform: 'uppercase', marginBottom: 10, display: 'block' }}>Required Blood Group</label>
                      <select className="input" value={searchBG} onChange={e => setSearchBG(e.target.value)} style={{ height: 52, borderRadius: 12 }}>
                         <option value="">Select Group</option>
                         {['A_POS', 'A_NEG', 'B_POS', 'B_NEG', 'AB_POS', 'AB_NEG', 'O_POS', 'O_NEG'].map(bg => (
                            <option key={bg} value={bg}>{formatBG(bg)}</option>
                         ))}
                      </select>
                   </div>
                   <div>
                      <label style={{ fontSize: '0.75rem', fontWeight: 800, color: 'var(--color-muted)', textTransform: 'uppercase', marginBottom: 10, display: 'block' }}>Search District / City</label>
                      <input className="input" placeholder="e.g. Chennai" value={searchDist} onChange={e => setSearchDist(e.target.value)} style={{ height: 52, borderRadius: 12 }} />
                   </div>
                   <button type="submit" className="primary-btn" disabled={searching} style={{ height: 52, padding: '0 40px', borderRadius: 12, display: 'flex', alignItems: 'center', gap: 10 }}>
                      {searching ? <Activity className="spin" size={20}/> : <Droplets size={20}/>}
                      {searching ? 'SEARCHING...' : 'FIND DONORS'}
                   </button>
                </form>
              </div>
           </div>

           <div className="grid grid-3" style={{ gap: 24 }}>
              {discoveryResults.length === 0 ? (
                 <div className="card" style={{ gridColumn: 'span 3', textAlign: 'center', padding: '100px 20px', background: 'rgba(255,255,255,0.01)', border: '2px dashed var(--color-border)' }}>
                    <div style={{ width: 80, height: 80, borderRadius: '50%', background: 'rgba(2,132,199,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 24px' }}>
                      <Activity size={40} color="var(--color-hospital)" style={{ opacity: 0.3 }} />
                    </div>
                    <h3 style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--color-text)' }}>No Donors Selected</h3>
                    <p style={{ color: 'var(--color-muted)', maxWidth: 400, margin: '8px auto 0' }}>Search to see available donors who match your required blood group and district.</p>
                 </div>
              ) : (
                 discoveryResults.map(donor => (
                    <div key={donor.id} className="card donor-discovery-card" style={{ border: '1px solid var(--color-border)', overflow: 'hidden', padding: 0, transition: '0.3s' }}>
                       <div style={{ height: 8, background: 'linear-gradient(90deg, #ef4444, #b91c1c)' }} />
                       <div style={{ padding: 24 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
                            <div style={{ width: 48, height: 48, borderRadius: 12, background: 'rgba(239,68,68,0.1)', color: '#ef4444', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900, fontSize: '1rem' }}>
                              {formatBG(donor.bloodGroup || donor.blood_group)}
                            </div>
                            <span style={{ fontSize: '0.7rem', fontWeight: 800, background: 'rgba(34,197,94,0.1)', color: '#16a34a', padding: '4px 10px', borderRadius: 20 }}>AVAILABLE</span>
                        </div>
                        <h3 style={{ fontSize: '1.15rem', fontWeight: 800, marginBottom: 4 }}>{donor.name || donor.user?.name}</h3>
                        <p style={{ color: 'var(--color-muted)', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: 6 }}>
                          <MapPin size={14} /> {donor.district}
                        </p>
                        <hr style={{ margin: '20px 0', border: 'none', borderTop: '1px solid var(--color-border)' }} />
                        <button className="btn btn-ghost" onClick={() => setSelectedDonor(donor)} style={{ width: '100%', justifyContent: 'center', fontWeight: 700, fontSize: '0.85rem', gap: 8 }}>
                          VIEW PROFILE <ArrowRight size={16} />
                        </button>
                       </div>
                    </div>
                 ))
              )}
           </div>
        </div>
      )}

      {/* ─── DONOR PROFILE MODAL ─────────────────────────── */}
      {selectedDonor && (
        <div className="modal-overlay" onClick={() => setSelectedDonor(null)} style={{ position: 'fixed', inset: 0, zIndex: 5000, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(8px)' }}>
          <div className="modal-content" style={{ width: '95%', maxWidth: 500, padding: 0, overflow: 'hidden', borderRadius: 32, position: 'relative' }} onClick={e => e.stopPropagation()}>
            <div style={{ background: 'linear-gradient(135deg, var(--color-hospital), #0ea5e9)', padding: '48px 40px', color: 'white' }}>
              <button 
                onClick={() => setSelectedDonor(null)} 
                style={{ position: 'absolute', top: 24, right: 24, background: 'rgba(255,255,255,0.2)', border: 'none', color: 'white', cursor: 'pointer', padding: 10, borderRadius: '50%', display: 'flex' }}
              >
                <X size={20} />
              </button>
              <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
                <div style={{ width: 88, height: 88, borderRadius: '50%', background: 'white', color: '#ef4444', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.75rem', fontWeight: 900, boxShadow: '0 10px 30px rgba(0,0,0,0.2)' }}>
                  {formatBG(selectedDonor.blood_group || selectedDonor.bloodGroup)}
                </div>
                <div>
                  <h2 style={{ fontSize: '2rem', fontWeight: 900, letterSpacing: '-0.02em' }}>{selectedDonor.name || selectedDonor.user?.name}</h2>
                  <div style={{ display: 'flex', gap: 12, marginTop: 6, opacity: 0.9, fontSize: '0.95rem', fontWeight: 600 }}>
                    <span>{selectedDonor.age} Years</span>
                    <span>•</span>
                    <span>{selectedDonor.district}</span>
                  </div>
                </div>
              </div>
            </div>

            <div style={{ padding: 40 }}>
              <h3 style={{ fontSize: '0.75rem', fontWeight: 800, color: 'var(--color-muted)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 24 }}>Contact Details</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 20, padding: 20, background: 'var(--color-bg-3)', borderRadius: 20, border: '1px solid var(--color-border)' }}>
                  <div style={{ width: 44, height: 44, borderRadius: 14, background: 'rgba(2,132,199,0.1)', color: 'var(--color-hospital)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Phone size={22} />
                  </div>
                  <div>
                    <label style={{ fontSize: '0.7rem', color: 'var(--color-muted)', fontWeight: 800, display: 'block', marginBottom: 2 }}>PHONE NUMBER</label>
                    <p style={{ fontSize: '1.1rem', fontWeight: 800 }}>{selectedDonor.phone || selectedDonor.user?.phone || 'Not Shared'}</p>
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 20, padding: 20, background: 'var(--color-bg-3)', borderRadius: 20, border: '1px solid var(--color-border)' }}>
                  <div style={{ width: 44, height: 44, borderRadius: 14, background: 'rgba(2,132,199,0.1)', color: 'var(--color-hospital)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Mail size={22} />
                  </div>
                  <div>
                    <label style={{ fontSize: '0.7rem', color: 'var(--color-muted)', fontWeight: 800, display: 'block', marginBottom: 2 }}>EMAIL ADDRESS</label>
                    <p style={{ fontSize: '1.1rem', fontWeight: 800, textTransform: 'lowercase' }}>{selectedDonor.email || selectedDonor.user?.email || 'Not Shared'}</p>
                  </div>
                </div>
              </div>
              <div style={{ marginTop: 40, display: 'flex', gap: 16 }}>
                 <a href={`tel:${selectedDonor.phone || selectedDonor.user?.phone}`} className="primary-btn" style={{ flex: 1, textDecoration: 'none', textAlign: 'center', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, borderRadius: 16, height: 56 }}>
                    <Phone size={18}/> CALL NOW
                 </a>
                 <button onClick={() => setSelectedDonor(null)} className="btn btn-ghost" style={{ flex: 1, borderRadius: 16, height: 56, border: '1px solid var(--color-border)' }}>CLOSE</button>
              </div>
            </div>
          </div>
        </div>
      )}
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
        {donor.blood_group?.replace('_POS','+').replace('_NEG','-') || donor.bloodGroup?.replace('_POS','+').replace('_NEG','-') || 'UNK'}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <p style={{ fontSize: '0.875rem', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{donor.user?.name || donor.name || 'Donor'}</p>
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
