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
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
       <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <button className="btn btn-ghost btn-sm" onClick={() => navigate('/donor')}><ArrowLeft size={16} /></button>
        <h1 style={{ fontSize: '1.25rem', fontWeight: 700 }}>Live Tracking</h1>
      </div>

      {/* Connection Banner */}
       <div className="alert alert-info" style={{ fontSize: '0.88rem', display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'space-between' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Navigation size={16} className={sharing ? 'animate-pulse' : ''} />
            {sharing ? '📍 Sharing your location with hospital' : 'Location sharing inactive'}
          </span>
          <span style={{ fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: 4,
            color: socketStatus === 'connected' ? 'var(--color-success)' : 'var(--color-muted)' }}>
            {socketStatus === 'connected'
              ? <><div style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--color-success)', animation: 'pulse-dot 1.5s infinite' }} /> Connected</>
              : <><WifiOff size={12} /> Connecting...</>}
          </span>
      </div>

      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
        {/* Map */}
        <div style={{ flex: '1 1 480px', height: 400, borderRadius: 16, overflow: 'hidden', border: '1px solid var(--color-border)' }}>
          <MapContainer center={hPos} zoom={14} style={{ height: '100%', width: '100%' }}>
            <TileLayer
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              attribution='© OpenStreetMap'
            />
            <FitBounds positions={mapPositions} />
            <Marker position={hPos} icon={hospitalIcon}>
              <Popup>{request?.hospital?.hospital_name}</Popup>
            </Marker>
            {donorPos && (
              <>
                <Marker position={donorPos} icon={donorIcon}>
                  <Popup>You are here</Popup>
                </Marker>
                <Polyline positions={[hPos, donorPos]} color="#0284c7" weight={3} dashArray="8,6" />
              </>
            )}
          </MapContainer>
        </div>

        {/* Info Card */}
        <div style={{ flex: '0 0 300px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div className="card" style={{ padding: 20 }}>
            <h3 style={{ fontSize: '0.85rem', fontWeight: 700, marginBottom: 16, color: 'var(--color-muted)', textTransform: 'uppercase' }}>Destination</h3>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 16 }}>
              <div style={{ padding: 8, background: 'var(--color-hospital)22', borderRadius: 8 }}>
                <MapPin size={20} color="var(--color-hospital)" />
              </div>
              <div>
                <p style={{ fontWeight: 700, fontSize: '0.95rem' }}>{request?.hospital?.hospital_name}</p>
                <p style={{ fontSize: '0.8rem', color: 'var(--color-muted)', marginTop: 2 }}>{request?.hospital?.address}</p>
              </div>
            </div>
            
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 0', borderTop: '1px solid var(--color-border)' }}>
              <span style={{ fontSize: '0.85rem', color: 'var(--color-muted)' }}>Distance Left</span>
              <strong style={{ fontSize: '0.9rem' }}>{distKm} km</strong>
            </div>

            <button className="btn btn-primary w-full mt-4" onClick={openInGoogleMaps} style={{ gap: 8 }}>
              <ExternalLink size={16} /> Open Navigation
            </button>
          </div>

          <div className="card" style={{ padding: 20 }}>
             <h3 style={{ fontSize: '0.85rem', fontWeight: 700, marginBottom: 16, color: 'var(--color-muted)', textTransform: 'uppercase' }}>Contact Hospital</h3>
             <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn btn-ghost btn-sm flex-1"><Phone size={14} /> Call</button>
                <button className="btn btn-ghost btn-sm flex-1"><MessageSquare size={14} /> SMS</button>
             </div>
          </div>
        </div>
      </div>
    </div>
  );
}
