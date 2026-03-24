import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { donorAPI } from '../../utils/api';
import { connectSocket } from '../../utils/socket';
import { MapPin, CheckCircle, XCircle, Navigation, AlertTriangle, Bell } from 'lucide-react';

const URGENCY_COLOR = { critical: '#ef4444', high: '#f59e0b', medium: '#3b82f6', low: '#22c55e' };
const formatBG = key => key?.replace('_POS', '+').replace('_NEG', '-') || key;

function CountdownTimer({ seconds }) {
  const [remaining, setRemaining] = useState(seconds);
  useEffect(() => {
    const t = setInterval(() => setRemaining(p => Math.max(0, p - 1)), 1000);
    return () => clearInterval(t);
  }, []);
  const m   = String(Math.floor(remaining / 60)).padStart(2, '0');
  const s   = String(remaining % 60).padStart(2, '0');
  const pct = (remaining / seconds) * 100;
  const color = pct > 50 ? '#22c55e' : pct > 25 ? '#f59e0b' : '#ef4444';
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, minWidth: 70 }}>
      <div style={{ position: 'relative', width: 54, height: 54 }}>
        <svg width="54" height="54" style={{ transform: 'rotate(-90deg)' }}>
          <circle cx="27" cy="27" r="22" fill="none" stroke="var(--color-bg-3)" strokeWidth="5" />
          <circle cx="27" cy="27" r="22" fill="none" stroke={color} strokeWidth="5"
            strokeDasharray={`${2 * Math.PI * 22}`}
            strokeDashoffset={`${2 * Math.PI * 22 * (1 - pct / 100)}`}
            strokeLinecap="round" style={{ transition: 'stroke-dashoffset 1s linear, stroke 0.5s' }} />
        </svg>
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.72rem', fontWeight: 700, fontFamily: 'var(--font-mono)', color }}>
          {m}:{s}
        </div>
      </div>
      <span style={{ fontSize: '0.65rem', color: 'var(--color-muted)', textTransform: 'uppercase' }}>Expires</span>
    </div>
  );
}

