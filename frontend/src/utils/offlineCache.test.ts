/**
 * @vitest-environment jsdom
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { remember, recall, OfflineCacheKeys } from './offlineCache';

describe('offlineCache', () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.restoreAllMocks();
  });

  describe('remember / recall', () => {
    it('grava e devolve o mesmo payload', () => {
      remember('foo', { a: 1, b: 'x' });
      const entry = recall<{ a: number; b: string }>('foo');
      expect(entry).not.toBeNull();
      expect(entry!.data).toEqual({ a: 1, b: 'x' });
      expect(typeof entry!.savedAt).toBe('number');
    });

    it('grava savedAt como timestamp atual (aprox.)', () => {
      const before = Date.now();
      remember('t', 42);
      const after = Date.now();
      const entry = recall<number>('t');
      expect(entry!.savedAt).toBeGreaterThanOrEqual(before);
      expect(entry!.savedAt).toBeLessThanOrEqual(after);
    });

    it('devolve null quando chave não existe', () => {
      expect(recall('inexistente')).toBeNull();
    });

    it('devolve null quando conteúdo é JSON inválido', () => {
      window.localStorage.setItem('plantonhub_offline_cache:bad', '{not-json');
      expect(recall('bad')).toBeNull();
    });

    it('devolve null quando entrada não tem savedAt numérico', () => {
      window.localStorage.setItem(
        'plantonhub_offline_cache:invalid',
        JSON.stringify({ data: 1, savedAt: 'nope' }),
      );
      expect(recall('invalid')).toBeNull();
    });

    it('sobrescreve entrada existente ao chamar remember novamente', () => {
      remember('k', 'v1');
      remember('k', 'v2');
      expect(recall<string>('k')!.data).toBe('v2');
    });

    it('preserva arrays e objetos aninhados via JSON.parse', () => {
      const payload = {
        items: [{ id: '1' }, { id: '2' }],
        meta: { total: 2 },
      };
      remember('deep', payload);
      expect(recall<typeof payload>('deep')!.data).toEqual(payload);
    });

    it('remember é silencioso quando setItem lança', () => {
      const spy = vi
        .spyOn(Storage.prototype, 'setItem')
        .mockImplementation(() => {
          throw new Error('QuotaExceededError');
        });
      expect(() => remember('x', 1)).not.toThrow();
      spy.mockRestore();
    });

    it('recall é silencioso quando getItem lança', () => {
      const spy = vi
        .spyOn(Storage.prototype, 'getItem')
        .mockImplementation(() => {
          throw new Error('SecurityError');
        });
      expect(recall('x')).toBeNull();
      spy.mockRestore();
    });

    it('usa prefixo próprio, sem colidir com outras chaves', () => {
      window.localStorage.setItem('foo', 'plain');
      remember('foo', 'cached');
      expect(window.localStorage.getItem('foo')).toBe('plain');
      expect(recall<string>('foo')!.data).toBe('cached');
    });
  });

  describe('OfflineCacheKeys', () => {
    it('shiftsToday inclui clinicId', () => {
      expect(OfflineCacheKeys.shiftsToday('abc')).toBe('shifts_today:abc');
    });

    it('shiftsToday usa "default" quando clinicId é undefined', () => {
      expect(OfflineCacheKeys.shiftsToday(undefined)).toBe(
        'shifts_today:default',
      );
    });

    it('activeAttendance inclui userId', () => {
      expect(OfflineCacheKeys.activeAttendance('user-1')).toBe(
        'attendance_active:user-1',
      );
    });

    it('activeAttendance usa "default" quando userId é undefined', () => {
      expect(OfflineCacheKeys.activeAttendance(undefined)).toBe(
        'attendance_active:default',
      );
    });

    it('shiftsToday e activeAttendance não colidem entre si', () => {
      expect(OfflineCacheKeys.shiftsToday('x')).not.toBe(
        OfflineCacheKeys.activeAttendance('x'),
      );
    });
  });
});
