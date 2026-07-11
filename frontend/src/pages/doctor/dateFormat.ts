/**
 * Formats a Date into a localized date string (DD/MM/YYYY).
 * Small util shared by attendance and reports screens.
 * Exported explicitly so property tests can import it.
 */
export function formatDate(date: Date | string | null | undefined): string {
  if (!date) return '--/--/----';
  const d = date instanceof Date ? date : new Date(date);
  if (isNaN(d.getTime())) return '--/--/----';
  const day = d.getDate().toString().padStart(2, '0');
  const month = (d.getMonth() + 1).toString().padStart(2, '0');
  const year = d.getFullYear();
  return `${day}/${month}/${year}`;
}

/**
 * Formata TimeSpan do backend ("HH:MM:SS" ou "HH:MM") em "HHhMM".
 * Centralizado aqui pra evitar duplicação entre:
 *   - DoctorShiftsScreen (era `fmtTime`)
 *   - AttendanceConfirmModal (era `formatShiftTime`)
 *
 * Exemplos:
 *   "08:00:00" → "08h00"
 *   "19:30"    → "19h30"
 */
export function formatShiftTime(timeSpan: string): string {
  const [h, m] = timeSpan.split(':');
  return `${h}h${m}`;
}
