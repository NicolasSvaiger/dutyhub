import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import { ClinicProvider } from './contexts/ClinicContext';
import { NetworkStatusProvider } from './contexts/NetworkStatusContext';
import retryQueue from './utils/retryQueue';
import { attendanceSendFn } from './utils/attendanceSendFn';
import './index.css';
import App from './App.tsx';

// Register the send function so the retry queue can auto-flush on 'online' event
retryQueue.setSendFn(attendanceSendFn);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <NetworkStatusProvider>
        <AuthProvider>
          <ClinicProvider>
            <App />
          </ClinicProvider>
        </AuthProvider>
      </NetworkStatusProvider>
    </BrowserRouter>
  </StrictMode>,
);
