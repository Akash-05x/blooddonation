import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Heart, Droplets, Check, ArrowRight, ArrowLeft,
  User, Mail, Phone, Lock, Building2, MapPin,
  ShieldCheck, Stethoscope, FileText, Eye, EyeOff,
  Clock, Activity, AlertCircle
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import './auth.css';

/* ── Blood group helpers ─────────────────────────────── */
const BLOOD_GROUPS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];
const BLOOD_GROUP_MAP = {
  'A+': 'A_POS', 'A-': 'A_NEG', 'B+': 'B_POS', 'B-': 'B_NEG',
  'O+': 'O_POS', 'O-': 'O_NEG', 'AB+': 'AB_POS', 'AB-': 'AB_NEG',
};

/* ── Step labels ─────────────────────────────────────── */
const DONOR_STEPS = ['Role', 'Account', 'Personal', 'Health', 'Location', 'Identity'];
const HOSPITAL_STEPS = ['Role', 'Account', 'Hospital Info', 'Type Details', 'Authorised'];

export default function Register() {
  const [step, setStep] = useState(0);
  const [role, setRole] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [locLoading, setLocLoading] = useState(false);
  const [locError, setLocError] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [pendingApproval, setPendingApproval] = useState(false);
  const { register } = useAuth();
  const navigate = useNavigate();

  const [form, setForm] = useState({
    // ── Shared ────────────────────────────────────────
    email: '', phone: '', password: '', confirm: '',

    // ── Donor Personal ────────────────────────────────
    fullName: '', gender: 'Male', dob: '', age: '',
    bodyWeight: '',

    // ── Donor Blood & Medical ─────────────────────────
    bloodGroup: '', majorIllness: '',
    takingMedicationDate: '', lastDonationDate: '',
    recentSurgeryDate: '', isPregnant: 'No',

    // ── Donor Location ────────────────────────────────
    district: '', address: '',
    donorLat: '', donorLng: '',

    // ── Donor Availability ────────────────────────────
    availableTime: 'Any', willingToTravel: 'Yes',

    // ── Donor Identity ────────────────────────────────
    idProofType: 'Aadhaar', idProofNo: '', consent: false,

    // ── Hospital Basic ────────────────────────────────
    hospitalName: '', hospitalDistrict: '', hospitalAddress: '',
    telephone: '', officialEmail: '',
    hospitalType: 'Govt',
    hospitalLat: '', hospitalLng: '',

    // ── Hospital — Govt ───────────────────────────────
    controllingDept: 'DMRHS', hospitalCategory: 'PHC',

    // ── Hospital — Private ────────────────────────────
    clinicalRegNo: '', issueDate: '', expiryDate: '',
    issuingAuthority: '',

    // ── Hospital — Optional ───────────────────────────
    nabhAccreditation: '', abdmFacilityId: '',

    // ── Hospital Authorised Person ────────────────────
    authorizedPersonName: '', authorizedDesignation: '', authorizedEmail: '',
  });

  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));

  /* ── GPS detection ─────────────────────────────────── */
  const fetchLocation = (latKey, lngKey) => {
    if (!navigator.geolocation) { setLocError('Geolocation not supported.'); return; }
    setLocLoading(true); setLocError('');
    navigator.geolocation.getCurrentPosition(
      pos => {
        set(latKey, pos.coords.latitude.toString());
        set(lngKey, pos.coords.longitude.toString());
        setLocLoading(false);
      },
      () => { setLocError('Could not get location. Enter coordinates manually.'); setLocLoading(false); }
    );
  };

  const STEPS = role === 'hospital' ? HOSPITAL_STEPS : (role === 'donor' ? DONOR_STEPS : ['Role']);
  const maxStep = STEPS.length - 1;

  const handleNext = () => {
    if (step === 0 && !role) return;
    setError('');
    if (step < maxStep) setStep(p => p + 1);
  };

  const handleSubmit = async () => {
    if (role === 'donor' && !form.consent) {
      setError('Please accept the consent & declaration before registering.');
      return;
    }
    if (form.password !== form.confirm) {
      setError('Passwords do not match.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      let payload = {
        name: form.fullName || form.hospitalName,
        email: form.email || undefined,
        phone: form.phone || undefined,
        password: form.password,
        role,
      };

      if (role === 'donor') {
        payload = {
          ...payload,
          name: form.fullName,
          gender: form.gender,
          dob: form.dob || undefined,
          age: parseInt(form.age) || 18,
          body_weight: form.bodyWeight ? parseFloat(form.bodyWeight) : undefined,
          blood_group: BLOOD_GROUP_MAP[form.bloodGroup] || 'O_POS',
          major_illness: form.majorIllness || undefined,
          taking_medication_date: form.takingMedicationDate || undefined,
          last_donation_date: form.lastDonationDate || undefined,
          recent_surgery_date: form.recentSurgeryDate || undefined,
          is_pregnant: form.isPregnant === 'Yes',
          district: form.district || undefined,
          address: form.address || undefined,
          latitude: form.donorLat ? parseFloat(form.donorLat) : undefined,
          longitude: form.donorLng ? parseFloat(form.donorLng) : undefined,
          available_time: form.availableTime,
          willing_to_travel: form.willingToTravel === 'Yes',
          id_proof_type: form.idProofType || undefined,
          id_proof_no: form.idProofNo || undefined,
          consent_declaration: form.consent,
        };
      } else if (role === 'hospital') {
        payload = {
          ...payload,
          name: form.hospitalName,
          hospital_name: form.hospitalName,
          hospital_district: form.hospitalDistrict,
          hospital_address: form.hospitalAddress,
          telephone: form.telephone,
          official_email: form.officialEmail,
          hospital_latitude: form.hospitalLat ? parseFloat(form.hospitalLat) : undefined,
          hospital_longitude: form.hospitalLng ? parseFloat(form.hospitalLng) : undefined,
          hospital_type: form.hospitalType,
          controlling_dept: form.hospitalType === 'Govt' ? form.controllingDept : undefined,
          hospital_category: form.hospitalType === 'Govt' ? form.hospitalCategory : undefined,
          clinical_reg_no: form.hospitalType === 'Private' ? form.clinicalRegNo : undefined,
          issue_date: form.hospitalType === 'Private' ? form.issueDate : undefined,
          expiry_date: form.hospitalType === 'Private' ? form.expiryDate : undefined,
          issuing_authority: form.hospitalType === 'Private' ? form.issuingAuthority : undefined,
          nabh_accreditation_no: form.nabhAccreditation || undefined,
          abdm_facility_id: form.abdmFacilityId || undefined,
          authorized_person_name: form.authorizedPersonName,
          authorized_designation: form.authorizedDesignation,
          authorized_email: form.authorizedEmail,
        };
      }

      const result = await register(payload);

      if (result?.requiresOTP) {
        navigate('/verify-otp', { state: { from: 'register', email: form.email, phone: form.phone } });
      } else if (result?.pendingApproval) {
        setPendingApproval(true);
      } else {
        navigate('/login');
      }
    } catch (err) {
      setError(err?.message || 'Registration failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  /* ── Pending approval screen ───────────────────────── */
  if (pendingApproval) {
    return (
      <div className="auth-page">
        <div className="auth-container" style={{ maxWidth: 500 }}>
          <div className="auth-logo">
            <div className="auth-logo-icon"><Heart size={28} fill="currentColor" /></div>
            <h1 className="auth-brand">BloodLink</h1>
          </div>
          <div className="auth-card" style={{ textAlign: 'center', padding: '40px 32px' }}>
            <div style={{
              width: 80, height: 80,
              background: 'linear-gradient(135deg, #1a3a5c, #2a5298)',
              borderRadius: '50%',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              margin: '0 auto 24px',
              boxShadow: '0 8px 24px rgba(26,58,92,0.25)',
            }}>
              <ShieldCheck size={36} color="white" />
            </div>
            <h2 style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--color-primary)', marginBottom: 12 }}>
              Registration Submitted!
            </h2>
            <p style={{ color: 'var(--color-muted)', marginBottom: 20, lineHeight: 1.7 }}>
              Your hospital registration is <strong style={{ color: 'var(--color-primary)' }}>pending admin approval</strong>.
              You will receive a notification once your registration is reviewed.
            </p>
            <div className="alert alert-info" style={{ textAlign: 'left', marginBottom: 24 }}>
              <AlertCircle size={16} style={{ flexShrink: 0 }} />
              <span>You will be able to log in only after the admin approves your hospital registration. This ensures patient safety and system integrity.</span>
            </div>
            <Link to="/login" className="btn btn-primary" style={{ display: 'inline-flex', width: '100%', justifyContent: 'center' }}>
              Return to Login
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-page">
      <div className="auth-container" style={{ maxWidth: step > 0 ? 560 : 480 }}>

        {/* Logo */}
        <div className="auth-logo">
          <div className="auth-logo-icon"><Heart size={28} fill="currentColor" /></div>
          <h1 className="auth-brand">BloodLink</h1>
          <p className="auth-tagline">Create your account</p>
        </div>

        <div className="auth-card">

          {/* Step indicator */}
          {role && (
            <div className="register-step-indicator">
              {STEPS.map((s, i) => (
                <div key={s} style={{ display: 'flex', alignItems: 'center', flex: i < STEPS.length - 1 ? 1 : 'initial' }}>
                  <div className={`step-dot ${i < step ? 'done' : i === step ? 'active' : ''}`}>
                    {i < step ? <Check size={14} /> : i + 1}
                  </div>
                  {i < STEPS.length - 1 && <div className={`step-line ${i < step ? 'done' : ''}`} />}
                </div>
              ))}
            </div>
          )}

          <h2 className="auth-title">{role ? STEPS[step] : 'Create Account'}</h2>

          {error && (
            <div className="alert alert-danger" style={{ marginBottom: 16 }}>
              <AlertCircle size={16} style={{ flexShrink: 0 }} />
              <span>{error}</span>
            </div>
          )}

          {/* ── Step 0: Role ─────────────────────────────── */}
          {step === 0 && (
            <div className="fade-in">
              <p className="auth-sub" style={{ marginBottom: 20 }}>I am registering as a...</p>
              <div className="role-cards">
                <div
                  className={`role-card ${role === 'hospital' ? 'selected' : ''}`}
                  style={{ '--role-color': 'var(--color-hospital)' }}
                  onClick={() => setRole('hospital')}
                >
                  <div className="role-icon"><Building2 size={22} /></div>
                  <p className="role-name">Hospital</p>
                  <p className="role-desc">Create blood requests</p>
                </div>
                <div
                  className={`role-card ${role === 'donor' ? 'selected' : ''}`}
                  style={{ '--role-color': 'var(--color-donor)' }}
                  onClick={() => setRole('donor')}
                >
                  <div className="role-icon"><Droplets size={22} /></div>
                  <p className="role-name">Donor</p>
                  <p className="role-desc">Donate blood & save lives</p>
                </div>
              </div>
            </div>
          )}

          {/* ── Step 1: Account ──────────────────────────── */}
          {step === 1 && (
            <div className="auth-form fade-in">
              <div className="form-group" style={{ marginBottom: 4 }}>
                <p className="auth-sub">Use email <strong>or</strong> phone number to register</p>
              </div>
              <div className="form-group">
                <label className="form-label">Email Address</label>
                <div className="input-icon-wrap">
                  {form.email === "" && <Mail size={15} className="input-icon" />}
                  <input type="email" className="form-input input-with-icon" placeholder="   your@email.com"
                    value={form.email} onChange={e => set('email', e.target.value)} />
                </div>
              </div>
              <div style={{ textAlign: 'center', color: 'var(--color-muted)', fontSize: '0.82rem' }}>— or —</div>
              <div className="form-group">
                <label className="form-label">Phone Number</label>
                <div className="input-icon-wrap">
                  {form.phone === "" && <Phone size={15} className="input-icon" />}
                  <input type="tel" className="form-input input-with-icon" placeholder="    +91 XXXXX XXXXX"
                    value={form.phone} onChange={e => set('phone', e.target.value)} />
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Password</label>
                <div className="input-icon-wrap">
                  {form.password === "" && <Lock size={15} className="input-icon" />}
                  <input type={showPw ? 'text' : 'password'} className="form-input input-with-icon input-with-icon-right"
                    placeholder="   Min. 8 characters"
                    value={form.password} onChange={e => set('password', e.target.value)} />
                  <button type="button" className="input-icon-right" onClick={() => setShowPw(p => !p)}>
                    {showPw ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Confirm Password</label>
                <div className="input-icon-wrap">
                  {form.confirm === "" && <Lock size={15} className="input-icon" />}
                  <input type="password" className="form-input input-with-icon" placeholder="   Re-enter password"
                    value={form.confirm} onChange={e => set('confirm', e.target.value)} />
                </div>
                {form.confirm && form.password !== form.confirm && (
                  <span className="form-error"><AlertCircle size={12} /> Passwords do not match</span>
                )}
              </div>
            </div>
          )}

          {/* ════════════════════════════════════════════════
              DONOR STEPS
          ════════════════════════════════════════════════ */}

          {/* Step 2 — Donor: Personal Details */}
          {step === 2 && role === 'donor' && (
            <div className="auth-form fade-in">
              <div className="section-divider">
                <div className="section-divider-line" />
                <span className="section-divider-label"><User size={13} /> Personal Details</span>
                <div className="section-divider-line" />
              </div>
              <div className="form-group">
                <label className="form-label">Full Name</label>
                <div className="input-icon-wrap">
                  {form.fullName === "" && <User size={15} className="input-icon" />}
                  <input className="form-input input-with-icon" placeholder="   Your full name"
                    value={form.fullName} onChange={e => set('fullName', e.target.value)} />
                </div>
              </div>
              <div className="grid-2">
                <div className="form-group">
                  <label className="form-label">Gender</label>
                  <select className="form-input" value={form.gender} onChange={e => set('gender', e.target.value)}>
                    <option>Male</option>
                    <option>Female</option>
                    <option>Other</option>
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Body Weight (kg)</label>
                  <input type="number" className="form-input" placeholder="   e.g. 65"
                    value={form.bodyWeight} onChange={e => set('bodyWeight', e.target.value)} />
                </div>
              </div>
              <div className="grid-2">
                <div className="form-group">
                  <label className="form-label">Date of Birth</label>
                  <input type="date" className="form-input" value={form.dob} onChange={e => set('dob', e.target.value)} />
                </div>
                <div className="form-group">
                  <label className="form-label">Age</label>
                  <input type="number" className="form-input" placeholder="   e.g. 25"
                    value={form.age} onChange={e => set('age', e.target.value)} />
                </div>
              </div>
              <div className="section-divider">
                <div className="section-divider-line" />
                <span className="section-divider-label"><Droplets size={13} /> Blood & Medical</span>
                <div className="section-divider-line" />
              </div>
              <div className="form-group">
                <label className="form-label">Blood Group</label>
                <select className="form-input" value={form.bloodGroup} onChange={e => set('bloodGroup', e.target.value)}>
                  <option value="">Select Blood Group</option>
                  {BLOOD_GROUPS.map(bg => <option key={bg}>{bg}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Mobile Number</label>
                <div className="input-icon-wrap">
                  <Phone size={15} className="input-icon" />
                  <input type="tel" className="form-input input-with-icon" placeholder="   +91 XXXXX XXXXX"
                    value={form.phone} onChange={e => set('phone', e.target.value)} />
                </div>
                <span style={{ fontSize: '0.78rem', color: 'var(--color-muted)' }}>If not entered in account step</span>
              </div>
            </div>
          )}

          {/* Step 3 — Donor: Health Eligibility */}
          {step === 3 && role === 'donor' && (
            <div className="auth-form fade-in">
              <div className="section-divider">
                <div className="section-divider-line" />
                <span className="section-divider-label"><Stethoscope size={13} /> Health Eligibility</span>
                <div className="section-divider-line" />
              </div>
              <div className="form-group">
                <label className="form-label">Any Major Illness (Diabetes, BP, etc.)</label>
                <input className="form-input" placeholder="Describe any major illness or 'None'"
                  value={form.majorIllness} onChange={e => set('majorIllness', e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label">Currently Taking Medication (Date started)</label>
                <input type="date" className="form-input"
                  value={form.takingMedicationDate} onChange={e => set('takingMedicationDate', e.target.value)} />
              </div>
              <div className="grid-2">
                <div className="form-group">
                  <label className="form-label">Last Blood Donation Date</label>
                  <input type="date" className="form-input"
                    value={form.lastDonationDate} onChange={e => set('lastDonationDate', e.target.value)} />
                </div>
                <div className="form-group">
                  <label className="form-label">Recent Surgery Date</label>
                  <input type="date" className="form-input"
                    value={form.recentSurgeryDate} onChange={e => set('recentSurgeryDate', e.target.value)} />
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Pregnant / Recent Delivery (Females)</label>
                <select className="form-input" value={form.isPregnant} onChange={e => set('isPregnant', e.target.value)}>
                  <option>No</option>
                  <option>Yes</option>
                </select>
              </div>
            </div>
          )}

          {/* Step 4 — Donor: Location & Availability */}
          {step === 4 && role === 'donor' && (
            <div className="auth-form fade-in">
              <div className="section-divider">
                <div className="section-divider-line" />
                <span className="section-divider-label"><MapPin size={13} /> Location Details</span>
                <div className="section-divider-line" />
              </div>
              <div className="form-group">
                <label className="form-label">District</label>
                <input className="form-input" placeholder="e.g. Chennai"
                  value={form.district} onChange={e => set('district', e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label">Address</label>
                <textarea className="form-input" placeholder="Street address..." style={{ minHeight: 70 }}
                  value={form.address} onChange={e => set('address', e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label">GPS Location</label>
                <button type="button" className="btn btn-secondary" style={{ marginBottom: 8 }}
                  onClick={() => fetchLocation('donorLat', 'donorLng')} disabled={locLoading}>
                  <MapPin size={15} />
                  {locLoading ? 'Detecting...' : form.donorLat ? '✓ Location Detected' : 'Detect My Location'}
                </button>
                {locError && <span className="form-error"><AlertCircle size={12} />{locError}</span>}
                <div className="grid-2">
                  <input className="form-input" placeholder="Latitude"
                    value={form.donorLat} onChange={e => set('donorLat', e.target.value)} />
                  <input className="form-input" placeholder="Longitude"
                    value={form.donorLng} onChange={e => set('donorLng', e.target.value)} />
                </div>
              </div>
              <div className="section-divider">
                <div className="section-divider-line" />
                <span className="section-divider-label"><Clock size={13} /> Availability</span>
                <div className="section-divider-line" />
              </div>
              <div className="grid-2">
                <div className="form-group">
                  <label className="form-label">Available Time</label>
                  <select className="form-input" value={form.availableTime} onChange={e => set('availableTime', e.target.value)}>
                    <option>Any</option>
                    <option>Day</option>
                    <option>Night</option>
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Willing to Travel</label>
                  <select className="form-input" value={form.willingToTravel} onChange={e => set('willingToTravel', e.target.value)}>
                    <option>Yes</option>
                    <option>No</option>
                  </select>
                </div>
              </div>
            </div>
          )}

          {/* Step 5 — Donor: Identity & Consent */}
          {step === 5 && role === 'donor' && (
            <div className="auth-form fade-in">
              <div className="section-divider">
                <div className="section-divider-line" />
                <span className="section-divider-label"><ShieldCheck size={13} /> Identity & Safety</span>
                <div className="section-divider-line" />
              </div>
              <div className="grid-2">
                <div className="form-group">
                  <label className="form-label">ID Proof Type</label>
                  <select className="form-input" value={form.idProofType} onChange={e => set('idProofType', e.target.value)}>
                    <option>Aadhaar</option>
                    <option>PAN Card</option>
                    <option>Voter ID</option>
                    <option>Driving License</option>
                    <option>Passport</option>
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">ID Proof Number</label>
                  <input className="form-input" placeholder="Enter ID number"
                    value={form.idProofNo} onChange={e => set('idProofNo', e.target.value)} />
                </div>
              </div>
              <div className="section-divider">
                <div className="section-divider-line" />
                <span className="section-divider-label"><FileText size={13} /> Consent & Declaration</span>
                <div className="section-divider-line" />
              </div>
              <label className="consent-wrap">
                <input type="checkbox" checked={form.consent} onChange={e => set('consent', e.target.checked)} />
                <span className="consent-text">
                  I declare that the information provided is accurate and complete. I freely consent to donate blood
                  and understand that my personal data will be used solely for emergency blood request matching and
                  will be kept confidential. I am medically eligible to donate blood to the best of my knowledge.
                </span>
              </label>
            </div>
          )}

          {/* ════════════════════════════════════════════════
              HOSPITAL STEPS
          ════════════════════════════════════════════════ */}

          {/* Step 2 — Hospital: Basic Info */}
          {step === 2 && role === 'hospital' && (
            <div className="auth-form fade-in">
              <div className="form-group">
                <label className="form-label">Hospital Name</label>
                <div className="input-icon-wrap">
                  {form.hospitalName === "" && <Building2 size={15} className="input-icon" />}
                  <input className="form-input input-with-icon" placeholder="   e.g. City General Hospital"
                    value={form.hospitalName} onChange={e => set('hospitalName', e.target.value)} />
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">District</label>
                <input className="form-input" placeholder="e.g. Chennai"
                  value={form.hospitalDistrict} onChange={e => set('hospitalDistrict', e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label">Address</label>
                <textarea className="form-input" placeholder="Full hospital address..." style={{ minHeight: 70 }}
                  value={form.hospitalAddress} onChange={e => set('hospitalAddress', e.target.value)} />
              </div>
              <div className="grid-2">
                <div className="form-group">
                  <label className="form-label">Telephone No.</label>
                  <div className="input-icon-wrap">
                    {form.telephone === "" && <Phone size={15} className="input-icon" />}
                    <input type="tel" className="form-input input-with-icon" placeholder="   044-XXXXXXXX"
                      value={form.telephone} onChange={e => set('telephone', e.target.value)} />
                  </div>
                </div>
                <div className="form-group">
                  <label className="form-label">Official Email ID</label>
                  <div className="input-icon-wrap">
                    {form.officialEmail === "" && <Mail size={15} className="input-icon" />}
                    <input type="email" className="form-input input-with-icon" placeholder="   official@hospital.in"
                      value={form.officialEmail} onChange={e => set('officialEmail', e.target.value)} />
                  </div>
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Hospital Type</label>
                <select className="form-input" value={form.hospitalType} onChange={e => set('hospitalType', e.target.value)}>
                  <option value="Govt">Govt</option>
                  <option value="Private">Private</option>
                  <option value="Clinic">Clinic</option>
                  <option value="Diagnostic">Diagnostic Centre</option>
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">GPS Location (Latitude & Longitude)</label>
                <button type="button" className="btn btn-secondary" style={{ marginBottom: 8 }}
                  onClick={() => fetchLocation('hospitalLat', 'hospitalLng')} disabled={locLoading}>
                  <MapPin size={15} />
                  {locLoading ? 'Detecting...' : form.hospitalLat ? '✓ Location Detected' : 'Detect My Location'}
                </button>
                {locError && <span className="form-error"><AlertCircle size={12} /> {locError}</span>}
                <div className="grid-2">
                  <input className="form-input" placeholder="Latitude (e.g. 13.0827)"
                    value={form.hospitalLat} onChange={e => set('hospitalLat', e.target.value)} />
                  <input className="form-input" placeholder="Longitude (e.g. 80.2707)"
                    value={form.hospitalLng} onChange={e => set('hospitalLng', e.target.value)} />
                </div>
              </div>
            </div>
          )}

          {/* Step 3 — Hospital: Type-Specific + Optional */}
          {step === 3 && role === 'hospital' && (
            <div className="auth-form fade-in">

              {/* GOVT fields */}
              {form.hospitalType === 'Govt' && (
                <div>
                  <div className="section-divider">
                    <div className="section-divider-line" />
                    <span className="section-divider-label" style={{ color: 'var(--color-primary)' }}>
                      <Activity size={13} /> Govt Hospital Details
                    </span>
                    <div className="section-divider-line" />
                  </div>
                  <div className="section-box section-box-govt">
                    <div className="form-group" style={{ marginBottom: 12 }}>
                      <label className="form-label">Controlling Department</label>
                      <select className="form-input" value={form.controllingDept} onChange={e => set('controllingDept', e.target.value)}>
                        <option value="DMRHS">DMRHS</option>
                        <option value="DME">DME</option>
                      </select>
                    </div>
                    <div className="form-group">
                      <label className="form-label">Hospital Category</label>
                      <select className="form-input" value={form.hospitalCategory} onChange={e => set('hospitalCategory', e.target.value)}>
                        <option value="PHC">PHC</option>
                        <option value="CHC">CHC</option>
                        <option value="District">District</option>
                        <option value="MedicalCollege">Medical College</option>
                      </select>
                    </div>
                  </div>
                </div>
              )}

              {/* PRIVATE fields */}
              {form.hospitalType === 'Private' && (
                <div>
                  <div className="section-divider">
                    <div className="section-divider-line" />
                    <span className="section-divider-label" style={{ color: 'var(--color-accent)' }}>
                      <FileText size={13} /> Clinical Establishment
                    </span>
                    <div className="section-divider-line" />
                  </div>
                  <div className="section-box section-box-private">
                    <div className="form-group" style={{ marginBottom: 12 }}>
                      <label className="form-label">Clinical Establishment Reg. No.</label>
                      <input className="form-input" placeholder="e.g. CE-TN-2024-XXXX"
                        value={form.clinicalRegNo} onChange={e => set('clinicalRegNo', e.target.value)} />
                    </div>
                    <div className="grid-2" style={{ marginBottom: 12 }}>
                      <div className="form-group">
                        <label className="form-label">Issue Date</label>
                        <input type="date" className="form-input" value={form.issueDate} onChange={e => set('issueDate', e.target.value)} />
                      </div>
                      <div className="form-group">
                        <label className="form-label">Expiry Date</label>
                        <input type="date" className="form-input" value={form.expiryDate} onChange={e => set('expiryDate', e.target.value)} />
                      </div>
                    </div>
                    <div className="form-group">
                      <label className="form-label">Issuing Authority (DMRHS)</label>
                      <input className="form-input" placeholder="e.g. DMRHS Tamil Nadu"
                        value={form.issuingAuthority} onChange={e => set('issuingAuthority', e.target.value)} />
                    </div>
                  </div>
                </div>
              )}

              {/* Optional national IDs */}
              <div className="section-divider">
                <div className="section-divider-line" />
                <span className="section-divider-label">Optional</span>
                <div className="section-divider-line" />
              </div>
              <div className="form-group">
                <label className="form-label">NABH Accreditation No. (optional)</label>
                <input className="form-input" placeholder="NABH accreditation number if any"
                  value={form.nabhAccreditation} onChange={e => set('nabhAccreditation', e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label">ABDM Health Facility ID (optional)</label>
                <input className="form-input" placeholder="ABDM facility identifier if any"
                  value={form.abdmFacilityId} onChange={e => set('abdmFacilityId', e.target.value)} />
              </div>
            </div>
          )}

          {/* Step 4 — Hospital: Authorised Person */}
          {step === 4 && role === 'hospital' && (
            <div className="auth-form fade-in">
              <div className="section-divider">
                <div className="section-divider-line" />
                <span className="section-divider-label"><User size={13} /> Authorized Person</span>
                <div className="section-divider-line" />
              </div>
              <div className="form-group">
                <label className="form-label">Authorized Person Name</label>
                <div className="input-icon-wrap">
                  {form.authorizedPersonName === "" && <User size={15} className="input-icon" />}
                  <input className="form-input input-with-icon" placeholder="   Full name of authorized person"
                    value={form.authorizedPersonName} onChange={e => set('authorizedPersonName', e.target.value)} />
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Authorized Designation</label>
                <input className="form-input" placeholder="e.g. Medical Superintendent, CEO"
                  value={form.authorizedDesignation} onChange={e => set('authorizedDesignation', e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label">Email ID</label>
                <div className="input-icon-wrap">
                  {form.authorizedEmail === "" && <Mail size={15} className="input-icon" />}
                  <input type="email" className="form-input input-with-icon" placeholder="   authorized@hospital.in"
                    value={form.authorizedEmail} onChange={e => set('authorizedEmail', e.target.value)} />
                </div>
              </div>
              <div className="alert alert-pending">
                <ShieldCheck size={16} style={{ flexShrink: 0 }} />
                <span>After submission, your hospital registration will be reviewed by the admin. You can log in only after approval.</span>
              </div>
            </div>
          )}

          {/* ── Navigation Buttons ─────────────────────── */}
          <div style={{ display: 'flex', gap: 12, marginTop: 24 }}>
            {step > 0 && (
              <button className="btn btn-ghost" style={{ minWidth: 100 }} onClick={() => setStep(p => p - 1)}>
                <ArrowLeft size={15} /> Back
              </button>
            )}
            {step < maxStep ? (
              <button className="btn btn-primary flex-1" onClick={handleNext} disabled={step === 0 && !role}>
                Next <ArrowRight size={15} />
              </button>
            ) : (
              step > 0 && (
                <button className="btn btn-primary flex-1" onClick={handleSubmit} disabled={loading}>
                  {loading
                    ? <span className="spinning" />
                    : role === 'hospital' ? 'Submit Registration' : 'Create Account'
                  }
                </button>
              )
            )}
          </div>

          <p className="auth-footer-text" style={{ marginTop: 20 }}>
            Already have an account? <Link to="/login" className="auth-link">Sign in</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
