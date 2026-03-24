// Mock data for all roles — simulates backend responses

export const MOCK_USERS = {
  admin: { id: 'u1', name: 'Dr. Admin Singh', email: 'admin@bloodlink.in', role: 'admin', avatar: 'AS' },
  hospital: { id: 'u2', name: 'Apollo Hospital Chennai', email: 'apollo@hospital.in', role: 'hospital', avatar: 'AH', hospitalId: 'h1' },
  donor: { id: 'u3', name: 'Ravi Kumar', email: 'ravi@gmail.com', role: 'donor', avatar: 'RK', donorId: 'd1' },
};

export const BLOOD_GROUPS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];

export const MOCK_HOSPITALS = [

];

export const MOCK_DONORS = [

];

export const MOCK_REQUESTS = [

];

export const MOCK_ALERTS = [

];

export const MOCK_DONATION_HISTORY = [

];

export const MOCK_ANALYTICS = {
  weekly: {
    requests: [12, 8, 15, 22, 18, 25, 19],
    successRate: [88, 92, 85, 91, 94, 89, 93],
    avgResponseTime: [7.2, 6.8, 8.1, 5.9, 6.2, 7.0, 5.5],
    labels: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
  },
  monthly: {
    requests: [156, 172, 148, 195, 210, 188, 225, 242, 198, 265, 278, 310],
    successRate: [87, 89, 88, 91, 92, 90, 93, 94, 91, 95, 93, 96],
    labels: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
  },
  bloodGroupDist: [
    { group: 'O+', count: 42 }, { group: 'A+', count: 28 }, { group: 'B+', count: 19 },
    { group: 'O-', count: 15 }, { group: 'AB+', count: 10 }, { group: 'A-', count: 8 },
    { group: 'B-', count: 5 }, { group: 'AB-', count: 3 },
  ],
  kpis: {
    totalRequests: 2847,
    successRate: 92.4,
    avgResponseTime: 6.2,
    activeDonors: 1284,
    activeHospitals: 38,
    todayRequests: 19,
    todayCompleted: 16,
    pendingVerification: 3,
  },
};

export const MOCK_CONFIG = {
  donorRadius: 15,
  maxDonorNotifications: 10,
  primaryResponseTimeout: 8,
  backupResponseTimeout: 5,
  distanceWeight: 0.35,
  responseWeight: 0.30,
  reliabilityWeight: 0.25,
  availabilityWeight: 0.10,
  otpExpiryMinutes: 10,
  otpMaxAttempts: 5,
  otpBlockDurationMinutes: 30,
  minDonationIntervalDays: 90,
};

export const MOCK_ADMIN_LOGS = [

];
