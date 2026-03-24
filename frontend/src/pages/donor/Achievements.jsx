import { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { donorAPI } from '../../utils/api';

const BADGES = [
  { id: 'first_drop',   emoji: '🩸', name: 'First Drop',       desc: 'Your first donation',             unlocked: true,  at: 'Jun 2022' },
  { id: 'triple',       emoji: '🎯', name: 'Triple Hero',      desc: '3 successful donations',          unlocked: true,  at: 'Feb 2023' },
  { id: 'swift',        emoji: '⚡', name: 'Swift Responder',  desc: 'Responded in under 5 minutes',    unlocked: true,  at: 'May 2023' },
  { id: 'gold_donor',   emoji: '🥇', name: 'Gold Donor',       desc: '10+ successful donations',        unlocked: true,  at: 'Aug 2024' },
  { id: 'lifesaver5',   emoji: '💎', name: 'Diamond Saver',    desc: '20+ successful donations',        unlocked: false, at: null },
  { id: 'critical_hero',emoji: '🚨', name: 'Critical Hero',    desc: 'Responded to 5 critical requests',unlocked: false, at: null },
  { id: 'perfect',      emoji: '💯', name: 'Perfect Score',    desc: '100% acceptance rate over 10',    unlocked: false, at: null },
  { id: 'veteran',      emoji: '🏆', name: 'Veteran Donor',    desc: '5 years of donations',            unlocked: false, at: null },
];

export default function Achievements() {
  const { user } = useAuth();
  const [history, setHistory] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [histRes, statsRes] = await Promise.all([
        donorAPI.getHistory({ limit: 50 }),
        donorAPI.getStats ? donorAPI.getStats() : Promise.resolve({ data: { reliabilityScore: 95, donations: 12, acceptanceRate: 100, responseTime: 14 } })
      ]);
      setHistory(histRes.data || []);
      setStats(statsRes.data);
    } catch (err) {
      console.error('Failed to get achievements data:', err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <div style={{ padding: 40, textAlign: 'center' }}>Loading achievements...</div>;
  }

  const me = {
    name: user?.name || 'Donor',
    bloodGroup: user?.blood_group?.replace('_POS','+').replace('_NEG','-') || 'O+',
    city: user?.donorProfile?.city || 'Unknown',
    reliabilityScore: stats?.reliabilityScore || 0,
    donations: stats?.donations || history.filter(d => d.status === 'completed').length,
    acceptanceRate: stats?.acceptanceRate || 0,
    responseTime: stats?.responseTime || 0,
  };

  // Mocking appreciation points for MVP if not from API
  const TOTAL_POINTS = history.reduce((s, d) => s + (d.appreciationPoints || 50), 0) || 450;
  const NEXT_MILESTONE = { points: Math.ceil(TOTAL_POINTS/500)*500 || 500, label: 'Next Tier' };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>

      {/* Score Hero Card */}
      <div className="card" style={{ background: 'linear-gradient(135deg, rgba(220,38,38,0.15) 0%, rgba(124,58,237,0.15) 100%)', border: '1px solid rgba(220,38,38,0.3)', padding: '32px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 24, flexWrap: 'wrap' }}>
          {/* Score Ring */}
          <div style={{ position: 'relative', width: 120, height: 120, flexShrink: 0 }}>
            <svg width="120" height="120" style={{ transform: 'rotate(-90deg)' }}>
              <circle cx="60" cy="60" r="50" fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth="10" />
              <circle cx="60" cy="60" r="50" fill="none"
                stroke="url(#scoreGrad)" strokeWidth="10"
                strokeDasharray={`${2 * Math.PI * 50}`}
                strokeDashoffset={`${2 * Math.PI * 50 * (1 - me.reliabilityScore / 100)}`}
                strokeLinecap="round" />
              <defs>
                <linearGradient id="scoreGrad" x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0%" stopColor="#e63946" />
                  <stop offset="100%" stopColor="#7c3aed" />
                </linearGradient>
              </defs>
            </svg>
            <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
              <span style={{ fontSize: '1.6rem', fontWeight: 900, color: 'white' }}>{me.reliabilityScore}</span>
              <span style={{ fontSize: '0.6rem', textTransform: 'uppercase', color: 'rgba(255,255,255,0.5)', letterSpacing: '0.06em' }}>Score</span>
            </div>
          </div>

          {/* Info */}
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
              <h2 style={{ fontSize: '1.2rem', fontWeight: 800 }}>{me.name}</h2>
              <span style={{ fontSize: '1.3rem' }}>🥇</span>
            </div>
            <p style={{ fontSize: '0.85rem', color: 'var(--color-text-2)', marginBottom: 16 }}>Gold Tier Donor · {me.bloodGroup} Blood Group · {me.city}</p>
            <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
              {[
                { label: 'Donations', value: me.donations, emoji: '💉' },
                { label: 'Points',    value: TOTAL_POINTS, emoji: '⭐' },
                { label: 'Acceptance',value: `${me.acceptanceRate}%`, emoji: '✅' },
                { label: 'Avg Response', value: `${me.responseTime}m`, emoji: '⚡' },
              ].map(s => (
                <div key={s.label} style={{ minWidth: 80 }}>
                  <p style={{ fontSize: '1.2rem', fontWeight: 800 }}>{s.emoji} {s.value}</p>
                  <p style={{ fontSize: '0.72rem', color: 'var(--color-muted)', marginTop: 2 }}>{s.label}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Points Progress */}
        <div style={{ marginTop: 24 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.78rem', marginBottom: 6 }}>
            <span style={{ color: 'var(--color-muted)' }}>{TOTAL_POINTS} pts</span>
            <span style={{ color: 'var(--color-muted)' }}>{NEXT_MILESTONE.label}: {NEXT_MILESTONE.points} pts</span>
          </div>
          <div className="progress-bar" style={{ height: 10 }}>
            <div className="progress-fill" style={{
              width: `${Math.min((TOTAL_POINTS / NEXT_MILESTONE.points) * 100, 100)}%`,
              '--from': '#e63946', '--to': '#7c3aed'
            }} />
          </div>
          <p style={{ fontSize: '0.72rem', color: 'var(--color-muted)', marginTop: 6 }}>
            {NEXT_MILESTONE.points - TOTAL_POINTS} points to {NEXT_MILESTONE.label}
          </p>
        </div>
      </div>

      {/* Badges Grid */}
      <div>
        <h3 style={{ fontSize: '0.95rem', fontWeight: 700, marginBottom: 14 }}>Badges & Achievements</h3>
        <div className="grid-4">
          {BADGES.map(b => (
            <div key={b.id} className="card"
              style={{ padding: '18px', textAlign: 'center', opacity: b.unlocked ? 1 : 0.4, position: 'relative', overflow: 'hidden',
                       border: b.unlocked ? '1px solid rgba(230,57,70,0.3)' : '1px solid var(--color-border)',
                       transition: 'transform 0.2s, box-shadow 0.2s',
                       cursor: b.unlocked ? 'default' : 'not-allowed' }}
              onMouseEnter={e => { if (b.unlocked) { e.currentTarget.style.transform = 'translateY(-3px)'; e.currentTarget.style.boxShadow = '0 8px 24px rgba(230,57,70,0.2)'; }}}
              onMouseLeave={e => { e.currentTarget.style.transform = ''; e.currentTarget.style.boxShadow = ''; }}>
              {!b.unlocked && (
                <div style={{ position: 'absolute', top: 8, right: 8, fontSize: '0.8rem' }}>🔒</div>
              )}
              <div style={{ fontSize: '2.5rem', marginBottom: 8 }}>{b.emoji}</div>
              <p style={{ fontWeight: 700, fontSize: '0.85rem' }}>{b.name}</p>
              <p style={{ fontSize: '0.72rem', color: 'var(--color-muted)', marginTop: 4 }}>{b.desc}</p>
              {b.at && <p style={{ fontSize: '0.68rem', color: 'var(--color-blood)', marginTop: 6, fontWeight: 600 }}>Earned {b.at}</p>}
            </div>
          ))}
        </div>
      </div>

      {/* Full Donation History */}
      <div>
        <h3 style={{ fontSize: '0.95rem', fontWeight: 700, marginBottom: 14 }}>Full Donation History</h3>
        <div className="table-container">
          <table className="table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Hospital</th>
                <th>Blood Group</th>
                <th>Units</th>
                <th>Response Time</th>
                <th>Points Earned</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {history.map(d => (
                <tr key={d.id}>
                  <td style={{ fontSize: '0.82rem', color: 'var(--color-muted)' }}>{new Date(d.created_at || d.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</td>
                  <td style={{ fontSize: '0.88rem' }}>{d.hospital_name || d.request?.hospital?.hospital_name || 'Hospital'}</td>
                  <td><div className="blood-badge">{d.bloodGroup || d.request?.blood_group?.replace('_POS','+').replace('_NEG','-')}</div></td>
                  <td style={{ textAlign: 'center', fontWeight: 700 }}>{d.units || d.request?.units_needed || 1}</td>
                  <td style={{ fontSize: '0.85rem' }}>{d.responseTime != null ? `${d.responseTime} min` : <span style={{ color: 'var(--color-muted)' }}>—</span>}</td>
                  <td>
                    {(d.appreciationPoints || 50) > 0
                      ? <span style={{ color: 'var(--color-warning)', fontWeight: 700 }}>⭐ +{d.appreciationPoints || 50}</span>
                      : <span style={{ color: 'var(--color-muted)' }}>—</span>}
                  </td>
                  <td><span className={`badge ${d.status === 'completed' ? 'badge-success' : 'badge-danger'}`}>{d.status}</span></td>
                </tr>
              ))}
              {history.length === 0 && (
                <tr>
                  <td colSpan="7" style={{ textAlign: 'center', padding: '20px 0', color: 'var(--color-muted)' }}>No donation history available.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
