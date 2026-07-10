import { useTranslation } from 'react-i18next';
import styles from './DoctorPage.module.css';

interface LogoutModalProps {
  onConfirm: () => void;
  onCancel: () => void;
}

export function LogoutModal({ onConfirm, onCancel }: LogoutModalProps) {
  const { t } = useTranslation();

  return (
    <div className={styles.modalOverlay}>
      <div className={styles.modalSheet}>
        <div className={styles.modalTitle}>{t('doctor.logout.title')}</div>
        <div className={styles.modalSub}>{t('doctor.logout.message')}</div>
        <div className={styles.modalBtns}>
          <button
            className={`${styles.btn} ${styles.btnGhost}`}
            onClick={onCancel}
            type="button"
          >
            {t('doctor.logout.cancel')}
          </button>
          <button
            className={`${styles.btn} ${styles.btnOrange}`}
            onClick={onConfirm}
            type="button"
          >
            {t('doctor.logout.confirm')}
          </button>
        </div>
      </div>
    </div>
  );
}
