import { useEffect, useRef } from 'react';

type InfiniteScrollSentinelProps = {
  hasMore: boolean;
  loading: boolean;
  onVisible: () => void;
};

export const InfiniteScrollSentinel = ({ hasMore, loading, onVisible }: InfiniteScrollSentinelProps) => {
  const elementRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const element = elementRef.current;
    if (!element || !hasMore || loading) return;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) onVisible();
    }, { rootMargin: '240px' });
    observer.observe(element);
    return () => observer.disconnect();
  }, [hasMore, loading, onVisible]);

  if (!hasMore && !loading) return null;
  return <div ref={elementRef} className="infinite-scroll-sentinel" aria-live="polite">{loading ? 'Carregando mais...' : ''}</div>;
};
