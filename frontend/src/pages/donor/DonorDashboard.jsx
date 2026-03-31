import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { donorAPI } from '../../utils/api';
import { connectSocket, sendLocationUpdate } from '../../utils/socket';
import { Bell, ArrowRight, Navigation, Wifi, WifiOff } from 'lucide-react';

export default function DonorDashboard() {
  const { user } = useAuth();
  const [available, setAvailable]         = useState(true);
  const [vacation, setVacation]           = useState(false);
  const [sharing, setSharing]             = useState(false);
  const [gpsStatus, setGpsStatus]         = useState('idle');
  const [stats, setStats]                 = useState(null);
  const [recentDonations, setRecentDonations] = useState([]);
  const [pendingAlerts, setPendingAlerts] = useState([]);
  const [activeAssignment, setActiveAssignment] = useState(null);
  const [loading, setLoading]             = useState(true);
  const gpsIntervalRef = useRef(null);
  const donorRef       = useRef(null);
  const socketRef      = useRef(null);

  useEffect(() => {
    fetchDashboardData();
    setupSocket();
    return () => {
      if (gpsIntervalRef.current) clearInterval(gpsIntervalRef.current);
      if (socketRef.current) socketRef.current.off('new_emergency');
    };
  }, []);

  const setupSocket = () => {
    const socket = connectSocket();
    if (!socket) return;
    socketRef.current = socket;
    socket.on('new_emergency', (data) => {
      setPendingAlerts(prev => {
        if (prev.some(a => a.request?.id === data.requestId)) return prev;
        return [{
          id: `live_${data.requestId}`,
          status: 'pending',
          request: {
            id: data.requestId,
            blood_group: data.bloodGroup,
            hospital: { hospital_name: data.hospital },
          },
        }, ...prev];
      });
    });
  };

  const fetchDashboardData = async () => {
    try {
      setLoading(true);
      const [historyRes, alertsRes, profileRes] = await Promise.all([
        donorAPI.getHistory(),
        donorAPI.getAlerts(),
        donorAPI.getProfile(),
      ]);
      const historyData = historyRes.data || [];
      const alertsData  = alertsRes.data  || [];
      const profile     = profileRes.data;
      donorRef.current  = profile;

      setAvailable(profile?.availability_status ?? true);
      setVacation(profile?.vacation_mode ?? false);
      setRecentDonations(historyData.slice(0, 3));
      setPendingAlerts(alertsData.filter(a => a.status === 'pending'));

      const active = alertsData.find(a => a.status === 'accepted');
      setActiveAssignment(active || null);

      setStats(historyRes.stats || {
        totalDonations:   historyData.filter(h => h.status === 'successful').length,
        reliabilityScore: profile?.reliability_score || 100,
        donationCount:    profile?.donation_count    || 0,
      });
    } catch (err) {
      console.error('Failed to fetch donor dashboard', err);
    } finally {
      setLoading(false);
    }
  };

  const toggleAvailable = async () => {
    const next = !available;
    setAvailable(next);
    try { await donorAPI.updateProfile({ availability_status: next }); }
    catch (_) { setAvailable(!next); }
  };

  const toggleVacation = async () => {
    const next = !vacation;
    setVacation(next);
    try { await donorAPI.updateProfile({ vacation_mode: next }); }
    catch (_) { setVacation(!next); }
  };

  const toggleGPS = () => {
    if (sharing) {
      clearInterval(gpsIntervalRef.current);
      setSharing(false);
      setGpsStatus('idle');
    } else {
      if (!activeAssignment) { setGpsStatus('error'); return; }
      const socket = connectSocket();
      if (!navigator.geolocation || !socket) { setGpsStatus('error'); return; }
      setSharing(true);
      setGpsStatus('active');
      const requestId      = activeAssignment.request?.id;
      const hospitalUserId = activeAssignment.request?.hospital?.user_id;
      const sendGPS = () => {
        navigator.geolocation.getCurrentPosition(
          (pos) => sendLocationUpdate(requestId, hospitalUserId, pos.coords.latitude, pos.coords.longitude),
          (err) => console.warn('GPS error:', err.message)
        );
      };
      sendGPS();
      gpsIntervalRef.current = setInterval(sendGPS, 4000);
    }
  };

  if (loading) {
    return (
      <div style={{ padding: 40, textAlign: 'center', color: 'var(--color-muted)' }}>
        Loading dashboard...
      </div>
    );
  }

  const me    = stats || { totalDonations: 0, reliabilityScore: 100, donationCount: 0 };
  const score = Math.round(me.reliabilityScore || 0);
  const R     = 44;
  const circ  = 2 * Math.PI * R;
  const dash  = circ * (score / 100);

  // Score colour
  const scoreColor = score >= 80 ? '#22c55e' : score >= 50 ? '#f59e0b' : '#ef4444';
  const scoreLabel = score >= 80 ? '🥇 Gold Donor' : score >= 50 ? '🥈 Silver Donor' : '🥉 Bronze Donor';

  const bloodGroupDisplay = (bg) =>
    bg ? bg.replace('_POS', '+').replace('_NEG', '-') : '—';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>

<<<<<<< HEAD


      {/* GPS Sharing Banner (shown when donor has active accepted assignment) */}
=======
      {/* ── GPS Sharing Banner ─────────────────────────────────────────── */}
>>>>>>> ab954513cd2fe1fbf94d454b328e45187e9e7eb9
      {activeAssignment && (
        <div className="card" style={{
          borderLeft: `4px solid ${sharing ? 'var(--color-success)' : 'var(--color-warning)'}`,
          padding: '16px 20px',
          background: sharing ? 'rgba(34,197,94,0.06)' : 'rgba(245,158,11,0.06)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              {sharing
                ? <Wifi size={22} color="var(--color-success)" />
                : <WifiOff size={22} color="var(--color-warning)" />}
              <div>
                <p style={{ fontWeight: 700, fontSize: '0.95rem' }}>
                  {sharing ? '📡 Broadcasting GPS Location' : '📍 Active Assignment — Share Location'}
                </p>
                <p style={{ fontSize: '0.78rem', color: 'var(--color-muted)', marginTop: 2 }}>
                  {sharing ? 'Hospital can see your route live every 4 sec' : 'Hospital needs your GPS to track your arrival'}
                </p>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <Link to={`/donor/tracking/${activeAssignment.request?.id}`} className="btn btn-primary btn-sm">
                <Navigation size={14} /> Track Live
              </Link>
              <button className={`btn ${sharing ? 'btn-danger' : 'btn-success'} btn-sm`} onClick={toggleGPS}>
                {sharing ? 'Stop GPS' : 'Start GPS'}
              </button>
            </div>
          </div>
          {gpsStatus === 'error' && (
            <p style={{ fontSize: '0.75rem', color: 'var(--color-danger)', marginTop: 8 }}>
              ⚠️ GPS unavailable or no active assignment.
            </p>
          )}
        </div>
      )}

      {/* ── Pending Alert Banner ────────────────────────────────────────── */}
      {pendingAlerts.length > 0 && (
        <div className="card glow-pulse" style={{
          borderLeft: '4px solid var(--color-danger)',
          background: 'rgba(220,38,38,0.06)',
          padding: '18px 22px',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <div style={{ position: 'relative' }}>
                <Bell size={28} color="var(--color-danger)" />
                <span style={{
                  position: 'absolute', top: -6, right: -6,
                  background: 'var(--color-danger)', color: 'white',
                  borderRadius: '50%', width: 18, height: 18,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '0.65rem', fontWeight: 700,
                }}>{pendingAlerts.length}</span>
              </div>
              <div>
                <p style={{ fontWeight: 700, fontSize: '1rem', color: 'var(--color-danger)' }}>Emergency Blood Request!</p>
                <p style={{ fontSize: '0.84rem', color: 'var(--color-text-2)', marginTop: 2 }}>
                  <strong>{pendingAlerts[0]?.request?.hospital?.hospital_name || 'A hospital'}</strong> needs{' '}
                  <strong>{bloodGroupDisplay(pendingAlerts[0]?.request?.blood_group)}</strong>
                </p>
              </div>
            </div>
            <Link to="/donor/alerts" className="btn btn-danger">
              View Alert <ArrowRight size={14} />
            </Link>
          </div>
        </div>
      )}

      {/* ── Top Row ─────────────────────────────────────────────────────── */}
      <div className="grid-3">

        {/* ── Availability Card ── */}
        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
<<<<<<< HEAD
          <h3 style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--color-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Availability Status</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div className="toggle-wrap" onClick={toggleAvailable}>
              <button
                style={{
                  display: 'flex', flexDirection: 'column', gap: 16, width: '100%', padding: '16px', borderRadius: '14px',
                  border: '1px solid #eef2f7', background: '#ffffff', boxShadow: '0 4px 14px rgba(0,0,0,0.06)',
                  transition: 'all 0.25s ease', cursor: 'pointer'
                }}
              >
                <div
                  className={`toggle ${available ? 'active' : ''}`}
                  style={{
                    width: '52px', height: '28px', borderRadius: '999px', background: available ? '#10b981' : '#d1d5db',
                    position: 'relative', transition: 'all 0.3s ease'
                  }}
                >
                  <div
                    className="toggle-knob"
                    style={{
                      width: '22px', height: '22px', borderRadius: '50%', background: '#ffffff',
                      position: 'absolute', top: '3px', left: available ? '26px' : '4px',
                      transition: 'all 0.3s ease', boxShadow: '0 2px 6px rgba(0,0,0,0.2)'
                    }}
                  />
                </div>

                <div>
                  <p style={{ fontSize: '0.9rem', fontWeight: 600, color: available ? '#059669' : '#111827' }}>
                    {available ? '✅ Available to Donate' : '❌ Not Available'}
                  </p>
                  <p style={{ fontSize: '0.75rem', color: '#6b7280' }}>
                    Toggle your donation availability
                  </p>
                </div>
              </button>
            </div>

            <div className="toggle-wrap" onClick={toggleVacation}>
              <button
                style={{
                  display: 'flex', flexDirection: 'column', gap: 16, width: '100%', padding: '16px', borderRadius: '14px',
                  border: '1px solid #eef2f7', background: '#ffffff', boxShadow: '0 4px 14px rgba(0,0,0,0.06)',
                  transition: 'all 0.25s ease', cursor: 'pointer'
                }}
              >
                <div
                  className={`toggle ${vacation ? 'active' : ''}`}
                  style={{
                    width: '52px', height: '28px', borderRadius: '999px', background: vacation ? '#f59e0b' : '#d1d5db',
                    position: 'relative', transition: 'all 0.3s ease'
                  }}
                >
                  <div
                    className="toggle-knob"
                    style={{
                      width: '22px', height: '22px', borderRadius: '50%', background: '#ffffff',
                      position: 'absolute', top: '3px', left: vacation ? '26px' : '4px',
                      transition: 'all 0.3s ease', boxShadow: '0 2px 6px rgba(0,0,0,0.2)'
                    }}
                  />
                </div>

                <div>
                  <p style={{ fontSize: '0.9rem', fontWeight: 600, color: vacation ? '#d97706' : '#111827' }}>
                    {vacation ? '🏖 Vacation Mode ON' : 'Vacation Mode'}
                  </p>
                  <p style={{ fontSize: '0.75rem', color: '#6b7280' }}>
                    Pause all alerts temporarily
                  </p>
                </div>
              </button>
=======
          <h3 style={{
            fontSize: '0.75rem', fontWeight: 700,
            color: 'var(--color-muted)', textTransform: 'uppercase', letterSpacing: '0.08em',
          }}>
            Availability Status
          </h3>

          {/* Available to Donate toggle */}
          <div
            onClick={toggleAvailable}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '14px 16px',
              borderRadius: 12,
              border: `2px solid ${available ? '#22c55e' : '#e5e7eb'}`,
              background: available ? 'rgba(34,197,94,0.06)' : 'var(--color-bg-2)',
              cursor: 'pointer',
              transition: 'all 0.25s',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{
                width: 36, height: 36, borderRadius: '50%',
                background: available ? 'rgba(34,197,94,0.15)' : 'rgba(0,0,0,0.06)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '1.1rem',
              }}>
                {available ? '✅' : '❌'}
              </div>
              <div>
                <p style={{ fontSize: '0.85rem', fontWeight: 700, color: available ? '#16a34a' : 'var(--color-muted)' }}>
                  {available ? 'Available' : 'Not Available'}
                </p>
                <p style={{ fontSize: '0.7rem', color: 'var(--color-muted)' }}>Tap to toggle</p>
              </div>
            </div>
            {/* Toggle switch */}
            <div style={{
              width: 44, height: 24, borderRadius: 12,
              background: available ? '#22c55e' : '#d1d5db',
              position: 'relative', transition: 'background 0.25s', flexShrink: 0,
            }}>
              <div style={{
                position: 'absolute', top: 3,
                left: available ? 23 : 3,
                width: 18, height: 18, borderRadius: '50%',
                background: 'white',
                boxShadow: '0 1px 4px rgba(0,0,0,0.2)',
                transition: 'left 0.25s',
              }} />
            </div>
          </div>

          {/* Vacation Mode toggle */}
          <div
            onClick={toggleVacation}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '14px 16px',
              borderRadius: 12,
              border: `2px solid ${vacation ? '#f59e0b' : '#e5e7eb'}`,
              background: vacation ? 'rgba(245,158,11,0.06)' : 'var(--color-bg-2)',
              cursor: 'pointer',
              transition: 'all 0.25s',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{
                width: 36, height: 36, borderRadius: '50%',
                background: vacation ? 'rgba(245,158,11,0.15)' : 'rgba(0,0,0,0.06)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '1.1rem',
              }}>
                {vacation ? '🏖️' : '💼'}
              </div>
              <div>
                <p style={{ fontSize: '0.85rem', fontWeight: 700, color: vacation ? '#d97706' : 'var(--color-muted)' }}>
                  {vacation ? 'Vacation ON' : 'Vacation Mode'}
                </p>
                <p style={{ fontSize: '0.7rem', color: 'var(--color-muted)' }}>Pause alerts temporarily</p>
              </div>
            </div>
            {/* Toggle switch */}
            <div style={{
              width: 44, height: 24, borderRadius: 12,
              background: vacation ? '#f59e0b' : '#d1d5db',
              position: 'relative', transition: 'background 0.25s', flexShrink: 0,
            }}>
              <div style={{
                position: 'absolute', top: 3,
                left: vacation ? 23 : 3,
                width: 18, height: 18, borderRadius: '50%',
                background: 'white',
                boxShadow: '0 1px 4px rgba(0,0,0,0.2)',
                transition: 'left 0.25s',
              }} />
>>>>>>> ab954513cd2fe1fbf94d454b328e45187e9e7eb9
            </div>
          </div>
        </div>

<<<<<<< HEAD
        {/* Score Ring */}
        <div className="card" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 12 }}>
          <h3 style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--color-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Reliability Score</h3>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px' }}>
            <div className="score-ring" style={{ width: 100, height: 100 }}>
              <svg width="100" height="100" style={{ transform: 'rotate(-90deg)' }}>
                <circle cx="50" cy="50" r="44" fill="none" stroke="var(--color-bg-3)" strokeWidth="8" />
                <circle cx="50" cy="50" r="44" fill="none" stroke="var(--color-donor)" strokeWidth="8"
                  strokeDasharray={`${2 * Math.PI * 44}`}
                  strokeDashoffset={`${2 * Math.PI * 44 * (1 - Math.min(100, me.reliabilityScore || 0) / 100)}`}
                  strokeLinecap="round" />
              </svg>
              <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Droplets size={32} color="var(--color-donor)" opacity={0.2} />
              </div>
            </div>
            
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'center', gap: '6px' }}>
                <span style={{ fontSize: '1.6rem', fontWeight: 800, color: '#111827' }}>
                  {me.reliabilityScore || 0}
                </span>
                <span style={{ fontSize: '0.9rem', color: '#6b7280', fontWeight: 600 }}>
                  / 100
                </span>
              </div>
              <span className="badge badge-success" style={{ padding: '4px 12px', borderRadius: '999px', background: '#ecfdf5', color: '#059669', fontSize: '0.75rem', fontWeight: 700, border: '1px solid #d1fae5' }}>
                🥇 GOLD DONOR
              </span>
            </div>
          </div>
