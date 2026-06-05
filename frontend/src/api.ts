import axios from 'axios';

// The backend endpoint can be dynamically loaded or fallback to local
const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor to add the authorization token
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor to handle token expiry or session conflicts
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response && error.response.status === 401) {
      // Token expired or missing — force re-login
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      if (window.location.pathname !== '/login' && window.location.pathname !== '/register') {
        window.location.href = '/login';
      }
    } else if (error.response && error.response.status === 403) {
      // 403 = role mismatch. This happens when two different accounts are logged in
      // across browser tabs and the stored token belongs to a different role.
      // Fix: clear the stale session and force re-login.
      const message = error.response.data?.message || '';
      if (message.includes('Insufficient permissions') || message.includes('Access denied')) {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        if (window.location.pathname !== '/login' && window.location.pathname !== '/register') {
          // Add a query param so the login page can show a helpful message
          window.location.href = '/login?reason=session_conflict';
        }
      }
    }
    return Promise.reject(error);
  }
);

export default api;
