import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Heart, Mail, Phone, Lock, Eye, EyeOff,
  AlertCircle, ArrowRight, Building2, ShieldCheck
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import './auth.css';

const DEMO_ACCOUNTS = [
  { role: 'admin', label: 'Admin', email: 'admin@bloodsystem.com', password: 'Admin@1234', color: 'var(--color-admin)' },
  { role: 'hospital', label: 'Hospital', email: 'akashcrazy2004@gmail.com', password: 'akash123', color: 'var(--color-hospital)' },
  { role: 'donor', label: 'Donor', email: 'anushanushya2007@gmail.com', password: 'anu123', color: 'var(--color-donor)' },
];

export default function Login() {
  const [loginBy, setLoginBy] = useState('email'); // 'email' | 'phone'
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState('');
  const [pendingMsg, setPendingMsg] = useState('');
  const { login, user, loading } = useAuth(); // removed loginAs
  const navigate = useNavigate();

  useEffect(() => {
    if (user) {
      if (user.role === 'admin') navigate('/admin');
      if (user.role === 'hospital') navigate('/hospital');
      if (user.role === 'donor') navigate('/donor');
    }
  }, [user, navigate]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setPendingMsg('');
    const creds = loginBy === 'email' ? { email, password } : { phone, password };
    const res = await login(creds.email || undefined, password, creds.phone || undefined);

    if (res.requiresOTP) {
      navigate('/verify-otp', { state: { from: 'login', email, phone } });
    } else if (res.pendingApproval) {
      setPendingMsg('Your hospital registration is pending admin approval. Please wait for review.');
    } else if (res.rejected) {
      setError('Your hospital registration was rejected. Contact support.');
    } else if (res.success) {
      const role = res.user?.role;
      if (role === 'admin') navigate('/admin');
      else if (role === 'hospital') navigate('/hospital');
      else if (role === 'donor') navigate('/donor');
      else navigate('/');
    } else {
      setError(res.error || 'Invalid credentials. Please try again.');
    }
  };

  const handleDemo = async (account) => {
    setError('');
    setPendingMsg('');
    setEmail(account.email);
    setPassword(account.password);
    setLoginBy('email');

    // Instead of relying on useEffect which might miss the race condition,
    // explicitly navigate after successful login based on the role.
    const res = await login(account.email, account.password);

    if (res.requiresOTP) {
      navigate('/verify-otp', { state: { from: 'login', email: account.email } });
    } else if (res.pendingApproval) {
      setPendingMsg('Your hospital registration is pending admin approval. Please wait for review.');
    } else if (res.rejected) {
      setError('Your hospital registration was rejected. Contact support.');
    } else if (res.success) {
      // Force navigation directly based on the returned user object
      const role = res.user?.role;
      if (role === 'admin') navigate('/admin');
      else if (role === 'hospital') navigate('/hospital');
      else if (role === 'donor') navigate('/donor');
      else navigate('/');
    } else {
      setError(res.error || 'Invalid credentials. Please try again.');
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-container">
        {/* Logo */}
        <div className="auth-logo">
          <div className="auth-logo-icon"><Heart size={28} fill="currentColor" /></div>
          <h1 className="auth-brand">BloodLink</h1>
          <p className="auth-tagline">Emergency Blood Request Management System</p>
        </div>

        {/* Card */}
        <div className="auth-card">
          <div className="auth-card-header">
            <h2 className="auth-title">Welcome back</h2>
            <p className="auth-sub">Sign in to your account to continue</p>
          </div>

          {pendingMsg && (
            <div className="alert alert-pending" style={{ marginBottom: 16 }}>
              <ShieldCheck size={16} style={{ flexShrink: 0 }} />
              <span>{pendingMsg}</span>
            </div>
          )}

          {error && (
            <div className="alert alert-danger" style={{ marginBottom: 16 }}>
              <AlertCircle size={16} style={{ flexShrink: 0 }} />
              <span>{error}</span>
            </div>
          )}

          {/* Login By Toggle */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 20, background: 'var(--color-bg)', borderRadius: 'var(--radius-md)', padding: 4 }}>
            {['email', 'phone'].map(opt => (
              <button
                key={opt}
                type="button"
                onClick={() => setLoginBy(opt)}
                style={{
                  flex: 1, padding: '8px 0',
                  borderRadius: 'var(--radius-sm)',
                  border: 'none',
                  background: loginBy === opt ? 'white' : 'transparent',
                  color: loginBy === opt ? 'var(--color-primary)' : 'var(--color-muted)',
                  fontWeight: loginBy === opt ? 700 : 500,
                  fontSize: '0.875rem',
                  cursor: 'pointer',
                  boxShadow: loginBy === opt ? 'var(--shadow-sm)' : 'none',
                  transition: 'all 0.2s',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                }}
              >
                {opt === 'email' ? <Mail size={14} /> : <Phone size={14} />}
                {opt === 'email' ? 'Email' : 'Phone'}
              </button>
            ))}
          </div>

          <form onSubmit={handleSubmit} className="auth-form">
            {loginBy === 'email' ? (
              <div className="form-group">
                <label className="form-label">Email Address</label>
                <div className="input-icon-wrap">
                  {email === "" && <Mail size={15} className="input-icon" />}
                  <input type="email" className="form-input input-with-icon" placeholder="    your@email.com"
                    value={email} onChange={e => setEmail(e.target.value)} required />
                </div>
              </div>
            ) : (
              <div className="form-group">
                <label className="form-label">Phone Number</label>
                <div className="input-icon-wrap">
                  {phone === "" && <Phone size={15} className="input-icon" />}
                  <input type="tel" className="form-input input-with-icon" placeholder="   +91 XXXXX XXXXX"
                    value={phone} onChange={e => setPhone(e.target.value)} required />
                </div>
              </div>
            )}

            <div className="form-group">
              <label className="form-label">Password</label>
              <div className="input-icon-wrap">
                {password === "" && <Lock size={15} className="input-icon" />}
                <input
                  type={showPw ? 'text' : 'password'}
                  className="form-input input-with-icon input-with-icon-right"
                  placeholder="   ••••••••"
                  value={password} onChange={e => setPassword(e.target.value)} required
                />
                <button type="button" className="input-icon-right" onClick={() => setShowPw(p => !p)}>
                  {showPw ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
            </div>

            <div className="auth-row">
              <label className="remember-wrap">
                <input type="checkbox" /> Remember me
              </label>
              <Link to="/forgot-password" className="auth-link">Forgot password?</Link>
            </div>

            <button type="submit" className="btn btn-primary btn-lg w-full" disabled={loading}>
              {loading
                ? <span className="spinning" />
                : <>Sign In <ArrowRight size={16} /></>
              }
            </button>
          </form>

          <div className="auth-divider"><span>or quick demo access</span></div>

          <div className="demo-buttons">
            {DEMO_ACCOUNTS.map(a => (
              <button key={a.role} className="demo-btn" style={{ '--demo-color': a.color }}
                onClick={() => handleDemo(a)} disabled={loading}>
                <span className="demo-pill" style={{ background: a.color }} />
                {a.label}
                <span className="demo-email">{a.email}</span>
              </button>
            ))}
          </div>

          <p className="auth-footer-text" style={{ marginTop: 20 }}>
            Don't have an account? <Link to="/register" className="auth-link">Register here</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
