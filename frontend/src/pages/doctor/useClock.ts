import { useState, useEffect } from 'react';

/**
 * Pure function that formats a Date into "HH:mm" (24h, zero-padded).
 */
export function formatTime(date: Date | string | null | undefined): string {
  if (!date) return '--:--';
  const d = date instanceof Date ? date : new Date(date);
  if (isNaN(d.getTime())) return '--:--';
  const hours = d.getHours().toString().padStart(2, '0');
  const minutes = d.getMinutes().toString().padStart(2, '0');
  return `${hours}:${minutes}`;
}

/**
 * Hook that returns the current time as "HH:mm", updated every second.
 */
export function useClock(): string {
  const [time, setTime] = useState(() => formatTime(new Date()));

  useEffect(() => {
    const interval = setInterval(() => {
      setTime(formatTime(new Date()));
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  return time;
}
