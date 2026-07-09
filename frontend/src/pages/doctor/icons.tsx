/**
 * SVG icon components extracted from medico.html.
 * All SVGs are identical to the originals.
 */

/**
 * Logo 24p7 - Gradient heart with heartbeat line and checkmark.
 * Used in page headers and logo blocks.
 */
export function Logo24p7({ size = 88, className }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 88 88"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      <defs>
        <linearGradient id="logo24p7Gradient" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#2DBFB8" />
          <stop offset="100%" stopColor="#F5A623" />
        </linearGradient>
      </defs>
      <circle cx="44" cy="44" r="44" fill="url(#logo24p7Gradient)" />
      <path
        d="M44 17 C33 17 24 26 24 37 C24 51 44 67 44 67 C44 67 64 51 64 37 C64 26 55 17 44 17Z"
        fill="rgba(255,255,255,.92)"
      />
      <polyline
        points="31,37 36,37 39,31 42,43 45,35 48,41 51,37 57,37"
        fill="none"
        stroke="#2DBFB8"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <polyline
        points="37,24 42,30 52,20"
        fill="none"
        stroke="#F5A623"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/**
 * Logo variant used in page headers (with semi-transparent background circle).
 */
export function LogoHeader({ size = 44, className }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 88 88"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      <defs>
        <linearGradient id="logoHeaderGradient" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#2DBFB8" />
          <stop offset="100%" stopColor="#F5A623" />
        </linearGradient>
      </defs>
      <circle cx="44" cy="44" r="44" fill="rgba(255,255,255,.22)" />
      <path
        d="M44 17 C33 17 24 26 24 37 C24 51 44 67 44 67 C44 67 64 51 64 37 C64 26 55 17 44 17Z"
        fill="rgba(255,255,255,.95)"
      />
      <polyline
        points="31,37 36,37 39,31 42,43 45,35 48,41 51,37 57,37"
        fill="none"
        stroke="#2DBFB8"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <polyline
        points="37,24 42,30 52,20"
        fill="none"
        stroke="#F5A623"
        strokeWidth="2.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/**
 * NavHome icon - House with door.
 */
export function NavHome() {
  return (
    <svg viewBox="0 0 24 24">
      <path d="M3 9.5L12 3l9 6.5V20a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9.5z" />
      <polyline points="9 21 9 12 15 12 15 21" />
    </svg>
  );
}

/**
 * NavCheckIn icon - Checkmark.
 */
export function NavCheckIn() {
  return (
    <svg viewBox="0 0 24 24">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

/**
 * NavCheckOut icon - Door with arrow.
 */
export function NavCheckOut() {
  return (
    <svg viewBox="0 0 24 24">
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <polyline points="16 17 21 12 16 7" />
      <line x1="21" y1="12" x2="9" y2="12" />
    </svg>
  );
}

/**
 * NavReports icon - Grid/table.
 */
export function NavReports() {
  return (
    <svg viewBox="0 0 24 24">
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <line x1="3" y1="9" x2="21" y2="9" />
      <line x1="3" y1="15" x2="21" y2="15" />
      <line x1="9" y1="9" x2="9" y2="21" />
    </svg>
  );
}

/**
 * NavLogout icon - Door with arrow pointing out (reverse direction).
 */
export function NavLogout() {
  return (
    <svg viewBox="0 0 24 24">
      <path d="M15 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10" />
      <polyline points="20 17 23 12 20 7" />
      <line x1="23" y1="12" x2="9" y2="12" />
    </svg>
  );
}

/**
 * CheckmarkIcon - Used in check-in button and confirmation header.
 */
export function CheckmarkIcon({ size = 20, className }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

/**
 * LogoutArrowIcon - Used in check-out button and confirmation screen.
 */
export function LogoutArrowIcon({ size = 20, className }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <polyline points="16 17 21 12 16 7" />
      <line x1="21" y1="12" x2="9" y2="12" />
    </svg>
  );
}

/**
 * UserAvatarIcon - Used in person cards on confirmation screens.
 */
export function UserAvatarIcon({ variant = 'teal', size = 46 }: { variant?: 'teal' | 'orange'; size?: number }) {
  const gradientId = variant === 'teal' ? 'userAvatarTeal' : 'userAvatarOrange';
  const startColor = variant === 'teal' ? '#2DBFB8' : '#F5A623';
  const endColor = variant === 'teal' ? '#4dd6a8' : '#f7c15e';

  return (
    <svg width={size} height={size} viewBox="0 0 46 46">
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor={startColor} />
          <stop offset="100%" stopColor={endColor} />
        </linearGradient>
      </defs>
      <circle cx="23" cy="23" r="23" fill={`url(#${gradientId})`} />
      <path d="M7 44 C7 31 13 27 23 27 C33 27 39 31 39 44Z" fill="rgba(255,255,255,.9)" />
      <circle cx="23" cy="17" r="9" fill="rgba(255,255,255,.9)" />
    </svg>
  );
}
