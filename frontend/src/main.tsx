import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import { ClinicProvider } from './contexts/ClinicContext';
import { NetworkStatusProvider } from './contexts/NetworkStatusContext';
import { ThemeProvider } from './contexts/ThemeContext';
import retryQueue from './utils/retryQueue';
import { attendanceSendFn } from './utils/attendanceSendFn';
import './index.css';
import './styles/theme.css';
import './i18n';
import App from './App.tsx';

// Register the send function so the retry queue can auto-flush on 'online' event
retryQueue.setSendFn(attendanceSendFn);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider>
      <BrowserRouter>
        <NetworkStatusProvider>
          <AuthProvider>
            <ClinicProvider>
              <App />
            </ClinicProvider>
          </AuthProvider>
        </NetworkStatusProvider>
      </BrowserRouter>
    </ThemeProvider>
  </StrictMode>,
);
