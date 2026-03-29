import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from 'react-leaflet';
import L from 'leaflet';
import { donorAPI } from '../../utils/api';
import { connectSocket, sendLocationUpdate } from '../../utils/socket';
import { Phone, MessageSquare, Navigation, MapPin, CheckCircle, Wifi, WifiOff, ArrowLeft, ExternalLink } from 'lucide-react';

// Fix Leaflet default icons
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl:       'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl:     'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

const hospitalIcon = L.divIcon({
  html: `<div style="width:36px;height:36px;background:#0284c7;border-radius:50%;display:flex;align-items:center;justify-content:center;border:3px solid white;box-shadow:0 2px 12px rgba(2,132,199,0.5);font-size:16px;">🏥</div>`,
  className: '', iconSize: [36, 36], iconAnchor: [18, 18],
});

const donorIcon = L.divIcon({
  html: `<div style="width:36px;height:36px;background:#dc2626;border-radius:50%;display:flex;align-items:center;justify-content:center;border:3px solid white;box-shadow:0 2px 12px rgba(220,38,38,0.5);font-size:16px;animation:pulse-dot 2s infinite;">🧑‍🏫</div>`,
  className: '', iconSize: [36, 36], iconAnchor: [18, 18],
});

const formatBG = key => key?.replace('_POS', '+').replace('_NEG', '-') || key;

function FitBounds({ positions }) {
  const map = useMap();
  useEffect(() => {
    if (positions.length >= 2) map.fitBounds(positions, { padding: [50, 50] });
  }, [positions, map]);
  return null;
}

