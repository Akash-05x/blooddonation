import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from 'react-leaflet';
import L from 'leaflet';
import { donorAPI } from '../../utils/api';
import { connectSocket, sendLocationUpdate } from '../../utils/socket';
import { Phone, Navigation, MapPin, ArrowLeft, CheckCircle, Target, Heart, ChevronRight, ChevronLeft, Maximize2, Minimize2 } from 'lucide-react';

// Fix Leaflet default icons
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl:       'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl:     'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
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
  const gpsWatchRef = useRef(null);
  const socketRef = useRef(null);
  const requestRef = useRef(null);

  useEffect(() => {
    fetchInitialData();
    setupSocket();
    return () => {
      if (gpsWatchRef.current !== null) {
        navigator.geolocation.clearWatch(gpsWatchRef.current);
      }
      if (socketRef.current) {
        socketRef.current.off('tracking_stopped');
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
        setIsAssigned(!assignment.isToken);
        const reqLat = assignment.request?.request_lat || assignment.request?.hospital?.latitude;
        const reqLng = assignment.request?.request_lng || assignment.request?.hospital?.longitude;
        if (reqLat && reqLng) {
          const hPos = [reqLat, reqLng];
          setHospitalPos(hPos);
        }
        // Start GPS tracking
        startGPSTracking(assignment.request);
      } else {
        setError('Tracking this request. Getting location...');
        startGPSTracking(null);
      }
    } catch (err) {
      setError('Failed to load tracking details.');
      startGPSTracking(null);
    } finally {
      setLoading(false);
    }
  };

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

    socket.on('assignment_confirmed', (data) => {
      if (data.requestId === requestId) setIsAssigned(true);
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

    setGpsLoading(true);
    gpsWatchRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        
        setDonorPos([lat, lng]);
        setGpsLoading(false);
        setGpsError(null);
        
        setTrail(prev => {
          const last = prev[prev.length - 1];
          // Only add to trail if moved significantly (approx 5-10 meters)
          if (last && Math.abs(last[0] - lat) < 0.00005 && Math.abs(last[1] - lng) < 0.00005) {
            return prev;
          }
          const newTrail = [...prev, [lat, lng]];
          return newTrail.slice(-100); 
        });

        // Send updates
        const hUserId = req?.hospital?.user_id || requestRef.current?.hospital?.user_id;
        if (socketRef.current?.connected && hUserId) {
          sendLocationUpdate(requestId, hUserId, lat, lng);
        }
        
        // HTTP fallback (throttled manually or just fire and forget)
        donorAPI.updateLocation({ requestId, latitude: lat, longitude: lng }).catch(() => {});
      },
      (err) => {
        console.warn('GPS error:', err.message);
        setGpsError(err.code === 1 ? 'Location permission denied.' : 'Searching for GPS signal...');
        setGpsLoading(false);
      },
      { 
        enableHighAccuracy: true, 
        timeout: 20000, 
        maximumAge: 5000 
      }
    );
  }, [requestId]);

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

  if (completed) return (
    <div style={{ position: 'fixed', inset: 0, background: 'linear-gradient(135deg,#052e16,#064e3b)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 20, zIndex: 1200, padding: 24 }}>
      <div style={{ width: 80, height: 80, borderRadius: '50%', background: 'linear-gradient(135deg,#16a34a,#22c55e)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 36, boxShadow: '0 0 40px rgba(34,197,94,0.5)' }}>✅</div>
      <h2 style={{ color: 'white', fontSize: '1.6rem', fontWeight: 800, textAlign: 'center' }}>Donation Complete!</h2>
      <p style={{ color: '#86efac', fontSize: '0.95rem', textAlign: 'center', lineHeight: 1.6 }}>Thank you for your life-saving contribution. You are a hero! 🦸</p>
      <button onClick={() => navigate('/donor')} style={{ marginTop: 8, padding: '16px 40px', borderRadius: 16, background: 'linear-gradient(135deg,#22c55e,#16a34a)', color: 'white', border: 'none', fontWeight: 800, fontSize: '1rem', cursor: 'pointer', boxShadow: '0 4px 12px rgba(34,197,94,0.4)' }}>
        Back to Dashboard
      </button>
    </div>
  );

  if (!isAssigned && !completed && !loading) return (
    <div style={{ position: 'fixed', inset: 0, background: '#0f172a', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 24, zIndex: 1200, padding: 32, textAlign: 'center' }}>
      <div style={{ width: 80, height: 80, borderRadius: '50%', background: 'linear-gradient(135deg,#0284c7,#0ea5e9)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 36, animation: 'pulse 2s infinite', boxShadow: '0 0 40px rgba(2,132,199,0.5)' }}>⏳</div>
      <div>
        <h2 style={{ color: 'white', fontSize: '1.6rem', fontWeight: 800, marginBottom: 8 }}>Awaiting Hospital Review</h2>
        <p style={{ color: '#94a3b8', fontSize: '0.95rem', maxWidth: 400, lineHeight: 1.6, margin: '0 auto' }}>Thank you for confirming your availability! You are now in the available candidate pool.<br/><br/>The hospital is currently assigning donors. If you are selected, the navigation map will appear here automatically.</p>
      </div>
      
      <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 10, background: 'rgba(34,197,94,0.1)', padding: '12px 20px', borderRadius: 24, border: '1px solid rgba(34,197,94,0.3)' }}>
        <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#22c55e', animation: 'pulse 1.5s infinite' }} />
        <span style={{ color: '#4ade80', fontSize: '0.88rem', fontWeight: 700 }}>Broadcasting Live Location to Hospital</span>
      </div>
      <button onClick={() => navigate('/donor')} style={{ marginTop: 24, padding: '12px 24px', borderRadius: 16, background: 'rgba(255,255,255,0.1)', color: 'white', border: 'none', fontWeight: 700, fontSize: '0.9rem', cursor: 'pointer' }}>
        Back to Dashboard
      </button>
    </div>
  );

  const hPos = hospitalPos || [8.7642, 78.1348]; // Thoothukudi fallback
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
                 {request?.blood_group?.replace('_POS','+').replace('_NEG','-')}
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

      {/* Hero Completion Screen (Overlay) */}
      {completed && (
        <div style={{ position: 'fixed', inset: 0, background: '#ef4444', zIndex: 2000, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'white', padding: 40, textAlign: 'center' }}>
          <div style={{ width: 120, height: 120, borderRadius: '50%', background: 'rgba(255,255,255,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 30 }}>
             <div style={{ animation: 'heartbeat 1.5s infinite' }}>
               <Heart size={80} fill="white" />
             </div>
          </div>
          <h1 style={{ fontSize: '3.5rem', fontWeight: 950, marginBottom: 15, letterSpacing: '-0.02em' }}>Life Saved!</h1>
          <p style={{ fontSize: '1.35rem', opacity: 0.95, maxWidth: 500, lineHeight: 1.6, fontWeight: 600 }}>
            Your blood donation has been successfully completed. Your courage and kindness have made a direct impact today. 
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
