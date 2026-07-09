import { useMemo } from 'react';
import type { Attendance } from '../../types/index';
import type { ReportStats } from './types';

/**
 * Pure function that computes report statistics from an array of Attendance records.
 *
 * - totalShifts: count of records that have a checkOutTime
 * - totalHours: sum of durations (checkOut - checkIn) in hours
 * - avgHoursPerShift: totalHours / totalShifts, or 0 if no completed shifts
 */
export function computeReportStats(records: Attendance[]): ReportStats {
  const completedRecords = records.filter((r) => r.checkOutTime != null);
  const totalShifts = completedRecords.length;

  const totalHours = completedRecords.reduce((sum, record) => {
    const checkIn = new Date(record.checkInTime).getTime();
    const checkOut = new Date(record.checkOutTime!).getTime();
    const durationHours = (checkOut - checkIn) / (1000 * 60 * 60);
    return sum + durationHours;
  }, 0);

  const avgHoursPerShift = totalShifts > 0 ? totalHours / totalShifts : 0;

  return { totalShifts, totalHours, avgHoursPerShift };
}

/**
 * Hook that computes report statistics from an array of Attendance records.
 * Returns a memoized ReportStats object.
 */
export function useReportStats(records: Attendance[]): ReportStats {
  return useMemo(() => computeReportStats(records), [records]);
}
