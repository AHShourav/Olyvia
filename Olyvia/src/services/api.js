import axios from 'axios';

// In dev, Vite proxy forwards /api to backend. In production, set VITE_API_URL if API is on another origin.
const API_BASE = import.meta.env.VITE_API_URL ?? ''
const api = axios.create({
  baseURL: `${API_BASE}/api`,
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json',
  },
});

export default api;
