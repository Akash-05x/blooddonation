import axios from 'axios';

const api = axios.create({
  baseURL: '/api',
  timeout: 15000,
  headers: { 'Content-Type': 'application/json' },
});

// ── Request interceptor: attach JWT token ─────────────────────────────────────
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('bl_token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// ── Response interceptor: handle errors ───────────────────────────────────────
api.interceptors.response.use(
  (response) => response.data,
  (error) => {
    const status = error.response?.status;
    const data   = error.response?.data || {};
    const message = data.message || error.message || 'Network error';

    if (status === 401) {
      localStorage.removeItem('bl_token');
      localStorage.removeItem('bl_user');
      window.location.href = '/login';
    }

    // Propagate structed error fields (pendingApproval, rejected)
    const enriched = new Error(message);
    enriched.status = status;
    enriched.pendingApproval = data.pendingApproval || false;
    enriched.rejected = data.rejected || false;
    return Promise.reject(enriched);
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// Auth API
// ─────────────────────────────────────────────────────────────────────────────
export const authAPI = {
  register: (data)                          => api.post('/register', data),
  login: (email, password, phone)           => api.post('/login', { email, phone, password }),
  verifyOTP: (contact, otp, purpose, byPhone) =>
    api.post('/verify-otp', byPhone ? { phone: contact, otp, purpose } : { email: contact, otp, purpose }),
  forgotPassword: (contact, byPhone)        =>
    api.post('/forgot-password', byPhone ? { phone: contact } : { email: contact }),
  resetPassword: (contact, otp, newPassword, byPhone) =>
    api.post('/reset-password', byPhone ? { phone: contact, otp, newPassword } : { email: contact, otp, newPassword }),
};

// ─────────────────────────────────────────────────────────────────────────────
// Donor API
// ─────────────────────────────────────────────────────────────────────────────
export const donorAPI = {
  getProfile:      ()           => api.get('/donor/profile'),
  updateProfile:   (data)       => api.put('/donor/profile', data),
  getAlerts:       ()           => api.get('/donor/alerts'),
  acceptRequest:   (assignmentId, location) => api.post('/donor/accept-request', { assignmentId, ...location }),
  rejectRequest:   (assignmentId) => api.post('/donor/reject-request', { assignmentId }),
  getHistory:      ()           => api.get('/donor/history'),
  // GPS location update (HTTP fallback — also sent via WebSocket)
  updateLocation:  (data)       => api.post('/donor/location', data),
  // Confirm notification token to enter ranking pool
  confirmToken:    (token)      => api.post('/donor/confirm-token', { token }),
  rejectToken:     (token)      => api.post('/donor/reject-token', { token }),
};

// ─────────────────────────────────────────────────────────────────────────────
// Hospital API
// ─────────────────────────────────────────────────────────────────────────────
export const hospitalAPI = {
  createRequest:      (data)       => api.post('/hospital/create-request', data),
  getRequests:        (params)     => api.get('/hospital/requests', { params }),
  getNearbyDonors:    (params)     => api.get('/hospital/nearby-donors', { params }),
  // Live tracking data for a specific request (location + assignment info)
  getRequestTracking: (requestId)  => api.get(`/hospital/request/${requestId}/tracking`),
  promoteBackup:      (requestId)  => api.post('/hospital/promote-backup', { requestId }),
  markArrival:        (assignmentId) => api.post('/hospital/mark-arrival', { assignmentId }),
  markDonation:       (data)       => api.post('/hospital/mark-donation', data),
  getHistory:         (params)     => api.get('/hospital/history', { params }),
  finalizeAssignment: (requestId)  => api.post('/hospital/finalize-assignment', { requestId }),
  deleteRequest:      (requestId)  => api.delete(`/hospital/request/${requestId}`),
  updateProfile:      (data)       => api.put('/hospital/profile', data),
};

// ─────────────────────────────────────────────────────────────────────────────
// Admin API
// ─────────────────────────────────────────────────────────────────────────────
export const adminAPI = {
  getHospitals:           (params)           => api.get('/admin/hospitals', { params }),
  verifyHospital:         (hospitalId, action) => api.post('/admin/verify-hospital', { hospitalId, action }),
  getDonors:              (params)           => api.get('/admin/donors', { params }),
  blockUser:              (userId, action)   => api.post('/admin/block-user', { userId, action }),
  getEmergencyMonitoring: (params)           => api.get('/admin/emergency-monitoring', { params }),
  getReports:             ()                 => api.get('/admin/reports'),
  getSystemConfig:        ()                 => api.get('/admin/system-config'),
  updateSystemConfig:     (data)             => api.put('/admin/system-config', data),
  // Live system stats for admin dashboard
  getStats:               ()                 => api.get('/admin/stats'),

  // Staged Hospital Registration
  getPendingHospitals:    (params)           => api.get('/admin/pending-hospitals', { params }),
  approveHospital:        (id)               => api.post(`/admin/approve-hospital/${id}`),
  rejectHospital:         (id)               => api.post(`/admin/reject-hospital/${id}`),
};

export default api;
