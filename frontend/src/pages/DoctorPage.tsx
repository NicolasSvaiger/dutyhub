import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { useClinic } from '../hooks/useClinic';
import { attendanceApi } from '../api/attendanceApi';
import { DoctorHomeScreen } from './doctor/DoctorHomeScreen';
import { DoctorAttendanceScreen } from './doctor/DoctorAttendanceScreen';
import { DoctorShiftsScreen } from './doctor/DoctorShiftsScreen';
import { DoctorReportsScreen } from './doctor/DoctorReportsScreen';
import { DoctorSettingsScreen } from './doctor/DoctorSettingsScreen';
import { DoctorBottomNav } from './doctor/DoctorBottomNav';
import { LogoutModal } from './doctor/LogoutModal';
import { computeLastAttendance } from './doctor/attendanceHistory';
import type { DoctorScreen, ConfirmationData } from './doctor/types';
import styles from './doctor/DoctorPage.module.css';

export function DoctorPage() {
  const [screen, setScreen] = useState<DoctorScreen>('home');
  const [lastCheckIn, setLastCheckIn] = useState<ConfirmationData | null>(null);
  const [lastCheckOut, setLastCheckOut] = useState<ConfirmationData | null>(null);
  const [showLogoutModal, setShowLogoutModal] = useState(false);

  const { logout } = useAuth();
  const { resolveClinicName } = useClinic();
  const navigate = useNavigate();

  const resolveClinicNameRef = useRef(resolveClinicName);
  resolveClinicNameRef.current = resolveClinicName;

  /**
   * Fonte de verdade da tela Presença — busca o histórico completo do
   * profissional e deriva "último check-in" / "último check-out" via
   * `computeLastAttendance` (regra: check-out só se for do MESMO atendimento
   * do último check-in). Extraída pra `useCallback` pra podermos disparar
   * um refetch imprevisto — quando o usuário navega pra Presença, quando
   * conclui um check-in/check-out, etc.
   */
  const refreshLastAttendance = useCallback(async () => {
    try {
      const history = await attendanceApi.getMyHistory();
      const { lastCheckIn: checkIn, lastCheckOut: checkOut } = computeLastAttendance(
        history,
        resolveClinicNameRef.current,
      );
      setLastCheckIn(checkIn);
      setLastCheckOut(checkOut);
    } catch {
      // Silent — attendance screen will show empty state
    }
  }, []);

  // Busca inicial e re-busca quando o contexto de clínicas muda
  useEffect(() => {
    void refreshLastAttendance();
  }, [refreshLastAttendance]);

  // Re-busca sempre que o usuário abrir a tela Presença vindouro de outra aba.
  // Mas NÃO sobrescreve se já temos um dado otimista mais recente (ex: acabou
  // de fazer check-in e o screen mudou pra 'presenca' no mesmo click).
  const skipNextRefetch = useRef(false);

  useEffect(() => {
    if (screen === 'presenca') {
      if (skipNextRefetch.current) {
        skipNextRefetch.current = false;
        return;
      }
      void refreshLastAttendance();
    }
  }, [screen, refreshLastAttendance]);

  /**
   * After a successful check-in:
   *   1. Atualização otimista — mostra logo o novo check-in. O dado vem
   *      direto do callback do modal (que por sua vez pegou a hora local
   *      exata do momento do click). É a fonte mais confiável.
   *   2. NÃO faz refetch automático — o otimista É o estado canônico até
   *      o usuário navegar de volta pra Presença (onde o useEffect de screen
   *      dispara um refetch fresco). Isso evita a race condition onde o GET
   *      retorna antes do DB ter commitado o novo registro.
   */
  const handleCheckedIn = (data: ConfirmationData) => {
    setLastCheckIn(data);
    setLastCheckOut(null);
    skipNextRefetch.current = true;
    setScreen('presenca');
  };

  /**
   * After a successful check-out:
   * Mantém o lastCheckIn intacto (o par check-in/check-out é do mesmo atendimento).
   * Faz refetch com delay pra reconciliar com o banco — o check-out acabou de ser
   * persistido, então o GET /my-history vai trazer o atendimento completo.
   */
  const handleCheckedOut = (data: ConfirmationData) => {
    setLastCheckOut(data);
    skipNextRefetch.current = true;
    setScreen('presenca');
    // Refetch reconciliatório — o skip evita o imediato do useEffect,
    // mas fazemos manualmente com delay pra confirmar o estado do banco.
    setTimeout(() => { void refreshLastAttendance(); }, 1500);
  };

  const handleNavigate = (target: DoctorScreen) => {
    setScreen(target);
  };

  const handleLogoutRequest = () => setShowLogoutModal(true);

  const handleLogoutConfirm = () => {
    setShowLogoutModal(false);
    logout();
    navigate('/login', { replace: true });
  };

  const handleLogoutCancel = () => setShowLogoutModal(false);

  return (
    <div className={styles.doctorRoot}>
      {screen === 'home' && (
        <DoctorHomeScreen
          onCheckedIn={handleCheckedIn}
          onCheckedOut={handleCheckedOut}
        />
      )}
      {screen === 'presenca' && (
        <DoctorAttendanceScreen lastCheckIn={lastCheckIn} lastCheckOut={lastCheckOut} />
      )}
      {screen === 'plantoes' && <DoctorShiftsScreen />}
      {screen === 'reports' && <DoctorReportsScreen />}
      {screen === 'settings' && (
        <DoctorSettingsScreen onLogoutRequest={handleLogoutRequest} />
      )}

      <DoctorBottomNav activeScreen={screen} onNavigate={handleNavigate} />

      {showLogoutModal && (
        <LogoutModal onConfirm={handleLogoutConfirm} onCancel={handleLogoutCancel} />
      )}
    </div>
  );
}
