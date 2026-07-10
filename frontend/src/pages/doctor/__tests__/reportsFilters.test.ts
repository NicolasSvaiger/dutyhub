/**
 * @vitest-environment jsdom
 */
import { describe, expect, it } from 'vitest';
import {
  filterByDateRange,
  filterByClinic,
} from '../DoctorReportsScreen';
import type { Attendance } from '../../../types/index';

function makeAttendance(overrides: Partial<Attendance>): Attendance {
  return {
    id: 'att-1',
    userId: 'u-1',
    shiftId: 's-1',
    clinicId: 'c-1',
    checkInTime: '2025-06-15T08:00:00Z',
    checkInLatitude: 0,
    checkInLongitude: 0,
    checkInDeviceId: 'd-1',
    biometricValidated: true,
    ...overrides,
  };
}

const records: Attendance[] = [
  makeAttendance({ id: '1', checkInTime: '2025-06-10T09:00:00Z', clinicId: 'a' }),
  makeAttendance({ id: '2', checkInTime: '2025-06-15T09:00:00Z', clinicId: 'b' }),
  makeAttendance({ id: '3', checkInTime: '2025-06-20T09:00:00Z', clinicId: 'a' }),
  makeAttendance({ id: '4', checkInTime: '2025-07-01T09:00:00Z', clinicId: 'c' }),
];

describe('filterByDateRange', () => {
  it('retorna todos os registros quando ambas as datas são null', () => {
    expect(filterByDateRange(records, null, null)).toEqual(records);
  });

  it('filtra por startDate quando endDate é null (inclusivo)', () => {
    const out = filterByDateRange(records, '2025-06-15', null);
    expect(out.map((r) => r.id)).toEqual(['2', '3', '4']);
  });

  it('filtra por endDate quando startDate é null (inclusivo)', () => {
    const out = filterByDateRange(records, null, '2025-06-15');
    expect(out.map((r) => r.id)).toEqual(['1', '2']);
  });

  it('filtra por intervalo completo (ambos inclusivos)', () => {
    const out = filterByDateRange(records, '2025-06-15', '2025-06-20');
    expect(out.map((r) => r.id)).toEqual(['2', '3']);
  });

  it('retorna vazio quando nenhum registro está no intervalo', () => {
    const out = filterByDateRange(records, '2025-08-01', '2025-08-31');
    expect(out).toEqual([]);
  });

  it('retorna vazio quando startDate > endDate', () => {
    const out = filterByDateRange(records, '2025-07-01', '2025-06-01');
    expect(out).toEqual([]);
  });

  it('inclui registro exatamente no limite inferior', () => {
    const out = filterByDateRange(records, '2025-06-15', '2025-06-15');
    expect(out.map((r) => r.id)).toEqual(['2']);
  });

  it('não muta o array original', () => {
    const copy = [...records];
    filterByDateRange(records, '2025-06-15', '2025-06-20');
    expect(records).toEqual(copy);
  });
});

describe('filterByClinic', () => {
  it('retorna todos os registros quando clinicId é null', () => {
    expect(filterByClinic(records, null)).toEqual(records);
  });

  it('retorna registros da clínica especificada', () => {
    const out = filterByClinic(records, 'a');
    expect(out.map((r) => r.id)).toEqual(['1', '3']);
  });

  it('retorna vazio quando nenhum registro pertence à clínica', () => {
    expect(filterByClinic(records, 'zzz')).toEqual([]);
  });

  it('retorna vazio para lista vazia', () => {
    expect(filterByClinic([], 'a')).toEqual([]);
  });

  it('não muta o array original', () => {
    const copy = [...records];
    filterByClinic(records, 'a');
    expect(records).toEqual(copy);
  });
});