=======
        {/* ── Reliability Score Ring ── */}
        <div className="card" style={{
          display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center', gap: 12,
        }}>
          <h3 style={{
            fontSize: '0.75rem', fontWeight: 700,
            color: 'var(--color-muted)', textTransform: 'uppercase', letterSpacing: '0.08em',
          }}>
            Reliability Score
          </h3>

          {/* SVG ring with centered text using foreignObject trick */}
          <div style={{ position: 'relative', width: 120, height: 120 }}>
            <svg width="120" height="120" style={{ transform: 'rotate(-90deg)' }}>
              {/* Background track */}
              <circle cx="60" cy="60" r={R} fill="none" stroke="#f1f5f9" strokeWidth="10" />
              {/* Score arc */}
              <circle
                cx="60" cy="60" r={R}
                fill="none"
                stroke={scoreColor}
                strokeWidth="10"
                strokeDasharray={`${dash} ${circ - dash}`}
                strokeLinecap="round"
                style={{ transition: 'stroke-dasharray 0.6s ease' }}
              />
            </svg>
            {/* Centered text absolutely positioned over SVG */}
            <div style={{
              position: 'absolute',
              top: 0, left: 0, right: 0, bottom: 0,
              display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center',
              pointerEvents: 'none',
            }}>
              <span style={{
                fontSize: '1.6rem', fontWeight: 800,
                color: scoreColor, lineHeight: 1,
              }}>{score}</span>
              <span style={{
                fontSize: '0.7rem', color: 'var(--color-muted)',
                fontWeight: 500, marginTop: 2,
              }}>/ 100</span>
            </div>
          </div>

          <span style={{
            background: score >= 80 ? 'rgba(34,197,94,0.12)' : score >= 50 ? 'rgba(245,158,11,0.12)' : 'rgba(239,68,68,0.12)',
            color: scoreColor,
            padding: '4px 12px', borderRadius: 20,
            fontSize: '0.75rem', fontWeight: 700,
          }}>
            {scoreLabel}
          </span>
