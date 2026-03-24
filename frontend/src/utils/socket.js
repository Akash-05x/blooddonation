import { io } from 'socket.io-client';

let socket = null;

/**
 * Connect to the Socket.io server using the stored JWT token.
 * Returns the singleton socket instance.
 */
export function connectSocket() {
  if (socket && socket.connected) return socket;

  const token = localStorage.getItem('bl_token');
  if (!token) return null;

  socket = io(window.location.origin, {
    auth: { token },
    reconnectionAttempts: 5,
    reconnectionDelay: 2000,
    timeout: 10000,
  });

  socket.on('connect', () => {
    console.log('[Socket.io] Connected:', socket.id);
  });

  socket.on('connect_error', (err) => {
    console.warn('[Socket.io] Connection error:', err.message);
  });

  socket.on('disconnect', (reason) => {
    console.log('[Socket.io] Disconnected:', reason);
  });

  return socket;
}

/**
 * Disconnect and destroy the socket instance.
 * Call on logout.
 */
export function disconnectSocket() {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}

/**
 * Get the existing socket instance (without connecting).
 */
export function getSocket() {
  return socket;
}

/**
 * Send the donor's current GPS location to hospital in real-time.
 * @param {string} requestId
 * @param {string} hospitalUserId
 * @param {number} latitude
 * @param {number} longitude
 */
export function sendLocationUpdate(requestId, hospitalUserId, latitude, longitude) {
  if (socket && socket.connected) {
    socket.emit('donor_location_update', { requestId, hospitalUserId, latitude, longitude });
  }
}

export default { connectSocket, disconnectSocket, getSocket, sendLocationUpdate };
