/**
 * Cache local (localStorage) de respostas que precisam funcionar offline —
 * plantões de hoje e check-ins ativos. A ideia é simples:
 *
 *   1. Quando online, `remember(key, data)` grava a última resposta boa.
 *   2. Quando offline, `recall(key)` devolve o último snapshot conhecido.
 *
 * Cada entrada guarda um timestamp para permitir que a UI exiba
 * "Dados de X min atrás" se precisar avisar o usuário.
 */

const PREFIX = 'plantonhub_offline_cache:';

interface CacheEntry<T> {
  data: T;
  savedAt: number; // epoch ms
}

/** Persiste `data` no localStorage sob a chave dada. Falhas são silenciosas. */
export function remember<T>(key: string, data: T): void {
  try {
    const entry: CacheEntry<T> = { data, savedAt: Date.now() };
    window.localStorage.setItem(PREFIX + key, JSON.stringify(entry));
  } catch {
    // Storage cheio / private mode / etc. — ignora, cache é best-effort.
  }
}

/** Lê a entrada do cache, ou null se não existe ou está inválida. */
export function recall<T>(key: string): { data: T; savedAt: number } | null {
  try {
    const raw = window.localStorage.getItem(PREFIX + key);
    if (!raw) return null;
    const entry = JSON.parse(raw) as CacheEntry<T>;
    if (!entry || typeof entry.savedAt !== 'number') return null;
    return entry;
  } catch {
    return null;
  }
}

/** Chaves de cache padronizadas pra evitar colisões e typos. */
export const OfflineCacheKeys = {
  shiftsToday: (clinicId: string | undefined) =>
    `shifts_today:${clinicId ?? 'default'}`,
  activeAttendance: (userId: string | undefined) =>
    `attendance_active:${userId ?? 'default'}`,
};
