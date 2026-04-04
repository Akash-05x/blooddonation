import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from 'react-leaflet';
import L from 'leaflet';
import { hospitalAPI } from '../../utils/api';
import { connectSocket } from '../../utils/socket';
import { Phone, AlertTriangle, CheckCircle, Navigation, WifiOff, MapPin, X, ArrowRight, Maximize2, Minimize2 } from 'lucide-react';

// Fix Leaflet default icons
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl:       'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl:     'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

const hospitalIcon = L.divIcon({
  html: `<div style="width:44px;height:44px;background:linear-gradient(135deg,#b91c1c,#991b1b);border-radius:50%;display:flex;align-items:center;justify-content:center;border:3px solid white;box-shadow:0 4px 16px rgba(185,28,28,0.6);font-size:20px;">🏥</div>`,
  className: '', iconSize: [44, 44], iconAnchor: [22, 22],
});

const donorIcon = L.divIcon({
  html: `<div style="width:48px;height:48px;background:linear-gradient(135deg,#b91c1c,#ef4444);border-radius:50%;display:flex;align-items:center;justify-content:center;border:3px solid white;box-shadow:0 4px 16px rgba(185,28,28,0.6);font-size:22px;animation:pulse 2s infinite;">👤</div>`,
  className: '', iconSize: [48, 48], iconAnchor: [24, 24],
});

const formatBG = key => key?.replace('_POS', '+').replace('_NEG', '-') || key;

function FitBounds({ positions, trigger }) {
  const map = useMap();
  useEffect(() => {
    if (positions && positions.length >= 2) {
      map.fitBounds(positions, { padding: [80, 80], animate: true });
    }
  }, [trigger, map]);
  return null;
}

function MapResizer({ trigger }) {
  const map = useMap();
  useEffect(() => {
    map.invalidateSize();
    const timer = setTimeout(() => map.invalidateSize(), 400); 
    return () => clearTimeout(timer);
  }, [trigger, map]);
  return null;
}

function calcDist(pos1, pos2) {
  if (!pos1 || !pos2) return null;
  const dLat = pos1[0] - pos2[0];
  const dLon = pos1[1] - pos2[1];
  return parseFloat((Math.sqrt(dLat * dLat + dLon * dLon) * 111).toFixed(1));
}