>>>>>>> ab954513cd2fe1fbf94d454b328e45187e9e7eb9
        </div>

        {/* ── My Stats ── */}
        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <h3 style={{
            fontSize: '0.75rem', fontWeight: 700,
            color: 'var(--color-muted)', textTransform: 'uppercase', letterSpacing: '0.08em',
          }}>
            My Stats
          </h3>
          {[
            { label: 'Total Donations', value: me.donationCount || me.totalDonations || 0, icon: '💉' },
            { label: 'Reliability Score', value: `${score} pts`, icon: '⭐' },
            { label: 'Lives Saved', value: ((me.donationCount || me.totalDonations || 0) * 3), icon: '❤️' },
            { label: 'Blood Group', value: bloodGroupDisplay(donorRef.current?.blood_group), icon: '🩸' },
          ].map(s => (
            <div key={s.label} style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '8px 10px', borderRadius: 8, background: 'var(--color-bg-2)',
            }}>
              <span style={{ fontSize: '0.82rem', color: 'var(--color-muted)', display: 'flex', alignItems: 'center', gap: 6 }}>
                <span>{s.icon}</span> {s.label}
              </span>
              <strong style={{ fontSize: '0.9rem' }}>{s.value}</strong>
            </div>
          ))}
        </div>
      </div>

      {/* ── Recent Donation History ──────────────────────────────────────── */}
      <div className="card">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <h3 style={{ fontSize: '0.95rem', fontWeight: 700 }}>Recent Donation History</h3>
          <Link to="/donor/achievements" className="btn btn-ghost btn-sm">See All</Link>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {recentDonations.map(d => (
            <div key={d.id} style={{
              display: 'flex', alignItems: 'center', gap: 14,
              padding: '12px 14px', background: 'var(--color-bg-3)', borderRadius: 10,
            }}>
              <div style={{
                width: 44, height: 44, borderRadius: 12, flexShrink: 0,
                background: d.status === 'completed' ? 'rgba(34,197,94,0.12)' : 'rgba(239,68,68,0.12)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.2rem',
              }}>
                {d.status === 'completed' ? '💉' : '❌'}
              </div>
              <div style={{ flex: 1 }}>
                <p style={{ fontSize: '0.88rem', fontWeight: 600 }}>
                  {d.hospital_name || d.request?.hospital?.hospital_name || 'Hospital'}
                </p>
                <p style={{ fontSize: '0.75rem', color: 'var(--color-muted)' }}>
                  {new Date(d.created_at || d.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                </p>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
                <span className={`badge ${d.status === 'completed' ? 'badge-success' : 'badge-danger'}`}>
                  {d.status}
                </span>
                {d.appreciationPoints > 0 && (
                  <span style={{ fontSize: '0.72rem', color: 'var(--color-warning)' }}>
                    +{d.appreciationPoints} pts
                  </span>
                )}
              </div>
            </div>
          ))}
          {recentDonations.length === 0 && (
            <p style={{ fontSize: '0.85rem', color: 'var(--color-muted)' }}>No recent donations.</p>
          )}
        </div>
      </div>
    </div>
  );
}