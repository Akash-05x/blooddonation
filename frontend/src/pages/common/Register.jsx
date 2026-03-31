import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Heart, Droplets, Check, ArrowRight, ArrowLeft,
  User, Mail, Phone, Lock, Building2, MapPin,
  ShieldCheck, Stethoscope, FileText, Eye, EyeOff,
  Clock, Activity, AlertCircle, CheckCircle2
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import './auth.css';

/* ── Blood group helpers ─────────────────────────────────────── */
const BLOOD_GROUPS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];
const BLOOD_GROUP_MAP = {
  'A+': 'A_POS', 'A-': 'A_NEG', 'B+': 'B_POS', 'B-': 'B_NEG',
  'O+': 'O_POS', 'O-': 'O_NEG', 'AB+': 'AB_POS', 'AB-': 'AB_NEG',
};

/* ── Step labels ─────────────────────────────────────────────── */
const DONOR_STEPS    = ['Role', 'Account', 'Personal', 'Health', 'Location', 'Identity'];
const HOSPITAL_STEPS = ['Role', 'Account', 'Hospital Info', 'Type Details', 'Authorised'];

/* ── Mandatory fields per donor step ────────────────────────── */
const DONOR_REQUIRED = {
  1: {
    emailOrPhone: 'Email or Phone Number',
    password:     'Password',
    confirm:      'Confirm Password',
  },
  2: {
    fullName:    'Full Name',
    gender:      'Gender',
    dob:         'Date of Birth',
    age:         'Age',
    bodyWeight:  'Body Weight',
    bloodGroup:  'Blood Group',
  },
  3: {},
  4: {
    district: 'District',
    address:  'Address',
    donorLat: 'GPS Location (Latitude)',
    donorLng: 'GPS Location (Longitude)',
  },
  5: {
    idProofType: 'ID Proof Type',
    idProofNo:   'ID Proof Number',
    consent:     'Consent & Declaration',
  },
};

const HOSPITAL_REQUIRED = {
  1: {
    emailOrPhone: 'Email or Phone Number',
    password:     'Password',
    confirm:      'Confirm Password',
  },
  2: {
    hospitalName:     'Hospital Name',
    hospitalDistrict: 'District',
    hospitalAddress:  'Address',
    telephone:        'Telephone Number',
    officialEmail:    'Official Email ID',
    hospitalType:     'Hospital Type',
    hospitalLat:      'GPS Latitude',
    hospitalLng:      'GPS Longitude',
  },
  3: {},
  4: {
    authorizedPersonName:  'Authorized Person Name',
    authorizedDesignation: 'Authorized Designation',
    authorizedEmail:       'Authorized Email ID',
  },
};

