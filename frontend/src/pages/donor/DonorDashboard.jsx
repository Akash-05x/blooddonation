import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { donorAPI } from '../../utils/api';
import { connectSocket, sendLocationUpdate } from '../../utils/socket';
import { Bell, ArrowRight, Navigation, Wifi, WifiOff, Droplets as Droplet, Activity, CheckCircle, XCircle } from 'lucide-react';

/* ── Shared Outcome Screen ────────────────────────────────────────────────── */
function OutcomeScreen({ type, onDismiss }) {
  const configs = {
    completed: {
      bg: 'linear-gradient(135deg, #065f46 0%, #064e3b 100%)',
      icon: <CheckCircle size={72} color="white" />,
      title: 'Donation Successful!',
      subtitle: 'Thank you for your life-saving contribution. Your donation has been confirmed. You are a hero!',
      btnColor: '#065f46',
    },
    failed: {
      bg: 'linear-gradient(135deg, #7f1d1d 0%, #991b1b 100%)',
      icon: <XCircle size={72} color="white" />,
      title: 'Request Failed',
      subtitle: 'The emergency request could not be fulfilled. This may be due to no donor availability or a timeout.',
      btnColor: '#7f1d1d',
    },
    cancelled: {
      bg: 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)',
      icon: <XCircle size={72} color="#94a3b8" />,
      title: 'Request Cancelled',
      subtitle: 'The hospital has cancelled this emergency request. You are free to accept other requests.',
      btnColor: '#1e293b',
    },
  };
  const cfg = configs[type] || configs.failed;
  return (
    <div style={{
      position: 'fixed', inset: 0,
      background: cfg.bg,
      zIndex: 9000, display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      color: 'white', padding: 40, textAlign: 'center'
    }}>
      <div style={{ width: 140, height: 140, borderRadius: '50%', background: 'rgba(255,255,255,0.12)', backdropFilter: 'blur(10px)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 32, border: '2px solid rgba(255,255,255,0.2)', animation: 'success-pop 0.6s cubic-bezier(0.175,0.885,0.32,1.275)' }}>
        {cfg.icon}
      </div>
      <h1 style={{ fontSize: '3rem', fontWeight: 950, marginBottom: 16, letterSpacing: '-0.03em', animation: 'fade-up 0.8s ease-out' }}>{cfg.title}</h1>
      <p style={{ fontSize: '1.15rem', opacity: 0.88, maxWidth: 520, lineHeight: 1.7, fontWeight: 500, marginBottom: 48, animation: 'fade-up 1s ease-out' }}>{cfg.subtitle}</p>
      <button
        onClick={onDismiss}
        style={{ padding: '20px 72px', borderRadius: 40, border: 'none', background: 'white', color: cfg.btnColor, fontWeight: 900, fontSize: '1.2rem', cursor: 'pointer', boxShadow: '0 20px 40px rgba(0,0,0,0.25)', transition: 'all 0.3s ease', animation: 'fade-up 1.2s ease-out' }}
        onMouseOver={e => e.target.style.transform = 'scale(1.05) translateY(-4px)'}
        onMouseOut={e => e.target.style.transform = 'scale(1)'}
      >
        Return to Dashboard
      </button>
      <style>{`
        @keyframes success-pop { 0% { transform: scale(0.5); opacity: 0; } 100% { transform: scale(1); opacity: 1; } }
        @keyframes fade-up { 0% { transform: translateY(30px); opacity: 0; } 100% { transform: translateY(0); opacity: 1; } }
      `}</style>
    </div>
  );
}

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
  const [outcomeScreen, setOutcomeScreen] = useState(null); // 'completed' | 'failed' | 'cancelled'
  const gpsIntervalRef = useRef(null);
  const donorRef       = useRef(null);
  const socketRef      = useRef(null);
  const activeRequestIdRef = useRef(null);

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

    socket.on('promoted_to_primary', (data) => {
      alert(data.message || 'You have been promoted to PRIMARY donor!');
      fetchDashboardData();
    });

    // Show outcome screens on terminal request events
    socket.on('request_completed', (data) => {
      if (activeRequestIdRef.current && data.requestId === activeRequestIdRef.current) {
        setOutcomeScreen('completed');
        setActiveAssignment(null);
        activeRequestIdRef.current = null;
      }
    });
    socket.on('request_failed', (data) => {
      if (activeRequestIdRef.current && data.requestId === activeRequestIdRef.current) {
        setOutcomeScreen('failed');
        setActiveAssignment(null);
        activeRequestIdRef.current = null;
      }
    });
    socket.on('request_cancelled', (data) => {
      if (activeRequestIdRef.current && data.requestId === activeRequestIdRef.current) {
        setOutcomeScreen('cancelled');
        setActiveAssignment(null);
        activeRequestIdRef.current = null;
      }
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
      activeRequestIdRef.current = active?.request?.id || null;

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

  const handleCancelDonation = async () => {
    if (!activeAssignment) return;
    const reason = window.prompt("Please provide a reason for cancellation:");
    if (reason === null) return; // User clicked "Cancel" on prompt

    try {
      setLoading(true);
      await donorAPI.cancelDonation({
        requestId: activeAssignment.request?.id,
        reason: reason
      });
      alert("Donation cancelled successfully.");
      window.location.reload(); // Refresh to update state
    } catch (err) {
      alert("Failed to cancel donation: " + (err.response?.data?.message || err.message));
    } finally {
      setLoading(false);
    }
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
          (err) => console.warn('GPS error:', err.message),
          { enableHighAccuracy: true, timeout: 5000 }
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

  /* Outcome screen takes priority over regular dashboard */
  if (outcomeScreen) {
    return <OutcomeScreen type={outcomeScreen} onDismiss={() => { setOutcomeScreen(null); fetchDashboardData(); }} />;
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

      {/* ── Active Mission Highlight (High Visibility) ────────────────── */}
      {activeAssignment && (
        <div style={{
          background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)',
          borderRadius: 24,
          padding: '32px',
          color: 'white',
          position: 'relative',
          overflow: 'hidden',
          boxShadow: '0 20px 40px rgba(0,0,0,0.15)',
          border: '1px solid rgba(255,255,255,0.1)',
        }}>
          {/* Decorative background elements */}
          <div style={{ position: 'absolute', top: '-20%', right: '-10%', width: '300px', height: '300px', background: 'rgba(220,38,38,0.1)', borderRadius: '50%', filter: 'blur(60px)' }} />
          
          <div style={{ position: 'relative', zIndex: 1, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 24 }}>
            <div style={{ flex: 1, minWidth: 280 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                <span style={{ background: '#ef4444', color: 'white', padding: '4px 12px', borderRadius: 20, fontSize: '0.7rem', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Live Emergency
                </span>
                <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.7rem', fontWeight: 700 }}>
                  ID: #{activeAssignment.request?.id?.slice(-6)}
                </span>
              </div>
              <h2 style={{ fontSize: '1.8rem', fontWeight: 900, marginBottom: 8, letterSpacing: '-0.02em' }}>
                {activeAssignment.request?.hospital?.hospital_name || 'Destination Hospital'}
              </h2>
              <div style={{ display: 'flex', alignItems: 'center', gap: 16, color: 'rgba(255,255,255,0.7)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Droplet size={18} color="#ef4444" fill="#ef4444" />
                  <span style={{ fontWeight: 800 }}>{bloodGroupDisplay(activeAssignment.request?.blood_group)} Required</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Activity size={18} color="#22c55e" />
                  <span style={{ fontWeight: 700 }}>Primary Responder</span>
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 14 }}>
              <button
                onClick={handleCancelDonation}
                style={{
                  background: 'rgba(239, 68, 68, 0.1)',
                  color: '#ef4444',
                  padding: '16px 24px',
                  borderRadius: 16,
                  fontWeight: 800,
                  border: '1px solid rgba(239, 68, 68, 0.2)',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                  fontSize: '0.9rem'
                }}
                onMouseOver={(e) => e.target.style.background = 'rgba(239, 68, 68, 0.2)'}
                onMouseOut={(e) => e.target.style.background = 'rgba(239, 68, 68, 0.1)'}
              >
                Cancel Donation
              </button>
              <Link 
                to={`/donor/tracking/${activeAssignment.request?.id}`} 
                className="glow-pulse"
                style={{ 
                  background: '#ef4444', color: 'white', padding: '16px 32px', borderRadius: 16, 
                  fontWeight: 900, display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none',
                  boxShadow: '0 10px 20px rgba(239,68,68,0.3)', transition: 'all 0.2s ease'
                }}
              >
                <Navigation size={20} /> Open Tracking Portal
              </Link>
            </div>
          </div>
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
            </div>
          </div>
        </div>

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
                background: (d.status === 'successful' || d.status === 'completed') ? 'rgba(34,197,94,0.12)' : 'rgba(239,68,68,0.12)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.2rem',
              }}>
                {(d.status === 'successful' || d.status === 'completed') ? '💉' : '❌'}
              </div>

              <div style={{ flex: 1 }}>
                <p style={{ fontSize: '0.88rem', fontWeight: 600, marginBottom: 2 }}>
                  {d.hospital?.hospital_name || d.hospital_name || 'Hospital'}
                </p>
                <p style={{ fontSize: '0.7rem', color: 'var(--color-muted)', marginBottom: 4 }}>
                  {new Date(d.donation_date || d.created_at || d.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                </p>
                <div style={{ fontSize: '0.65rem', color: 'var(--color-muted)', background: 'var(--color-bg-2)', padding: '4px 8px', borderRadius: 6, display: 'inline-block' }}>
                   Primary: {d.request?.assignments?.find(a => a.role === 'primary')?.donor?.user?.name || 'Assigned'}
                   {d.request?.assignments?.some(a => a.role === 'backup') && (
                     <span style={{ marginLeft: 8, paddingLeft: 8, borderLeft: '1px solid var(--color-border)' }}>
                       Backup: {d.request.assignments.find(a => a.role === 'backup')?.donor?.user?.name}
                     </span>
                   )}
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
                <span className={`badge ${(d.status === 'successful' || d.status === 'completed') ? 'badge-success' : 'badge-danger'}`}>
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