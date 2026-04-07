import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from 'react-leaflet';
import L from 'leaflet';
import { donorAPI } from '../../utils/api';
import { connectSocket, sendLocationUpdate } from '../../utils/socket';
import { Phone, Navigation, MapPin, ArrowLeft, CheckCircle, Target, Heart, ChevronRight, ChevronLeft, Maximize2, Minimize2, Shield, Clock, Droplet, Activity, X } from 'lucide-react';

// Fix Leaflet default icons
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

const hospitalIcon = L.divIcon({
  html: `<div style="width:44px;height:44px;background:linear-gradient(135deg,#0284c7,#0ea5e9);border-radius:50%;display:flex;align-items:center;justify-content:center;border:3px solid white;box-shadow:0 4px 16px rgba(2,132,199,0.6);font-size:20px;">🏥</div>`,
  className: '', iconSize: [44, 44], iconAnchor: [22, 22],
});

const donorIcon = L.divIcon({
  html: `<div style="width:48px;height:48px;background:linear-gradient(135deg,#b91c1c,#ef4444);border-radius:50%;display:flex;align-items:center;justify-content:center;border:3px solid white;box-shadow:0 4px 16px rgba(185,28,28,0.6);font-size:22px;animation:pulse 2s infinite;">👤</div>`,
  className: '', iconSize: [48, 48], iconAnchor: [24, 24],
});

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

function RecenterMap({ center }) {
  const map = useMap();
  useEffect(() => {
    if (center) map.setView(center, map.getZoom(), { animate: true });
  }, [center, map]);
  return null;
}

function calcDistance(pos1, pos2) {
  if (!pos1 || !pos2) return null;
  const dLat = pos1[0] - pos2[0];
  const dLon = pos1[1] - pos2[1];
  return parseFloat((Math.sqrt(dLat * dLat + dLon * dLon) * 111).toFixed(1));
}

