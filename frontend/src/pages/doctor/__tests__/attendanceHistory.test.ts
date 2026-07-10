import { describe, expect, it } from 'vitest';
import { computeLastAttendance } from '../attendanceHistory';
import type { Attendance } from '../../../types';

function att(overrides: Partial<Attendance> & { id: string; checkInTime: string }): Attendance {
  return {
    userId: 'u-1',
    shiftId: 's-1',
    clinicId: 'alpha',
    checkInLatitude: 0,
    checkInLongitude: 0,
    checkInDeviceId: 'd-1',
    biometricValidated: true,
    ...overrides,
  };
}

const clinicName = (id: string) =>
  id === 'alpha' ? 'Clínica Alpha' : id === 'beta' ? 'Clínica Beta' : 'Unidade';

describe('computeLastAttendance', () => {
  it('retorna null/null para histórico vazio', () => {
    expect(computeLastAttendance([], clinicName)).toEqual({
      lastCheckIn: null,
      lastCheckOut: null,
    });
  });

  it('pega o check-in mais recente como último', () => {
    const history = [
      att({ id: 'old', checkInTime: '2025-06-01T08:00:00Z', checkOutTime: '2025-06-01T20:00:00Z' }),
      att({ id: 'new', checkInTime: '2025-07-10T08:00:00Z', checkOutTime: '2025-07-10T20:00:00Z' }),
    ];
    const result = computeLastAttendance(history, clinicName);
    expect(result.lastCheckIn?.dateTime.toISOString()).toBe('2025-07-10T08:00:00.000Z');
  });

  it('quando o último check-in NÃO tem check-out, lastCheckOut fica null (bug corrigido)', () => {
    // Cenário do bug reportado: usuário fez check-in hoje mas ainda não fez
    // check-out; existe check-out de plantão ANTERIOR no histórico. A tela
    // NÃO deve mostrar o check-out antigo.
    const history = [
      att({
        id: 'antigo',
        clinicId: 'beta',
        checkInTime: '2025-07-06T08:00:00Z',
        checkOutTime: '2025-07-06T17:59:00Z', // ← check-out de plantão passado
      }),
      att({
        id: 'atual',
        clinicId: 'beta',
        checkInTime: '2025-07-09T23:04:00Z', // ← plantão em andamento
        // sem checkOutTime
      }),
    ];
    const result = computeLastAttendance(history, clinicName);

    expect(result.lastCheckIn?.dateTime.toISOString()).toBe('2025-07-09T23:04:00.000Z');
    expect(result.lastCheckOut).toBeNull();
  });

  it('quando o último check-in tem check-out, mostra ambos', () => {
    const history = [
      att({
        id: 'atual',
        clinicId: 'alpha',
        checkInTime: '2025-07-10T08:00:00Z',
        checkOutTime: '2025-07-10T20:00:00Z',
      }),
    ];
    const result = computeLastAttendance(history, clinicName);
    expect(result.lastCheckIn?.dateTime.toISOString()).toBe('2025-07-10T08:00:00.000Z');
    expect(result.lastCheckOut?.dateTime.toISOString()).toBe('2025-07-10T20:00:00.000Z');
    // Nome da clínica é resolvido via callback
    expect(result.lastCheckIn?.clinicName).toBe('Clínica Alpha');
    expect(result.lastCheckOut?.clinicName).toBe('Clínica Alpha');
  });

  it('ordena por checkInTime mesmo se o histórico vier fora de ordem', () => {
    const history = [
      att({ id: 'meio', checkInTime: '2025-07-05T08:00:00Z', checkOutTime: '2025-07-05T20:00:00Z' }),
      att({ id: 'novo', checkInTime: '2025-07-10T08:00:00Z' }),
      att({ id: 'antigo', checkInTime: '2025-06-01T08:00:00Z', checkOutTime: '2025-06-01T20:00:00Z' }),
    ];
    const result = computeLastAttendance(history, clinicName);
    expect(result.lastCheckIn?.dateTime.toISOString()).toBe('2025-07-10T08:00:00.000Z');
    expect(result.lastCheckOut).toBeNull(); // novo é o mais recente e não tem check-out
  });

  it('usa a clínica do atendimento mais recente, não a ativa do usuário', () => {
    const history = [
      att({
        id: 'novo',
        clinicId: 'beta',
        checkInTime: '2025-07-10T08:00:00Z',
        checkOutTime: '2025-07-10T20:00:00Z',
      }),
    ];
    const result = computeLastAttendance(history, clinicName);
    expect(result.lastCheckIn?.clinicName).toBe('Clínica Beta');
    expect(result.lastCheckOut?.clinicName).toBe('Clínica Beta');
  });

  it('não muta o histórico original', () => {
    const history = [
      att({ id: 'a', checkInTime: '2025-06-01T08:00:00Z' }),
      att({ id: 'b', checkInTime: '2025-07-10T08:00:00Z' }),
    ];
    const before = history.map((r) => r.id);
    computeLastAttendance(history, clinicName);
    expect(history.map((r) => r.id)).toEqual(before);
  });
});
