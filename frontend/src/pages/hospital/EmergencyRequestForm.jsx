import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Droplets, AlertTriangle, User, FileText, Send, MapPin, Navigation } from 'lucide-react';
import { hospitalAPI } from '../../utils/api';
import { useAuth } from '../../contexts/AuthContext';

// Map display values to Prisma enum keys
const BLOOD_GROUP_MAP = {
  'A+': 'A_POS', 'A-': 'A_NEG', 'B+': 'B_POS', 'B-': 'B_NEG',
  'O+': 'O_POS', 'O-': 'O_NEG', 'AB+': 'AB_POS', 'AB-': 'AB_NEG',
};
const formatBG = (key) => key?.replace('_POS', '+').replace('_NEG', '-') || key;

const BLOOD_GROUPS   = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];
const URGENCY_LEVELS = [
  { value: 'critical', label: '🔴 Critical', desc: 'Life-threatening, immediate need', color: '#ef4444' },
  { value: 'high',     label: '🟠 High',     desc: 'Urgent, within the hour',         color: '#f59e0b' },
  { value: 'medium',   label: '🟡 Medium',   desc: 'Required within a few hours',     color: '#3b82f6' },
];
const REASONS = [
  'Emergency Surgery','Accident / Trauma','Post-partum Hemorrhage','Cancer / Chemotherapy',
  'Thalassemia','Dengue / Malaria','Anemia','Organ Transplant','Other',
];

