import axios from 'axios';

/**
 * baseURL relativa (`/api`) — o frontend deve sempre bater no mesmo origin
 * em que ele está sendo servido. Em produção (docker-compose), o nginx
 * proxya `/api/*` para o container da API; em desenvolvimento com Vite,
 * configure um proxy equivalente no `vite.config.ts` se precisar.
 *
 * Hardcode para `http://localhost:5000/api` foi removido porque quebrava
 * ambientes onde `localhost` não é o host da máquina (containers de teste
 * E2E, execução em servidor headless etc.) e não trazia benefício em prod.
 */
const axiosInstance = axios.create({
  baseURL: '/api',
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
    // The backend validates it against the 'clinicIds' claim in the JWT.
    // Only fill in from localStorage when the caller hasn't already set the
    // header explicitly — explicit values win, which avoids races when the
    // user switches clinics and the localStorage lags behind for a tick.
    const alreadySet = config.headers['X-Clinic-Id'] ?? config.headers['x-clinic-id'];
    if (!alreadySet) {
      const activeClinicId = localStorage.getItem('plantonhub_active_clinic');
      if (activeClinicId) {
        config.headers['X-Clinic-Id'] = activeClinicId;
      }
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

    // Não tenta refresh quando o próprio /auth/login retorna 401: significa
    // que as credenciais estão erradas, o LoginPage vai mostrar o erro.
    // Também não redireciona pra /login (usuário já está lá).
    if (originalRequest.url?.includes('/auth/login')) {
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
        '/api/auth/refresh-token',
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
