import { PageSkeleton, Bone, TableSkeleton } from "@/components/shell/page-skeleton";

export default function CampaignsLoading() {
  return (
    <PageSkeleton>
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-2">
          <Bone className="h-9 w-44" />
          <Bone className="h-4 w-64" />
        </div>
        <Bone className="h-9 w-32 rounded-sm" />
      </div>
      <div className="flex gap-2">
        <Bone className="h-9 w-24 rounded-full" />
        <Bone className="h-9 w-24 rounded-full" />
        <Bone className="h-9 w-24 rounded-full" />
      </div>
      <TableSkeleton rows={5} cols={5} />
    </PageSkeleton>
  );
}