export default function DonorTracking() {
  const { requestId } = useParams();
  const navigate = useNavigate();
  const [request, setRequest] = useState(null);
  const [loading, setLoading] = useState(true);
  const [donorPos, setDonorPos] = useState(null);
  const [hospitalPos, setHospitalPos] = useState(null);
  const [socketStatus, setSocketStatus] = useState('connecting');
  const [sharing, setSharing] = useState(true);
  const [error, setError] = useState('');
  const gpsIntervalRef = useRef(null);
  const socketRef = useRef(null);

  useEffect(() => {
    fetchRequestDetails();
    setupSocket();
    startGPSTracking();
    return () => {
      if (gpsIntervalRef.current) clearInterval(gpsIntervalRef.current);
      if (socketRef.current) {
        socketRef.current.off('donor_location_update');
        socketRef.current.off('tracking_stopped');
      }
    };
  }, [requestId]);

  const fetchRequestDetails = async () => {
    try {
      setLoading(true);
      const res = await donorAPI.getAlerts();
      const assignment = (res.data || []).find(a => a.request?.id === requestId);
      if (!assignment) {
        setError('Assignment not found or no longer active.');
        setLoading(false);
        return;
      }
      setRequest(assignment.request);
      if (assignment.request?.hospital?.latitude) {
        setHospitalPos([assignment.request.hospital.latitude, assignment.request.hospital.longitude]);
      }
    } catch (err) {
      setError('Failed to load request details.');
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

    socket.on('donor_location_update', (data) => {
      if (data.requestId === requestId && data.donorUserId !== socket.id) {
        // This would be for the secondary donor watching primary
      }
    });

    socket.on('tracking_stopped', (data) => {
      if (data.requestId === requestId) {
        alert('Tracking stopped. Thank you for your donation!');
        navigate('/donor');
      }
    });

    setSocketStatus(socket.connected ? 'connected' : 'connecting');
  };

  const startGPSTracking = () => {
    if (!navigator.geolocation) {
      setError('Geolocation not supported by this browser.');
      return;
    }

    const sendGPS = () => {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const lat = pos.coords.latitude;
          const lng = pos.coords.longitude;
          setDonorPos([lat, lng]);
          if (socketRef.current && socketRef.current.connected) {
            sendLocationUpdate(requestId, request?.hospital?.user_id, lat, lng);
          }
        },
        (err) => { console.warn('GPS error:', err.message); },
        { enableHighAccuracy: true }
      );
    };

    sendGPS();
    gpsIntervalRef.current = setInterval(sendGPS, 4000);
  };

  const openInGoogleMaps = () => {
    if (!hospitalPos) return;
    const url = `https://www.google.com/maps/dir/?api=1&destination=${hospitalPos[0]},${hospitalPos[1]}`;
    window.open(url, '_blank');
  };

  if (loading) return <div style={{ padding: 40, textAlign: 'center' }}>Loading tracking experience...</div>;
  if (error) return (
    <div style={{ padding: 40, textAlign: 'center' }}>
      <p style={{ color: 'var(--color-danger)', marginBottom: 16 }}>{error}</p>
      <button className="btn btn-ghost" onClick={() => navigate('/donor')}><ArrowLeft size={16} /> Back to Dashboard</button>
    </div>
  );

  const hPos = hospitalPos || [13.0604, 80.2496];
  const mapPositions = donorPos ? [hPos, donorPos] : [hPos];
  const distKm = donorPos ? (() => {
    const dLat = hPos[0] - donorPos[0];
    const dLon = hPos[1] - donorPos[1];
    return (Math.sqrt(dLat * dLat + dLon * dLon) * 111).toFixed(1);
  })() : '—';

  return (
    <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: 'var(--color-bg-1)', zIndex: 100 }}>
      {/* Map Background */}
      <div style={{ flex: 1, position: 'relative' }}>
         <MapContainer center={hPos} zoom={15} style={{ height: '100%', width: '100%' }} zoomControl={false}>
            <TileLayer
              url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
              attribution='&copy; OpenStreetMap'
            />
            <FitBounds positions={mapPositions} />
            <Marker position={hPos} icon={hospitalIcon}>
              <Popup>{request?.hospital?.hospital_name}</Popup>
            </Marker>
            {donorPos && (
              <>
                <Marker position={donorPos} icon={donorIcon}>
                  <Popup>Current Location</Popup>
                </Marker>
                <Polyline positions={[hPos, donorPos]} color="#06b6d4" weight={5} dashArray="8,10" opacity={0.6} lineCap="round" />
              </>
            )}
         </MapContainer>
      </div>

      {/* Top Floating Bar */}
      <div style={{ position: 'absolute', top: 20, left: 20, right: 20, zIndex: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
         <button className="btn btn-ghost" style={{ background: '#ffffff', color: '#111827', border: '1px solid #e5e7eb', borderRadius: '50%', width: 44, height: 44, padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }} onClick={() => navigate('/donor')}>
            <ArrowLeft size={20} />
         </button>
         
         <div className="card" style={{ padding: '8px 16px', borderRadius: 30, display: 'flex', alignItems: 'center', gap: 10, background: '#ffffff', color: '#111827', border: '1px solid #e5e7eb', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}>
             <Navigation size={16} className={sharing ? 'animate-pulse' : ''} color={sharing ? "#10b981" : "#9ca3af"} />
             <span style={{ fontSize: '0.85rem', fontWeight: 700 }}>{sharing ? 'Live Tracking' : 'Paused'}</span>
             <div style={{ width: 8, height: 8, borderRadius: '50%', background: socketStatus === 'connected' ? '#10b981' : '#f59e0b', border: '2px solid #ffffff' }} />
         </div>
      </div>

      {/* Bottom Floating Rapido-like Sheet */}
      <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, zIndex: 10, background: 'linear-gradient(to top, rgba(0,0,0,0.05) 90%, transparent)' }}>
         <div style={{ background: '#ffffff', color: '#111827', margin: '0 12px 12px 12px', padding: '24px 20px', borderRadius: '24px', boxShadow: '0 -10px 40px rgba(0,0,0,0.1)', border: '1px solid #e5e7eb', position: 'relative' }}>
            
            {/* Grab Handle */}
            <div style={{ position: 'absolute', top: 10, left: '50%', transform: 'translateX(-50%)', width: 40, height: 4, borderRadius: 2, background: '#e5e7eb' }} />
            
            {/* Sheet Header: ETA & Distance */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20, marginTop: 4 }}>
               <div style={{ display: 'flex', flexDirection: 'column' }}>
                 <p style={{ fontSize: '1.4rem', fontWeight: 800, lineHeight: 1 }}>{distKm !== '—' ? Math.ceil(distKm * 3) : '--'} min</p>
                 <p style={{ fontSize: '0.85rem', color: '#6b7280', fontWeight: 600, marginTop: 4 }}>{distKm} km · Dropoff at {request?.hospital?.hospital_name || 'Destination'}</p>
               </div>
            </div>

            {/* Drop Location Block */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '16px', background: '#f3f4f6', borderRadius: 16 }}>
                <div style={{ width: 44, height: 44, borderRadius: '50%', background: '#fee2e2', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <MapPin size={22} color="#ef4444" />
                </div>
                <div>
                  <p style={{ fontSize: '0.95rem', fontWeight: 700, color: '#111827' }}>{request?.hospital?.hospital_name || 'Hospital'}</p>
                  <p style={{ fontSize: '0.8rem', color: '#6b7280', marginTop: 2, display: '-webkit-box', WebkitLineClamp: 1, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{request?.hospital?.address || 'Address not listed'}</p>
                </div>
            </div>

            {/* Actions */}
            <div style={{ display: 'flex', gap: 12, marginTop: 20 }}>
               <button onClick={openInGoogleMaps} style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, fontSize: '0.95rem', fontWeight: 700, padding: '14px', borderRadius: 16, background: '#f5c518', color: '#111827', border: 'none', cursor: 'pointer', boxShadow: '0 4px 12px rgba(245, 197, 24, 0.3)' }}>
                 <Navigation size={18} fill="currentColor" /> Navigate to Hospital
               </button>
               <button style={{ background: '#f3f4f6', color: '#111827', border: 'none', borderRadius: 16, width: 54, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
                 <Phone size={20} />
               </button>
            </div>

         </div>
      </div>
    </div>
  );
}
