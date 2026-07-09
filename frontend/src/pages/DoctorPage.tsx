import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { DoctorHomeScreen } from './doctor/DoctorHomeScreen';
import { DoctorCheckInConfirmScreen } from './doctor/DoctorCheckInConfirmScreen';
import { DoctorCheckOutConfirmScreen } from './doctor/DoctorCheckOutConfirmScreen';
import { DoctorReportsScreen } from './doctor/DoctorReportsScreen';
import { DoctorBottomNav } from './doctor/DoctorBottomNav';
import { LogoutModal } from './doctor/LogoutModal';
import type { DoctorScreen, ConfirmationData } from './doctor/types';
import styles from './doctor/DoctorPage.module.css';

export function DoctorPage() {
  const [screen, setScreen] = useState<DoctorScreen>('home');
  const [confirmData, setConfirmData] = useState<ConfirmationData | null>(null);
  const [showLogoutModal, setShowLogoutModal] = useState(false);

  const { logout } = useAuth();
  const navigate = useNavigate();

  const handleCheckedIn = (data: ConfirmationData) => {
    setConfirmData(data);
    setScreen('checkin-confirm');
  };

  const handleCheckedOut = (data: ConfirmationData) => {
    setConfirmData(data);
    setScreen('checkout-confirm');
  };

  const handleNavigate = (target: DoctorScreen) => {
    setScreen(target);
  };

  const handleLogoutRequest = () => {
    setShowLogoutModal(true);
  };

  const handleLogoutConfirm = () => {
    setShowLogoutModal(false);
    logout();
    navigate('/login', { replace: true });
  };

  const handleLogoutCancel = () => {
    setShowLogoutModal(false);
  };

  return (
    <div className={styles.doctorRoot}>
      {screen === 'home' && (
        <DoctorHomeScreen
          onCheckedIn={handleCheckedIn}
          onCheckedOut={handleCheckedOut}
        />
      )}
      {screen === 'checkin-confirm' && confirmData && (
        <DoctorCheckInConfirmScreen data={confirmData} />
      )}
      {screen === 'checkout-confirm' && confirmData && (
        <DoctorCheckOutConfirmScreen data={confirmData} />
      )}
      {screen === 'reports' && <DoctorReportsScreen />}

      <DoctorBottomNav
        activeScreen={screen}
        onNavigate={handleNavigate}
        onLogout={handleLogoutRequest}
      />

      {showLogoutModal && (
        <LogoutModal
          onConfirm={handleLogoutConfirm}
          onCancel={handleLogoutCancel}
        />
      )}
    </div>
  );
}
