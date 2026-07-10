import { useCallback, useEffect, useRef, useState } from 'react';
import { isNetworkError } from '../utils/networkError';
import { recall, remember } from '../utils/offlineCache';

export interface OfflineQueryState<T> {
  /** Dados retornados (do servidor ou do cache). null se ainda não resolveu. */
  data: T | null;
  /** True enquanto a requisição está em voo. */
  loading: boolean;
  /** Mensagem de erro (rede offline sem cache, ou erro inesperado). */
  error: string | null;
  /** True quando os dados vieram do cache local, não do servidor. */
  fromCache: boolean;
  /** Dispara um refetch manual (mesma key). */
  refetch: () => void;
}

/**
 * Hook genérico que encapsula o padrão:
 *   1. Tenta buscar dados do servidor via `fetcher()`
 *   2. Se sucesso: persiste no cache local via `remember(cacheKey, data)`
 *   3. Se falha por rede: tenta `recall(cacheKey)` como fallback
 *   4. Se falha por outro motivo: propaga o erro
 *
 * Dispara automaticamente quando `cacheKey` ou `deps` mudam. Também expõe
 * `refetch()` pra chamadas imperativas (ex: após um check-in bem-sucedido).
 *
 * @param fetcher - Função async que retorna os dados do servidor.
 * @param cacheKey - Chave usada no offlineCache (prefixada automaticamente internamente).
 * @param deps - Array de dependências extras que disparam refetch automático.
 * @param offlineErrorMessage - Mensagem amigável quando está offline e sem cache.
 */
export function useOfflineQuery<T>(
  fetcher: () => Promise<T>,
  cacheKey: string,
  deps: readonly unknown[] = [],
  offlineErrorMessage = 'Sem conexão e sem dados locais para exibir.',
): OfflineQueryState<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [fromCache, setFromCache] = useState(false);

  // Ref estável do fetcher pra não disparar useEffect toda vez que fecha/abre o componente
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  const execute = useCallback(async () => {
    setLoading(true);
    setError(null);
    setFromCache(false);

    try {
      const result = await fetcherRef.current();
      remember(cacheKey, result);
      setData(result);
    } catch (err) {
      if (isNetworkError(err)) {
        const cached = recall<T>(cacheKey);
        if (cached) {
          setData(cached.data);
          setFromCache(true);
        } else {
          setError(offlineErrorMessage);
        }
      } else {
        const message = err instanceof Error ? err.message : 'Erro inesperado.';
        setError(message);
      }
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cacheKey, offlineErrorMessage]);

  // Auto-fetch quando cacheKey ou deps extras mudam
  useEffect(() => {
    void execute();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [execute, ...deps]);

  return { data, loading, error, fromCache, refetch: execute };
}
