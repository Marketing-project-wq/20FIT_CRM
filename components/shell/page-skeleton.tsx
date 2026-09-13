export function Bone({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded bg-surface-border ${className}`} />;
}

export function PageSkeleton({ children }: { children?: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-6">
      {children ?? <GenericSkeleton />}
    </div>
  );
}

export function GenericSkeleton() {
  return (
    <>
      <div className="flex flex-col gap-2">
        <Bone className="h-8 w-48" />
        <Bone className="h-4 w-72" />
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Bone className="h-24 rounded-card" />
        <Bone className="h-24 rounded-card" />
        <Bone className="h-24 rounded-card" />
      </div>
      <Bone className="h-64 rounded-card" />
    </>
  );
}

export function TableSkeleton({ rows = 5, cols = 4 }: { rows?: number; cols?: number }) {
  return (
    <div className="card overflow-hidden p-0">
      <div className="border-b border-surface-border px-4 py-3">
        <Bone className="h-3 w-full" />
      </div>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex gap-4 border-b border-surface-border/50 px-4 py-3 last:border-0">
          {Array.from({ length: cols }).map((_, j) => (
            <Bone key={j} className={`h-4 ${j === 0 ? "w-32" : "w-16"}`} />
          ))}
        </div>
      ))}
    </div>
  );
}
