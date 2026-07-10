import type { Shift } from '../../types';

export type ShiftBucket = 'today' | 'upcoming' | 'past';

export interface GroupedShifts {
  today: Shift[];
  upcoming: Shift[];
  past: Shift[];
}

/**
 * Agrupa shifts em três buckets baseado na data de referência:
 *   - today:    shifts com `date` igual a hoje
 *   - upcoming: shifts com `date` posterior a hoje, ordenados asc
 *   - past:     shifts com `date` anterior a hoje, ordenados desc
 *
 * A comparação é feita sobre a porção "YYYY-MM-DD" da data, evitando
 * problemas de timezone quando o servidor retorna datas em UTC.
 *
 * `referenceDate` existe para facilitar testes — em produção usa `new Date()`.
 */
export function groupShifts(
  shifts: Shift[],
  referenceDate: Date = new Date(),
): GroupedShifts {
  const todayIso = toIsoDate(referenceDate);
  const result: GroupedShifts = { today: [], upcoming: [], past: [] };

  for (const s of shifts) {
    const shiftDate = s.date.slice(0, 10);
    if (shiftDate === todayIso) result.today.push(s);
    else if (shiftDate > todayIso) result.upcoming.push(s);
    else result.past.push(s);
  }

  result.upcoming.sort((a, b) => a.date.localeCompare(b.date));
  result.past.sort((a, b) => b.date.localeCompare(a.date));
  return result;
}

/** "YYYY-MM-DD" no fuso local (não UTC). */
function toIsoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
