import { useState, useRef } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { Heart, ShieldCheck, Clock } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import './auth.css';

export default function OTPVerify() {
  const [digits, setDigits]           = useState(['', '', '', '', '', '']);
  const [error, setError]             = useState('');
  const [pendingMsg, setPendingMsg]   = useState('');
  const [timer]                       = useState(600); // 10 min display only
  const [loading, setLoading]         = useState(false);
  const [verified, setVerified]       = useState(false);
  const [resendCooldown, setResent]   = useState(0);
  const refs = useRef([]);
  const navigate  = useNavigate();
  const location  = useLocation();
  const { verifyOTP, forgotPassword } = useAuth();

  // Context passed via navigate state from Login / Register
  const email   = location.state?.email || '';
  const purpose = location.state?.from === 'reset' ? 'reset' : 'verification';

  const mins = String(Math.floor(timer / 60)).padStart(2, '0');
  const secs = String(timer % 60).padStart(2, '0');

  const handleChange = (i, val) => {
    if (!/^\d*$/.test(val)) return;
    const next = [...digits];
    next[i] = val.slice(-1);
    setDigits(next);
    if (val && i < 5) refs.current[i + 1]?.focus();
  };

  const handleKeyDown = (i, e) => {
    if (e.key === 'Backspace' && !digits[i] && i > 0) refs.current[i - 1]?.focus();
  };

  const handlePaste = (e) => {
    const text = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (text.length === 6) setDigits(text.split(''));
  };

  // Decode JWT payload without an external library
  const getRoleFromToken = (token) => {
    try {
      return JSON.parse(atob(token.split('.')[1])).role || null;
    } catch { return null; }
  };

  const handleVerify = async () => {
    const code = digits.join('');
    if (code.length < 6) { setError('Enter all 6 digits'); return; }
    setLoading(true);
    setError('');

    const res = await verifyOTP(email, code, purpose);
    setLoading(false);

    if (!res.success) {
      setError(res.error || 'Invalid or expired OTP. Please try again.');
      return;
    }

    setVerified(true);
    
    // Hospital registration pending admin approval
    if (res.pendingApproval) {
      setPendingMsg(res.message || 'Your hospital registration is now pending admin approval.');
      // Don't auto-redirect for hospitals, let them read the message
      return;
    }

    // Password-reset flow: just go back to login
    if (purpose === 'reset') {
      setTimeout(() => navigate('/login'), 1500);
      return;
    }

    // Registration verification: decode token → navigate to correct dashboard
    const role = getRoleFromToken(res.token);
    setTimeout(() => {
      if (role === 'admin')         navigate('/admin');
      else if (role === 'hospital') navigate('/hospital');
      else if (role === 'donor')    navigate('/donor');
      else                          navigate('/login');
    }, 1500);
  };

  const handleResend = async () => {
    if (resendCooldown > 0 || !email) return;
    // Reuse forgotPassword which triggers a new OTP email
    await forgotPassword(email);
    setResent(60);
    const iv = setInterval(() => {
      setResent(c => { if (c <= 1) { clearInterval(iv); return 0; } return c - 1; });
    }, 1000);
  };

  return (
    <div className="auth-page">
      <div className="auth-bg">
        <div className="auth-glow g1" />
        <div className="auth-glow g2" />
      </div>

      <div className="auth-container">
        <div className="auth-logo">
          <div className="auth-logo-icon"><Heart size={28} fill="currentColor" /></div>
          <h1 className="auth-brand">BloodLink</h1>
        </div>

        <div className="auth-card">
          <div style={{ textAlign: 'center', marginBottom: 24 }}>
            <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'rgba(230,57,70,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px', border: '2px solid var(--color-blood-dark)' }}>
              <ShieldCheck size={24} color="var(--color-blood)" />
            </div>
            <h2 className="auth-title">OTP Verification</h2>
            <p className="auth-sub">
              Enter the 6-digit code sent to <strong>{email || 'your email'}</strong>
            </p>
          </div>

          {verified ? (
            <div style={{ textAlign: 'center', padding: '20px 0' }}>
              <div style={{ fontSize: '3rem', marginBottom: 8 }}>✅</div>
              <p className="font-bold text-success">{pendingMsg ? 'Verified!' : 'Verified! Redirecting...'}</p>
              {pendingMsg && (
                <div style={{ marginTop: 20 }}>
                  <div className="alert alert-pending" style={{ textAlign: 'left', marginBottom: 20 }}>
                    <ShieldCheck size={16} style={{ flexShrink: 0 }} />
                    <span>{pendingMsg}</span>
                  </div>
                  <Link to="/login" className="btn btn-primary w-full">
                    Return to Login
                  </Link>
                </div>
              )}
            </div>
          ) : (
            <>
              {error && (
                <div className="alert alert-danger" style={{ marginBottom: 16 }}>
                  <span>{error}</span>
                </div>
              )}

              <div className="otp-inputs" onPaste={handlePaste}>
                {digits.map((d, i) => (
                  <input
                    key={i}
                    ref={el => refs.current[i] = el}
                    className="otp-digit"
                    inputMode="numeric"
                    maxLength={1}
                    value={d}
                    onChange={e => handleChange(i, e.target.value)}
                    onKeyDown={e => handleKeyDown(i, e)}
                  />
                ))}
              </div>

              <div className="otp-timer" style={{ marginTop: 16, marginBottom: 20 }}>
                <Clock size={14} />
                <span>Expires in </span>
                <span className="otp-timer-value">{mins}:{secs}</span>
              </div>

              <button
                className="btn btn-primary btn-lg w-full"
                onClick={handleVerify}
                disabled={loading}
              >
                {loading ? 'Verifying...' : 'Verify OTP'}
              </button>

              <div style={{ textAlign: 'center', marginTop: 16, fontSize: '0.84rem', color: 'var(--color-muted)' }}>
                Didn't receive the code?{' '}
                <button
                  className="otp-resend-btn"
                  onClick={handleResend}
                  disabled={resendCooldown > 0}
                >
                  {resendCooldown > 0 ? `Resend in ${resendCooldown}s` : 'Resend OTP'}
                </button>
              </div>
            </>
          )}
        </div>

        <p className="auth-footer-text">
          <Link to="/login" className="auth-link">← Back to Login</Link>
        </p>
      </div>
    </div>
  );
}
