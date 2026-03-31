import { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { authAPI } from '../utils/api';
import { connectSocket, disconnectSocket } from '../utils/socket';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser]       = useState(null);
  const [loading, setLoading] = useState(false);

  // ── Persist user to localStorage ────────────────────────────────────────────
  const persist = useCallback((userData, token) => {
    setUser(userData);
    if (token)    localStorage.setItem('bl_token', token);
    if (userData) localStorage.setItem('bl_user', JSON.stringify(userData));
  }, []);

  // ── Rehydrate from localStorage on page load ─────────────────────────────────
  const rehydrate = useCallback(() => {
    try {
      const stored = localStorage.getItem('bl_user');
      const token  = localStorage.getItem('bl_token');
      if (stored && token) {
        setUser(JSON.parse(stored));
        connectSocket();
      }
    } catch { /* ignore corrupt storage */ }
  }, []);

  useEffect(() => { rehydrate(); }, [rehydrate]);

  // ── Login — supports email OR phone ──────────────────────────────────────────
  const login = useCallback(async (email, password, phone) => {
    setLoading(true);
    try {
      const res = await authAPI.login(email, password, phone);

      if (res.requiresOTP) {
        setLoading(false);
        return { success: false, requiresOTP: true, userId: res.userId, email };
      }

      if (res.pendingApproval) {
        setLoading(false);
        return { success: false, pendingApproval: true, message: res.message };
      }

      if (res.rejected) {
        setLoading(false);
        return { success: false, rejected: true, message: res.message };
      }

      persist(res.user, res.token);
      connectSocket();
      setLoading(false);
      return { success: true, user: res.user };
    } catch (err) {
      setLoading(false);
      if (err.pendingApproval) return { success: false, pendingApproval: true, message: err.message };
      if (err.rejected)        return { success: false, rejected: true, message: err.message };
      return { success: false, error: err.message || 'Invalid credentials.' };
    }
  }, [persist]);

  // ── Register ─────────────────────────────────────────────────────────────────
  const register = useCallback(async (data) => {
    setLoading(true);
    try {
      const res = await authAPI.register(data);
      setLoading(false);
      return res;
    } catch (err) {
      setLoading(false);
      return { success: false, error: err.message || 'Registration failed.' };
    }
  }, []);

  // ── Verify OTP ───────────────────────────────────────────────────────────────
  const verifyOTP = useCallback(async (email, otp, purpose = 'verification') => {
    setLoading(true);
    try {
      const res = await authAPI.verifyOTP(email, otp, purpose);
      if (res.token) {
        localStorage.setItem('bl_token', res.token);
        connectSocket();
      }
      setLoading(false);
      return { success: true, token: res.token, pendingApproval: res.pendingApproval, message: res.message };
    } catch (err) {
      setLoading(false);
      return { success: false, error: err.message || 'OTP verification failed.' };
    }
  }, []);

  // ── Resend OTP (verification or reset) ───────────────────────────────────────
  const resendOTP = useCallback(async (email, purpose = 'verification') => {
    try {
      const res = await authAPI.resendOTP(email, purpose);
      return { success: true, message: res.message };
    } catch (err) {
      return { success: false, error: err.message || 'Failed to resend OTP.' };
    }
  }, []);

  // ── Forgot / Reset password ──────────────────────────────────────────────────
  const forgotPassword = useCallback(async (email) => {
    try {
      const res = await authAPI.forgotPassword(email);
      return { success: true, message: res.message };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }, []);

  const resetPassword = useCallback(async (email, otp, newPassword) => {
    try {
      await authAPI.resetPassword(email, otp, newPassword);
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }, []);

  // ── Logout ────────────────────────────────────────────────────────────────────
  const logout = useCallback(() => {
    setUser(null);
    localStorage.removeItem('bl_token');
    localStorage.removeItem('bl_user');
    disconnectSocket();
  }, []);

  // ── Dev helper ────────────────────────────────────────────────────────────────
  const loginAs = useCallback((roleOrUser) => {
    const fakeUser = typeof roleOrUser === 'string'
      ? { id: 'dev', name: 'Dev ' + roleOrUser, email: 'dev@dev.com', role: roleOrUser }
      : roleOrUser;
    setUser(fakeUser);
    localStorage.setItem('bl_user', JSON.stringify(fakeUser));
  }, []);

  return (
    <AuthContext.Provider value={{
      user, loading,
      login, register, logout, rehydrate,
      verifyOTP, resendOTP, forgotPassword, resetPassword,
      loginAs,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
};