export default function DonorTrackingMap() {
  const navigate = useNavigate();
  const [activeReq,    setActiveReq]    = useState(null);
  const [loading,      setLoading]      = useState(true);
  const [donorPos,     setDonorPos]     = useState(null);
  const [donorPositions, setDonorPositions] = useState({}); // { donorId: [lat, lng] }
  const [donorTrails,   setDonorTrails]   = useState({});   // { donorId: [[lat, lng], ...] }
  const [hospitalPos,  setHospitalPos]  = useState(null);
  const [socketStatus, setSocketStatus] = useState('connecting');
  const [promoted,     setPromoted]     = useState(false);
  const [completed,    setCompleted]    = useState(false);
  const [showDonation, setShowDonation] = useState(false);
  const [markingArrival, setMarkingArrival] = useState(false);
  const [donationNotes, setDonationNotes] = useState('');
  const [error,        setError]        = useState('');
  const [sidebarVisible, setSidebarVisible] = useState(true);
  const [recenterCounter, setRecenterCounter] = useState(0);
  const socketRef = useRef(null);

  useEffect(() => {
    fetchActiveTracking();
    return () => {
      if (socketRef.current) {
        socketRef.current.off('donor_location_update');
        socketRef.current.off('tracking_stopped');
        socketRef.current.off('failover_alert');
        socketRef.current.off('request_status_update');
        socketRef.current.off('donor_accepted');
        socketRef.current.off('new_primary_promoted');
      }
    };
  }, []);

  const fetchActiveTracking = async (preserveExisting = false) => {
    try {
      const res  = await hospitalAPI.getRequests({ limit: 50 });
      const reqs = res.data || [];
      const active = reqs.find(r => 
        ['created', 'active', 'assigned', 'in_transit', 'awaiting_confirmation', 'awaiting_assignment', 'donor_search'].includes(r.status)
      );
      
      // CRITICAL FIX: If we have a current active session and fetch returns null (e.g. during
      // DB transition/lock window), do NOT clear the existing session — it would close the map.
      if (active) {
        setActiveReq(active);
      } else if (!preserveExisting) {
        // Only clear if this is an initial load
        setActiveReq(null);
      }
      // If preserveExisting=true and active is null, we keep the old activeReq

      if (active) {
        try {
          const trackRes = await hospitalAPI.getRequestTracking(active.id);
          const loc      = trackRes?.data?.lastLocation;
          if (loc) {
            const pos = [loc.latitude, loc.longitude];
            setDonorPos(pos);
            const donorId = active.assignments?.find(a => a.role === 'primary' && a.status === 'accepted')?.donor?.user_id;
            if (donorId) {
              setDonorPositions(prev => ({ ...prev, [donorId]: pos }));
              setDonorTrails(prev => ({ ...prev, [donorId]: [pos] }));
            }
          }
          const h = trackRes?.data?.hospital;
          const mapLat = active.request_lat || h?.latitude;
          const mapLng = active.request_lng || h?.longitude;
          if (mapLat && mapLng) setHospitalPos([mapLat, mapLng]);
        } catch (_) {}

        setupSocket(active);
      }
    } catch (err) {
      console.error('Failed to get active tracking:', err);
      setError('Failed to load tracking data.');
    } finally {
      setLoading(false);
    }
  };

  const setupSocket = useCallback((request) => {
    const socket = connectSocket();
    if (!socket) { setSocketStatus('disconnected'); return; }
    socketRef.current = socket;

    socket.on('connect',    () => setSocketStatus('connected'));
    socket.on('disconnect', () => setSocketStatus('disconnected'));

    socket.on('donor_location_update', (data) => {
      if (data.requestId !== request.id) return;
      
      const pos = [data.latitude, data.longitude];
      setDonorPositions(prev => ({ ...prev, [data.donorUserId]: pos }));
      setDonorTrails(prev => {
        const trail = prev[data.donorUserId] || [];
        return { ...prev, [data.donorUserId]: [...trail.slice(-60), pos] };
      });

      setActiveReq(prev => {
        if (!prev) return prev;
        const primaryAssignment = prev.assignments?.find(a => a.role === 'primary');
        if (primaryAssignment && data.donorUserId === primaryAssignment.donor?.user_id) {
          setDonorPos(pos); // Keep legacy donorPos for main card/route if it's the primary
        }
        return prev;
      });
    });

    socket.on('tracking_stopped', (data) => {
      if (data.requestId === request.id) setSocketStatus('arrived');
    });

    socket.on('request_completed', (data) => {
      if (data.requestId === request.id) setCompleted(true);
    });

    socket.on('failover_alert', (data) => {
      if (data.requestId === request.id) {
        setPromoted(true);
        // Do NOT re-fetch here — the DB transaction may not be committed yet.
        // new_primary_promoted event (emitted after DB commit) handles the refresh.
      }
    });

    socket.on('donor_accepted', (data) => {
      if (data.requestId === request.id) {
        fetchActiveTracking();
      }
    });

    socket.on('request_status_update', (data) => {
      if (data.requestId === request.id) {
        setActiveReq(prev => prev ? { ...prev, status: data.status } : prev);
        // If assigned, re-fetch to get the new donor name/details immediately
        if (data.status === 'assigned') {
          fetchActiveTracking(true);
        }
      }
    });

    socket.on('new_primary_promoted', (data) => {
      if (data.requestId === request.id) {
        console.log(`[Socket] New primary donor promoted: ${data.donorName}`);
        setPromoted(true);
        
        // Immediately update donor position if we already have their trail
        if (data.donorUserId && donorPositions[data.donorUserId]) {
          setDonorPos(donorPositions[data.donorUserId]);
        }

        // Instant visual patch: update assignment info from socket event data
        // so the sidebar shows the new donor name/phone without waiting for fetch
        if (data.donorName) {
          setActiveReq(prev => {
            if (!prev) return prev;
            let found = false;
            let newAssignments = (prev.assignments || []).map(a => {
              if (a.donor?.user_id === data.donorUserId) {
                found = true;
                return {
                  ...a,
                  role: 'primary',
                  status: 'accepted',
                  donor: {
                    ...a.donor,
                    user: { ...(a.donor?.user || {}), name: data.donorName, phone: data.donorPhone }
                  }
                };
              }
              // STRICT RESET: Demote any other "primary" to reserve
              if (a.role === 'primary') {
                return { ...a, role: 'reserve' };
              }
              return a;
            });

            // If new primary wasn't in the list (e.g. late confirmed), add them now
            if (!found) {
              newAssignments.push({
                id: `new-${Date.now()}`,
                role: 'primary',
                status: 'accepted',
                donor: {
                  user_id: data.donorUserId,
                  user: { id: data.donorUserId, name: data.donorName, phone: data.donorPhone }
                }
              });
            }

            return { ...prev, assignments: newAssignments };
          });
        }

        // CRITICAL: Double re-fetch to ensure sync. One immediate, one delayed.
        fetchActiveTracking(true); // Soft refresh
        setTimeout(() => fetchActiveTracking(false), 2500); // Hardy refresh after settle
      }
    });

    setSocketStatus(socket.connected ? 'connected' : 'connecting');
  }, []);

  const [routeCoords, setRouteCoords] = useState([]);

  const fetchRoadRoute = async (start, end) => {
    try {
      const url = `https://router.project-osrm.org/route/v1/driving/${start[1]},${start[0]};${end[1]},${end[0]}?overview=full&geometries=geojson`;
      const res = await fetch(url);
      const data = await res.json();
      if (data.routes && data.routes.length > 0) {
        const coords = data.routes[0].geometry.coordinates.map(c => [c[1], c[0]]);
        setRouteCoords(coords);
      }
    } catch (err) {
      console.error('OSRM Fetch Error:', err);
    }
  };

  useEffect(() => {
    if (completed) {
      const timer = setTimeout(() => {
        navigate('/hospital');
      }, 3000); // 3 seconds is plenty for feedback
      return () => clearTimeout(timer);
    }
  }, [completed]);

  useEffect(() => {
    if (donorPos && hospitalPos) {
      fetchRoadRoute(donorPos, hospitalPos);
    }
  }, [donorPos, hospitalPos]);

  const handlePromoteBackup = async () => {
    if (!activeReq) return;
    try {
      await hospitalAPI.promoteBackup(activeReq.id);
      setPromoted(true);
    } catch (err) { setError(err.message || 'Failed to promote backup donor.'); }
  };

  const handleMarkArrival = async () => {
    if (!activeReq || markingArrival) return;

    // ROBUST FIX: Re-fetch latest request state before marking arrival.
    // This prevents stale local-state bugs after promotion where the new 
    // primary might not yet have status === 'accepted' in the cached data.
    let currentReq = activeReq;
    try {
      const res = await hospitalAPI.getRequests({ limit: 50 });
      const reqs = res.data || [];
      const fresh = reqs.find(r => r.id === activeReq.id);
      if (fresh) {
        currentReq = fresh;
        setActiveReq(fresh);
      }
    } catch (_) { /* use cached state as fallback */ }

    // Find the active primary — exclude only terminal statuses.
    // 'pending' is valid right after promotion before donor starts navigating.
    const primary = currentReq.assignments?.find(
      a => a.role === 'primary' && !['failed', 'rejected', 'cancelled', 'closed'].includes(a.status)
    );
    
    if (!primary) { 
      setError('No active primary donor found. Please wait a moment and try again.'); 
      return; 
    }
    
    setMarkingArrival(true);
    setError('');
    try {
      await hospitalAPI.markArrival(primary.id);
      // Simplified: Mark arrival now concludes the entire flow instantly
      setCompleted(true);
      setTimeout(() => navigate('/hospital'), 1500);
    } catch (err) { 
      console.error('Mark Arrival Error:', err);
      setError(err.response?.data?.message || err.message || 'Failed to conclude donation.'); 
    } finally {
      setMarkingArrival(false);
    }
  };

  const handleMarkDonation = async () => {
    if (!activeReq) return;
    try {
      const primaryAssignment = activeReq.assignments?.find(
        a => a.role === 'primary' && !['failed', 'rejected', 'cancelled', 'closed'].includes(a.status)
      );
      if (!primaryAssignment) { setError('No primary assignment found.'); return; }
      
      await hospitalAPI.markDonation({
        assignmentId: primaryAssignment.id,
        donorId:      primaryAssignment.donor_id,
        status:       'successful',
        notes:        donationNotes,
      });

      // Immediate visual feedback then redirect
      setShowDonation(false);
      setCompleted(true);
      
      // Auto-redirect after a shorter delay (1s) for satisfaction
      setTimeout(() => navigate('/hospital'), 1500);
    } catch (err) { 
      console.error('Mark donation error:', err);
      setError(err.response?.data?.message || err.message || 'Failed to mark donation.'); 
    }
  };

  if (loading) return (
    <div style={{ textAlign: 'center', padding: '80px 0', color: 'var(--color-muted)' }}>Loading tracking session...</div>
  );

  if (!activeReq) return (
    <div style={{ textAlign: 'center', padding: '80px 0', color: 'var(--color-muted)' }}>
      <div style={{ fontSize: '3rem', marginBottom: 16 }}>📡</div>
      <p style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: 8 }}>No active tracking session</p>
      <p style={{ fontSize: '0.85rem' }}>Submit an emergency request to see live donor tracking.</p>
    </div>
  );

  const primaryAssignment = activeReq.assignments?.find(a => a.role === 'primary' && a.status !== 'failed');
  const isSearching = ['created', 'active', 'donor_search', 'awaiting_confirmation', 'awaiting_assignment'].includes(activeReq.status);
  const donorName  = primaryAssignment?.donor?.user?.name || (isSearching ? 'Searching for donors...' : 'Assigned Donor');
  const hPos = [activeReq?.request_lat || activeReq?.hospital?.latitude || 8.7642, activeReq?.request_lng || activeReq?.hospital?.longitude || 78.1348];
  const mapPositions = donorPos ? [hPos, donorPos] : [hPos];
  const distKm = calcDist(donorPos, hPos);
  const eta = distKm !== null ? Math.ceil(distKm * 3) : null;

  return (
    <div style={{ position: 'fixed', inset: 0, background: '#0f172a', zIndex: 100, display: 'flex', overflow: 'hidden' }}>
      {/* 1. Map Section (Left/Main) */}
      <div style={{ position: 'relative', flex: 1, height: '100%', transition: 'all 0.4s cubic-bezier(0.4, 0, 0.2, 1)' }}>
        <MapContainer center={hPos} zoom={15} style={{ height: '100%', width: '100%' }} zoomControl={false} attributionControl={false}>
          <TileLayer
            url="http://mt0.google.com/vt/lyrs=m&hl=en&x={x}&y={y}&z={z}"
            attribution="&copy; Google Maps"
          />
          <MapResizer trigger={sidebarVisible} />
          <FitBounds positions={routeCoords.length > 2 ? routeCoords : mapPositions} trigger={recenterCounter} />

          {/* Hospital marker */}
          <Marker position={hPos} icon={hospitalIcon}>
            <Popup>🏥 Your Hospital</Popup>
          </Marker>

          {/* Donor markers + routes — only show active (non-failed) donors */}
          {Object.entries(donorPositions).map(([donorUserId, pos]) => {
            const assignment = activeReq.assignments?.find(a => a.donor?.user_id === donorUserId);
            // Skip failed/rejected donors — they should not appear on map
            if (!assignment || assignment.status === 'failed' || assignment.status === 'rejected') return null;
            
            const isPrimary = assignment.role === 'primary' && assignment.status === 'accepted';
            const trail = donorTrails[donorUserId] || [];
            
            return (
              <div key={donorUserId}>
                <Marker position={pos} icon={donorIcon}>
                  <Popup>
                    👤 {assignment?.donor?.user?.name || 'Donor'} ({isPrimary ? '🔴 Primary' : 'Standby'}) 
                    <br/> {formatBG(activeReq.blood_group)} · {calcDist(pos, hPos)} km
                  </Popup>
                </Marker>
                {trail.length > 1 && (
                  <Polyline positions={trail} color={isPrimary ? "#f43f5e" : "#94a3b8"} weight={3} opacity={0.4} />
                )}
                {isPrimary && (
                  <Polyline
                    positions={routeCoords.length > 0 ? routeCoords : [pos, hPos]}
                    color="#b91c1c"
                    weight={6}
                    opacity={0.9}
                    lineCap="round"
                    lineJoin="round"
                  />
                )}
              </div>
            );
          })}
        </MapContainer>

        {/* Floating Top Overlays on Map */}
        <div style={{ position: 'absolute', top: 20, left: 20, zIndex: 1100, display: 'flex', gap: 12 }}>
          <button
            onClick={() => window.history.back()}
            style={{ width: 44, height: 44, borderRadius: '50%', background: 'white', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', boxShadow: '0 8px 24px rgba(0,0,0,0.15)' }}
          >
            <X size={20} color="#111827" />
          </button>
          
          <div style={{ background: 'rgba(15,23,42,0.9)', backdropFilter: 'blur(12px)', borderRadius: 30, padding: '10px 20px', display: 'flex', alignItems: 'center', gap: 10, border: '1px solid rgba(255,255,255,0.1)', boxShadow: '0 8px 24px rgba(0,0,0,0.2)' }}>
            <div style={{ width: 10, height: 10, borderRadius: '50%', background: (completed || socketStatus === 'arrived') ? '#22c55e' : socketStatus === 'connected' ? '#22c55e' : '#f59e0b', animation: 'pulse 1.5s infinite' }} />
            <span style={{ color: 'white', fontSize: '0.88rem', fontWeight: 800 }}>
              {completed ? 'SUCCESS' : socketStatus === 'arrived' ? 'ARRIVED' : 'LIVE TRACKING'}
            </span>
          </div>
        </div>

        {/* Maximize/Minimize Toggle Button */}
        <button
          onClick={() => setSidebarVisible(!sidebarVisible)}
          style={{
            position: 'absolute', top: 20, right: 20, zIndex: 1100,
            width: 44, height: 44, borderRadius: 12, background: 'white', border: 'none',
            display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
            boxShadow: '0 8px 24px rgba(0,0,0,0.15)', transition: 'all 0.3s'
          }}
        >
          {sidebarVisible ? <Maximize2 size={20} color="#111827" /> : <Minimize2 size={20} color="#111827" />}
        </button>
      </div>

      {/* 2. Info Sidebar (Right) */}
      <div style={{
        width: sidebarVisible ? 420 : 0,
        opacity: sidebarVisible ? 1 : 0,
        height: '100%',
        background: 'white',
        borderLeft: '1px solid #e2e8f0',
        display: 'flex',
        flexDirection: 'column',
        transition: 'all 0.4s cubic-bezier(0.4, 0, 0.2, 1)',
        zIndex: 100,
        overflow: 'hidden',
        position: 'relative'
      }}>
        <div style={{ width: 420, height: '100%', display: 'flex', flexDirection: 'column', padding: '32px 24px' }}>
          {/* Header */}
          <div style={{ marginBottom: 32 }}>
            <h2 style={{ fontSize: '1.75rem', fontWeight: 900, color: '#111827', letterSpacing: '-0.02em', marginBottom: 8 }}>
              Donor Tracking
            </h2>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ background: '#fee2e2', color: '#dc2626', padding: '4px 12px', borderRadius: 20, fontSize: '0.75rem', fontWeight: 900 }}>
                {activeReq.emergency_level?.toUpperCase()} EMERGENCY
              </span>
              <span style={{ color: '#94a3b8', fontSize: '0.85rem', fontWeight: 600 }}>#{activeReq.id?.slice(-6)}</span>
            </div>
          </div>

          {/* Stats Card */}
          <div style={{ background: '#f8fafc', borderRadius: 24, padding: 24, border: '1px solid #e2e8f0', marginBottom: 24 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 24 }}>
              <div>
                <span style={{ color: '#64748b', fontSize: '0.9rem', fontWeight: 600, display: 'block', marginBottom: 4 }}>EST. TIME</span>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
                  <span style={{ fontSize: '2.5rem', fontWeight: 950, color: '#111827' }}>
                    {eta !== null ? eta : '--'}
                  </span>
                  <span style={{ fontSize: '1rem', fontWeight: 700, color: '#64748b' }}>MIN</span>
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <span style={{ color: '#64748b', fontSize: '0.9rem', fontWeight: 600, display: 'block', marginBottom: 4 }}>DISTANCE</span>
                <span style={{ fontSize: '1.5rem', fontWeight: 800, color: '#334155' }}>
                  {distKm || '--'} <small style={{ fontSize: '0.8rem' }}>KM</small>
                </span>
              </div>
            </div>

            <div style={{ height: 1, background: '#e2e8f0', margin: '0 0 20px' }} />

            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
               <div style={{ width: 40, height: 40, borderRadius: '50%', background: 'rgba(185,28,28,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                 <MapPin size={20} color="#b91c1c" />
               </div>
               <div style={{ flex: 1 }}>
                 <p style={{ fontSize: '0.95rem', fontWeight: 800, color: '#1e293b' }}>{donorName}</p>
                 <p style={{ fontSize: '0.8rem', color: '#64748b', fontWeight: 500 }}>
                   Assigned Primary Donor
                 </p>
               </div>
               <div style={{ background: '#b91c1c', color: 'white', width: 34, height: 34, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.75rem', fontWeight: 900 }}>
                 {formatBG(activeReq.blood_group)}
               </div>
            </div>
          </div>

          {/* Actions */}
          <div style={{ flex: 1 }}>
            <h3 style={{ fontSize: '0.85rem', fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 16 }}>Controls</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {!completed && !showDonation && (
                <button
                  className="btn btn-success"
                  onClick={handleMarkArrival}
                  disabled={markingArrival}
                  style={{ 
                    padding: '20px', borderRadius: 20, fontWeight: 800, 
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, 
                    boxShadow: '0 8px 20px rgba(34,197,94,0.3)',
                    opacity: markingArrival ? 0.7 : 1,
                    cursor: markingArrival ? 'not-allowed' : 'pointer'
                  }}
                >
                  {markingArrival ? (
                    <>
                      <div className="spinner-small" style={{ borderTopColor: 'white' }} /> 
                      Marking Arrival...
                    </>
                  ) : (
                    <>
                      <MapPin size={20} /> Mark Donor Arrival
                    </>
                  )}
                </button>
              )}
              
              <button
                onClick={() => setRecenterCounter(p => p + 1)}
                style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 16, padding: '20px', borderRadius: 20, background: '#1e293b', color: 'white', border: 'none', cursor: 'pointer' }}
              >
                <Navigation size={22} />
                <span style={{ fontWeight: 800, fontSize: '1.05rem' }}>Recenter Route</span>
              </button>

              {primaryAssignment?.donor?.user?.phone && (
                <button
                  onClick={() => window.open(`tel:${primaryAssignment.donor.user.phone}`, '_self')}
                  style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 16, padding: '20px', borderRadius: 20, background: '#f8fafc', color: '#334155', border: '1px solid #e2e8f0', cursor: 'pointer' }}
                >
                  <Phone size={22} />
                  <span style={{ fontWeight: 800, fontSize: '1.05rem' }}>Call Donor</span>
                </button>
              )}

              {!promoted && !completed && (
                <button
                  onClick={handlePromoteBackup}
                  style={{ width: '100%', padding: '14px', borderRadius: 16, background: '#fffbeb', color: '#f59e0b', border: '1px solid #fef3c7', fontWeight: 700, cursor: 'pointer' }}
                >
                  <AlertTriangle size={16} /> Promote Backup Donor
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Completion Screen */}
      {completed && (
        <div style={{ position: 'fixed', inset: 0, background: '#b91c1c', zIndex: 2000, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'white', padding: 40, textAlign: 'center' }}>
          <div style={{ width: 120, height: 120, borderRadius: '50%', background: 'rgba(255,255,255,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 30 }}>
             <div style={{ fontSize: 60 }}>✅</div>
          </div>
          <h1 style={{ fontSize: '3rem', fontWeight: 950, marginBottom: 15 }}>Success!</h1>
          <p style={{ fontSize: '1.25rem', opacity: 0.9, maxWidth: 500, lineHeight: 1.6 }}>
            The emergency blood donation has been completed.
          </p>
          <button 
            onClick={() => navigate('/hospital')}
            style={{ marginTop: 50, padding: '20px 60px', borderRadius: 40, border: 'none', background: 'white', color: '#b91c1c', fontWeight: 950, fontSize: '1.25rem', cursor: 'pointer', boxShadow: '0 10px 30px rgba(0,0,0,0.2)' }}
          >
            Back to Dashboard
          </button>
        </div>
      )}

      <style>{`
        @keyframes pulse {
          0%, 100% { transform: scale(1); opacity: 1; }
          50% { transform: scale(1.1); opacity: 0.8; }
        }
        .leaflet-marker-icon { transition: transform 1s linear, left 1s linear, top 1s linear !important; }
        .leaflet-control-attribution { display: none !important; }
      `}</style>
    </div>
  );
}
