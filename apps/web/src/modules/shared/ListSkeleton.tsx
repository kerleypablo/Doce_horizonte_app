type ListSkeletonProps = {
  rows?: number;
  withTableHead?: boolean;
};

export const ListSkeleton = ({ rows = 5, withTableHead = false }: ListSkeletonProps) => {
  return (
    <div className="table">
      {withTableHead && (
        <div className="table-head">
          <span className="skeleton-line skeleton-line-sm" />
          <span className="skeleton-line skeleton-line-sm" />
          <span className="skeleton-line skeleton-line-sm" />
          <span className="skeleton-line skeleton-line-sm" />
        </div>
      )}
      {Array.from({ length: rows }).map((_, index) => (
        <div key={index} className="list-row">
          <div className="skeleton-block">
            <span className="skeleton-line skeleton-line-lg" />
            <span className="skeleton-line skeleton-line-md" />
          </div>
          <span className="skeleton-dot" />
        </div>
      ))}
    </div>
  );
};
