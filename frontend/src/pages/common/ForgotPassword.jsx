import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Heart, Mail, Phone, ArrowRight, ArrowLeft, Lock, AlertCircle, CheckCircle } from 'lucide-react';
import './auth.css';

const API = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

export default function ForgotPassword() {
  const [step, setStep] = useState(0); // 0=role+contact, 1=otp, 2=new-password
  const [role, setRole] = useState('donor');
  const [contact, setContact] = useState('');
  const [contactType, setContactType] = useState('email'); // 'email' | 'phone'
  const [otp, setOtp] = useState('');
  const [userId, setUserId] = useState('');
  const [newPw, setNewPw] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const navigate = useNavigate();

  const handleSendOtp = async () => {
    if (!contact) { setError('Please enter your email or phone number.'); return; }
    setLoading(true); setError('');
    try {
      const body = contactType === 'email' ? { email: contact } : { phone: contact };
      const res = await fetch(`${API}/forgot-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (data.success) {
        setUserId(data.userId || '');
        setStep(1);
      } else {
        setError(data.message || 'Failed to send OTP.');
      }
    } catch {
      setError('Network error. Please try again.');
    } finally { setLoading(false); }
  };
const handleVerifyOtp = () => {
  if (otp.length < 6) { setError('Please enter the complete 6-digit OTP.'); return; }
  setError('');
  setStep(2); // Just move to next step — OTP verified during reset
};
 

  const handleReset = async () => {
    if (!newPw || newPw !== confirm) { setError('Passwords do not match.'); return; }
    if (newPw.length < 8) { setError('Password must be at least 8 characters.'); return; }
    setLoading(true); setError('');
    try {
      const body = {
        newPassword: newPw,
        otp,
        ...(contactType === 'email' ? { email: contact } : { phone: contact }),
      };
      const res = await fetch(`${API}/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (data.success) {
        setDone(true);
        setTimeout(() => navigate('/login'), 2500);
      } else {
        setError(data.message || 'Failed to reset password.');
      }
    } catch {
      setError('Network error. Please try again.');
    } finally { setLoading(false); }
  };

  return (
    <div className="auth-page">
      <div className="auth-container">
        <div className="auth-logo">
          <div className="auth-logo-icon"><Heart size={28} fill="currentColor" /></div>
          <h1 className="auth-brand">BloodLink</h1>
        </div>

        <div className="auth-card">
          {done ? (
            <div style={{ textAlign: 'center', padding: '32px 0' }}>
              <div style={{
                width: 72, height: 72,
                background: 'linear-gradient(135deg, var(--color-success), var(--color-green-dark))',
                borderRadius: '50%',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                margin: '0 auto 20px',
                boxShadow: '0 8px 24px rgba(5,150,105,0.25)',
              }}>
                <CheckCircle size={32} color="white" />
              </div>
              <h2 style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--color-primary)', marginBottom: 8 }}>
                Password Reset!
              </h2>
              <p style={{ color: 'var(--color-muted)' }}>Redirecting you to the login page...</p>
            </div>
          ) : (
            <>
              <div className="auth-card-header">
                <h2 className="auth-title">
                  {step === 0 ? 'Forgot Password' : step === 1 ? 'Verify OTP' : 'Set New Password'}
                </h2>
                <p className="auth-sub">
                  {step === 0 ? 'Enter your registered email or phone to receive a reset code'
                    : step === 1 ? `OTP sent to ${contact}`
                      : 'Choose a strong new password'}
                </p>
              </div>

              {error && (
                <div className="alert alert-danger" style={{ marginBottom: 16 }}>
                  <AlertCircle size={16} style={{ flexShrink: 0 }} /><span>{error}</span>
                </div>
              )}

              {/* Step 0: Select role + contact */}
              {step === 0 && (
                <div className="auth-form">
                  <div className="form-group">
                    <label className="form-label">Select Role</label>
                    <select className="form-input" value={role} onChange={e => setRole(e.target.value)}>
                      <option value="donor">Donor</option>
                      <option value="hospital">Hospital</option>
                    </select>
                  </div>
                  {/* Contact type toggle */}
                  <div style={{ display: 'flex', gap: 8, background: 'var(--color-bg)', borderRadius: 'var(--radius-md)', padding: 4 }}>
                    {['email', 'phone'].map(opt => (
                      <button key={opt} type="button"
                        onClick={() => { setContactType(opt); setContact(''); }}
                        style={{
                          flex: 1, padding: '8px 0',
                          borderRadius: 'var(--radius-sm)', border: 'none',
                          background: contactType === opt ? 'white' : 'transparent',
                          color: contactType === opt ? 'var(--color-primary)' : 'var(--color-muted)',
                          fontWeight: contactType === opt ? 700 : 500,
                          fontSize: '0.875rem', cursor: 'pointer',
                          boxShadow: contactType === opt ? 'var(--shadow-sm)' : 'none',
                          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                        }}>
                        {opt === 'email' ? <Mail size={14} /> : <Phone size={14} />}
                        {opt === 'email' ? 'Email' : 'Phone'}
                      </button>
                    ))}
                  </div>
                  <div className="form-group">
                    <label className="form-label">{contactType === 'email' ? 'Email Address' : 'Phone Number'}</label>
                    <div className="input-icon-wrap">
                      {contact === "" && (contactType === 'email' ? <Mail size={15} className="input-icon" /> : <Phone size={15} className="input-icon" />)}
                      <input
                        type={contactType === 'email' ? 'email' : 'tel'}
                        className="form-input input-with-icon"
                        placeholder={contactType === 'email' ? '  your@email.com' : '  +91 XXXXX XXXXX'}
                        value={contact} onChange={e => setContact(e.target.value)}
                      />
                    </div>
                  </div>
                  <button className="btn btn-primary btn-lg w-full" onClick={handleSendOtp}
                    disabled={loading || !contact}>
                    {loading ? <span className="spinning" /> : <>Send Reset OTP <ArrowRight size={15} /></>}
                  </button>
                </div>
              )}

              {/* Step 1: OTP */}
              {step === 1 && (
                <div className="auth-form">
                  <div className="form-group">
                    <label className="form-label">Enter 6-Digit OTP</label>
                    <input
                      className="form-input"
                      style={{ textAlign: 'center', letterSpacing: 8, fontSize: '1.3rem', fontWeight: 700 }}
                      placeholder="• • • • • •"
                      maxLength={6}
                      value={otp}
                      onChange={e => setOtp(e.target.value.replace(/\D/g, ''))}
                    />
                  </div>
                  <div style={{ display: 'flex', gap: 10 }}>
                    <button className="btn btn-ghost" style={{ flex: 1 }} onClick={() => { setStep(0); setOtp(''); setError(''); }}>
                      <ArrowLeft size={14} /> Back
                    </button>
                    <button className="btn btn-primary" style={{ flex: 1 }} onClick={handleVerifyOtp}
                      disabled={loading || otp.length < 6}>
                      {loading ? <span className="spinning" /> : 'Verify OTP'}
                    </button>
                  </div>
                </div>
              )}

              {/* Step 2: New Password */}
              {step === 2 && (
                <div className="auth-form">
                  <div className="form-group">
                    <label className="form-label">New Password</label>
                    <div className="input-icon-wrap">
                      {newPw === "" && <Lock size={15} className="input-icon" />}
                      <input type="password" className="form-input input-with-icon" placeholder="Min. 8 characters"
                        value={newPw} onChange={e => setNewPw(e.target.value)} />
                    </div>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Confirm New Password</label>
                    <div className="input-icon-wrap">
                      {confirm === "" && <Lock size={15} className="input-icon" />}
                      <input type="password" className="form-input input-with-icon" placeholder="Re-enter password"
                        value={confirm} onChange={e => setConfirm(e.target.value)} />
                    </div>
                    {newPw && confirm && newPw !== confirm && (
                      <span className="form-error"><AlertCircle size={12} /> Passwords do not match</span>
                    )}
                  </div>
                  <button className="btn btn-primary btn-lg w-full" onClick={handleReset}
                    disabled={loading || !newPw || newPw !== confirm || newPw.length < 8}>
                    {loading ? <span className="spinning" /> : 'Reset Password'}
                  </button>
                </div>
              )}

              <p className="auth-footer-text" style={{ marginTop: 20 }}>
                <Link to="/login" className="auth-link">← Back to Login</Link>
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