export default function EmergencyRequestForm() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [form, setForm] = useState({
    bloodGroup: '', units: 1, urgency: '', patientName: '', reason: '', notes: '', consentChecked: false,
  });
  const [step, setStep]           = useState(0); // 0=form, 1=submitting, 2=success
  const [result, setResult]       = useState(null);
  const [error, setError]         = useState('');
  // Live location state
  const [locLoading, setLocLoading] = useState(false);
  const [locError, setLocError]     = useState('');
  const [liveLocation, setLiveLocation] = useState(null);   // { lat, lng }
  const [district, setDistrict]     = useState('');         // district text input

  const set = useCallback((k, v) => setForm(p => ({ ...p, [k]: v })), []);
  const isValid = form.bloodGroup && form.urgency && form.patientName && form.reason;

  // ── GPS detection ──────────────────────────────────────────────────────────
  const detectLocation = () => {
    if (!navigator.geolocation) {
      setLocError('Geolocation not supported by this browser.');
      return;
    }
    setLocLoading(true);
    setLocError('');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLiveLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setLocLoading(false);
      },
      () => {
        setLocError('Could not detect location. Please enter district manually or try again.');
        setLocLoading(false);
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const handleSubmit = async () => {
    setStep(1);
    setError('');
    try {
      const res = await hospitalAPI.createRequest({
        blood_group:      BLOOD_GROUP_MAP[form.bloodGroup] || form.bloodGroup,
        units_required:   form.units,
        emergency_level:  form.urgency,
        notes:            [form.patientName && `Patient: ${form.patientName}`, form.reason, form.notes].filter(Boolean).join(' | '),
        // Live location — sent to backend to prioritize same-district donors
        hospital_lat:     liveLocation?.lat ?? null,
        hospital_lng:     liveLocation?.lng ?? null,
        request_district: district.trim() || null,
      });
      setResult(res.data);
      setStep(2);
    } catch (err) {
      setError(err.message || 'Failed to create request. Please try again.');
      setStep(0);
    }
  };

  // ── Loading (submitting) screen ──────────────────────────────────────────────
  if (step === 1) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '60vh', gap: 24, textAlign: 'center' }}>
        <div style={{ width: 72, height: 72, borderRadius: '50%', border: '4px solid var(--color-hospital)', borderTopColor: 'transparent', animation: 'spin 1s linear infinite' }} />
        <div>
          <h2 style={{ fontSize: '1.2rem', fontWeight: 700, marginBottom: 8 }}>Finding & Notifying Donors...</h2>
          <p style={{ color: 'var(--color-muted)', fontSize: '0.88rem' }}>Scanning nearby donors, computing scores, sending alerts</p>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: '0.8rem', color: 'var(--color-muted)', maxWidth: 320 }}>
          {[
            '🔍 Scanning donors within radius...',
            district ? `🏙️ Prioritizing ${district} district donors first...` : '🧮 Running Haversine distance filter...',
            '📊 Ranking by response · distance · history...',
            '📱 Sending SMS + Call to top-10 donors...',
          ].map((t, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ color: 'var(--color-success)' }}>✓</span>{t}
            </div>
          ))}
        </div>
      </div>
    );
  }

  // ── Success screen ───────────────────────────────────────────────────────────
  if (step === 2 && result) {
    const { request, assignments } = result;
    const primary = assignments?.primary;
    const backup  = assignments?.backup;
    const notified = assignments?.notified ?? 0;

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20, maxWidth: 700 }}>
        <div className="alert alert-success">
          <span>✅ Emergency request created! {notified} donors notified{request?.request_district ? ` in ${request.request_district} district` : ''}.</span>
        </div>

        {/* Request Info */}
        <div className="card" style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'center', padding: '16px 20px' }}>
          <div className="blood-badge" style={{ width: 52, height: 52, fontSize: '0.9rem' }}>
            {formatBG(request?.blood_group)}
          </div>
          <div style={{ flex: 1 }}>
            <p style={{ fontWeight: 700 }}>Request #{request?.id?.slice(-8).toUpperCase()}</p>
            <p style={{ fontSize: '0.82rem', color: 'var(--color-muted)', marginTop: 2 }}>
              {request?.emergency_level?.toUpperCase()} · {request?.units_required} unit(s) · Status: <strong>{request?.status?.replace('_', ' ').toUpperCase()}</strong>
            </p>
            {request?.request_district && (
              <p style={{ fontSize: '0.78rem', color: 'var(--color-hospital)', marginTop: 4, display: 'flex', alignItems: 'center', gap: 4 }}>
                <MapPin size={12} /> Alerting donors in <strong>{request.request_district}</strong> district first
              </p>
            )}
          </div>
          <span className="badge badge-info" style={{ animation: 'pulse-dot 2s infinite' }}>LIVE</span>
        </div>

        {/* Assigned Donors */}
        {(primary || backup) ? (
          <div className="grid-2">
            {[
              { label: 'PRIMARY DONOR', data: primary, color: 'var(--color-hospital)', flag: '⭐ Primary' },
              { label: 'SECONDARY DONOR', data: backup, color: 'var(--color-muted)', flag: '🔄 Backup' },
            ].map(({ label, data, color, flag }) => data ? (
              <div key={label} className="card" style={{ borderTop: `3px solid ${color}` }}>
                <p style={{ fontSize: '0.68rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--color-muted)', marginBottom: 12 }}>{label}</p>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
                  <div className="avatar" style={{ width: 44, height: 44, background: `${color}22`, color, fontWeight: 800, fontSize: '0.85rem' }}>
                    {(data.donor?.user?.name || 'D').split(' ').map(w => w[0]).join('').slice(0, 2)}
                  </div>
                  <div>
                    <p style={{ fontWeight: 700, fontSize: '0.95rem' }}>{data.donor?.user?.name || 'Assigned Donor'}</p>
                    <div className="blood-badge" style={{ marginTop: 4, display: 'inline-flex', width: 'auto', padding: '2px 8px', fontSize: '0.7rem' }}>
                      {formatBG(data.donor?.blood_group)}
                    </div>
                  </div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {[
                    ['Score',    data.score     != null ? `${(data.score * 100).toFixed(1)} / 100` : '—'],
                    ['Distance', data.distance_km != null ? `${data.distance_km} km` : '—'],
                    ['Role',     data.role?.toUpperCase() || '—'],
                  ].map(([k, v]) => (
                    <div key={k} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem' }}>
                      <span style={{ color: 'var(--color-muted)' }}>{k}</span>
                      <strong>{v}</strong>
                    </div>
                  ))}
                </div>
                <div style={{ marginTop: 12, padding: '6px 10px', background: `${color}15`, borderRadius: 8, fontSize: '0.72rem', color, fontWeight: 700, textAlign: 'center' }}>{flag}</div>
              </div>
            ) : null)}
          </div>
        ) : (
          <div className="card" style={{ textAlign: 'center', padding: 32 }}>
            <p style={{ fontSize: '1.5rem', marginBottom: 8 }}>📡</p>
            <p style={{ fontWeight: 600 }}>Notified {notified} donors — awaiting confirmation</p>
            <p style={{ fontSize: '0.82rem', color: 'var(--color-muted)', marginTop: 6 }}>
              Donors will be assigned once they confirm. Check the tracking page in a moment.
            </p>
          </div>
        )}

        <div style={{ display: 'flex', gap: 12 }}>
          <button className="btn btn-primary flex-1" onClick={() => navigate('/hospital/tracking')}
            style={{ '--accent': 'var(--color-hospital)', '--accent-glow': 'var(--color-hospital-glow)' }}>
            📍 Track Donor Live
          </button>
          <button className="btn btn-ghost flex-1"
            onClick={() => { setStep(0); setResult(null); setLiveLocation(null); setDistrict(''); setForm({ bloodGroup:'', units:1, urgency:'', patientName:'', reason:'', notes:'', consentChecked:false }); }}>
            + New Request
          </button>
        </div>
      </div>
    );
  }

  // ── Form ─────────────────────────────────────────────────────────────────────
  return (
    <div style={{ maxWidth: 700 }}>
      {error && <div className="alert alert-danger" style={{ marginBottom: 16 }}>⚠️ {error}</div>}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

        {/* Blood Group */}
        <div className="card">
          <h3 style={{ fontSize: '0.9rem', fontWeight: 700, marginBottom: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
            <Droplets size={17} color="var(--color-hospital)" /> Blood Group Required
          </h3>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {BLOOD_GROUPS.map(bg => (
              <button key={bg} type="button"
                className={`btn ${form.bloodGroup === bg ? 'btn-primary' : 'btn-ghost'}`}
                style={{ minWidth: 64, ...(form.bloodGroup === bg ? { '--accent': 'var(--color-hospital)', '--accent-glow': 'var(--color-hospital-glow)' } : {}) }}
                onClick={() => set('bloodGroup', bg)}>{bg}</button>
            ))}
          </div>
          {form.bloodGroup && (
            <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 10 }}>
              <label className="form-label" style={{ whiteSpace: 'nowrap' }}>Units Needed:</label>
              <input type="number" className="form-input" min={1} max={10} value={form.units}
                onChange={e => set('units', Number(e.target.value))} style={{ maxWidth: 100 }} />
            </div>
          )}
        </div>

        {/* Urgency */}
        <div className="card">
          <h3 style={{ fontSize: '0.9rem', fontWeight: 700, marginBottom: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
            <AlertTriangle size={17} color="var(--color-warning)" /> Urgency Level
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {URGENCY_LEVELS.map(u => (
              <div key={u.value} onClick={() => set('urgency', u.value)}
                style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 16px', borderRadius: 10, border: `2px solid ${form.urgency === u.value ? u.color : 'var(--color-border)'}`, cursor: 'pointer', background: form.urgency === u.value ? `${u.color}12` : 'var(--color-bg-3)', transition: 'all 0.15s' }}>
                <div style={{ width: 14, height: 14, borderRadius: '50%', border: `3px solid ${u.color}`, background: form.urgency === u.value ? u.color : 'transparent', transition: 'all 0.15s', flexShrink: 0 }} />
                <div>
                  <p style={{ fontWeight: 600, fontSize: '0.9rem' }}>{u.label}</p>
                  <p style={{ fontSize: '0.75rem', color: 'var(--color-muted)' }}>{u.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ── Hospital Live Location (NEW) ─────────────────────────────────── */}
        <div className="card" style={{ border: '2px solid var(--color-hospital)', borderRadius: 12 }}>
          <h3 style={{ fontSize: '0.9rem', fontWeight: 700, marginBottom: 6, display: 'flex', alignItems: 'center', gap: 8, color: 'var(--color-hospital)' }}>
            <Navigation size={17} /> Hospital Live Location
            <span style={{ fontSize: '0.72rem', fontWeight: 400, color: 'var(--color-muted)', marginLeft: 4 }}>— donors in your district are alerted first</span>
          </h3>

          {/* District text input */}
          <div className="form-group" style={{ marginBottom: 12 }}>
            <label className="form-label">Hospital District <span style={{ color: 'var(--color-muted)', fontWeight: 400 }}>(required for district alerts)</span></label>
            <input
              className="form-input"
              placeholder="e.g. Chennai, Coimbatore..."
              value={district}
              onChange={e => setDistrict(e.target.value)}
            />
          </div>

          {/* GPS detection */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <button
              type="button"
              className={`btn ${liveLocation ? 'btn-success' : 'btn-secondary'}`}
              style={{ minWidth: 180 }}
              onClick={detectLocation}
              disabled={locLoading}
            >
              <MapPin size={15} />
              {locLoading ? 'Detecting...' : liveLocation ? '✓ GPS Location Captured' : 'Detect My Live Location'}
            </button>
            {liveLocation && (
              <span style={{ fontSize: '0.78rem', color: 'var(--color-success)', fontWeight: 600 }}>
                📍 {liveLocation.lat.toFixed(5)}, {liveLocation.lng.toFixed(5)}
              </span>
            )}
          </div>
          {locError && (
            <p style={{ color: 'var(--color-danger)', fontSize: '0.78rem', marginTop: 8 }}>⚠️ {locError}</p>
          )}
          {!liveLocation && !locError && (
            <p style={{ fontSize: '0.75rem', color: 'var(--color-muted)', marginTop: 8 }}>
              GPS coordinates are optional but improve donor matching accuracy. District is used to alert local donors first.
            </p>
          )}
          {liveLocation && district && (
            <div className="alert alert-info" style={{ marginTop: 10, fontSize: '0.8rem', padding: '10px 14px' }}>
              🏥 Donors in <strong>{district}</strong> will be notified first, followed by nearby donors within the search radius.
            </div>
          )}
        </div>

        {/* Patient Info */}
        <div className="card">
          <h3 style={{ fontSize: '0.9rem', fontWeight: 700, marginBottom: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
            <User size={17} color="var(--color-hospital)" /> Patient Information
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div className="form-group">
              <label className="form-label">Patient Name</label>
              <input className="form-input" placeholder="e.g. Mr. Arjun Verma"
                value={form.patientName} onChange={e => set('patientName', e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Reason for Blood Requirement</label>
              <select className="form-select" value={form.reason} onChange={e => set('reason', e.target.value)}>
                <option value="">Select reason...</option>
                {REASONS.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Additional Notes (optional)</label>
              <textarea className="form-textarea" placeholder="Any specific requirements or medical notes..."
                value={form.notes} onChange={e => set('notes', e.target.value)} style={{ minHeight: 80 }} />
            </div>
          </div>
        </div>

        {/* Consent + Submit */}
        <div className="card">
          <label style={{ display: 'flex', gap: 10, cursor: 'pointer', marginBottom: 16 }}>
            <input type="checkbox" checked={form.consentChecked} onChange={e => set('consentChecked', e.target.checked)}
              style={{ accentColor: 'var(--color-hospital)', marginTop: 2 }} />
            <span style={{ fontSize: '0.84rem', color: 'var(--color-text-2)' }}>
              I confirm that this is a genuine medical emergency and the information provided is accurate.
              I understand that false requests may result in account suspension.
            </span>
          </label>
          <button className="btn btn-primary btn-lg w-full"
            style={{ '--accent': 'var(--color-hospital)', '--accent-glow': 'var(--color-hospital-glow)' }}
            disabled={!isValid || !form.consentChecked}
            onClick={handleSubmit}>
            <Send size={16} /> Submit Emergency Request
          </button>
          {!isValid && <p style={{ fontSize: '0.75rem', color: 'var(--color-muted)', textAlign: 'center', marginTop: 8 }}>Please fill in all required fields above</p>}
        </div>
      </div>
    </div>
  );
}
