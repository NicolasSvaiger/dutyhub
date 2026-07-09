import styles from './DoctorPage.module.css';

interface LogoutModalProps {
  onConfirm: () => void;
  onCancel: () => void;
}

export function LogoutModal({ onConfirm, onCancel }: LogoutModalProps) {
  return (
    <div className={styles.modalOverlay}>
      <div className={styles.modalSheet}>
        <div className={styles.modalTitle}>Sair da conta</div>
        <div className={styles.modalSub}>Deseja realmente sair?</div>
        <div className={styles.modalBtns}>
          <button
            className={`${styles.btn} ${styles.btnGhost}`}
            onClick={onCancel}
            type="button"
          >
            Cancelar
          </button>
          <button
            className={`${styles.btn} ${styles.btnOrange}`}
            onClick={onConfirm}
            type="button"
          >
            Sair
          </button>
        </div>
      </div>
    </div>
  );
}
