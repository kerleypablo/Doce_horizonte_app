import { useCallback, useEffect, useState } from 'react';

type CacheEntry<T> = {
  data?: T;
  updatedAt: number;
  promise?: Promise<T>;
};

const cache = new Map<string, CacheEntry<unknown>>();

const getEntry = <T,>(key: string) => cache.get(key) as CacheEntry<T> | undefined;

const isFresh = (updatedAt: number, staleTime: number) => Date.now() - updatedAt < staleTime;

export const clearQueryCache = () => {
  cache.clear();
};

export const invalidateQueryCache = (prefix: string) => {
  for (const key of cache.keys()) {
    if (key === prefix || key.startsWith(`${prefix}:`)) {
      cache.delete(key);
    }
  }
};

type FetchWithCacheOptions = {
  staleTime?: number;
  force?: boolean;
};

export const fetchWithCache = async <T,>(
  key: string,
  fetcher: () => Promise<T>,
  options?: FetchWithCacheOptions
) => {
  const staleTime = options?.staleTime ?? 60_000;
  const force = options?.force ?? false;

  const current = getEntry<T>(key);
  if (!force && current?.data !== undefined && isFresh(current.updatedAt, staleTime)) {
    return current.data;
  }

  if (!force && current?.promise) {
    return current.promise;
  }

  const promise = fetcher()
    .then((data) => {
      cache.set(key, { data, updatedAt: Date.now() });
      return data;
    })
    .finally(() => {
      const latest = getEntry<T>(key);
      if (latest?.promise) {
        cache.set(key, {
          data: latest.data,
          updatedAt: latest.updatedAt
        });
      }
    });

  cache.set(key, { data: current?.data, updatedAt: current?.updatedAt ?? 0, promise });
  return promise;
};

export const prefetchWithCache = async <T,>(
  key: string,
  fetcher: () => Promise<T>,
  options?: FetchWithCacheOptions
) => {
  try {
    await fetchWithCache<T>(key, fetcher, options);
  } catch {
    // Prefetch should never break UI flow.
  }
};

type UseCachedQueryOptions = {
  staleTime?: number;
  enabled?: boolean;
  refetchOnWindowFocus?: boolean;
  refetchOnReconnect?: boolean;
  refetchInterval?: number;
};

export const useCachedQuery = <T,>(
  key: string,
  fetcher: () => Promise<T>,
  options?: UseCachedQueryOptions
) => {
  const staleTime = options?.staleTime ?? 60_000;
  const enabled = options?.enabled ?? true;
  const refetchOnWindowFocus = options?.refetchOnWindowFocus ?? true;
  const refetchOnReconnect = options?.refetchOnReconnect ?? true;
  const refetchInterval = options?.refetchInterval;
  const initial = getEntry<T>(key);
  const hasFreshInitial = Boolean(initial?.data !== undefined && isFresh(initial.updatedAt, staleTime));

  const [data, setData] = useState<T | undefined>(() => (hasFreshInitial ? initial?.data : undefined));
  const [loading, setLoading] = useState(Boolean(enabled && !hasFreshInitial));
  const [isFetching, setIsFetching] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const run = useCallback(
    async (force = false) => {
      if (!enabled) return undefined;
      const hasData = getEntry<T>(key)?.data !== undefined;
      setLoading(!hasData);
      setIsFetching(true);
      setError(null);
      try {
        const next = await fetchWithCache<T>(key, fetcher, { staleTime, force });
        setData(next);
        return next;
      } catch (err) {
        const nextError = err instanceof Error ? err : new Error('Erro ao carregar dados');
        setError(nextError);
        throw nextError;
      } finally {
        setLoading(false);
        setIsFetching(false);
      }
    },
    [enabled, fetcher, key, staleTime]
  );

  useEffect(() => {
    if (!enabled) return;
    const current = getEntry<T>(key);
    if (current?.data !== undefined && isFresh(current.updatedAt, staleTime)) {
      setData(current.data);
      setLoading(false);
      return;
    }
    run(false).catch(() => undefined);
  }, [enabled, key, run, staleTime]);

  useEffect(() => {
    if (!enabled || !refetchOnWindowFocus || typeof window === 'undefined') return;
    const onFocus = () => {
      run(false).catch(() => undefined);
    };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onFocus);
    return () => {
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onFocus);
    };
  }, [enabled, refetchOnWindowFocus, run]);

  useEffect(() => {
    if (!enabled || !refetchOnReconnect || typeof window === 'undefined') return;
    const onOnline = () => {
      run(false).catch(() => undefined);
    };
    window.addEventListener('online', onOnline);
    return () => window.removeEventListener('online', onOnline);
  }, [enabled, refetchOnReconnect, run]);

  useEffect(() => {
    if (!enabled || !refetchInterval || refetchInterval <= 0) return;
    const timer = window.setInterval(() => {
      run(false).catch(() => undefined);
    }, refetchInterval);
    return () => window.clearInterval(timer);
  }, [enabled, refetchInterval, run]);

  return {
    data,
    loading,
    isFetching,
    error,
    refetch: () => run(true)
  };
};
