import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import styles from './DoctorPage.module.css';
import { notificationsApi, type NotificationItem } from '../../api/notificationsApi';

const POLL_INTERVAL_MS = 60_000; // refresh the badge every minute

/**
 * Bell icon shown in the doctor header. Displays a small badge with the
 * unread notification count and opens a popover with the notification list
 * when clicked. Backed by GET /notifications and /notifications/unread-count
 * (both stubs today — the UI is ready for when real notifications land).
 */
export function NotificationBell() {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(0);
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [loadingItems, setLoadingItems] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  // Poll the unread count so the badge stays fresh without user action
  useEffect(() => {
    let cancelled = false;

    const fetchCount = async () => {
      try {
        const count = await notificationsApi.getUnreadCount();
        if (!cancelled) setUnread(count);
      } catch {
        // Silent — bell just won't show a badge if the endpoint fails
      }
    };

    void fetchCount();
    const id = window.setInterval(fetchCount, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, []);

  // Load notification items lazily when the popover opens
  useEffect(() => {
    if (!open) return;

    let cancelled = false;
    setLoadingItems(true);

    notificationsApi
      .getAll()
      .then((data) => {
        if (!cancelled) setItems(data);
      })
      .catch(() => {
        if (!cancelled) setItems([]);
      })
      .finally(() => {
        if (!cancelled) setLoadingItems(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open]);

  // Close on click outside / ESC
  useEffect(() => {
    if (!open) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [open]);

  const displayCount = unread > 99 ? '99+' : String(unread);

  return (
    <div className={styles.notifWrapper} ref={wrapperRef}>
      <button
        type="button"
        className={styles.notifButton}
        onClick={() => setOpen((v) => !v)}
        aria-label={
          unread > 0
            ? t('doctor.notifications.ariaLabelWithCount', { count: unread })
            : t('doctor.notifications.ariaLabel')
        }
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
          <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
        </svg>
        {unread > 0 && (
          <span className={styles.notifBadge} aria-hidden="true">
            {displayCount}
          </span>
        )}
      </button>

      {open && (
        <div className={styles.notifPopover} role="dialog" aria-label={t('doctor.notifications.title')}>
          <div className={styles.notifPopoverHeader}>
            <div className={styles.notifPopoverTitle}>{t('doctor.notifications.title')}</div>
            {unread > 0 && (
              <div className={styles.notifPopoverSubtitle}>
                {t('doctor.notifications.unread', { count: unread })}
              </div>
            )}
          </div>

          <div className={styles.notifPopoverBody}>
            {loadingItems && (
              <div className={styles.notifEmpty}>{t('doctor.notifications.loading')}</div>
            )}
            {!loadingItems && items.length === 0 && (
              <div className={styles.notifEmpty}>
                <svg
                  width="32"
                  height="32"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
                  <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
                </svg>
                <div className={styles.notifEmptyText}>{t('doctor.notifications.empty')}</div>
                <div className={styles.notifEmptyHint}>
                  {t('doctor.notifications.emptyHint')}
                </div>
              </div>
            )}
            {!loadingItems && items.length > 0 && (
              <ul className={styles.notifList}>
                {items.map((n) => (
                  <li
                    key={n.id}
                    className={`${styles.notifItem} ${!n.isRead ? styles.notifItemUnread : ''}`}
                  >
                    <div className={styles.notifItemTitle}>{n.title}</div>
                    <div className={styles.notifItemMessage}>{n.message}</div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
