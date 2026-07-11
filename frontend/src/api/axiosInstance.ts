import axios from 'axios';
import { cognitoGetCurrentSession, cognitoLogout } from './cognitoAuth';

/**
 * baseURL relativa (`/api`) — o frontend deve sempre bater no mesmo origin
 * em que ele está sendo servido. Em produção (docker-compose), o nginx
 * proxya `/api/*` para o container da API; em desenvolvimento com Vite,
 * configure um proxy equivalente no `vite.config.ts` se precisar.
 */
const axiosInstance = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api',
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor: add Bearer token and active clinic from localStorage
axiosInstance.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('plantonhub_token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }

    // Multi-clinic support: send the active clinic id in every request.
    const alreadySet = config.headers['X-Clinic-Id'] ?? config.headers['x-clinic-id'];
    if (!alreadySet) {
      const activeClinicId = localStorage.getItem('plantonhub_active_clinic');
      if (activeClinicId) {
        config.headers['X-Clinic-Id'] = activeClinicId;
      }
    }

    return config;
  },
  (error) => Promise.reject(error),
);

// Response interceptor: handle 401 with Cognito session refresh
let isRefreshing = false;
let failedQueue: Array<{
  resolve: (value: unknown) => void;
  reject: (reason?: unknown) => void;
}> = [];

const processQueue = (error: unknown, token: string | null = null) => {
  failedQueue.forEach(({ resolve, reject }) => {
    if (error) {
      reject(error);
    } else {
      resolve(token);
    }
  });
  failedQueue = [];
};

function redirectToLogin(): void {
  localStorage.removeItem('plantonhub_token');
  localStorage.removeItem('plantonhub_refresh_token');
  localStorage.removeItem('plantonhub_user');
  localStorage.removeItem('plantonhub_active_clinic');
  cognitoLogout();
  window.location.href = '/login';
}

axiosInstance.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    // Only attempt refresh on 401 and if we haven't already retried
    if (error.response?.status !== 401 || originalRequest._retry) {
      return Promise.reject(error);
    }

    // Don't try to refresh for auth endpoints that naturally return 401
    if (originalRequest.url?.includes('/auth/login')) {
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

    try {
      // Cognito SDK handles refresh automatically via getSession()
      const session = await cognitoGetCurrentSession();
      if (!session) {
        throw new Error('No valid session');
      }

      const newToken = session.tokens.accessToken;

      // Persist the refreshed tokens
      localStorage.setItem('plantonhub_token', newToken);
      localStorage.setItem('plantonhub_refresh_token', session.tokens.refreshToken);

      processQueue(null, newToken);

      originalRequest.headers.Authorization = `Bearer ${newToken}`;
      return axiosInstance(originalRequest);
    } catch (refreshError) {
      processQueue(refreshError, null);
      redirectToLogin();
      return Promise.reject(refreshError);
    } finally {
      isRefreshing = false;
    }
  },
);

export default axiosInstance;
