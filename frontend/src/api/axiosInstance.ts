import axios from 'axios';

const axiosInstance = axios.create({
  baseURL: 'http://localhost:5000/api',
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor: add Bearer token from localStorage
axiosInstance.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('plantonhub_token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Response interceptor: handle 401 with automatic refresh
let isRefreshing = false;
let failedQueue: Array<{
  resolve: (value: unknown) => void;
  reject: (reason?: unknown) => void;
}> = [];

const processQueue = (error: unknown | null, token: string | null = null) => {
  failedQueue.forEach(({ resolve, reject }) => {
    if (error) {
      reject(error);
    } else {
      resolve(token);
    }
  });
  failedQueue = [];
};

axiosInstance.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    // Only attempt refresh on 401 and if we haven't already retried
    if (error.response?.status !== 401 || originalRequest._retry) {
      return Promise.reject(error);
    }

    // Don't try to refresh if the failing request is the refresh endpoint itself
    if (originalRequest.url?.includes('/auth/refresh-token')) {
      localStorage.removeItem('plantonhub_token');
      localStorage.removeItem('plantonhub_refresh_token');
      localStorage.removeItem('plantonhub_user');
      localStorage.removeItem('plantonhub_active_clinic');
      window.location.href = '/login';
      return Promise.reject(error);
    }

    if (isRefreshing) {
      // Queue requests while refresh is in progress
      return new Promise((resolve, reject) => {
        failedQueue.push({ resolve, reject });
      }).then((token) => {
        originalRequest.headers.Authorization = `Bearer ${token}`;
        return axiosInstance(originalRequest);
      });
    }

    originalRequest._retry = true;
    isRefreshing = true;

    const refreshToken = localStorage.getItem('plantonhub_refresh_token');

    if (!refreshToken) {
      localStorage.removeItem('plantonhub_token');
      localStorage.removeItem('plantonhub_refresh_token');
      localStorage.removeItem('plantonhub_user');
      localStorage.removeItem('plantonhub_active_clinic');
      window.location.href = '/login';
      return Promise.reject(error);
    }

    try {
      const { data } = await axios.post(
        'http://localhost:5000/api/auth/refresh-token',
        { refreshToken }
      );

      const newToken: string = data.token;
      const newRefreshToken: string = data.refreshToken;

      localStorage.setItem('plantonhub_token', newToken);
      localStorage.setItem('plantonhub_refresh_token', newRefreshToken);

      processQueue(null, newToken);

      originalRequest.headers.Authorization = `Bearer ${newToken}`;
      return axiosInstance(originalRequest);
    } catch (refreshError) {
      processQueue(refreshError, null);
      localStorage.removeItem('plantonhub_token');
      localStorage.removeItem('plantonhub_refresh_token');
      localStorage.removeItem('plantonhub_user');
      localStorage.removeItem('plantonhub_active_clinic');
      window.location.href = '/login';
      return Promise.reject(refreshError);
    } finally {
      isRefreshing = false;
    }
  }
);

export default axiosInstance;
