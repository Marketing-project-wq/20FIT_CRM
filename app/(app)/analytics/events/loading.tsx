import { PageSkeleton, Bone, TableSkeleton } from "@/components/shell/page-skeleton";

export default function EventAnalysisLoading() {
  return (
    <PageSkeleton>
      <div className="flex flex-col gap-2">
        <Bone className="h-9 w-56" />
        <Bone className="h-4 w-80" />
        <Bone className="h-3 w-48" />
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Bone className="h-24 rounded-card" />
        <Bone className="h-24 rounded-card" />
        <Bone className="h-24 rounded-card" />
      </div>
      <TableSkeleton rows={6} cols={4} />
      <Bone className="h-48 rounded-card" />
    </PageSkeleton>
  );
}
