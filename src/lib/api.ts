import axios from 'axios';
import { getApiUrl } from '../config';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '',
});

// Add a request interceptor
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

// Add a response interceptor
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response && error.response.status === 401) {
      // Unauthorized: clear token and optionally redirect
      localStorage.removeItem('token');
      // We'll let the App component handle the UI state transition
    }
    return Promise.reject(error);
  }
);

export default api;
