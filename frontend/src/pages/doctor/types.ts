export type DoctorScreen = 'home' | 'checkin-confirm' | 'checkout-confirm' | 'reports';

export interface ConfirmationData {
  type: 'checkin' | 'checkout';
  dateTime: Date;
  clinicName: string;
}

export interface ReportFilters {
  startDate: string | null;
  endDate: string | null;
  clinicId: string | null;
}

export interface ReportStats {
  totalShifts: number;
  totalHours: number;
  avgHoursPerShift: number;
}
