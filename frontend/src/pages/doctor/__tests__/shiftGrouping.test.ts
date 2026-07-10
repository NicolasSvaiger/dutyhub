import { describe, expect, it } from 'vitest';
import { groupShifts } from '../shiftGrouping';
import type { Shift } from '../../../types';

function makeShift(overrides: Partial<Shift> & { id: string; date: string }): Shift {
  return {
    clinicId: 'c-1',
    title: 'Plantão',
    startTime: '08:00:00',
    endTime: '20:00:00',
    createdAt: '2025-01-01T00:00:00Z',
    assignments: [],
    ...overrides,
  };
}

/** Segunda-feira ao meio-dia local, longe de fronteiras UTC. */
const REF = new Date(2025, 5, 15, 12, 0, 0); // 2025-06-15

describe('groupShifts', () => {
  it('retorna buckets vazios para lista vazia', () => {
    expect(groupShifts([], REF)).toEqual({ today: [], upcoming: [], past: [] });
  });

  it('coloca shifts de hoje no bucket "today"', () => {
    const shifts = [
      makeShift({ id: 'a', date: '2025-06-15' }),
      makeShift({ id: 'b', date: '2025-06-15T00:00:00Z' }),
    ];
    const g = groupShifts(shifts, REF);
    expect(g.today.map((s) => s.id).sort()).toEqual(['a', 'b']);
    expect(g.upcoming).toEqual([]);
    expect(g.past).toEqual([]);
  });

  it('coloca datas futuras em "upcoming", ordem ascendente', () => {
    const shifts = [
      makeShift({ id: 'c', date: '2025-08-01' }),
      makeShift({ id: 'a', date: '2025-06-20' }),
      makeShift({ id: 'b', date: '2025-07-01' }),
    ];
    const g = groupShifts(shifts, REF);
    expect(g.upcoming.map((s) => s.id)).toEqual(['a', 'b', 'c']);
    expect(g.today).toEqual([]);
    expect(g.past).toEqual([]);
  });

  it('coloca datas passadas em "past", ordem descendente', () => {
    const shifts = [
      makeShift({ id: 'a', date: '2025-01-01' }),
      makeShift({ id: 'c', date: '2025-06-10' }),
      makeShift({ id: 'b', date: '2025-05-15' }),
    ];
    const g = groupShifts(shifts, REF);
    expect(g.past.map((s) => s.id)).toEqual(['c', 'b', 'a']);
    expect(g.today).toEqual([]);
    expect(g.upcoming).toEqual([]);
  });

  it('separa corretamente uma mistura de passado, hoje e futuro', () => {
    const shifts = [
      makeShift({ id: 'past-1', date: '2025-06-01' }),
      makeShift({ id: 'today-1', date: '2025-06-15' }),
      makeShift({ id: 'up-1', date: '2025-06-16' }),
      makeShift({ id: 'up-2', date: '2025-06-20' }),
      makeShift({ id: 'past-2', date: '2025-06-14' }),
    ];
    const g = groupShifts(shifts, REF);
    expect(g.today.map((s) => s.id)).toEqual(['today-1']);
    expect(g.upcoming.map((s) => s.id)).toEqual(['up-1', 'up-2']);
    expect(g.past.map((s) => s.id)).toEqual(['past-2', 'past-1']);
  });

  it('usa apenas a porção YYYY-MM-DD ignorando o horário na data', () => {
    const shifts = [
      makeShift({ id: 'ontem-tarde', date: '2025-06-14T23:59:59Z' }),
      makeShift({ id: 'hoje-inicio', date: '2025-06-15T00:00:01Z' }),
      makeShift({ id: 'amanha-cedo', date: '2025-06-16T00:00:00Z' }),
    ];
    const g = groupShifts(shifts, REF);
    expect(g.past.map((s) => s.id)).toEqual(['ontem-tarde']);
    expect(g.today.map((s) => s.id)).toEqual(['hoje-inicio']);
    expect(g.upcoming.map((s) => s.id)).toEqual(['amanha-cedo']);
  });

  it('respeita referenceDate customizado (função pura, sem depender de "agora")', () => {
    const shifts = [
      makeShift({ id: 'a', date: '2024-01-01' }),
      makeShift({ id: 'b', date: '2024-01-02' }),
      makeShift({ id: 'c', date: '2024-01-03' }),
    ];
    const g = groupShifts(shifts, new Date(2024, 0, 2, 10));
    expect(g.past.map((s) => s.id)).toEqual(['a']);
    expect(g.today.map((s) => s.id)).toEqual(['b']);
    expect(g.upcoming.map((s) => s.id)).toEqual(['c']);
  });

  it('usa new Date() como default quando referenceDate não é passado', () => {
    const today = new Date();
    const y = today.getFullYear();
    const m = String(today.getMonth() + 1).padStart(2, '0');
    const d = String(today.getDate()).padStart(2, '0');
    const g = groupShifts([makeShift({ id: 'x', date: `${y}-${m}-${d}` })]);
    expect(g.today.map((s) => s.id)).toEqual(['x']);
  });
});
