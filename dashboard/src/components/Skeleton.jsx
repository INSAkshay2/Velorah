export function CardSkeleton({ className = "" }) {
  return (
    <div className={`animate-pulse rounded-xl bg-gray-200 dark:bg-gray-800 ${className}`} />
  );
}

export function ChartSkeleton() {
  return (
    <div className="rounded-xl border border-gray-200 dark:border-gray-700 p-4">
      <div className="animate-pulse space-y-3">
        <div className="h-4 w-32 rounded bg-gray-200 dark:bg-gray-800" />
        <div className="h-48 rounded bg-gray-200 dark:bg-gray-800" />
      </div>
    </div>
  );
}

export function TableSkeleton({ rows = 5 }) {
  return (
    <div className="rounded-xl border border-gray-200 dark:border-gray-700 p-4">
      <div className="animate-pulse space-y-3">
        <div className="h-4 w-40 rounded bg-gray-200 dark:bg-gray-800" />
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="h-8 rounded bg-gray-200 dark:bg-gray-800" />
        ))}
      </div>
    </div>
  );
}
