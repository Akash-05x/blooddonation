import { useState } from 'react';
import { MOCK_CONFIG } from '../../data/mockData';
import { Save, RotateCcw, Info } from 'lucide-react';

function SliderField({ label, name, value, min, max, step = 1, unit, hint, onChange }) {
  return (
    <div className="form-group">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
        <label className="form-label">{label}</label>
        <span style={{ fontSize: '0.88rem', fontWeight: 700, color: 'var(--color-admin-light, #a78bfa)' }}>
          {value}{unit}
        </span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value}
        onChange={e => onChange(name, Number(e.target.value))}
        style={{ width: '100%', accentColor: 'var(--color-admin)' }} />
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 2 }}>
        <span style={{ fontSize: '0.7rem', color: 'var(--color-muted)' }}>{min}{unit}</span>
        <span style={{ fontSize: '0.7rem', color: 'var(--color-muted)' }}>{max}{unit}</span>
      </div>
      {hint && <p style={{ fontSize: '0.72rem', color: 'var(--color-muted)', marginTop: 4 }}>{hint}</p>}
    </div>
  );
}

function NumberField({ label, name, value, min, max, unit, hint, onChange }) {
  return (
    <div className="form-group">
      <label className="form-label">{label}</label>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <input type="number" className="form-input" min={min} max={max} value={value}
          onChange={e => onChange(name, Number(e.target.value))} style={{ flex: 1 }} />
        {unit && <span style={{ fontSize: '0.85rem', color: 'var(--color-muted)', whiteSpace: 'nowrap' }}>{unit}</span>}
      </div>
      {hint && <p style={{ fontSize: '0.72rem', color: 'var(--color-muted)', marginTop: 4 }}>{hint}</p>}
    </div>
  );
}

function SectionCard({ title, icon, children }) {
  return (
    <div className="card" style={{ '--accent': 'var(--color-admin)' }}>
      <h3 style={{ fontSize: '0.95rem', fontWeight: 700, marginBottom: 20, display: 'flex', alignItems: 'center', gap: 8, color: 'var(--color-text)' }}>
        <span style={{ fontSize: '1rem' }}>{icon}</span> {title}
      </h3>
      {children}
    </div>
  );
}

export default function SystemConfig() {
  const [config, setConfig]   = useState(MOCK_CONFIG);
  const [saved, setSaved]     = useState(false);

  const set = (k, v) => setConfig(p => ({ ...p, [k]: v }));

  const totalWeight = config.distanceWeight + config.responseWeight + config.reliabilityWeight + config.availabilityWeight;

  const handleSave = () => {
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

      {/* Donor Selection */}
      <SectionCard title="Donor Selection Radius & Limits" icon="📍">
        <div className="grid-2">
          <SliderField label="Max Donor Search Radius" name="donorRadius" value={config.donorRadius}
            min={5} max={50} unit=" km" hint="Donors beyond this radius won't be notified" onChange={set} />
          <NumberField label="Max Donors to Notify" name="maxDonorNotifications" value={config.maxDonorNotifications}
            min={1} max={50} unit="donors" hint="Top N ranked donors per request" onChange={set} />
        </div>
      </SectionCard>

      {/* Response Timeouts */}
      <SectionCard title="Response Timeout Settings" icon="⏱">
        <div className="grid-2">
          <NumberField label="Primary Donor Timeout" name="primaryResponseTimeout" value={config.primaryResponseTimeout}
            min={2} max={30} unit="minutes" hint="Auto-promote backup after this duration" onChange={set} />
          <NumberField label="Backup Donor Timeout" name="backupResponseTimeout" value={config.backupResponseTimeout}
            min={2} max={20} unit="minutes" hint="Cancel if backup also doesn't respond" onChange={set} />
        </div>
      </SectionCard>

      {/* AI Weights */}
      <SectionCard title="AI Donor Ranking Weights" icon="🤖">
        <div className="alert alert-info" style={{ marginBottom: 16 }}>
          <Info size={15} />
          <span>All weights must sum to 1.0. Current total: <strong style={{ color: Math.abs(totalWeight - 1) < 0.01 ? 'var(--color-success)' : 'var(--color-danger)' }}>{totalWeight.toFixed(2)}</strong></span>
        </div>
        <div className="grid-2">
          <SliderField label="Distance Weight" name="distanceWeight" value={config.distanceWeight}
            min={0.05} max={0.6} step={0.05} unit="" hint="How much proximity matters" onChange={set} />
          <SliderField label="Response Speed Weight" name="responseWeight" value={config.responseWeight}
            min={0.05} max={0.6} step={0.05} unit="" hint="Historical response time score" onChange={set} />
          <SliderField label="Reliability Weight" name="reliabilityWeight" value={config.reliabilityWeight}
            min={0.05} max={0.6} step={0.05} unit="" hint="Past success rate influence" onChange={set} />
          <SliderField label="Availability Weight" name="availabilityWeight" value={config.availabilityWeight}
            min={0.05} max={0.3} step={0.05} unit="" hint="Current availability bonus" onChange={set} />
        </div>
        <div style={{ marginTop: 12, padding: '12px 14px', background: 'var(--color-bg-3)', borderRadius: 10, fontFamily: 'var(--font-mono)', fontSize: '0.78rem', color: 'var(--color-text-2)' }}>
          score = ({config.distanceWeight} × dist) + ({config.responseWeight} × resp) + ({config.reliabilityWeight} × reliability) + ({config.availabilityWeight} × avail)
        </div>
      </SectionCard>

      {/* OTP Settings */}
      <SectionCard title="OTP & Security Configuration" icon="🔐">
        <div className="grid-3">
          <NumberField label="OTP Expiry" name="otpExpiryMinutes" value={config.otpExpiryMinutes}
            min={5} max={30} unit="minutes" onChange={set} />
          <NumberField label="Max OTP Attempts" name="otpMaxAttempts" value={config.otpMaxAttempts}
            min={3} max={10} unit="tries" onChange={set} />
          <NumberField label="Block Duration" name="otpBlockDurationMinutes" value={config.otpBlockDurationMinutes}
            min={15} max={120} unit="minutes" onChange={set} />
        </div>
      </SectionCard>

      {/* Donation Rules */}
      <SectionCard title="Donation Rules" icon="💉">
        <div style={{ maxWidth: 320 }}>
          <NumberField label="Min Donation Interval" name="minDonationIntervalDays" value={config.minDonationIntervalDays}
            min={56} max={180} unit="days" hint="Minimum days between donations (WHO recommends 90 days)" onChange={set} />
        </div>
      </SectionCard>

      {/* Save */}
      <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
        <button className="btn btn-ghost" onClick={() => setConfig(MOCK_CONFIG)}>
          <RotateCcw size={15} /> Reset to Defaults
        </button>
        <button className="btn btn-primary" onClick={handleSave} style={{ '--accent': 'var(--color-admin)', '--accent-glow': 'var(--color-admin-glow)' }}>
          <Save size={15} /> {saved ? '✓ Saved!' : 'Save Configuration'}
        </button>
      </div>
    </div>
  );
}
