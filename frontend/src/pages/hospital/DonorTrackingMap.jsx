import { useState, useEffect, useRef, useCallback } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from 'react-leaflet';
import L from 'leaflet';
import { hospitalAPI } from '../../utils/api';
import { connectSocket } from '../../utils/socket';
import { Phone, MessageSquare, AlertTriangle, CheckCircle, Navigation, WifiOff } from 'lucide-react';

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

export default function DonorTrackingMap() {
  const [activeReq,    setActiveReq]    = useState(null);
  const [loading,      setLoading]      = useState(true);
  const [donorPos,     setDonorPos]     = useState(null);   // [lat, lng] from real socket
  const [hospitalPos,  setHospitalPos]  = useState(null);   // [lat, lng] from request data
  const [socketStatus, setSocketStatus] = useState('connecting'); // connected | disconnected | connecting
  const [promoted,     setPromoted]     = useState(false);
  const [completed,    setCompleted]    = useState(false);
  const [error,        setError]        = useState('');
  const socketRef = useRef(null);

  useEffect(() => {
    fetchActiveTracking();
    return () => {
      // Cleanup socket listeners on unmount
      if (socketRef.current) {
        socketRef.current.off('donor_location_update');
        socketRef.current.off('tracking_stopped');
        socketRef.current.off('failover_alert');
        socketRef.current.off('request_status_update');
      }
    };
  }, []);

  const fetchActiveTracking = async () => {
    try {
      const res  = await hospitalAPI.getRequests({ limit: 50 });
      const reqs = res.data || [];
      const active = reqs.find(r => ['assigned', 'in_transit', 'awaiting_confirmation'].includes(r.status));
      setActiveReq(active || null);

      if (active) {
        // Set hospital position from request data
        const hospital = active.assignments?.[0]?.request?.hospital || active.hospital;
        if (hospital?.latitude && hospital?.longitude) {
          setHospitalPos([hospital.latitude, hospital.longitude]);
        }

        // Try to get last known location from API
        try {
          const trackRes = await hospitalAPI.getRequestTracking(active.id);
          const loc      = trackRes?.data?.lastLocation;
          if (loc) setDonorPos([loc.latitude, loc.longitude]);
          // Set hospital coords from tracking data
          const h = trackRes?.data?.hospital;
          if (h?.latitude && h?.longitude) setHospitalPos([h.latitude, h.longitude]);
        } catch (_) { /* ignore if not available */ }

        // Connect to real-time socket
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

    // Real-time GPS from primary donor
    socket.on('donor_location_update', (data) => {
      // Only track if it's the primary donor for this request
      setActiveReq(prev => {
        if (!prev || data.requestId !== prev.id) return prev;
        const primaryAssignment = prev.assignments?.find(a => a.role === 'primary');
        if (primaryAssignment && data.donorUserId === primaryAssignment.donor?.user_id) {
          setDonorPos([data.latitude, data.longitude]);
        }
        return prev;
      });
    });

    // Tracking stopped (donation completed)
    socket.on('tracking_stopped', (data) => {
      if (data.requestId === request.id) setCompleted(true);
    });

    // Failover: backup promoted to primary
    socket.on('failover_alert', (data) => {
      if (data.requestId === request.id) {
        setPromoted(true);
        setActiveReq(prev => prev ? { ...prev, _failoverMsg: data.message } : prev);
      }
    });

    // Donor Accepted (Real-time update for hospital)
    socket.on('donor_accepted', (data) => {
      if (data.requestId === request.id) {
        setActiveReq(prev => {
          if (!prev) return prev;
          const newAssignment = {
            id:          data.assignmentId,
            donor_id:    data.donorId,
            role:        data.role,
            status:      'accepted',
            donor:       { user: { name: data.donorName } }
          };
          // Replace or add to assignments
          const others = (prev.assignments || []).filter(a => a.donor_id !== data.donorId);
          return { ...prev, assignments: [...others, newAssignment] };
        });
      }
    });

    // Status update
    socket.on('request_status_update', (data) => {
      if (data.requestId === request.id) {
        setActiveReq(prev => prev ? { ...prev, status: data.status } : prev);
      }
    });

    setSocketStatus(socket.connected ? 'connected' : 'connecting');
  }, []);

  const handlePromoteBackup = async () => {
    if (!activeReq) return;
    try {
      await hospitalAPI.promoteBackup(activeReq.id);
      setPromoted(true);
    } catch (err) {
      setError(err.message || 'Failed to promote backup donor.');
    }
  };

  const handleMarkDonation = async () => {
    if (!activeReq) return;
    try {
      const primaryAssignment = activeReq.assignments?.find(a => a.role === 'primary');
      if (!primaryAssignment) { setError('No primary assignment found.'); return; }
      await hospitalAPI.markDonation({
        assignmentId: primaryAssignment.id,
        donorId:      primaryAssignment.donor_id,
        status:       'successful',
      });
      setCompleted(true);
    } catch (err) {
      setError(err.message || 'Failed to mark donation.');
    }
  };

  if (loading) {
    return <div style={{ textAlign: 'center', padding: '80px 0', color: 'var(--color-muted)' }}>Loading tracking session...</div>;
  }

  if (!activeReq) {
    return (
      <div style={{ textAlign: 'center', padding: '80px 0', color: 'var(--color-muted)' }}>
        <p style={{ fontSize: '1.1rem', marginBottom: 8 }}>No active tracking session</p>
        <p style={{ fontSize: '0.85rem' }}>Submit an emergency request to see live donor tracking.</p>
      </div>
    );
  }

  const primaryAssignment = activeReq.assignments?.find(a => a.role === 'primary');
  const donorName  = primaryAssignment?.donor?.user?.name || 'Assigned Donor';

  // Fallback hospital position (Chennai center) if not yet loaded from API
  const hPos = hospitalPos || [13.0604, 80.2496];
  // Only show route if we have real donor position
  const mapPositions = donorPos ? [hPos, donorPos] : [hPos];

  // Estimate distance from donor to hospital
  const distKm = donorPos ? (() => {
    const dLat = hPos[0] - donorPos[0];
    const dLon = hPos[1] - donorPos[1];
    return Math.sqrt(dLat * dLat + dLon * dLon) * 111; // rough conversion
  })().toFixed(1) : '—';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {error && <div className="alert alert-danger">{error} <button style={{ float: 'right', background: 'none', border: 'none', cursor: 'pointer' }} onClick={() => setError('')}>✕</button></div>}

      {/* Status Banner */}
      {completed ? (
        <div className="alert alert-success" style={{ fontSize: '0.92rem', fontWeight: 600 }}>
          <CheckCircle size={18} /> ✅ Donation Completed — Thank you, {donorName}! Request marked as closed.
        </div>
      ) : promoted ? (
        <div className="alert alert-warning" style={{ fontSize: '0.92rem', fontWeight: 600 }}>
          <AlertTriangle size={18} /> 🔄 {activeReq._failoverMsg || 'Backup donor promoted to primary.'}
        </div>
      ) : (
        <div className="alert alert-info" style={{ fontSize: '0.88rem', display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'space-between' }}>
          <span>
            <Navigation size={16} style={{ verticalAlign: 'middle', marginRight: 4 }} />
            {donorPos
              ? <><strong>{donorName}</strong> is heading to hospital · <strong>{distKm} km</strong> remaining</>
              : <><strong>{donorName}</strong> assigned — waiting for GPS signal</>
            }
          </span>
          <span style={{ fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: 4,
            color: socketStatus === 'connected' ? 'var(--color-success)' : 'var(--color-muted)' }}>
            {socketStatus === 'connected'
              ? <><div style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--color-success)', animation: 'pulse-dot 1.5s infinite' }} /> Live</>
              : <><WifiOff size={12} /> Connecting...</>}
          </span>
        </div>
      )}

      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
        {/* Map */}
        <div style={{ flex: '1 1 480px', height: 460, borderRadius: 16, overflow: 'hidden', border: '1px solid var(--color-border)' }}>
          <MapContainer center={hPos} zoom={14} style={{ height: '100%', width: '100%' }}>
            <TileLayer
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              attribution='© <a href="https://openstreetmap.org">OpenStreetMap</a>'
            />
            <FitBounds positions={mapPositions} />
            {/* Hospital marker */}
            <Marker position={hPos} icon={hospitalIcon}>
              <Popup>🏥 Your Hospital</Popup>
            </Marker>
            {/* Donor marker (only when we have real GPS) */}
            {donorPos && (
              <>
                <Marker position={donorPos} icon={donorIcon}>
                  <Popup>🚗 {donorName} · {formatBG(activeReq.blood_group)} · {distKm} km away</Popup>
                </Marker>
                <Polyline positions={[hPos, donorPos]} color="#0284c7" weight={3} dashArray="8,6" />
              </>
            )}
          </MapContainer>
        </div>

        {/* Sidebar */}
        <div style={{ flex: '0 0 260px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          {/* Live Stats */}
          <div className="card" style={{ padding: '18px' }}>
            <h3 style={{ fontSize: '0.85rem', fontWeight: 700, marginBottom: 14, color: 'var(--color-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Request Info</h3>
            {[
              ['Blood Group',   formatBG(activeReq.blood_group) || '—'],
              ['Units',         activeReq.units_required || '—'],
              ['Urgency',       activeReq.emergency_level?.toUpperCase() || '—'],
              ['Status',        activeReq.status?.replace('_', ' ').toUpperCase() || '—'],
              ['Distance Left', donorPos ? `${distKm} km` : 'Waiting GPS'],
              ['GPS Signal',    socketStatus === 'connected' ? '🟢 Live' : '🔴 Connecting'],
            ].map(([k, v]) => (
              <div key={k} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', padding: '7px 0', borderBottom: '1px solid var(--color-border)' }}>
                <span style={{ color: 'var(--color-muted)' }}>{k}</span>
                <strong style={{ color: k === 'Urgency' && activeReq.emergency_level === 'critical' ? 'var(--color-danger)' : k === 'Urgency' ? 'var(--color-warning)' : 'var(--color-text)' }}>{String(v)}</strong>
              </div>
            ))}
          </div>

          {/* Donor Card */}
          <div className="card" style={{ padding: '18px' }}>
            <h3 style={{ fontSize: '0.85rem', fontWeight: 700, marginBottom: 12, color: 'var(--color-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Primary Donor</h3>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
              <div className="avatar" style={{ width: 44, height: 44, background: 'var(--color-donor-dark)', color: 'white', fontSize: '0.8rem' }}>
                {donorName.split(' ').map(n => n[0]).join('').slice(0, 2)}
              </div>
              <div>
                <p style={{ fontWeight: 700 }}>{donorName}</p>
                <div style={{ marginTop: 4, fontSize: '0.72rem', color: 'var(--color-muted)' }}>
                  {formatBG(primaryAssignment?.donor?.blood_group)} · {primaryAssignment?.status?.toUpperCase()}
                </div>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-ghost btn-sm flex-1"><Phone size={13} /> Call</button>
              <button className="btn btn-ghost btn-sm flex-1"><MessageSquare size={13} /> Text</button>
            </div>
          </div>

          {/* Actions */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {!promoted && !completed && (
              <button className="btn btn-warning btn-sm" onClick={handlePromoteBackup}>
                <AlertTriangle size={13} /> Promote Backup Donor
              </button>
            )}
            {!completed && (
              <button className="btn btn-success btn-sm" onClick={handleMarkDonation}>
                <CheckCircle size={13} /> Mark Donation Complete
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