export default function EmergencyAlerts() {
  const [alerts,    setAlerts]    = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [responded, setResponded] = useState({});
  const [liveCount, setLiveCount] = useState(0);
  const navigate = useNavigate();
  const socketRef = useRef(null);

  useEffect(() => {
    fetchAlerts();
    setupSocket();
    return () => {
      if (socketRef.current) {
        socketRef.current.off('new_emergency');
        socketRef.current.off('assignment_confirmed');
        socketRef.current.off('request_cancelled');
      }
    };
  }, []);

  const setupSocket = () => {
    const socket = connectSocket();
    if (!socket) return;
    socketRef.current = socket;

    // New emergency broadcast — prepend to alerts list in real time
    socket.on('new_emergency', (data) => {
      setLiveCount(c => c + 1);
      setAlerts(prev => {
        // Avoid duplicates
        if (prev.some(a => a.request?.id === data.requestId)) return prev;
        // Format into assignment-like shape for display
        const newAlert = {
          id:      `live_${data.requestId}`,
          status:  'pending',
          role:    data.role,
          request: {
            id:              data.requestId,
            blood_group:     data.bloodGroup,
            emergency_level: data.emergencyLevel,
            units_required:  data.unitsRequired,
            hospital: {
              hospital_name: data.hospital,
              address:       data.hospitalAddress,
            },
          },
          distance_km: data.distance_km,
          token:        data.token,           // Notification token for confirmation
          expiresInMins: data.expiresInMins || 10,
          isLive: true,
        };
        return [newAlert, ...prev];
      });
    });

    // Assignment confirmed (moved from awaiting to assigned)
    socket.on('assignment_confirmed', (data) => {
      setAlerts(prev => prev.map(a =>
        a.request?.id === data.requestId
          ? { ...a, status: 'pending', assignmentId: data.assignmentId, role: data.role }
          : a
      ));
    });

    // Request cancelled by hospital
    socket.on('request_cancelled', ({ requestId }) => {
      setAlerts(prev => prev.filter(a => a.request?.id !== requestId));
    });
  };

  const fetchAlerts = async () => {
    try {
      setLoading(true);
      const res = await donorAPI.getAlerts();
      setAlerts(res.data || []);
    } catch (err) {
      console.error('Failed to get alerts:', err);
    } finally {
      setLoading(false);
    }
  };

  const respond = async (alert, decision) => {
    try {
      const assignmentId = alert.id?.startsWith('live_') ? null : alert.id;
      if (assignmentId) {
        if (decision === 'accepted') await donorAPI.acceptRequest(assignmentId);
        else await donorAPI.rejectRequest(assignmentId);
      }
      setResponded(p => ({ ...p, [alert.id]: decision }));
      setAlerts(prev => prev.map(a => a.id === alert.id ? { ...a, status: decision } : a));

      if (decision === 'accepted') {
        const requestId = alert.request?.id || alert.id?.replace('live_', '');
        navigate(`/donor/tracking/${requestId}`);
      }
    } catch (err) {
      console.error('Failed to respond:', err);
      alert('Failed to submit response. Please try again.');
    }
  };

  if (loading) {
    return <div style={{ padding: 40, textAlign: 'center' }}>Loading emergency alerts...</div>;
  }

  const pending = alerts.filter(a => a.status === 'pending');
  const past    = alerts.filter(a => a.status !== 'pending');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>

      {/* Pending Alerts */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
          <h2 style={{ fontSize: '1rem', fontWeight: 700 }}>Incoming Requests</h2>
          {pending.length > 0 && (
            <span className="badge badge-danger" style={{ animation: 'pulse-dot 1.5s infinite' }}>
              {pending.length} ACTIVE
            </span>
          )}
          {liveCount > 0 && (
            <span className="badge badge-info" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <Bell size={10} /> {liveCount} LIVE
            </span>
          )}
        </div>

        {pending.length === 0 ? (
          <div className="card" style={{ textAlign: 'center', padding: '48px', color: 'var(--color-muted)' }}>
            <div style={{ fontSize: '3rem', marginBottom: 12 }}>🎉</div>
            <p style={{ fontWeight: 600, fontSize: '0.95rem' }}>No pending requests right now</p>
            <p style={{ fontSize: '0.82rem', marginTop: 6 }}>You'll be notified when a nearby hospital needs your blood group</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {pending.map(alert => {
              const req    = alert.request || {};
              const hosp   = req.hospital  || {};
              const level  = req.emergency_level || alert.urgency;
              const bg     = formatBG(req.blood_group || alert.bloodGroup);
              return (
                <div key={alert.id} className="card"
                  style={{ borderLeft: `4px solid ${URGENCY_COLOR[level] || '#6b7280'}`, padding: '20px 22px',
                    ...(alert.isLive ? { boxShadow: `0 0 0 2px ${URGENCY_COLOR[level] || '#3b82f6'}30` } : {}) }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' }}>
                    {/* Blood Badge */}
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
                      <div className="blood-badge" style={{ width: 52, height: 52, fontSize: '0.85rem' }}>{bg}</div>
                      <span style={{ background: `${URGENCY_COLOR[level]}20`, color: URGENCY_COLOR[level], padding: '2px 8px', borderRadius: 20, fontSize: '0.68rem', fontWeight: 700, textTransform: 'uppercase', whiteSpace: 'nowrap' }}>
                        {level}
                      </span>
                      {alert.isLive && <span className="badge badge-info" style={{ fontSize: '0.6rem' }}>🔴 LIVE</span>}
                    </div>

                    {/* Info */}
                    <div style={{ flex: 1, minWidth: 200 }}>
                      <p style={{ fontWeight: 700, fontSize: '1rem', marginBottom: 6 }}>
                        {hosp.hospital_name || 'Hospital'}
                      </p>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: '0.83rem', color: 'var(--color-text-2)' }}>
                        {hosp.address && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <MapPin size={13} color="var(--color-muted)" /> {hosp.address}
                          </div>
                        )}
                        {alert.distance_km != null && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <Navigation size={13} color="var(--color-muted)" />
                            <strong style={{ color: 'var(--color-text)' }}>{Number(alert.distance_km).toFixed(1)} km away</strong>
                          </div>
                        )}
                        <p style={{ marginTop: 4 }}>
                          <strong>{req.units_required || 1}</strong> unit(s) needed ·
                          Role: <strong style={{ color: alert.role === 'primary' ? 'var(--color-hospital)' : 'var(--color-muted)' }}>
                            {alert.role?.toUpperCase() || 'CANDIDATE'}
                          </strong>
                        </p>
                      </div>

                      {/* Action Buttons */}
                      <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
                        <button className="btn btn-success flex-1" onClick={() => respond(alert, 'accepted')} style={{ gap: 6 }}>
                          <CheckCircle size={15} /> Accept & Navigate
                        </button>
                        <button className="btn btn-ghost flex-1"
                          style={{ color: 'var(--color-danger)', borderColor: 'rgba(239,68,68,0.3)' }}
                          onClick={() => respond(alert, 'rejected')}>
                          <XCircle size={15} /> Decline
                        </button>
                      </div>
                    </div>

                    {/* Countdown */}
                    <CountdownTimer seconds={(alert.expiresInMins || 10) * 60} />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Past Responses */}
      {past.length > 0 && (
        <div>
          <h2 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: 14, color: 'var(--color-muted)' }}>Past Responses</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {past.map(alert => {
              const bg   = formatBG(alert.request?.blood_group || alert.bloodGroup);
              const hosp = alert.request?.hospital;
              return (
                <div key={alert.id} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 16px', background: 'var(--color-surface)', borderRadius: 12, border: '1px solid var(--color-border)', opacity: 0.75 }}>
                  <div className="blood-badge" style={{ opacity: 0.6 }}>{bg}</div>
                  <div style={{ flex: 1 }}>
                    <p style={{ fontSize: '0.88rem', fontWeight: 600 }}>{hosp?.hospital_name || 'Hospital'}</p>
                    <p style={{ fontSize: '0.75rem', color: 'var(--color-muted)' }}>
                      {alert.distance_km != null ? `${Number(alert.distance_km).toFixed(1)} km` : ''} · {alert.request?.emergency_level}
                    </p>
                  </div>
                  <span className={`badge ${alert.status === 'accepted' ? 'badge-success' : 'badge-danger'}`}>
                    {alert.status === 'accepted' ? '✓ Accepted' : '✗ Declined'}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
