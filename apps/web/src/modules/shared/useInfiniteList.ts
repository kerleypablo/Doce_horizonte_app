import { useCallback, useEffect, useRef, useState } from 'react';

export type PaginatedResponse<T> = {
  items: T[];
  hasMore: boolean;
};

type UseInfiniteListOptions<T> = {
  enabled: boolean;
  resetKey: string;
  fetchPage: (offset: number) => Promise<PaginatedResponse<T>>;
};

export const useInfiniteList = <T,>({ enabled, resetKey, fetchPage }: UseInfiniteListOptions<T>) => {
  const fetchPageRef = useRef(fetchPage);
  const requestIdRef = useRef(0);
  const itemsCountRef = useRef(0);
  const [items, setItems] = useState<T[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);

  useEffect(() => {
    fetchPageRef.current = fetchPage;
  }, [fetchPage]);

  useEffect(() => {
    itemsCountRef.current = items.length;
  }, [items.length]);

  const load = useCallback(async (reset: boolean) => {
    if (!enabled) return;
    const requestId = ++requestIdRef.current;
    const offset = reset ? 0 : itemsCountRef.current;
    if (reset) setLoading(true);
    else setLoadingMore(true);

    try {
      const page = await fetchPageRef.current(offset);
      if (requestId !== requestIdRef.current) return;
      setItems((current) => reset ? page.items : [...current, ...page.items]);
      setHasMore(page.hasMore);
    } finally {
      if (requestId === requestIdRef.current) {
        setLoading(false);
        setLoadingMore(false);
      }
    }
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return;
    const timer = window.setTimeout(() => { void load(true); }, 300);
    return () => window.clearTimeout(timer);
  }, [enabled, load, resetKey]);

  const loadMore = useCallback(() => {
    if (!enabled || loading || loadingMore || !hasMore) return;
    void load(false);
  }, [enabled, hasMore, load, loading, loadingMore]);

  const refresh = useCallback(() => load(true), [load]);

  return { items, loading, loadingMore, hasMore, loadMore, refresh, setItems };
};
