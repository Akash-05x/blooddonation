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

const getDonorIcon = (rotation = 0) => L.divIcon({
  html: `
    <div style="width:48px; height:48px; position:relative; transform: rotate(${rotation}deg); transition: transform 0.8s ease-in-out;">
      <div style="width:48px; height:48px; background:linear-gradient(135deg,#b91c1c,#ef4444); border-radius:50%; display:flex; align-items:center; justify-content:center; border:3px solid white; box-shadow:0 4px 16px rgba(185,28,28,0.6); font-size:22px;">
        👤
      </div>
      <div style="position:absolute; top:-8px; left:14px; width:0; height:0; border-left:10px solid transparent; border-right:10px solid transparent; border-bottom:15px solid #ef4444;"></div>
    </div>
  `,
  className: '', iconSize: [48, 48], iconAnchor: [24, 24],
});

const formatBG = key => key?.replace('_POS', '+').replace('_NEG', '-') || key;

function FitBounds({ positions, trigger }) {
  const map = useMap();
  useEffect(() => {
    if (positions && positions.length >= 2) {
      try {
        const bounds = L.latLngBounds(positions);
        if (bounds.isValid()) {
          map.fitBounds(bounds, { padding: [80, 80], animate: true, maxZoom: 16 });
        }
      } catch (e) { /* ignore */ }
    }
  }, [trigger, map, JSON.stringify(positions)]);
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

function haversineDist(pos1, pos2) {
  if (!pos1 || !pos2) return null;
  const R = 6371; // Radius of the earth in km
  const dLat = (pos2[0] - pos1[0]) * Math.PI / 180;
  const dLon = (pos2[1] - pos1[1]) * Math.PI / 180;
  const a = 
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(pos1[0] * Math.PI / 180) * Math.cos(pos2[0] * Math.PI / 180) * 
    Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return parseFloat((R * c).toFixed(1));
}

// Keep calcDist but use Haversine logic for consistency
const calcDist = haversineDist;

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
  const [distKm, setDistKm] = useState(null);
  const [eta, setEta] = useState(null);
  const [donorHeadings, setDonorHeadings] = useState({}); // { donorId: angle }
  const donorPrevPosRef = useRef({}); // { donorId: [lat, lng] }
  const socketRef = useRef(null);
  const lastOsrmFetchRef = useRef(0); // Debounce guard for OSRM calls

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
          } else {
            // Requirement 166: Fallback to donor profile location if no live GPS yet
            const primary = active.assignments?.find(a => a.role === 'primary');
            if (primary?.donor?.latitude && primary?.donor?.longitude) {
              const pos = [primary.donor.latitude, primary.donor.longitude];
              setDonorPos(pos);
              if (primary.donor.user_id) {
                setDonorPositions(prev => ({ ...prev, [primary.donor.user_id]: pos }));
              }
            }
          }
          const h = trackRes?.data?.hospital;
          const mapLat = active.request_lat || h?.latitude;
          const mapLng = active.request_lng || h?.longitude;
          if (mapLat && mapLng) setHospitalPos([mapLat, mapLng]);

          // Also grab live GPS to keep hospital pin accurate
          if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(
              async (pos) => {
                const { latitude, longitude } = pos.coords;
                setHospitalPos([latitude, longitude]);
                // Persist to backend for tracking accuracy
                try { await hospitalAPI.updateProfile({ latitude, longitude }); } catch (_) {}
              },
              () => {}, // Silently ignore if denied
              { enableHighAccuracy: true, timeout: 8000, maximumAge: 60000 }
            );
          }
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
      
      const { donorUserId, latitude, longitude } = data;
      const pos = [latitude, longitude];

      setDonorPositions(prev => {
        const prevPos = prev[donorUserId];
        if (prevPos) {
           // Calculate heading (Requirement 258)
           const dy = latitude - prevPos[0];
           const dx = Math.cos(Math.PI / 180 * latitude) * (longitude - prevPos[1]);
           const angle = Math.atan2(dx, dy) * 180 / Math.PI;
           if (Math.abs(angle) > 1) {
              setDonorHeadings(h => ({ ...h, [donorUserId]: angle }));
           }
        }
        return { ...prev, [donorUserId]: pos };
      });

      setDonorTrails(prev => {
        const trail = prev[donorUserId] || [];
        return { ...prev, [donorUserId]: [...trail.slice(-60), pos] };
      });

      setActiveReq(prev => {
        if (!prev) return prev;
        const primaryAssignment = prev.assignments?.find(a => a.role === 'primary');
        if (primaryAssignment && donorUserId === primaryAssignment.donor?.user_id) {
          setDonorPos(pos); // Keep legacy donorPos for main card/route if it's the primary
          // Update primary assignment with live ETA and heartbeat
          const updatedAssignments = prev.assignments.map(a => 
            a.id === primaryAssignment.id 
              ? { ...a, etaMinutes: data.etaMinutes, expected_arrival_at: data.expectedArrivalAt, last_heartbeat_at: data.timestamp }
              : a
          );
          return { ...prev, assignments: updatedAssignments };
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
  }, [donorPositions]);

  const [routeCoords, setRouteCoords] = useState([]);

  const fetchRoadRoute = async (start, end) => {
    // Debounce: only after the very first fetch do we impose a 20s throttle.
    const now = Date.now();
    const isFirstFetch = lastOsrmFetchRef.current === 0;
    if (!isFirstFetch && now - lastOsrmFetchRef.current < 20_000) {
      console.log('[Hospital OSRM] Skipping — debounced (<20s since last fetch)');
      return;
    }
    lastOsrmFetchRef.current = now;

    try {
      const url = `https://router.project-osrm.org/route/v1/driving/${start[1]},${start[0]};${end[1]},${end[0]}?overview=full&geometries=geojson&steps=true`;
      const res = await fetch(url);
      const data = await res.json();
      if (data.routes && data.routes.length > 0) {
        const coords = data.routes[0].geometry.coordinates.map(c => [c[1], c[0]]);
        setRouteCoords(coords);
        const distance = (data.routes[0].distance / 1000).toFixed(1);
        const duration = Math.ceil(data.routes[0].duration / 60);
        setDistKm(distance);
        setEta(duration);
      }
    } catch (err) {
      console.error('[Hospital OSRM] Fetch Error:', err);
      const d = haversineDist(start, end);
      setDistKm(d);
      setEta(d !== null ? Math.ceil(d * 1.5) : null);
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

    // Try to find primary from cached state FIRST to avoid unnecessary API call.
    // Only re-fetch if primary is not found (e.g. right after a promotion transition).
    let currentReq = activeReq;
    let primary = currentReq.assignments?.find(
      a => a.role === 'primary' && !['failed', 'rejected', 'cancelled', 'closed'].includes(a.status)
    );

    // Only hit the API if the primary wasn't in local state (avoids rate-limit pressure)
    if (!primary) {
      try {
        const res = await hospitalAPI.getRequests({ limit: 50 });
        const reqs = res.data || [];
        const fresh = reqs.find(r => r.id === activeReq.id);
        if (fresh) {
          currentReq = fresh;
          setActiveReq(fresh);
          primary = fresh.assignments?.find(
            a => a.role === 'primary' && !['failed', 'rejected', 'cancelled', 'closed'].includes(a.status)
          );
        }
      } catch (_) { /* use cached state as fallback */ }
    }

    if (!primary) { 
      setError('No active primary donor found. Please wait a moment and try again.'); 
      return; 
    }
    
    setMarkingArrival(true);
    setError('');
    try {
      await hospitalAPI.markArrival({
        assignmentId: primary.id,
        notes: donationNotes
      });
      // Mark arrival concludes the entire flow instantly
      setCompleted(true);
    } catch (err) { 
      console.error('Mark Arrival Error:', err);
      setError(err.response?.data?.message || err.message || 'Failed to conclude donation.'); 
    } finally {
      setMarkingArrival(false);
    }
  };

  const handleStartArrival = () => {
    setShowDonation(true);
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
  
  // FIX: Removed hardcoded Thoothukudi fallback. Use profile coords or default to a neutral map state.
  const hPos = [
    activeReq?.request_lat || activeReq?.hospital?.latitude || 0, 
    activeReq?.request_lng || activeReq?.hospital?.longitude || 0
  ];
  const mapPositions = donorPos ? [hPos, donorPos] : [hPos];
  // distKm and eta are now managed via state from OSRM/Haversine in fetchRoadRoute

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
          <FitBounds
            positions={donorPos && hPos[0] !== 0 ? [hPos, donorPos] : null}
            trigger={recenterCounter}
          />

          {/* Hospital marker */}
          <Marker position={hPos} icon={hospitalIcon}>
            <Popup>🏥 Your Hospital</Popup>
          </Marker>

          {/* Donor markers + Swiggy-style routes — only show active (non-failed) donors */}
          {Object.entries(donorPositions).map(([donorUserId, pos]) => {
            const assignment = activeReq.assignments?.find(a => a.donor?.user_id === donorUserId);
            if (!assignment || assignment.status === 'failed' || assignment.status === 'rejected') return null;
            const isPrimary = assignment.role === 'primary';
            const trail = donorTrails[donorUserId] || [];

            return (
              <div key={donorUserId}>
                <Marker position={pos} icon={getDonorIcon(donorHeadings[donorUserId] || 0)}>
                  <Popup>
                    👤 {assignment?.donor?.user?.name || 'Donor'} ({isPrimary ? '🔴 Primary' : 'Standby'})
                    <br/> {formatBG(activeReq.blood_group)} · {haversineDist(pos, hPos)} km
                  </Popup>
                </Marker>
                {trail.length > 1 && (
                  <Polyline positions={trail} color={isPrimary ? '#f59e0b' : '#94a3b8'} weight={3} opacity={0.35} />
                )}
                {isPrimary && (
                  <>
                    {/* Glow shadow */}
                    <Polyline
                      positions={routeCoords.length > 0 ? routeCoords : [pos, hPos]}
                      color="rgba(239,68,68,0.25)"
                      weight={14}
                      opacity={1}
                      lineCap="round"
                      lineJoin="round"
                    />
                    {/* Main bright route line */}
                    <Polyline
                      positions={routeCoords.length > 0 ? routeCoords : [pos, hPos]}
                      color="#ef4444"
                      weight={6}
                      opacity={1}
                      lineCap="round"
                      lineJoin="round"
                      className="animated-route-line"
                    />
                    {/* Animated dashes (Swiggy moving-ant effect) */}
                    <Polyline
                      positions={routeCoords.length > 0 ? routeCoords : [pos, hPos]}
                      color="white"
                      weight={3}
                      opacity={0.75}
                      lineCap="round"
                      lineJoin="round"
                      dashArray="12 18"
                      className="route-dash-animated"
                    />
                  </>
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
        <div style={{ width: 420, height: '100%', display: 'flex', flexDirection: 'column', padding: '32px 24px', overflowY: 'auto' }}>
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
                    {primaryAssignment?.etaMinutes || eta || '--'}
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
               <div style={{ width: 40, height: 40, borderRadius: '50%', background: 'rgba(185,28,28,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
                 <MapPin size={20} color="#b91c1c" />
                 {/* Live Heartbeat Indicator */}
                 {primaryAssignment?.last_heartbeat_at && (
                   <div style={{ 
                     position: 'absolute', top: -2, right: -2, width: 12, height: 12, borderRadius: '50%', 
                     background: (Date.now() - new Date(primaryAssignment.last_heartbeat_at).getTime() < 10000) ? '#22c55e' : '#f59e0b',
                     border: '2px solid white', animation: 'pulse 2s infinite' 
                   }} />
                 )}
               </div>
               <div style={{ flex: 1 }}>
                 <p style={{ fontSize: '0.95rem', fontWeight: 800, color: '#1e293b' }}>{donorName}</p>
                 <p style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 600 }}>
                   {primaryAssignment?.last_heartbeat_at 
                     ? `Last Update: ${Math.floor((Date.now() - new Date(primaryAssignment.last_heartbeat_at).getTime()) / 1000)}s ago`
                     : 'Awaiting primary donor...'}
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
                  onClick={handleStartArrival}
                  style={{ 
                    padding: '20px', borderRadius: 20, fontWeight: 800, 
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, 
                    boxShadow: '0 8px 20px rgba(34,197,94,0.3)'
                  }}
                >
                  <MapPin size={20} /> Mark Donor Arrival
                </button>
              )}

              {showDonation && !completed && (
                <div style={{ background: '#f0fdf4', border: '1px solid #bcf0da', borderRadius: 20, padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <p style={{ fontWeight: 800, color: '#166534', fontSize: '0.9rem' }}>Finalize Donation</p>
                    <button onClick={() => setShowDonation(false)} style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer' }}><X size={16}/></button>
                  </div>
                  <textarea
                    placeholder="Enter donation details (e.g., 1 unit donated, notes on donor condition...)"
                    value={donationNotes}
                    onChange={(e) => setDonationNotes(e.target.value)}
                    style={{ width: '100%', minHeight: 120, borderRadius: 12, border: '1px solid #d1d5db', padding: 12, fontSize: '0.85rem', resize: 'none' }}
                  />
                  <button
                    className="btn btn-success"
                    onClick={handleMarkArrival}
                    disabled={markingArrival}
                    style={{ width: '100%', padding: '14px', borderRadius: 14, fontWeight: 800 }}
                  >
                    {markingArrival ? 'Concluding...' : 'Confirm Completion'}
                  </button>
                </div>
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
        <div style={{ 
          position: 'fixed', inset: 0, 
          background: 'linear-gradient(135deg, #b91c1c 0%, #7f1d1d 100%)', 
          zIndex: 2000, display: 'flex', flexDirection: 'column', 
          alignItems: 'center', justifyContent: 'center', color: 'white', 
          padding: 40, textAlign: 'center' 
        }}>
          {/* Decorative background elements */}
          <div style={{ position: 'absolute', top: '-10%', left: '-10%', width: '40%', height: '40%', background: 'rgba(255,255,255,0.05)', borderRadius: '50%', filter: 'blur(80px)' }} />
          <div style={{ position: 'absolute', bottom: '-10%', right: '-10%', width: '40%', height: '40%', background: 'rgba(0,0,0,0.2)', borderRadius: '50%', filter: 'blur(80px)' }} />

          <div style={{ 
            width: 140, height: 140, borderRadius: '50%', 
            background: 'rgba(255,255,255,0.15)', backdropFilter: 'blur(10px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', 
            marginBottom: 32, boxShadow: '0 20px 50px rgba(0,0,0,0.3)',
            border: '2px solid rgba(255,255,255,0.2)',
            animation: 'success-pop 0.6s cubic-bezier(0.175, 0.885, 0.32, 1.275)'
          }}>
             <CheckCircle size={70} color="white" strokeWidth={3} />
          </div>

          <h1 style={{ 
            fontSize: '4rem', fontWeight: 950, marginBottom: 16, 
            letterSpacing: '-0.03em', textShadow: '0 4px 12px rgba(0,0,0,0.2)',
            animation: 'fade-up 0.8s ease-out'
          }}>
            Mission Success
          </h1>
          
          <p style={{ 
            fontSize: '1.4rem', opacity: 0.9, maxWidth: 600, 
            lineHeight: 1.6, fontWeight: 600, marginBottom: 40,
            animation: 'fade-up 1s ease-out'
          }}>
            The emergency donation for <strong>{formatBG(activeReq.blood_group)}</strong> has been successfully completed. 
            Lives have been saved thanks to your quick response.
          </p>

          <div style={{ 
            display: 'flex', gap: 20, marginBottom: 60,
            animation: 'fade-up 1.2s ease-out'
          }}>
            <div style={{ background: 'rgba(255,255,255,0.1)', backdropFilter: 'blur(8px)', padding: '20px 32px', borderRadius: 24, border: '1px solid rgba(255,255,255,0.1)' }}>
              <p style={{ fontSize: '0.8rem', fontWeight: 800, opacity: 0.7, textTransform: 'uppercase', marginBottom: 4 }}>Donor</p>
              <p style={{ fontSize: '1.2rem', fontWeight: 800 }}>{donorName}</p>
            </div>
            <div style={{ background: 'rgba(255,255,255,0.1)', backdropFilter: 'blur(8px)', padding: '20px 32px', borderRadius: 24, border: '1px solid rgba(255,255,255,0.1)' }}>
              <p style={{ fontSize: '0.8rem', fontWeight: 800, opacity: 0.7, textTransform: 'uppercase', marginBottom: 4 }}>Status</p>
              <p style={{ fontSize: '1.2rem', fontWeight: 800 }}>Verified ✅</p>
            </div>
          </div>

          <button 
            onClick={() => navigate('/hospital')}
            className="glow-pulse"
            style={{ 
              padding: '24px 80px', borderRadius: 40, border: 'none', 
              background: 'white', color: '#b91c1c', fontWeight: 950, 
              fontSize: '1.4rem', cursor: 'pointer', 
              boxShadow: '0 20px 40px rgba(0,0,0,0.25)',
              transition: 'all 0.3s ease',
              animation: 'fade-up 1.4s ease-out'
            }}
            onMouseOver={(e) => e.target.style.transform = 'scale(1.05) translateY(-5px)'}
            onMouseOut={(e) => e.target.style.transform = 'scale(1)'}
          >
            Return to Command Center
          </button>

          <style>{`
            @keyframes success-pop {
              0% { transform: scale(0.5); opacity: 0; }
              100% { transform: scale(1); opacity: 1; }
            }
            @keyframes fade-up {
              0% { transform: translateY(30px); opacity: 0; }
              100% { transform: translateY(0); opacity: 1; }
            }
            .glow-pulse {
              box-shadow: 0 0 0 0 rgba(255, 255, 255, 0.4);
              animation: pulse-white 2s infinite;
            }
            @keyframes pulse-white {
              0% { box-shadow: 0 0 0 0 rgba(255, 255, 255, 0.4); }
              70% { box-shadow: 0 0 0 20px rgba(255, 255, 255, 0); }
              100% { box-shadow: 0 0 0 0 rgba(255, 255, 255, 0); }
            }
          `}</style>
        </div>
      )}

      <style>{`
        @keyframes pulse {
          0%, 100% { transform: scale(1); opacity: 1; }
          50% { transform: scale(1.1); opacity: 0.8; }
        }
        .leaflet-marker-icon { transition: transform 1s linear, left 1s linear, top 1s linear !important; }
        .leaflet-control-attribution { display: none !important; }
        /* Swiggy/Zomato-style animated dashed overlay on route */
        @keyframes march-dashes {
          from { stroke-dashoffset: 60; }
          to   { stroke-dashoffset: 0; }
        }
        .route-dash-animated path {
          animation: march-dashes 0.8s linear infinite;
        }
        @keyframes route-glow {
          0%, 100% { opacity: 1; }
          50%       { opacity: 0.75; }
        }
        .animated-route-line path {
          animation: route-glow 2s ease-in-out infinite;
        }
      `}</style>
    </div>
  );
}