export default function Register() {
  const [step, setStep]               = useState(0);
  const [role, setRole]               = useState('');
  const [showPw, setShowPw]           = useState(false);
  const [locLoading, setLocLoading]   = useState(false);
  const [locError, setLocError]       = useState('');
  const [loading, setLoading]         = useState(false);
  const [error, setError]             = useState('');
  const [fieldErrors, setFieldErrors] = useState({});
  const [pendingApproval, setPendingApproval] = useState(false);
  const { register } = useAuth();
  const navigate = useNavigate();

  const [form, setForm] = useState({
    email: '', phone: '', password: '', confirm: '',
    fullName: '', gender: 'Male', dob: '', age: '', bodyWeight: '',
    bloodGroup: '', hasMajorIllness: 'No', majorIllness: '',
    takingMedication: 'No', takingMedicationDate: '',
    lastDonationDate: '', recentSurgeryDate: '', isPregnant: 'No',
    district: '', address: '', donorLat: '', donorLng: '',
    availableTime: 'Any', willingToTravel: 'Yes',
    idProofType: 'Aadhaar', idProofNo: '', consent: false,
    hospitalName: '', hospitalDistrict: '', hospitalAddress: '',
    telephone: '', officialEmail: '', hospitalType: 'Govt',
    hospitalLat: '', hospitalLng: '',
    controllingDept: 'DMRHS', hospitalCategory: 'PHC',
    clinicalRegNo: '', issueDate: '', expiryDate: '', issuingAuthority: '',
    nabhAccreditation: '', abdmFacilityId: '',
    authorizedPersonName: '', authorizedDesignation: '', authorizedEmail: '',
  });

  const set = (k, v) => {
    setForm(p => ({ ...p, [k]: v }));
    if (fieldErrors[k]) {
      setFieldErrors(p => { const n = { ...p }; delete n[k]; return n; });
    }
  };

  /* ── Auto-calculate age from DOB ──────────────────────────── */
  const handleDobChange = (e) => {
    const dob = e.target.value;
    set('dob', dob);
    if (dob) {
      const today = new Date();
      const birth = new Date(dob);
      let age = today.getFullYear() - birth.getFullYear();
      const m = today.getMonth() - birth.getMonth();
      if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
      if (age >= 0) set('age', age.toString());
    }
  };

  /* ── GPS detection ────────────────────────────────────────── */
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

  const STEPS   = role === 'hospital' ? HOSPITAL_STEPS : (role === 'donor' ? DONOR_STEPS : ['Role']);
  const maxStep = STEPS.length - 1;

  const validateStep = (s) => {
    const errors = {};
    const required = role === 'hospital' ? HOSPITAL_REQUIRED[s] : DONOR_REQUIRED[s];
    if (!required) return errors;

    for (const [key, label] of Object.entries(required)) {
      if (key === 'emailOrPhone') {
        if (!form.email.trim() && !form.phone.trim()) errors.email = 'Email or Phone Number is required';
        continue;
      }
      if (key === 'consent') {
        if (!form.consent) errors.consent = 'You must accept the Consent & Declaration';
        continue;
      }
      const val = form[key];
      if (val === undefined || val === null || String(val).trim() === '') {
        errors[key] = `${label} is required`;
      }
    }
    if (s === 1 && form.password !== form.confirm && form.confirm) errors.confirm = 'Passwords do not match';
    if (s === 1 && form.password && form.password.length < 8) errors.password = 'Password must be at least 8 characters';
    if (s === 3 && role === 'hospital' && form.hospitalType === 'Private') {
      if (!form.clinicalRegNo.trim()) errors.clinicalRegNo = 'Clinical Registration No. is required';
      if (!form.issueDate)            errors.issueDate     = 'Issue Date is required';
      if (!form.expiryDate)           errors.expiryDate    = 'Expiry Date is required';
      if (!form.issuingAuthority.trim()) errors.issuingAuthority = 'Issuing Authority is required';
    }
    return errors;
  };

  const focusFirstError = (errors) => {
    const firstKey = Object.keys(errors)[0];
    if (!firstKey) return;
    setTimeout(() => {
      const el = document.querySelector(`[data-field="${firstKey}"]`);
      if (el) { el.scrollIntoView({ behavior: 'smooth', block: 'center' }); el.focus(); }
    }, 100);
  };

  const handleNext = () => {
    if (step === 0 && !role) return;
    setError('');
    const errors = validateStep(step);
    if (Object.keys(errors).length > 0) { setFieldErrors(errors); focusFirstError(errors); return; }
    setFieldErrors({});
    if (step < maxStep) setStep(p => p + 1);
  };

  const jumpToStep = (stepNum) => { setStep(stepNum); setFieldErrors({}); setError(''); };

  const handleSubmit = async () => {
    const errors = validateStep(step);
    if (Object.keys(errors).length > 0) { setFieldErrors(errors); focusFirstError(errors); return; }
    if (form.password !== form.confirm) { setError('Passwords do not match.'); return; }
    setLoading(true); setError('');
    try {
      let payload = {
        name: form.fullName || form.hospitalName,
        email: form.email || undefined,
        phone: form.phone || undefined,
        password: form.password, role,
      };
      if (role === 'donor') {
        payload = {
          ...payload,
          name: form.fullName, gender: form.gender,
          dob: form.dob || undefined,
          age: parseInt(form.age) || 18,
          body_weight: form.bodyWeight ? parseFloat(form.bodyWeight) : undefined,
          blood_group: BLOOD_GROUP_MAP[form.bloodGroup] || 'O_POS',
          major_illness: form.hasMajorIllness === 'Yes' ? form.majorIllness : undefined,
          taking_medication_date: form.takingMedication === 'Yes' ? form.takingMedicationDate : undefined,
          last_donation_date: form.lastDonationDate || undefined,
          recent_surgery_date: form.recentSurgeryDate || undefined,
          is_pregnant: form.isPregnant === 'Yes',
          district: form.district || undefined, address: form.address || undefined,
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
          name: form.hospitalName, hospital_name: form.hospitalName,
          hospital_district: form.hospitalDistrict, hospital_address: form.hospitalAddress,
          telephone: form.telephone, official_email: form.officialEmail,
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
      if (result && result.success === false) {
        const errMsg = result.error || 'Registration failed. Please try again.';
        setError(errMsg); setLoading(false);
        const lower = errMsg.toLowerCase();
        if (lower.includes('email') && lower.includes('already')) {
          jumpToStep(1);
          setTimeout(() => {
            setFieldErrors({ email: 'This email is already registered' });
            const el = document.querySelector('[data-field="email"]');
            if (el) { el.scrollIntoView({ behavior: 'smooth', block: 'center' }); el.focus(); }
          }, 150);
        } else if (lower.includes('phone') && lower.includes('already')) {
          jumpToStep(1);
          setTimeout(() => {
            setFieldErrors({ phone: 'This phone number is already registered' });
            const el = document.querySelector('[data-field="phone"]');
            if (el) { el.scrollIntoView({ behavior: 'smooth', block: 'center' }); el.focus(); }
          }, 150);
        }
        return;
      }
      if (result?.requiresOTP) {
        const otpEmail = form.email || form.officialEmail;
        navigate('/verify-otp', { state: { from: 'register', email: otpEmail, phone: form.phone, role } });
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

  const FieldError = ({ name }) =>
    fieldErrors[name]
      ? <span className="form-error" style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 4 }}>
          <AlertCircle size={12} />{fieldErrors[name]}
        </span>
      : null;

  const inputClass = (name) => `form-input${fieldErrors[name] ? ' input-error' : ''}`;

  if (pendingApproval) {
    return (
      <div className="auth-page">
        <div className="auth-container" style={{ maxWidth: 500 }}>
          <div className="auth-logo">
            <div className="auth-logo-icon"><Heart size={28} fill="currentColor" /></div>
            <h1 className="auth-brand">BloodLink</h1>
          </div>
          <div className="auth-card" style={{ textAlign: 'center', padding: '40px 32px' }}>
            <div style={{ width: 80, height: 80, background: 'linear-gradient(135deg, #1a3a5c, #2a5298)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 24px', boxShadow: '0 8px 24px rgba(26,58,92,0.25)' }}>
              <ShieldCheck size={36} color="white" />
            </div>
            <h2 style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--color-primary)', marginBottom: 12 }}>Registration Submitted!</h2>
            <p style={{ color: 'var(--color-muted)', marginBottom: 20, lineHeight: 1.7 }}>
              Your hospital registration is <strong style={{ color: 'var(--color-primary)' }}>pending admin approval</strong>.
            </p>
            <div className="alert alert-info" style={{ textAlign: 'left', marginBottom: 24 }}>
              <AlertCircle size={16} style={{ flexShrink: 0 }} />
              <span>You will be able to log in only after the admin approves your hospital registration.</span>
            </div>
            <Link to="/login" className="btn btn-primary" style={{ display: 'inline-flex', width: '100%', justifyContent: 'center' }}>Return to Login</Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-page">
      <div className="auth-container" style={{ maxWidth: step > 0 ? 560 : 480 }}>
        <div className="auth-logo">
          <div className="auth-logo-icon"><Heart size={28} fill="currentColor" /></div>
          <h1 className="auth-brand">BloodLink</h1>
          <p className="auth-tagline">Create your account</p>
        </div>

        <div className="auth-card">
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
              <AlertCircle size={16} style={{ flexShrink: 0 }} /><span>{error}</span>
            </div>
          )}

          {/* Step 0: Role */}
          {step === 0 && (
            <div className="fade-in">
              <p className="auth-sub" style={{ marginBottom: 20 }}>I am registering as a...</p>
              <div className="role-cards">
                <div className={`role-card ${role === 'hospital' ? 'selected' : ''}`} style={{ '--role-color': 'var(--color-hospital)' }} onClick={() => setRole('hospital')}>
                  <div className="role-icon"><Building2 size={22} /></div>
                  <p className="role-name">Hospital</p>
                  <p className="role-desc">Create blood requests</p>
                </div>
                <div className={`role-card ${role === 'donor' ? 'selected' : ''}`} style={{ '--role-color': 'var(--color-donor)' }} onClick={() => setRole('donor')}>
                  <div className="role-icon"><Droplets size={22} /></div>
                  <p className="role-name">Donor</p>
                  <p className="role-desc">Donate blood & save lives</p>
                </div>
              </div>
            </div>
          )}

          {/* Step 1: Account */}
          {step === 1 && (
            <div className="auth-form fade-in">
              <div className="form-group" style={{ marginBottom: 4 }}>
                <p className="auth-sub">Use email <strong>or</strong> phone number to register</p>
              </div>
              <div className="form-group">
                <label className="form-label">Email Address</label>
                <div className="input-icon-wrap">
                  {form.email === '' && <Mail size={15} className="input-icon" />}
                  <input data-field="email" type="email" className={`${inputClass('email')} input-with-icon`} placeholder="   your@email.com" value={form.email} onChange={e => set('email', e.target.value)} />
                </div>
                <FieldError name="email" />
              </div>
              <div style={{ textAlign: 'center', color: 'var(--color-muted)', fontSize: '0.82rem' }}>— or —</div>
              <div className="form-group">
                <label className="form-label">Phone Number</label>
                <div className="input-icon-wrap">
                  {form.phone === '' && <Phone size={15} className="input-icon" />}
                  <input data-field="phone" type="tel" className={`${inputClass('phone')} input-with-icon`} placeholder="   +91 XXXXX XXXXX" value={form.phone} onChange={e => set('phone', e.target.value)} />
                </div>
                <FieldError name="phone" />
              </div>
              <div className="form-group">
                <label className="form-label">Password <span style={{ color: 'red' }}>*</span></label>
                <div className="input-icon-wrap">
                  {form.password === '' && <Lock size={15} className="input-icon" />}
                  <input data-field="password" type={showPw ? 'text' : 'password'} className={`${inputClass('password')} input-with-icon input-with-icon-right`} placeholder="   Min. 8 characters" value={form.password} onChange={e => set('password', e.target.value)} />
                  <button type="button" className="input-icon-right" onClick={() => setShowPw(p => !p)}>
                    {showPw ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div>
                <FieldError name="password" />
              </div>
              <div className="form-group">
                <label className="form-label">Confirm Password <span style={{ color: 'red' }}>*</span></label>
                <div className="input-icon-wrap">
                  {form.confirm === '' && <Lock size={15} className="input-icon" />}
                  <input data-field="confirm" type="password" className={`${inputClass('confirm')} input-with-icon`} placeholder="   Re-enter password" value={form.confirm} onChange={e => set('confirm', e.target.value)} />
                </div>
                <FieldError name="confirm" />
                {!fieldErrors.confirm && form.confirm && form.password === form.confirm && (
                  <span style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 4, fontSize: '0.78rem', color: 'green' }}>
                    <CheckCircle2 size={12} /> Passwords match
                  </span>
                )}
              </div>
            </div>
          )}

          {/* Step 2 – Donor: Personal */}
          {step === 2 && role === 'donor' && (
            <div className="auth-form fade-in">
              <div className="section-divider">
                <div className="section-divider-line" />
                <span className="section-divider-label"><User size={13} /> Personal Details</span>
                <div className="section-divider-line" />
              </div>
              <div className="form-group">
                <label className="form-label">Full Name <span style={{ color: 'red' }}>*</span></label>
                <div className="input-icon-wrap">
                  {form.fullName === '' && <User size={15} className="input-icon" />}
                  <input data-field="fullName" className={`${inputClass('fullName')} input-with-icon`} placeholder="   Your full name" value={form.fullName} onChange={e => set('fullName', e.target.value)} />
                </div>
                <FieldError name="fullName" />
              </div>
              <div className="grid-2">
                <div className="form-group">
                  <label className="form-label">Gender <span style={{ color: 'red' }}>*</span></label>
                  <select data-field="gender" className={inputClass('gender')} value={form.gender} onChange={e => set('gender', e.target.value)}>
                    <option>Male</option><option>Female</option><option>Other</option>
                  </select>
                  <FieldError name="gender" />
                </div>
                <div className="form-group">
                  <label className="form-label">Body Weight (kg) <span style={{ color: 'red' }}>*</span></label>
                  <input data-field="bodyWeight" type="number" className={inputClass('bodyWeight')} placeholder="e.g. 65" value={form.bodyWeight} onChange={e => set('bodyWeight', e.target.value)} />
                  <FieldError name="bodyWeight" />
                </div>
              </div>
              <div className="grid-2">
                <div className="form-group">
                  <label className="form-label">Date of Birth <span style={{ color: 'red' }}>*</span></label>
                  <input
                    data-field="dob"
                    type="date"
                    className={inputClass('dob')}
                    value={form.dob}
                    onChange={handleDobChange}
                  />
                  <FieldError name="dob" />
                </div>
                <div className="form-group">
                  <label className="form-label">
                    Age <span style={{ color: 'red' }}>*</span>
                    {form.dob && (
                      <span style={{ fontSize: '0.7rem', color: 'var(--color-muted)', marginLeft: 6, fontWeight: 400 }}>
                        (auto-filled)
                      </span>
                    )}
                  </label>
                  <input data-field="age" type="number" className={inputClass('age')} placeholder="e.g. 25" value={form.age} onChange={e => set('age', e.target.value)} />
                  <FieldError name="age" />
                </div>
              </div>
              <div className="section-divider">
                <div className="section-divider-line" />
                <span className="section-divider-label"><Droplets size={13} /> Blood & Medical</span>
                <div className="section-divider-line" />
              </div>
              <div className="form-group">
                <label className="form-label">Blood Group <span style={{ color: 'red' }}>*</span></label>
                <select data-field="bloodGroup" className={inputClass('bloodGroup')} value={form.bloodGroup} onChange={e => set('bloodGroup', e.target.value)}>
                  <option value="">Select Blood Group</option>
                  {BLOOD_GROUPS.map(bg => <option key={bg}>{bg}</option>)}
                </select>
                <FieldError name="bloodGroup" />
              </div>
              <div className="form-group">
                <label className="form-label">Mobile Number</label>
                <div className="input-icon-wrap">
                  <Phone size={15} className="input-icon" />
                  <input data-field="phone" type="tel" className="form-input input-with-icon" placeholder="   +91 XXXXX XXXXX" value={form.phone} onChange={e => set('phone', e.target.value)} />
                </div>
                <span style={{ fontSize: '0.78rem', color: 'var(--color-muted)' }}>If not entered in account step</span>
              </div>
            </div>
          )}

          {/* Step 3 – Donor: Health */}
          {step === 3 && role === 'donor' && (
            <div className="auth-form fade-in">
              <div className="section-divider">
                <div className="section-divider-line" />
                <span className="section-divider-label"><Stethoscope size={13} /> Health Eligibility</span>
                <div className="section-divider-line" />
              </div>
              <div className="form-group">
                <label className="form-label">Do you have any Major Illness? (Diabetes, BP, etc.)</label>
                <div style={{ display: 'flex', gap: 12, marginTop: 6 }}>
                  {['No', 'Yes'].map(opt => (
                    <button key={opt} type="button" onClick={() => set('hasMajorIllness', opt)} style={{ flex: 1, padding: '10px 0', borderRadius: 8, border: `2px solid ${form.hasMajorIllness === opt ? (opt === 'Yes' ? '#e53e3e' : '#38a169') : '#e2e8f0'}`, background: form.hasMajorIllness === opt ? (opt === 'Yes' ? '#fff5f5' : '#f0fff4') : 'white', color: form.hasMajorIllness === opt ? (opt === 'Yes' ? '#e53e3e' : '#38a169') : 'var(--color-muted)', fontWeight: 600, cursor: 'pointer', transition: 'all 0.2s' }}>
                      {opt === 'Yes' ? '⚠️ Yes' : '✅ No'}
                    </button>
                  ))}
                </div>
              </div>
              {form.hasMajorIllness === 'Yes' && (
                <div className="form-group" style={{ animation: 'fadeIn 0.3s ease' }}>
                  <label className="form-label">Please describe your illness <span style={{ color: 'red' }}>*</span></label>
                  <input data-field="majorIllness" className={inputClass('majorIllness')} placeholder="e.g. Type 2 Diabetes, Hypertension" value={form.majorIllness} onChange={e => set('majorIllness', e.target.value)} />
                  <FieldError name="majorIllness" />
                </div>
              )}
              <div className="form-group">
                <label className="form-label">Currently Taking Medication?</label>
                <div style={{ display: 'flex', gap: 12, marginTop: 6 }}>
                  {['No', 'Yes'].map(opt => (
                    <button key={opt} type="button" onClick={() => set('takingMedication', opt)} style={{ flex: 1, padding: '10px 0', borderRadius: 8, border: `2px solid ${form.takingMedication === opt ? (opt === 'Yes' ? '#d69e2e' : '#38a169') : '#e2e8f0'}`, background: form.takingMedication === opt ? (opt === 'Yes' ? '#fffff0' : '#f0fff4') : 'white', color: form.takingMedication === opt ? (opt === 'Yes' ? '#d69e2e' : '#38a169') : 'var(--color-muted)', fontWeight: 600, cursor: 'pointer', transition: 'all 0.2s' }}>
                      {opt === 'Yes' ? '💊 Yes' : '✅ No'}
                    </button>
                  ))}
                </div>
              </div>
              {form.takingMedication === 'Yes' && (
                <div className="form-group" style={{ animation: 'fadeIn 0.3s ease' }}>
                  <label className="form-label">Medication Start Date</label>
                  <input type="date" className="form-input" value={form.takingMedicationDate} onChange={e => set('takingMedicationDate', e.target.value)} />
                </div>
              )}
              <div className="grid-2">
                <div className="form-group">
                  <label className="form-label">Last Blood Donation Date</label>
                  <input type="date" className="form-input" value={form.lastDonationDate} onChange={e => set('lastDonationDate', e.target.value)} />
                </div>
                <div className="form-group">
                  <label className="form-label">Recent Surgery Date</label>
                  <input type="date" className="form-input" value={form.recentSurgeryDate} onChange={e => set('recentSurgeryDate', e.target.value)} />
                </div>
              </div>
              {form.gender === 'Female' && (
                <div className="form-group">
                  <label className="form-label">Pregnant / Recent Delivery</label>
                  <select className="form-input" value={form.isPregnant} onChange={e => set('isPregnant', e.target.value)}>
                    <option>No</option><option>Yes</option>
                  </select>
                </div>
              )}
            </div>
          )}

          {/* Step 4 – Donor: Location */}
          {step === 4 && role === 'donor' && (
            <div className="auth-form fade-in">
              <div className="section-divider">
                <div className="section-divider-line" />
                <span className="section-divider-label"><MapPin size={13} /> Location Details</span>
                <div className="section-divider-line" />
              </div>
              <div className="form-group">
                <label className="form-label">District <span style={{ color: 'red' }}>*</span></label>
                <input data-field="district" className={inputClass('district')} placeholder="e.g. Chennai" value={form.district} onChange={e => set('district', e.target.value)} />
                <FieldError name="district" />
              </div>
              <div className="form-group">
                <label className="form-label">Address <span style={{ color: 'red' }}>*</span></label>
                <textarea data-field="address" className={inputClass('address')} placeholder="Street address..." style={{ minHeight: 70 }} value={form.address} onChange={e => set('address', e.target.value)} />
                <FieldError name="address" />
              </div>
              <div className="form-group">
                <label className="form-label">GPS Location <span style={{ color: 'red' }}>*</span></label>
                <button type="button" className="btn btn-secondary" style={{ marginBottom: 8 }} onClick={() => fetchLocation('donorLat', 'donorLng')} disabled={locLoading}>
                  <MapPin size={15} />
                  {locLoading ? 'Detecting...' : form.donorLat ? '✓ Location Detected' : 'Detect My Location'}
                </button>
                {locError && <span className="form-error"><AlertCircle size={12} />{locError}</span>}
                <div className="grid-2">
                  <div>
                    <input data-field="donorLat" className={inputClass('donorLat')} placeholder="Latitude" value={form.donorLat} onChange={e => set('donorLat', e.target.value)} />
                    <FieldError name="donorLat" />
                  </div>
                  <div>
                    <input data-field="donorLng" className={inputClass('donorLng')} placeholder="Longitude" value={form.donorLng} onChange={e => set('donorLng', e.target.value)} />
                    <FieldError name="donorLng" />
                  </div>
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
                    <option>Any</option><option>Day</option><option>Night</option>
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Willing to Travel</label>
                  <select className="form-input" value={form.willingToTravel} onChange={e => set('willingToTravel', e.target.value)}>
                    <option>Yes</option><option>No</option>
                  </select>
                </div>
              </div>
            </div>
          )}

          {/* Step 5 – Donor: Identity */}
          {step === 5 && role === 'donor' && (
            <div className="auth-form fade-in">
              <div className="section-divider">
                <div className="section-divider-line" />
                <span className="section-divider-label"><ShieldCheck size={13} /> Identity & Safety</span>
                <div className="section-divider-line" />
              </div>
              <div className="grid-2">
                <div className="form-group">
                  <label className="form-label">ID Proof Type <span style={{ color: 'red' }}>*</span></label>
                  <select data-field="idProofType" className={inputClass('idProofType')} value={form.idProofType} onChange={e => set('idProofType', e.target.value)}>
                    <option>Aadhaar</option><option>PAN Card</option><option>Voter ID</option><option>Driving License</option><option>Passport</option>
                  </select>
                  <FieldError name="idProofType" />
                </div>
                <div className="form-group">
                  <label className="form-label">ID Proof Number <span style={{ color: 'red' }}>*</span></label>
                  <input data-field="idProofNo" className={inputClass('idProofNo')} placeholder="Enter ID number" value={form.idProofNo} onChange={e => set('idProofNo', e.target.value)} />
                  <FieldError name="idProofNo" />
                </div>
              </div>
              <div className="section-divider">
                <div className="section-divider-line" />
                <span className="section-divider-label"><FileText size={13} /> Consent & Declaration</span>
                <div className="section-divider-line" />
              </div>
              <label data-field="consent" className="consent-wrap" style={{ border: fieldErrors.consent ? '1.5px solid #e53e3e' : undefined, borderRadius: 8, padding: fieldErrors.consent ? 8 : 0 }}>
                <input type="checkbox" checked={form.consent} onChange={e => set('consent', e.target.checked)} />
                <span className="consent-text">
                  I declare that the information provided is accurate and complete. I freely consent to donate blood
                  and understand that my personal data will be used solely for emergency blood request matching and
                  will be kept confidential. I am medically eligible to donate blood to the best of my knowledge.
                </span>
              </label>
              <FieldError name="consent" />
            </div>
          )}

          {/* Step 2 – Hospital: Basic Info */}
          {step === 2 && role === 'hospital' && (
            <div className="auth-form fade-in">
              <div className="form-group">
                <label className="form-label">Hospital Name <span style={{ color: 'red' }}>*</span></label>
                <div className="input-icon-wrap">
                  {form.hospitalName === '' && <Building2 size={15} className="input-icon" />}
                  <input data-field="hospitalName" className={`${inputClass('hospitalName')} input-with-icon`} placeholder="   e.g. City General Hospital" value={form.hospitalName} onChange={e => set('hospitalName', e.target.value)} />
                </div>
                <FieldError name="hospitalName" />
              </div>
              <div className="form-group">
                <label className="form-label">District <span style={{ color: 'red' }}>*</span></label>
                <input data-field="hospitalDistrict" className={inputClass('hospitalDistrict')} placeholder="e.g. Chennai" value={form.hospitalDistrict} onChange={e => set('hospitalDistrict', e.target.value)} />
                <FieldError name="hospitalDistrict" />
              </div>
              <div className="form-group">
                <label className="form-label">Address <span style={{ color: 'red' }}>*</span></label>
                <textarea data-field="hospitalAddress" className={inputClass('hospitalAddress')} placeholder="Full hospital address..." style={{ minHeight: 70 }} value={form.hospitalAddress} onChange={e => set('hospitalAddress', e.target.value)} />
                <FieldError name="hospitalAddress" />
              </div>
              <div className="grid-2">
                <div className="form-group">
                  <label className="form-label">Telephone No. <span style={{ color: 'red' }}>*</span></label>
                  <div className="input-icon-wrap">
                    {form.telephone === '' && <Phone size={15} className="input-icon" />}
                    <input data-field="telephone" type="tel" className={`${inputClass('telephone')} input-with-icon`} placeholder="   044-XXXXXXXX" value={form.telephone} onChange={e => set('telephone', e.target.value)} />
                  </div>
                  <FieldError name="telephone" />
                </div>
                <div className="form-group">
                  <label className="form-label">Official Email ID <span style={{ color: 'red' }}>*</span></label>
                  <div className="input-icon-wrap">
                    {form.officialEmail === '' && <Mail size={15} className="input-icon" />}
                    <input data-field="officialEmail" type="email" className={`${inputClass('officialEmail')} input-with-icon`} placeholder="   official@hospital.in" value={form.officialEmail} onChange={e => set('officialEmail', e.target.value)} />
                  </div>
                  <FieldError name="officialEmail" />
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Hospital Type <span style={{ color: 'red' }}>*</span></label>
                <select className="form-input" value={form.hospitalType} onChange={e => set('hospitalType', e.target.value)}>
                  <option value="Govt">Govt</option><option value="Private">Private</option><option value="Clinic">Clinic</option><option value="Diagnostic">Diagnostic Centre</option>
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">GPS Location <span style={{ color: 'red' }}>*</span></label>
                <button type="button" className="btn btn-secondary" style={{ marginBottom: 8 }} onClick={() => fetchLocation('hospitalLat', 'hospitalLng')} disabled={locLoading}>
                  <MapPin size={15} />
                  {locLoading ? 'Detecting...' : form.hospitalLat ? '✓ Location Detected' : 'Detect My Location'}
                </button>
                {locError && <span className="form-error"><AlertCircle size={12} /> {locError}</span>}
                <div className="grid-2">
                  <div>
                    <input data-field="hospitalLat" className={inputClass('hospitalLat')} placeholder="Latitude (e.g. 13.0827)" value={form.hospitalLat} onChange={e => set('hospitalLat', e.target.value)} />
                    <FieldError name="hospitalLat" />
                  </div>
                  <div>
                    <input data-field="hospitalLng" className={inputClass('hospitalLng')} placeholder="Longitude (e.g. 80.2707)" value={form.hospitalLng} onChange={e => set('hospitalLng', e.target.value)} />
                    <FieldError name="hospitalLng" />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Step 3 – Hospital: Type Details */}
          {step === 3 && role === 'hospital' && (
            <div className="auth-form fade-in">
              {form.hospitalType === 'Govt' && (
                <div>
                  <div className="section-divider">
                    <div className="section-divider-line" />
                    <span className="section-divider-label" style={{ color: 'var(--color-primary)' }}><Activity size={13} /> Govt Hospital Details</span>
                    <div className="section-divider-line" />
                  </div>
                  <div className="section-box section-box-govt">
                    <div className="form-group" style={{ marginBottom: 12 }}>
                      <label className="form-label">Controlling Department</label>
                      <select className="form-input" value={form.controllingDept} onChange={e => set('controllingDept', e.target.value)}>
                        <option value="DMRHS">DMRHS</option><option value="DME">DME</option>
                      </select>
                    </div>
                    <div className="form-group">
                      <label className="form-label">Hospital Category</label>
                      <select className="form-input" value={form.hospitalCategory} onChange={e => set('hospitalCategory', e.target.value)}>
                        <option value="PHC">PHC</option><option value="CHC">CHC</option><option value="District">District</option><option value="MedicalCollege">Medical College</option>
                      </select>
                    </div>
                  </div>
                </div>
              )}
              {form.hospitalType === 'Private' && (
                <div>
                  <div className="section-divider">
                    <div className="section-divider-line" />
                    <span className="section-divider-label" style={{ color: 'var(--color-accent)' }}><FileText size={13} /> Clinical Establishment</span>
                    <div className="section-divider-line" />
                  </div>
                  <div className="section-box section-box-private">
                    <div className="form-group" style={{ marginBottom: 12 }}>
                      <label className="form-label">Clinical Establishment Reg. No. <span style={{ color: 'red' }}>*</span></label>
                      <input data-field="clinicalRegNo" className={inputClass('clinicalRegNo')} placeholder="e.g. CE-TN-2024-XXXX" value={form.clinicalRegNo} onChange={e => set('clinicalRegNo', e.target.value)} />
                      <FieldError name="clinicalRegNo" />
                    </div>
                    <div className="grid-2" style={{ marginBottom: 12 }}>
                      <div className="form-group">
                        <label className="form-label">Issue Date <span style={{ color: 'red' }}>*</span></label>
                        <input data-field="issueDate" type="date" className={inputClass('issueDate')} value={form.issueDate} onChange={e => set('issueDate', e.target.value)} />
                        <FieldError name="issueDate" />
                      </div>
                      <div className="form-group">
                        <label className="form-label">Expiry Date <span style={{ color: 'red' }}>*</span></label>
                        <input data-field="expiryDate" type="date" className={inputClass('expiryDate')} value={form.expiryDate} onChange={e => set('expiryDate', e.target.value)} />
                        <FieldError name="expiryDate" />
                      </div>
                    </div>
                    <div className="form-group">
                      <label className="form-label">Issuing Authority (DMRHS) <span style={{ color: 'red' }}>*</span></label>
                      <input data-field="issuingAuthority" className={inputClass('issuingAuthority')} placeholder="e.g. DMRHS Tamil Nadu" value={form.issuingAuthority} onChange={e => set('issuingAuthority', e.target.value)} />
                      <FieldError name="issuingAuthority" />
                    </div>
                  </div>
                </div>
              )}
              <div className="section-divider">
                <div className="section-divider-line" />
                <span className="section-divider-label">Optional</span>
                <div className="section-divider-line" />
              </div>
              <div className="form-group">
                <label className="form-label">NABH Accreditation No. (optional)</label>
                <input className="form-input" placeholder="NABH accreditation number if any" value={form.nabhAccreditation} onChange={e => set('nabhAccreditation', e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label">ABDM Health Facility ID (optional)</label>
                <input className="form-input" placeholder="ABDM facility identifier if any" value={form.abdmFacilityId} onChange={e => set('abdmFacilityId', e.target.value)} />
              </div>
            </div>
          )}

          {/* Step 4 – Hospital: Authorised Person */}
          {step === 4 && role === 'hospital' && (
            <div className="auth-form fade-in">
              <div className="section-divider">
                <div className="section-divider-line" />
                <span className="section-divider-label"><User size={13} /> Authorized Person</span>
                <div className="section-divider-line" />
              </div>
              <div className="form-group">
                <label className="form-label">Authorized Person Name <span style={{ color: 'red' }}>*</span></label>
                <div className="input-icon-wrap">
                  {form.authorizedPersonName === '' && <User size={15} className="input-icon" />}
                  <input data-field="authorizedPersonName" className={`${inputClass('authorizedPersonName')} input-with-icon`} placeholder="   Full name of authorized person" value={form.authorizedPersonName} onChange={e => set('authorizedPersonName', e.target.value)} />
                </div>
                <FieldError name="authorizedPersonName" />
              </div>
              <div className="form-group">
                <label className="form-label">Authorized Designation <span style={{ color: 'red' }}>*</span></label>
                <input data-field="authorizedDesignation" className={inputClass('authorizedDesignation')} placeholder="e.g. Medical Superintendent, CEO" value={form.authorizedDesignation} onChange={e => set('authorizedDesignation', e.target.value)} />
                <FieldError name="authorizedDesignation" />
              </div>
              <div className="form-group">
                <label className="form-label">Email ID <span style={{ color: 'red' }}>*</span></label>
                <div className="input-icon-wrap">
                  {form.authorizedEmail === '' && <Mail size={15} className="input-icon" />}
                  <input data-field="authorizedEmail" type="email" className={`${inputClass('authorizedEmail')} input-with-icon`} placeholder="   authorized@hospital.in" value={form.authorizedEmail} onChange={e => set('authorizedEmail', e.target.value)} />
                </div>
                <FieldError name="authorizedEmail" />
              </div>
              <div className="alert alert-pending">
                <ShieldCheck size={16} style={{ flexShrink: 0 }} />
                <span>After submission, your hospital registration will be reviewed by the admin. You can log in only after approval.</span>
              </div>
            </div>
          )}

          {/* Navigation Buttons */}
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
                  {loading ? <span className="spinning" /> : role === 'hospital' ? 'Submit Registration' : 'Create Account'}
                </button>
              )
            )}
          </div>

          <p className="auth-footer-text" style={{ marginTop: 20 }}>
            Already have an account? <Link to="/login" className="auth-link">Sign in</Link>
          </p>
        </div>
      </div>

      <style>{`
        .input-error {
          border-color: #e53e3e !important;
          background: #fff5f5 !important;
        }
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(-8px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}