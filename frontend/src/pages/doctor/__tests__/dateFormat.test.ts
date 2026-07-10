import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { formatDate } from '../dateFormat';

describe('formatDate', () => {
  it('formata data padrão como DD/MM/YYYY', () => {
    expect(formatDate(new Date(2024, 0, 15))).toBe('15/01/2024');
  });

  it('faz padding de dia com um dígito', () => {
    expect(formatDate(new Date(2024, 4, 5))).toBe('05/05/2024');
  });

  it('faz padding de mês com um dígito', () => {
    expect(formatDate(new Date(2024, 8, 20))).toBe('20/09/2024');
  });

  it('trata primeiro dia do ano', () => {
    expect(formatDate(new Date(2025, 0, 1))).toBe('01/01/2025');
  });

  it('trata último dia do ano', () => {
    expect(formatDate(new Date(2025, 11, 31))).toBe('31/12/2025');
  });

  it('lida com anos de 4 dígitos sem truncar', () => {
    expect(formatDate(new Date(1999, 11, 31))).toBe('31/12/1999');
    expect(formatDate(new Date(2100, 5, 10))).toBe('10/06/2100');
  });

  it('propriedade: comprimento sempre 10 e formato DD/MM/YYYY', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 2000, max: 2099 }),
        fc.integer({ min: 0, max: 11 }),
        fc.integer({ min: 1, max: 28 }),
        (y, m, d) => {
          const s = formatDate(new Date(y, m, d));
          expect(s).toHaveLength(10);
          expect(s).toMatch(/^\d{2}\/\d{2}\/\d{4}$/);
        },
      ),
    );
  });
});
