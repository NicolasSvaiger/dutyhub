import type { Attendance } from '../../types';
import type { ConfirmationData } from './types';

/**
 * Calcula o "último check-in" e "último check-out" para a tela Presença.
 *
 * Regra:
 *   - Último check-in: mais recente por `checkInTime`, sempre.
 *   - Último check-out: o `checkOutTime` DO MESMO atendimento do último
 *     check-in. Se esse atendimento ainda não tem check-out (plantão ativo),
 *     `lastCheckOut` fica `null` — não mostramos check-out de plantão
 *     anterior, isso confundia o usuário.
 *
 * Função pura para facilitar testes e reuso. `resolveClinicName` permite
 * ao chamador injetar a lookup do nome da clínica sem trazer o context aqui.
 */
export interface LastAttendance {
  lastCheckIn: ConfirmationData | null;
  lastCheckOut: ConfirmationData | null;
}

export function computeLastAttendance(
  history: readonly Attendance[],
  resolveClinicName: (clinicId: string) => string,
): LastAttendance {
  if (history.length === 0) {
    return { lastCheckIn: null, lastCheckOut: null };
  }

  const sorted = [...history].sort(
    (a, b) => new Date(b.checkInTime).getTime() - new Date(a.checkInTime).getTime(),
  );

  const latest = sorted[0];
  const lastCheckIn: ConfirmationData = {
    type: 'checkin',
    dateTime: new Date(latest.checkInTime),
    clinicName: resolveClinicName(latest.clinicId),
  };

  const lastCheckOut: ConfirmationData | null = latest.checkOutTime
    ? {
        type: 'checkout',
        dateTime: new Date(latest.checkOutTime),
        clinicName: resolveClinicName(latest.clinicId),
      }
    : null;

  return { lastCheckIn, lastCheckOut };
}
