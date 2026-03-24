import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { useEffect } from 'react';

// Common Pages
import Login from './pages/common/Login';
import Register from './pages/common/Register';
import OTPVerify from './pages/common/OTPVerify';
import ForgotPassword from './pages/common/ForgotPassword';

// Admin Pages
import AdminLayout from './components/layout/AdminLayout';
import AdminDashboard from './pages/admin/AdminDashboard';
import HospitalVerification from './pages/admin/HospitalVerification';
import DonorManagement from './pages/admin/DonorManagement';
import EmergencyMonitoring from './pages/admin/EmergencyMonitoring';
import Analytics from './pages/admin/Analytics';
import SystemConfig from './pages/admin/SystemConfig';

// Hospital Pages
import HospitalLayout from './components/layout/HospitalLayout';
import HospitalDashboard from './pages/hospital/HospitalDashboard';
import EmergencyRequestForm from './pages/hospital/EmergencyRequestForm';
import DonorTrackingMap from './pages/hospital/DonorTrackingMap';
import HospitalHistory from './pages/hospital/HospitalHistory';

// Donor Pages
import DonorLayout from './components/layout/DonorLayout';
import DonorDashboard from './pages/donor/DonorDashboard';
import EmergencyAlerts from './pages/donor/EmergencyAlerts';
import DonorProfile from './pages/donor/DonorProfile';
import Achievements from './pages/donor/Achievements';
import DonorTracking from './pages/donor/DonorTracking';

function PrivateRoute({ children, role }) {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  if (role && user.role !== role) return <Navigate to="/login" replace />;
  return children;
}

function RoleRedirect() {
  const { user, rehydrate } = useAuth();
  useEffect(() => { rehydrate(); }, [rehydrate]);
  if (!user) return <Navigate to="/login" replace />;
  if (user.role === 'admin') return <Navigate to="/admin" replace />;
  if (user.role === 'hospital') return <Navigate to="/hospital" replace />;
  if (user.role === 'donor') return <Navigate to="/donor" replace />;
  return <Navigate to="/login" replace />;
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          {/* Public */}
          <Route path="/" element={<RoleRedirect />} />
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/verify-otp" element={<OTPVerify />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />

          {/* Admin */}
          <Route path="/admin" element={<PrivateRoute role="admin"><AdminLayout /></PrivateRoute>}>
            <Route index element={<AdminDashboard />} />
            <Route path="hospitals" element={<HospitalVerification />} />
            <Route path="donors" element={<DonorManagement />} />
            <Route path="requests" element={<EmergencyMonitoring />} />
            <Route path="analytics" element={<Analytics />} />
            <Route path="config" element={<SystemConfig />} />
          </Route>

          {/* Hospital */}
          <Route path="/hospital" element={<PrivateRoute role="hospital"><HospitalLayout /></PrivateRoute>}>
            <Route index element={<HospitalDashboard />} />
            <Route path="request" element={<EmergencyRequestForm />} />
            <Route path="tracking" element={<DonorTrackingMap />} />
            <Route path="history" element={<HospitalHistory />} />
          </Route>

          {/* Donor */}
          <Route path="/donor" element={<PrivateRoute role="donor"><DonorLayout /></PrivateRoute>}>
            <Route index element={<DonorDashboard />} />
            <Route path="alerts" element={<EmergencyAlerts />} />
            <Route path="profile" element={<DonorProfile />} />
            <Route path="achievements" element={<Achievements />} />
            <Route path="tracking/:requestId" element={<DonorTracking />} />
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