export default function DonorTracking() {
  const { requestId } = useParams();
  const navigate = useNavigate();
  const [request, setRequest] = useState(null);
  const [loading, setLoading] = useState(true);
  const [donorPos, setDonorPos] = useState(null);
  const [hospitalPos, setHospitalPos] = useState(null);
  const [socketStatus, setSocketStatus] = useState('connecting');
  const [trail, setTrail] = useState([]);
  const [eta, setEta] = useState(null);
  const [recenterCounter, setRecenterCounter] = useState(0);
  const [sidebarVisible, setSidebarVisible] = useState(true);
  const [distKm, setDistKm] = useState(null);
  const [completed, setCompleted] = useState(false);
  const [isAssigned, setIsAssigned] = useState(false);
  const [error, setError] = useState('');
  const [sheetExpanded, setSheetExpanded] = useState(false);
  const [arrived, setArrived] = useState(false);
  const [gpsError, setGpsError] = useState(null);
  const [gpsLoading, setGpsLoading] = useState(true);
  const [promoted, setPromoted] = useState(false);
  const [role, setRole] = useState('reserve');
  const gpsWatchRef = useRef(null);
  const socketRef = useRef(null);
  const requestRef = useRef(null);
  const gpsHeartbeatRef = useRef(null); // Timer for GPS signal loss detection

  useEffect(() => {
    fetchInitialData();
    setupSocket();
    return () => {
      if (gpsWatchRef.current !== null) {
        navigator.geolocation.clearWatch(gpsWatchRef.current);
      }
      if (gpsHeartbeatRef.current) clearTimeout(gpsHeartbeatRef.current);
      if (socketRef.current) {
        socketRef.current.off('tracking_stopped');
        socketRef.current.off('request_completed');
        socketRef.current.off('request_cancelled');
        socketRef.current.off('assignment_confirmed');
        socketRef.current.off('promoted_to_primary');
      }
    };
  }, [requestId]);

  const [routeCoords, setRouteCoords] = useState([]);

  const fetchRoadRoute = async (start, end) => {
    try {
      // OSRM expects coordinates as lon,lat;lon,lat
      const url = `https://router.project-osrm.org/route/v1/driving/${start[1]},${start[0]};${end[1]},${end[0]}?overview=full&geometries=geojson`;
      const res = await fetch(url);
      const data = await res.json();
      if (data.routes && data.routes.length > 0) {
        const coords = data.routes[0].geometry.coordinates.map(c => [c[1], c[0]]);
        setRouteCoords(coords);
        // Update dist and ETA from OSRM data
        const distance = (data.routes[0].distance / 1000).toFixed(1);
        const duration = Math.ceil(data.routes[0].duration / 60);
        setDistKm(distance);
        setEta(duration);
      }
    } catch (err) {
      console.error('OSRM Fetch Error:', err);
      // Fallback to straight line if OSRM fails
      const d = calcDistance(start, end);
      setDistKm(d);
      setEta(d !== null ? Math.ceil(d * 3) : null);
    }
  };

  useEffect(() => {
    if (donorPos && hospitalPos) {
      fetchRoadRoute(donorPos, hospitalPos);
    }
  }, [donorPos, hospitalPos]);

  const fetchInitialData = async () => {
    try {
      setLoading(true);

      // Fetch profile for initial location AND alerts for request details
      const [profileRes, alertsRes] = await Promise.all([
        donorAPI.getProfile(),
        donorAPI.getAlerts()
      ]);

      // Set initial position from profile if available
      if (profileRes.data?.latitude && profileRes.data?.longitude) {
        const initialPos = [profileRes.data.latitude, profileRes.data.longitude];
        setDonorPos(initialPos);
        setTrail([initialPos]);
      }

      const assignment = (alertsRes.data || []).find(a => a.request?.id === requestId);
      if (assignment) {
        setRequest(assignment.request);
        requestRef.current = assignment.request;
        setRole(assignment.role);

        // ONLY Primary donors see the map. Others see the "Awaiting/Status" screen.
        const isPrimary = assignment.role === 'primary' && !assignment.isToken;
        setIsAssigned(isPrimary);

        // Handle Termination
        if (assignment.request?.status === 'completed' || assignment.status === 'completed') {
          setCompleted(true);
          return;
        }

        if (['failed', 'rejected', 'cancelled'].includes(assignment.status)) {
          setError('This assignment has been terminated or timed out.');
          if (gpsWatchRef.current !== null) {
            navigator.geolocation.clearWatch(gpsWatchRef.current);
            gpsWatchRef.current = null;
          }
          return;
        }

        const reqLat = assignment.request?.request_lat || assignment.request?.hospital?.latitude;
        const reqLng = assignment.request?.request_lng || assignment.request?.hospital?.longitude;
        if (reqLat && reqLng) {
          const hPos = [reqLat, reqLng];
          setHospitalPos(hPos);
        }
        // Donors should still broadcast their location if they are assigned (primary OR backup) 
        startGPSTracking(assignment.request);
      } else {
        // Assignment not found - this can happen briefly during promotion transitions
        // Only show error after a deliberate retry to avoid false negatives
        setTimeout(() => {
          if (!requestRef.current) {
            setError('Request not found or access denied.');
          }
        }, 3000);
      }
    } catch (err) {
      console.error('fetchInitialData error:', err);
      // Don't immediately show 'Session Ended' for network errors — it's jarring during promotion
      // Only set error if we had no previous data
      if (!requestRef.current) {
        setTimeout(() => {
          if (!requestRef.current) setError('Failed to load tracking details.');
        }, 4000);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (completed) {
      const timer = setTimeout(() => {
        navigate('/donor');
      }, 1500); // Reduce from 3.5s to 1.5s for snappier feedback
      return () => clearTimeout(timer);
    }
  }, [completed, navigate]);

  const setupSocket = () => {
    const socket = connectSocket();
    if (!socket) { setSocketStatus('disconnected'); return; }
    socketRef.current = socket;

    socket.on('connect', () => setSocketStatus('connected'));
    socket.on('disconnect', () => setSocketStatus('disconnected'));

    socket.on('tracking_stopped', (data) => {
      if (data.requestId === requestId) {
        setArrived(true);
        if (gpsWatchRef.current !== null) {
          navigator.geolocation.clearWatch(gpsWatchRef.current);
          gpsWatchRef.current = null;
        }
      }
    });

    socket.on('request_completed', (data) => {
      if (data.requestId === requestId) {
        setCompleted(true);
        if (gpsWatchRef.current !== null) {
          navigator.geolocation.clearWatch(gpsWatchRef.current);
          gpsWatchRef.current = null;
        }
      }
    });

    socket.on('request_cancelled', (data) => {
      if (data.requestId === requestId) {
        setError('Donation failed or cancelled. Thank you for your patience.');
        setTimeout(() => navigate('/donor'), 4500);
      }
    });

    socket.on('assignment_confirmed', (data) => {
      if (data.requestId === requestId) {
        if (data.role === 'primary') setIsAssigned(true);
        fetchInitialData(); // Refresh to get full details
      }
    });

    socket.on('promoted_to_primary', (data) => {
      if (data.requestId === requestId) {
        setRole('primary');
        setIsAssigned(true);
        setPromoted(true);

        // Immediately wire up hospital position from socket data so the map
        // renders with the correct destination before the API re-fetch completes.
        if (data.hospitalLat && data.hospitalLng) {
          setHospitalPos([data.hospitalLat, data.hospitalLng]);
        }

        // CRITICAL FIX: Clear the existing GPS watch so startGPSTracking can
        // re-initialize properly with the updated request ref.
        if (gpsWatchRef.current !== null) {
          navigator.geolocation.clearWatch(gpsWatchRef.current);
          gpsWatchRef.current = null;
        }
        if (gpsHeartbeatRef.current) {
          clearTimeout(gpsHeartbeatRef.current);
          gpsHeartbeatRef.current = null;
        }

        // Short delay to let DB settle before re-fetching full request data
        setTimeout(() => fetchInitialData(), 800);
      }
    });

    socket.on('role_update', (data) => {
      if (data.requestId === requestId) {
        setRole(data.role);
        if (data.role === 'primary') {
          setIsAssigned(true);
        } else {
          setIsAssigned(false);
          // Stop tracking if demoted
          if (gpsWatchRef.current !== null) {
            console.log('[GPS] 🛑 Stopping GPS tracking: role demoted from primary.');
            navigator.geolocation.clearWatch(gpsWatchRef.current);
            gpsWatchRef.current = null;
          }
          if (gpsHeartbeatRef.current) {
            clearTimeout(gpsHeartbeatRef.current);
            gpsHeartbeatRef.current = null;
          }
        }
      }
    });

    socket.on('request_status_update', (data) => {
      if (data.requestId === requestId) {
        if (data.status === 'completed') {
          setCompleted(true);
        } else if (['failed', 'cancelled', 'expired'].includes(data.status)) {
          setError('The emergency request has ended or been cancelled.');
          if (gpsWatchRef.current !== null) {
            navigator.geolocation.clearWatch(gpsWatchRef.current);
            gpsWatchRef.current = null;
          }
        }
      }
    });

    setSocketStatus(socket.connected ? 'connected' : 'connecting');
  };

  const startGPSTracking = useCallback((req) => {
    if (!navigator.geolocation) {
      setGpsError('Geolocation not supported by this browser.');
      setGpsLoading(false);
      return;
    }

    if (gpsWatchRef.current !== null) return;
    if (role !== 'primary') {
      console.log('[GPS] ✋ Skipping GPS tracking initiation: user is not the primary donor.');
      return;
    }

    setGpsLoading(true);

    // GPS Heartbeat: If no location update received in 20s, trigger failover.
    // 20s is intentionally short — the donor turning off location is an emergency.
    const startHeartbeat = () => {
      if (role !== 'primary') return; // Do NOT start heartbeat for backup/reserve
      if (gpsHeartbeatRef.current) clearTimeout(gpsHeartbeatRef.current);
      gpsHeartbeatRef.current = setTimeout(() => {
        const req = requestRef.current;
        if (req?.id && socketRef.current?.connected && role === 'primary') {
          console.log('[GPS] ⚡ Heartbeat timeout — no GPS for 20s. Triggering immediate failover.');
          setGpsError('GPS signal lost. Initiating donor replacement...');
          socketRef.current.emit('gps_failure', {
            requestId: req.id,
            reason: 'GPS_HEARTBEAT_TIMEOUT',
          });
        }
      }, 300_000); // 5 minute (300s) timeout — allowing for traffic/signal delay
    };

    startHeartbeat(); // Start initial heartbeat timer

    // 3-5s Heartbeat interval (Requirement 6)
    const heartbeatInterval = setInterval(() => {
      if (role === 'primary' && donorPos && socketRef.current?.connected) {
        const [lat, lng] = donorPos;
        const hUserId = req?.hospital?.user_id || requestRef.current?.hospital?.user_id;
        if (hUserId) {
          sendLocationUpdate(requestId, hUserId, lat, lng);
        }
      }
    }, 5000);

    gpsWatchRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;

        setDonorPos([lat, lng]);
        setGpsLoading(false);
        setGpsError(null);

        // Reset heartbeat timer on every successful GPS update
        startHeartbeat();

        setTrail(prev => {
          const last = prev[prev.length - 1];
          // Only add to trail if moved significantly (approx 5-10 meters)
          if (last && Math.abs(last[0] - lat) < 0.00005 && Math.abs(last[1] - lng) < 0.00005) {
            return prev;
          }
          const newTrail = [...prev, [lat, lng]];
          return newTrail.slice(-100);
        });

        // Send updates immediately on change as well
        const hUserId = req?.hospital?.user_id || requestRef.current?.hospital?.user_id;
        if (socketRef.current?.connected && hUserId) {
          sendLocationUpdate(requestId, hUserId, lat, lng);
        }

        // HTTP fallback (throttled manually or just fire and forget)
        donorAPI.updateLocation({ requestId, latitude: lat, longitude: lng }).catch(() => { });
      },
      (err) => {
        console.warn('GPS error:', err.code, err.message);
        const errMsg = err.code === 1 ? 'Location permission denied.' : 'Searching for GPS signal...';
        setGpsError(errMsg);
        setGpsLoading(false);

        // CRITICAL: If this donor is primary, immediately trigger failover
        // Error code 1 = PERMISSION_DENIED, code 2 = POSITION_UNAVAILABLE
        if ((err.code === 1 || err.code === 2) && socketRef.current?.connected) {
          const req = requestRef.current;
          if (req?.id) {
            console.log('[GPS] Critical GPS failure — triggering immediate failover via socket');
            socketRef.current.emit('gps_failure', {
              requestId: req.id,
              reason: err.code === 1 ? 'GPS_PERMISSION_DENIED' : 'GPS_UNAVAILABLE',
            });
          }
        }
      },
      {
        enableHighAccuracy: true,
        timeout: 20000,
        maximumAge: 5000
      }
    );

    return () => {
      clearInterval(heartbeatInterval);
    };
  }, [requestId, role]);

  const handleCancelAvailability = async () => {
    if (!window.confirm('Are you sure you want to cancel your availability? This will remove you from the standby pool.')) return;
    try {
      await donorAPI.cancelDonation({
        requestId: requestId,
        reason: 'Cancelled from tracking screen'
      });

      navigate('/donor');
    } catch (err) {
      alert('Failed to cancel availability. Please try again.');
    }
  };

  const openInGoogleMaps = () => {
    if (!hospitalPos) return;
    const isAndroid = /Android/i.test(navigator.userAgent);
    const isIOS = /iPhone|iPad|iPod/i.test(navigator.userAgent);

    if (isAndroid) {
      window.open(`google.navigation:q=${hospitalPos[0]},${hospitalPos[1]}&mode=d`, '_system');
    } else if (isIOS) {
      window.open(`maps://?daddr=${hospitalPos[0]},${hospitalPos[1]}&dirflg=d`, '_system');
    } else {
      const origin = donorPos ? `&origin=${donorPos[0]},${donorPos[1]}` : '';
      const url = `https://www.google.com/maps/dir/?api=1${origin}&destination=${hospitalPos[0]},${hospitalPos[1]}&travelmode=driving&dir_action=navigate`;
      window.open(url, '_blank');
    }
  };

  const callHospital = () => {
    const phone = request?.hospital?.phone;
    if (phone) window.open(`tel:${phone}`, '_self');
  };

  if (loading) return (
    <div style={{ position: 'fixed', inset: 0, background: '#0f172a', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 20, zIndex: 1200 }}>
      <div style={{ width: 60, height: 60, borderRadius: '50%', background: 'linear-gradient(135deg,#dc2626,#ef4444)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28, animation: 'pulse 1.5s infinite', boxShadow: '0 0 30px rgba(220,38,38,0.5)' }}>🧑‍🏫</div>
      <p style={{ color: '#e5e7eb', fontSize: '1rem', fontWeight: 700 }}>Starting navigation...</p>
    </div>
  );

  if (error) return (
    <div style={{ position: 'fixed', inset: 0, background: '#0f172a', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 20, zIndex: 1200, padding: 24 }}>
      <div style={{ width: 80, height: 80, borderRadius: '50%', background: 'rgba(239,68,68,0.1)', border: '2px solid #ef4444', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 36, animation: 'pulse-error 2s infinite' }}>⚠️</div>
      <h2 style={{ color: 'white', fontSize: '1.6rem', fontWeight: 800, textAlign: 'center' }}>Session Ended</h2>
      <p style={{ color: '#fca5a5', fontSize: '1.1rem', textAlign: 'center', lineHeight: 1.6, fontWeight: 700, maxWidth: 400 }}>{error}</p>
      <button onClick={() => navigate('/donor')} style={{ marginTop: 8, padding: '16px 40px', borderRadius: 16, background: '#ef4444', color: 'white', border: 'none', fontWeight: 800, fontSize: '1rem', cursor: 'pointer', boxShadow: '0 4px 12px rgba(239,68,68,0.4)' }}>
        Return to Dashboard
      </button>
      <style>{`
        @keyframes pulse-error {
          0%, 100% { transform: scale(1); box-shadow: 0 0 0 0 rgba(239,68,68,0.4); }
          50% { transform: scale(1.05); box-shadow: 0 0 20px 10px rgba(239,68,68,0.2); }
        }
      `}</style>
    </div>
  );

  if (completed) return (
    <div style={{ position: 'fixed', inset: 0, background: 'linear-gradient(135deg,#052e16,#064e3b)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 20, zIndex: 1200, padding: 24 }}>
      <div style={{ width: 80, height: 80, borderRadius: '50%', background: 'linear-gradient(135deg,#16a34a,#22c55e)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 36, boxShadow: '0 0 40px rgba(34,197,94,0.5)' }}>✅</div>
      <h2 style={{ color: 'white', fontSize: '1.6rem', fontWeight: 800, textAlign: 'center' }}>Donation Status</h2>
      <p style={{ color: '#86efac', fontSize: '1.1rem', textAlign: 'center', lineHeight: 1.6, fontWeight: 700 }}>Donation completed. Thank you for your patience.</p>
      <button onClick={() => navigate('/donor')} style={{ marginTop: 8, padding: '16px 40px', borderRadius: 16, background: 'linear-gradient(135deg,#22c55e,#16a34a)', color: 'white', border: 'none', fontWeight: 800, fontSize: '1rem', cursor: 'pointer', boxShadow: '0 4px 12px rgba(34,197,94,0.4)' }}>
        Back to Dashboard
      </button>
    </div>
  );

  // ── Standby Mode (Multi-Role Professional Hospital Portal Style) ──────────────────────
  if (!isAssigned && !completed && !loading) return (
    <div style={{ minHeight: '100vh', background: '#f8fafc', color: '#1e293b', paddingBottom: 40 }}>
      {/* Header Bar */}
      <div style={{ background: 'white', borderBottom: '1px solid #e2e8f0', padding: '16px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'sticky', top: 0, zIndex: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 40, height: 40, borderRadius: 10, background: 'var(--color-hospital)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Shield size={22} color="white" />
          </div>
          <div>
            <h1 style={{ fontSize: '1rem', fontWeight: 800, color: '#0f172a', margin: 0 }}>Donor Safety Portal</h1>
            <p style={{ fontSize: '0.72rem', color: 'var(--color-hospital)', fontWeight: 700, margin: 0 }}>
              {role === 'backup' ? 'SECONDARY PROTOCOL' : 'RESERVE STANDBY'}
            </p>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#22c55e', animation: 'pulse-dot 2s infinite' }} />
          <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#64748b' }}>Live Status</span>
        </div>
      </div>

      <div style={{ maxWidth: 500, margin: '24px auto', padding: '0 20px', display: 'flex', flexDirection: 'column', gap: 20 }}>

        {/* Main Status Card */}
        <div style={{ background: 'white', borderRadius: 20, padding: 24, boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05), 0 2px 4px -1px rgba(0,0,0,0.03)', border: '1px solid #e2e8f0' }}>
          <div style={{ textAlign: 'center', marginBottom: 24 }}>
            <div style={{ width: 64, height: 64, background: '#f1f5f9', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
              <Clock size={32} color="var(--color-hospital)" />
            </div>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#0f172a' }}>
              {role === 'backup' ? 'You are the Secondary Donor' : 'You are in Reserve Standby'}
            </h2>
            <p style={{ color: '#64748b', fontSize: '0.88rem', marginTop: 4 }}>
              {role === 'backup'
                ? 'The primary donor is in transit. You are the priority backup for this emergency.'
                : 'A primary and secondary donor have been assigned. Please remain ready in case of further failover.'}
            </p>
          </div>

          {/* Progress Stepper */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginBottom: 8 }}>
            {[
              { label: 'Availability Confirmed', sub: 'Verified by Medical Portal', done: true },
              { label: role === 'backup' ? 'Priority Standby' : 'Reserve Queue', sub: role === 'backup' ? 'Rank 2: Next in Line' : 'Status: Supporting Team', done: true },
              { label: 'Active Dispatch', sub: 'Initializing map on promotion', done: false },
            ].map((s, i) => (
              <div key={i} style={{ display: 'flex', gap: 14 }}>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                  <div style={{
                    width: 24, height: 24, borderRadius: '50%',
                    background: s.done ? '#22c55e' : '#f1f5f9',
                    border: s.done ? 'none' : '2px solid #e2e8f0',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    zIndex: 2
                  }}>
                    {s.done ? <CheckCircle size={14} color="white" /> : <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#cbd5e1' }} />}
                  </div>
                  {i < 2 && <div style={{ width: 2, flex: 1, background: s.done ? '#22c55e' : '#e2e8f0', margin: '4px 0' }} />}
                </div>
                <div style={{ paddingBottom: i < 2 ? 16 : 0 }}>
                  <p style={{ fontSize: '0.9rem', fontWeight: 700, color: s.done ? '#0f172a' : '#94a3b8' }}>{s.label}</p>
                  <p style={{ fontSize: '0.75rem', color: '#64748b' }}>{s.sub}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Emergency Details Section (Detailed for Backup, Minimal for Reserve) */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          <div style={{ background: 'white', padding: 16, borderRadius: 16, border: '1px solid #e2e8f0' }}>
            <p style={{ fontSize: '0.7rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', marginBottom: 8 }}>Group Needed</p>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ width: 32, height: 32, borderRadius: '50%', background: '#fee2e2', color: '#ef4444', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: '0.8rem' }}>
                {request?.blood_group?.replace('_POS', '+').replace('_NEG', '-')}
              </div>
              <span style={{ fontWeight: 700, fontSize: '0.95rem' }}>{request?.blood_group?.replace('_POS', '+').replace('_NEG', '-')}</span>
            </div>
          </div>
          <div style={{ background: 'white', padding: 16, borderRadius: 16, border: '1px solid #e2e8f0' }}>
            <p style={{ fontSize: '0.7rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', marginBottom: 8 }}>Hospital</p>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Activity size={18} color="var(--color-hospital)" />
              <span style={{ fontWeight: 700, fontSize: '0.85rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {request?.hospital?.hospital_name || 'Medical Center'}
              </span>
            </div>
          </div>
        </div>

        {/* Readiness Checklist */}
        <div style={{ background: 'white', borderRadius: 20, padding: 20, border: '1px solid #e2e8f0' }}>
          <h3 style={{ fontSize: '0.9rem', fontWeight: 800, color: '#0f172a', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
            <Droplet size={18} color="#ef4444" /> {role === 'backup' ? 'Medical Readiness Checklist' : 'Pre-Arrival Tips'}
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {(role === 'backup' ? [
              { icon: '🚗', text: 'Vehicle/Transportation is on standby for immediate departure' },
              { icon: '📱', text: 'App is open and notifications are prioritized' },
              { icon: '🪪', text: 'Identification and medical records are ready' },
              { icon: '🥤', text: 'Hydrate well for optimal donation readiness' }
            ] : [
              { icon: '🧘', text: 'Remain calm and await further updates' },
              { icon: '🔌', text: 'Keep your mobile device fully charged' },
              { icon: '✅', text: 'Verify your donor credentials are up to date' }
            ]).map((item, idx) => (
              <div key={idx} style={{ display: 'flex', gap: 12, padding: '10px', background: '#f8fafc', borderRadius: 12 }}>
                <span style={{ fontSize: '1.1rem' }}>{item.icon}</span>
                <span style={{ fontSize: '0.8rem', color: '#475569', lineHeight: 1.4 }}>{item.text}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Promotion Alert */}
        {promoted && (
          <div style={{ background: 'rgba(34,197,94,0.1)', border: '2px solid #22c55e', borderRadius: 20, padding: 20, textAlign: 'center', animation: 'glow-pulse 2s infinite' }}>
            <div style={{ fontSize: '2rem', marginBottom: 8 }}>🚀</div>
            <h3 style={{ color: '#16a34a', fontWeight: 800 }}>ROLE UPDATED</h3>
            <p style={{ fontSize: '0.85rem', color: '#15803d', marginTop: 4 }}>You have been promoted to a priority role. Initializing...</p>
          </div>
        )}

        {/* Controls */}
        <div style={{ textAlign: 'center', marginTop: 12, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', gap: 12 }}>
            <button className="btn btn-ghost" onClick={callHospital} style={{ flex: 1, fontSize: '0.8rem', background: 'white', border: '1px solid #e2e8f0', borderRadius: 12, padding: '12px' }}>
              <Phone size={14} /> Call Hospital
            </button>
            <button
              className="btn btn-ghost"
              style={{ flex: 1, fontSize: '0.8rem', color: '#64748b', background: 'white', border: '1px solid #fee2e2', borderRadius: 12, padding: '12px' }}
              onClick={() => navigate('/donor')}
            >
              <ArrowLeft size={14} /> Close Portal
            </button>
          </div>
          
          {/* Requirement 4: Cancel Availability Button */}
          <button
            onClick={handleCancelAvailability}
            style={{ 
              width: '100%', 
              padding: '14px', 
              borderRadius: 12, 
              background: '#fee2e2', 
              color: '#ef4444', 
              border: '1px solid #fecaca', 
              fontWeight: 800, 
              fontSize: '0.85rem',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8
            }}
          >
            <X size={16} /> Cancel Availability
          </button>
        </div>
      </div>
    </div>
  );

  const hPos = hospitalPos; // Thoothukudi fallback
  const mapCenter = donorPos || hPos;
  const mapPositions = donorPos ? [hPos, donorPos] : [hPos];

  return (
    <div style={{ position: 'fixed', inset: 0, background: '#0f172a', zIndex: 100, display: 'flex', overflow: 'hidden' }}>
      {/* 1. Map Section (Left/Main) */}
      <div style={{ position: 'relative', flex: 1, height: '100%', transition: 'all 0.4s cubic-bezier(0.4, 0, 0.2, 1)' }}>
        <MapContainer center={mapCenter} zoom={15} style={{ height: '100%', width: '100%' }} zoomControl={false} attributionControl={false}>
          <TileLayer
            url="http://mt0.google.com/vt/lyrs=m&hl=en&x={x}&y={y}&z={z}"
            attribution="&copy; Google Maps"
          />
          <MapResizer trigger={sidebarVisible} />
          <FitBounds positions={routeCoords.length > 2 ? routeCoords : mapPositions} trigger={recenterCounter} />

          {/* Markers */}
          <Marker position={hPos} icon={hospitalIcon}>
            <Popup className="custom-popup">{request?.hospital?.hospital_name || 'Destination Hospital'}</Popup>
          </Marker>
          {donorPos && (
            <>
              <Marker position={donorPos} icon={donorIcon}>
                <Popup>Your Current Location</Popup>
              </Marker>
              {trail.length > 1 && <Polyline positions={trail} color="#f59e0b" weight={3} opacity={0.4} />}
              <Polyline
                positions={routeCoords.length > 0 ? routeCoords : [donorPos, hPos]}
                color="#b91c1c"
                weight={6}
                opacity={0.9}
                lineCap="round"
                lineJoin="round"
              />
            </>
          )}
        </MapContainer>

        {/* Floating Top Overlays on Map */}
        <div style={{ position: 'absolute', top: 20, left: 20, zIndex: 1100, display: 'flex', gap: 12 }}>
          <button
            onClick={() => navigate('/donor')}
            style={{ width: 44, height: 44, borderRadius: '50%', background: 'white', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', boxShadow: '0 8px 24px rgba(0,0,0,0.15)' }}
          >
            <ArrowLeft size={20} color="#111827" />
          </button>

          <div style={{ background: 'rgba(15,23,42,0.9)', backdropFilter: 'blur(12px)', borderRadius: 30, padding: '10px 20px', display: 'flex', alignItems: 'center', gap: 10, border: '1px solid rgba(255,255,255,0.1)', boxShadow: '0 8px 24px rgba(0,0,0,0.2)' }}>
            <div style={{
              width: 10, height: 10, borderRadius: '50%',
              background: (completed || arrived) ? '#22c55e' : (gpsError ? '#ef4444' : gpsLoading ? '#f59e0b' : '#22c55e'),
              animation: (gpsLoading && !completed && !arrived) ? 'pulse 1s infinite' : 'pulse 1.5s infinite'
            }} />
            <span style={{ color: 'white', fontSize: '0.88rem', fontWeight: 800 }}>
              {completed ? 'SUCCESS' : arrived ? 'ARRIVED' : gpsError ? 'GPS ERROR' : gpsLoading ? 'ACQUIRING GPS...' : 'LIVE TRACKING'}
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
          title={sidebarVisible ? "Maximize Map" : "Show Details"}
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
              Track Donation
            </h2>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ background: '#fee2e2', color: '#dc2626', padding: '4px 12px', borderRadius: 20, fontSize: '0.75rem', fontWeight: 900 }}>
                {request?.emergency_level?.toUpperCase()} EMERGENCY
              </span>
              <span style={{ color: '#94a3b8', fontSize: '0.85rem', fontWeight: 600 }}>#{requestId?.slice(-6)}</span>
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
              <div style={{ width: 40, height: 40, borderRadius: '50%', background: '#fef2f2', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <MapPin size={20} color="#ef4444" />
              </div>
              <div style={{ flex: 1 }}>
                <p style={{ fontSize: '0.95rem', fontWeight: 800, color: '#1e293b' }}>{request?.hospital?.hospital_name}</p>
                <p style={{ fontSize: '0.8rem', color: '#64748b', fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '240px' }}>
                  {request?.hospital?.address}
                </p>
              </div>
              <div style={{ background: '#ef4444', color: 'white', width: 34, height: 34, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.75rem', fontWeight: 900 }}>
                {request?.blood_group?.replace('_POS', '+').replace('_NEG', '-')}
              </div>
            </div>
          </div>

          {/* Action List */}
          <div style={{ flex: 1 }}>
            <h3 style={{ fontSize: '0.85rem', fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 16 }}>Controls</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {!arrived ? (
                <button
                  onClick={() => setRecenterCounter(prev => prev + 1)}
                  style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 16, padding: '20px', borderRadius: 20, background: '#1e293b', color: 'white', border: 'none', cursor: 'pointer', transition: 'all 0.2s', boxShadow: '0 4px 12px rgba(30,41,59,0.3)' }}
                >
                  <Target size={24} />
                  <span style={{ fontWeight: 800, fontSize: '1.05rem' }}>Recenter Route</span>
                </button>
              ) : (
                <div style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 16, padding: '20px', borderRadius: 20, background: '#f0fdf4', color: '#16a34a', border: '1px solid #bbf7d0' }}>
                  <CheckCircle size={24} />
                  <span style={{ fontWeight: 800, fontSize: '1.05rem' }}>Arrived at Destination</span>
                </div>
              )}

              <button
                onClick={callHospital}
                style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 16, padding: '20px', borderRadius: 20, background: '#f8fafc', color: '#334155', border: '1px solid #e2e8f0', cursor: 'pointer', transition: 'all 0.2s' }}
              >
                <Phone size={24} />
                <span style={{ fontWeight: 800, fontSize: '1.05rem' }}>Call Hospital</span>
              </button>
            </div>
          </div>

          {/* Footer */}
          <div style={{ marginTop: 'auto', textAlign: 'center' }}>
            <p style={{ fontSize: '0.75rem', color: '#94a3b8', fontWeight: 600 }}>
              🔒 Tracking ends automatically on arrival
            </p>
          </div>
        </div>
      </div>

      {/* Arrival Overlay */}
      {arrived && !completed && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(21,128,61,0.9)', backdropFilter: 'blur(10px)', zIndex: 1200, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'white', textAlign: 'center', padding: '40px' }}>
          <div style={{ width: 100, height: 100, borderRadius: '50%', background: 'rgba(255,255,255,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 24, animation: 'pulse 2s infinite' }}>
            <MapPin size={50} />
          </div>
          <h2 style={{ fontSize: '2.5rem', fontWeight: 950, marginBottom: 12 }}>You've Arrived!</h2>
          <p style={{ fontSize: '1.2rem', opacity: 0.9, maxWidth: 400, lineHeight: 1.6 }}>
            The hospital has confirmed your arrival. Please head to the <strong>Emergency Admission</strong> counter immediately.
          </p>
          <div style={{ marginTop: 40, background: 'rgba(0,0,0,0.1)', padding: '20px', borderRadius: 20, maxWidth: 350 }}>
            <p style={{ fontSize: '0.9rem', fontWeight: 700, margin: 0 }}>Step 1: Present your Donor ID</p>
            <p style={{ fontSize: '0.9rem', fontWeight: 700, margin: '8px 0 0' }}>Step 2: Start the donation process</p>
          </div>
          <p style={{ marginTop: 30, fontSize: '0.85rem', opacity: 0.7 }}>This tracking session will close once donation is completed.</p>
        </div>
      )}

      {/* Hero Completion Screen (Overlay) */}
      {completed && (
        <div style={{ position: 'fixed', inset: 0, background: '#ef4444', zIndex: 2000, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'white', padding: 40, textAlign: 'center' }}>
          <div style={{ width: 120, height: 120, borderRadius: '50%', background: 'rgba(255,255,255,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 30 }}>
            <div style={{ animation: 'heartbeat 1.5s infinite' }}>
              <Heart size={80} fill="white" />
            </div>
          </div>
          <h1 style={{ fontSize: '3.5rem', fontWeight: 950, marginBottom: 15, letterSpacing: '-0.02em' }}>Thank You!</h1>
          <p style={{ fontSize: '1.35rem', opacity: 0.95, maxWidth: 500, lineHeight: 1.6, fontWeight: 600 }}>
            Donation completed. Thank you for your patience.
          </p>
          <button
            onClick={() => navigate('/donor')}
            style={{ marginTop: 50, padding: '20px 60px', borderRadius: 40, border: 'none', background: 'white', color: '#ef4444', fontWeight: 950, fontSize: '1.25rem', cursor: 'pointer', boxShadow: '0 20px 50px rgba(0,0,0,0.2)', transition: 'all 0.2s' }}
          >
            Finish & Exit
          </button>
        </div>
      )}

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.6; transform: scale(0.95); }
        }
        @keyframes heartbeat {
          0% { transform: scale(1); }
          14% { transform: scale(1.3); }
          28% { transform: scale(1); }
          42% { transform: scale(1.3); }
          70% { transform: scale(1); }
        }
        .leaflet-marker-icon {
          transition: transform 1.5s linear !important;
        }
        .leaflet-control-attribution { display: none !important; }
        .custom-popup .leaflet-popup-content-wrapper {
          border-radius: 12px;
          font-weight: 700;
        }
      `}</style>
    </div>
  );
}
