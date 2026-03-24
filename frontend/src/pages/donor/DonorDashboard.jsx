import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { donorAPI } from '../../utils/api';
import { connectSocket, sendLocationUpdate } from '../../utils/socket';
import { Heart, Bell, MapPin, Clock, Droplets, Award, ArrowRight, Navigation, Wifi, WifiOff } from 'lucide-react';

export default function DonorDashboard() {
  const { user } = useAuth();
  const [available, setAvailable] = useState(true);
  const [vacation, setVacation] = useState(false);
  const [sharing, setSharing] = useState(false);   // GPS sharing active
  const [gpsStatus, setGpsStatus] = useState('idle');  // idle | active | error
  const [stats, setStats] = useState(null);
  const [recentDonations, setRecentDonations] = useState([]);
  const [pendingAlerts, setPendingAlerts] = useState([]);
  const [activeAssignment, setActiveAssignment] = useState(null);
  const [loading, setLoading] = useState(true);
  const gpsIntervalRef = useRef(null);
  const donorRef = useRef(null);

  useEffect(() => {
    fetchDashboardData();
    setupSocket();
    return () => { 
      if (gpsIntervalRef.current) clearInterval(gpsIntervalRef.current);
      if (socketRef.current) socketRef.current.off('new_emergency');
    };
  }, []);

  const socketRef = useRef(null);

  const setupSocket = () => {
    const socket = connectSocket();
    if (!socket) return;
    socketRef.current = socket;

    socket.on('new_emergency', (data) => {
      console.log('[Dashboard] New emergency alert received via socket:', data);
      setPendingAlerts(prev => {
        if (prev.some(a => a.request?.id === data.requestId)) return prev;
        const newAlert = {
          id: `live_${data.requestId}`,
          status: 'pending',
          request: {
            id: data.requestId,
            blood_group: data.bloodGroup,
            hospital: { hospital_name: data.hospital }
          }
        };
        return [newAlert, ...prev];
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
      const alertsData = alertsRes.data || [];
      const profile = profileRes.data;
      donorRef.current = profile;

      setAvailable(profile?.availability_status ?? true);
      setVacation(profile?.vacation_mode ?? false);
      setRecentDonations(historyData.slice(0, 3));
      setPendingAlerts(alertsData.filter(a => a.status === 'pending'));

      // Find active accepted assignment for GPS sharing
      const active = alertsData.find(a => a.status === 'accepted');
      setActiveAssignment(active || null);

      setStats(historyRes.stats || {
        totalDonations: historyData.filter(h => h.status === 'successful').length,
        reliabilityScore: profile?.reliability_score || 100,
        donationCount: profile?.donation_count || 0,
      });
    } catch (err) {
      console.error('Failed to fetch donor dashboard', err);
    } finally {
      setLoading(false);
    }
  };

  // Toggle availability and persist to API
  const toggleAvailable = async () => {
    const next = !available;
    setAvailable(next);
    try { await donorAPI.updateProfile({ availability_status: next }); } catch (_) { setAvailable(!next); }
  };

  // Toggle vacation mode and persist to API
  const toggleVacation = async () => {
    const next = !vacation;
    setVacation(next);
    try { await donorAPI.updateProfile({ vacation_mode: next }); } catch (_) { setVacation(!next); }
  };

  // GPS sharing — send location every 4 seconds via socket
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
      const requestId = activeAssignment.request?.id;
      const hospitalUserId = activeAssignment.request?.hospital?.user_id;
      const sendGPS = () => {
        navigator.geolocation.getCurrentPosition(
          (pos) => sendLocationUpdate(requestId, hospitalUserId, pos.coords.latitude, pos.coords.longitude),
          (err) => { console.warn('GPS error:', err.message); }
        );
      };
      sendGPS(); // Immediate first send
      gpsIntervalRef.current = setInterval(sendGPS, 4000);
    }
  };

  if (loading) {
    return <div style={{ padding: 40, textAlign: 'center' }}>Loading dashboard...</div>;
  }

  const me = stats || { totalDonations: 0, reliabilityScore: 100, donationCount: 0 };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>

      {/* GPS Sharing Banner (shown when donor has active accepted assignment) */}
      {activeAssignment && (
        <div className="card" style={{ borderLeft: `4px solid ${sharing ? 'var(--color-success)' : 'var(--color-warning)'}`, padding: '16px 20px', background: sharing ? 'rgba(34,197,94,0.06)' : 'rgba(245,158,11,0.06)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              {sharing ? <Wifi size={22} color="var(--color-success)" /> : <WifiOff size={22} color="var(--color-warning)" />}
              <div>
                <p style={{ fontWeight: 700, fontSize: '0.95rem' }}>{sharing ? '📡 Broadcasting GPS Location' : '📍 Active Assignment — Share Location'}</p>
                <p style={{ fontSize: '0.78rem', color: 'var(--color-muted)', marginTop: 2 }}>{sharing ? 'Hospital can see your route live every 4 sec' : 'Hospital needs your GPS to track your arrival'}</p>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <Link to={`/donor/tracking/${activeAssignment.request?.id}`} className="btn btn-primary btn-sm" style={{ '--accent': 'var(--color-hospital)', '--accent-glow': 'var(--color-hospital-glow)' }}>
                <Navigation size={14} /> Track Live
              </Link>
              <button className={`btn ${sharing ? 'btn-danger' : 'btn-success'} btn-sm`} onClick={toggleGPS}>
                {sharing ? 'Stop GPS' : 'Start GPS'}
              </button>
            </div>
          </div>
          {gpsStatus === 'error' && <p style={{ fontSize: '0.75rem', color: 'var(--color-danger)', marginTop: 8 }}>⚠️ GPS unavailable or no active assignment.</p>}
        </div>
      )}

      {/* Pending Alert Banner */}
      {pendingAlerts.length > 0 && (
        <div className="card glow-pulse" style={{ borderLeft: '4px solid var(--color-danger)', background: 'rgba(220,38,38,0.06)', padding: '18px 22px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <div style={{ position: 'relative' }}>
                <Bell size={28} color="var(--color-danger)" />
                <span style={{ position: 'absolute', top: -6, right: -6, background: 'var(--color-danger)', color: 'white', borderRadius: '50%', width: 18, height: 18, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.65rem', fontWeight: 700 }}>{pendingAlerts.length}</span>
              </div>
              <div>
                <p style={{ fontWeight: 700, fontSize: '1rem', color: 'var(--color-danger)' }}>Emergency Blood Request!</p>
                <p style={{ fontSize: '0.84rem', color: 'var(--color-text-2)', marginTop: 2 }}>
                  <strong>{pendingAlerts[0]?.request?.hospital?.hospital_name || 'A hospital'}</strong> needs <strong>{pendingAlerts[0]?.request?.blood_group?.replace('_POS', '+').replace('_NEG', '-') || 'blood'}</strong>
                </p>
              </div>
            </div>
            <Link to="/donor/alerts" className="btn btn-danger">
              View Alert <ArrowRight size={14} />
            </Link>
          </div>
        </div>
      )}

      {/* Top row: Availability toggle + Score ring + Quick stats */}
      <div className="grid-3">
        {/* Availability Card */}
        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <h3 style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--color-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Availability Status</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div className="toggle-wrap" onClick={toggleAvailable}>
              <button style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div className={`toggle ${available ? 'active' : ''}`}><div className="toggle-knob" /></div>
                <div>
                  <p style={{ fontSize: '0.88rem', fontWeight: 600 }}>{available ? '✅ Available to Donate' : '❌ Not Available'}</p>
                  <p style={{ fontSize: '0.72rem', color: 'var(--color-muted)' }}>Toggle your donation availability</p>
                </div>
              </button>
            </div>
            <div className="toggle-wrap" onClick={toggleVacation}>
              <button style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div className={`toggle ${vacation ? 'active' : ''}`} style={vacation ? { background: '#f59e0b' } : {}}><div className="toggle-knob" /></div>
                <div>
                  <p style={{ fontSize: '0.88rem', fontWeight: 600 }}>{vacation ? '🏖 Vacation Mode ON' : 'Vacation Mode'}</p>
                  <p style={{ fontSize: '0.72rem', color: 'var(--color-muted)' }}>Pause all alerts temporarily</p>
                </div>
              </button>
            </div>
          </div>
        </div>

        {/* Score Ring */}
        <div className="card" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 12 }}>
          <h3 style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--color-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Reliability Score</h3>
          <div className="score-ring" style={{ width: 110, height: 110 }}>
            <svg width="110" height="110" style={{ transform: 'rotate(-90deg)' }}>
              <circle cx="55" cy="55" r="44" fill="none" stroke="var(--color-bg-3)" strokeWidth="10" />
              <circle cx="55" cy="55" r="44" fill="none" stroke="var(--color-donor)" strokeWidth="10"
                strokeDasharray={`${2 * Math.PI * 44}`}
                strokeDashoffset={`${2 * Math.PI * 44 * (1 - (me.reliabilityScore || 0) / 100)}`}
                strokeLinecap="round" />
            </svg>
            <div className="score-ring-text">
              <span className="score-number" style={{ fontSize: '1.4rem' }}>{me.reliabilityScore || 0}</span>
              <span className="score-label">/ 100</span>
            </div>
          </div>
          <span className="badge badge-success">🥇 Gold Donor</span>
        </div>

        {/* Stats */}
        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <h3 style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--color-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>My Stats</h3>
          {[
            { label: 'Total Donations', value: me.donationCount || me.totalDonations || 0, icon: '💉' },
            { label: 'Reliability Score', value: `${Math.round(me.reliabilityScore || 0)} pts`, icon: '⭐' },
            { label: 'Lives Saved', value: ((me.donationCount || me.totalDonations || 0) * 3), icon: '❤️' },
            { label: 'Blood Group', value: donorRef.current?.blood_group?.replace('_POS', '+').replace('_NEG', '-') || '—', icon: '🩸' },
          ].map(s => (
            <div key={s.label} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: '0.82rem', color: 'var(--color-muted)', display: 'flex', alignItems: 'center', gap: 6 }}>
                <span>{s.icon}</span> {s.label}
              </span>
              <strong style={{ fontSize: '0.9rem' }}>{s.value}</strong>
            </div>
          ))}
        </div>
      </div>

      {/* Recent Donation History */}
      <div className="card">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <h3 style={{ fontSize: '0.95rem', fontWeight: 700 }}>Recent Donation History</h3>
          <Link to="/donor/achievements" className="btn btn-ghost btn-sm">See All</Link>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {recentDonations.map(d => (
            <div key={d.id} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '12px 14px', background: 'var(--color-bg-3)', borderRadius: 10 }}>
              <div style={{ width: 44, height: 44, borderRadius: 12, background: d.status === 'completed' ? 'rgba(34,197,94,0.12)' : 'rgba(239,68,68,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.2rem', flexShrink: 0 }}>
                {d.status === 'completed' ? '💉' : '❌'}
              </div>
              <div style={{ flex: 1 }}>
                <p style={{ fontSize: '0.88rem', fontWeight: 600 }}>{d.hospital_name || d.request?.hospital?.hospital_name || 'Hospital'}</p>
                <p style={{ fontSize: '0.75rem', color: 'var(--color-muted)' }}>{new Date(d.created_at || d.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</p>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
                <span className={`badge ${d.status === 'completed' ? 'badge-success' : 'badge-danger'}`}>{d.status}</span>
                {d.appreciationPoints > 0 && <span style={{ fontSize: '0.72rem', color: 'var(--color-warning)' }}>+{d.appreciationPoints} pts</span>}
              </div>
            </div>
          ))}
          {recentDonations.length === 0 && <p style={{ fontSize: '0.85rem', color: 'var(--color-muted)' }}>No recent donations.</p>}
        </div>
      </div>
    </div>
  );
}
