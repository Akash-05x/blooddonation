import { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { donorAPI } from '../../utils/api';
import { BLOOD_GROUPS } from '../../data/mockData';
import { Save, User, MapPin, Heart, AlertCircle } from 'lucide-react';

const CONDITIONS = ['None','Diabetes','Hypertension','Asthma','Heart Condition','Hepatitis B','Hepatitis C','HIV/AIDS'];

export default function DonorProfile() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saved, setSaved] = useState(false);
  
  const [form, setForm] = useState({
    name:        '',
    email:       '',
    phone:       '',
    bloodGroup:  '',
    age:         '',
    weight:      '',
    city:        '',
    condition:   'None',
    lastDonation: '',
  });

  const mapToBackendBG = bg => bg?.replace('+', '_POS').replace('-', '_NEG');
  const mapToFrontendBG = bg => bg?.replace('_POS', '+').replace('_NEG', '-');

  useEffect(() => {
    fetchProfile();
  }, []);

  const fetchProfile = async () => {
    try {
      setLoading(true);
      const res = await donorAPI.getProfile();
      if (res.success && res.data) {
        const d = res.data;
        setForm({
          name:         d.user?.name || '',
          email:        d.user?.email || '',
          phone:        d.user?.phone || '',
          bloodGroup:   mapToFrontendBG(d.blood_group),
          age:          d.age || '',
          weight:       d.body_weight || '',
          city:         d.district || '',
          condition:    d.medical_notes || 'None',
          lastDonation: d.last_donation_date ? d.last_donation_date.split('T')[0] : '',
        });
      }
    } catch (err) {
      console.error('Failed to fetch profile', err);
    } finally {
      setLoading(false);
    }
  };

  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));

  const daysSinceLastDonation = form.lastDonation ? Math.floor((Date.now() - new Date(form.lastDonation)) / (1000 * 60 * 60 * 24)) : 999;
  // TEMPORARILY DISABLED FOR TESTING: 90-day interval not enforced
  const canDonate = true; // daysSinceLastDonation >= 90;

  const handleSave = async () => {
    try {
      const payload = {
        name:          form.name,
        phone:         form.phone,
        blood_group:   mapToBackendBG(form.bloodGroup),
        age:           form.age,
        body_weight:   form.weight,
        district:      form.city,
        medical_notes: form.condition,
      };
      
      await donorAPI.updateProfile(payload);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (error) {
      console.error("Failed to update profile", error);
      alert("Failed to update profile: " + (error.message || 'Unknown error'));
    }
  };

  if (loading) {
     return <div style={{ padding: 40, textAlign: 'center' }}>Loading profile...</div>;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20, maxWidth: 720 }}>

      {/* Donation Eligibility Banner */}
      <div className={`alert ${canDonate ? 'alert-success' : 'alert-warning'}`}>
        {canDonate ? <Heart size={16} /> : <AlertCircle size={16} />}
        {canDonate
          ? `✅ You are eligible to donate.${form.lastDonation ? ` Last donation was ${daysSinceLastDonation} days ago.` : ' No recent donations recorded.'}`
          : `⏳ You can donate again in ${90 - daysSinceLastDonation} days (90-day interval required).`}
      </div>

      {/* Personal Info */}
      <div className="card">
        <h3 style={{ fontSize: '0.9rem', fontWeight: 700, marginBottom: 18, display: 'flex', alignItems: 'center', gap: 8 }}>
          <User size={16} color="var(--color-donor)" /> Personal Information
        </h3>
        <div className="grid-2" style={{ gap: 16 }}>
          <div className="form-group">
            <label className="form-label">Full Name</label>
            <input className="form-input" value={form.name} onChange={e => set('name', e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label">Email Address</label>
            <input type="email" className="form-input" value={form.email} onChange={e => set('email', e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label">Phone Number</label>
            <input className="form-input" value={form.phone} onChange={e => set('phone', e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label">City</label>
            <div style={{ position: 'relative' }}>
              <MapPin size={14} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--color-muted)', pointerEvents: 'none' }} />
              <input className="form-input" style={{ paddingLeft: 36 }} value={form.city} onChange={e => set('city', e.target.value)} />
            </div>
          </div>
        </div>
      </div>

      {/* Medical Info */}
      <div className="card">
        <h3 style={{ fontSize: '0.9rem', fontWeight: 700, marginBottom: 18, display: 'flex', alignItems: 'center', gap: 8 }}>
          <Heart size={16} color="var(--color-donor)" /> Medical Information
        </h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          {/* Blood Group */}
          <div className="form-group">
            <label className="form-label">Blood Group</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {BLOOD_GROUPS.map(bg => (
                <button key={bg} type="button"
                  className={`btn btn-sm ${form.bloodGroup === bg ? 'btn-primary' : 'btn-ghost'}`}
                  style={{ minWidth: 52, ...(form.bloodGroup === bg ? { '--accent': 'var(--color-donor)', '--accent-glow': 'rgba(220,38,38,0.25)' } : {}) }}
                  onClick={() => set('bloodGroup', bg)}>{bg}</button>
              ))}
            </div>
          </div>

          <div className="grid-3">
            <div className="form-group">
              <label className="form-label">Age (years)</label>
              <input type="number" className="form-input" min={18} max={65} value={form.age} onChange={e => set('age', Number(e.target.value))} />
            </div>
            <div className="form-group">
              <label className="form-label">Weight (kg)</label>
              <input type="number" className="form-input" min={45} value={form.weight} onChange={e => set('weight', Number(e.target.value))} />
              {form.weight > 0 && form.weight < 45 && <p className="text-danger text-xs" style={{ marginTop: 4 }}>Minimum weight is 45 kg</p>}
            </div>
            <div className="form-group">
              <label className="form-label">Last Donation</label>
              <input type="date" className="form-input" value={form.lastDonation} onChange={e => set('lastDonation', e.target.value)} />
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Medical Condition (if any)</label>
            <select className="form-select" value={form.condition} onChange={e => set('condition', e.target.value)}>
              {CONDITIONS.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            {form.condition !== 'None' && (
              <div className="alert alert-warning" style={{ marginTop: 8, fontSize: '0.8rem' }}>
                ⚠️ Donors with certain medical conditions may be temporarily ineligible. An admin will review your status.
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ID Verification */}
      <div className="card">
        <h3 style={{ fontSize: '0.9rem', fontWeight: 700, marginBottom: 14 }}>Identity Verification</h3>
        <div>
          <p style={{ fontSize: '0.84rem', color: 'var(--color-muted)', marginBottom: 12 }}>Upload a government-issued ID for verification (Aadhaar, PAN, Passport)</p>
          <div style={{ border: '2px dashed var(--color-border)', borderRadius: 12, padding: '24px', textAlign: 'center', cursor: 'pointer', transition: 'border-color 0.2s' }}
            onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--color-donor)'}
            onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--color-border)'}>
            <p style={{ fontSize: '2rem', marginBottom: 8 }}>📎</p>
            <p style={{ fontSize: '0.85rem', fontWeight: 600 }}>Drop file here or click to upload</p>
            <p style={{ fontSize: '0.72rem', color: 'var(--color-muted)', marginTop: 4 }}>PNG, JPG, PDF up to 5MB</p>
          </div>
          {user?.verified_status === 'approved' && (
             <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', background: 'rgba(34,197,94,0.08)', borderRadius: 8 }}>
                <span>✅</span>
                <p style={{ fontSize: '0.8rem' }}>Identity Verified by Admin</p>
             </div>
          )}
        </div>
      </div>

      {/* Save */}
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <button className="btn btn-primary btn-lg" onClick={handleSave}
          style={{ '--accent': 'var(--color-donor)', '--accent-glow': 'rgba(220,38,38,0.25)', minWidth: 180 }}>
          <Save size={15} /> {saved ? '✓ Saved!' : 'Save Changes'}
        </button>
      </div>
    </div>
  );
}
