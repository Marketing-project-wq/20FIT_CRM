import { PageSkeleton, Bone } from "@/components/shell/page-skeleton";

export default function BodLoading() {
  return (
    <PageSkeleton>
      <div className="flex flex-col gap-2">
        <Bone className="h-9 w-52" />
        <Bone className="h-4 w-72" />
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Bone className="h-28 rounded-card" />
        <Bone className="h-28 rounded-card" />
        <Bone className="h-28 rounded-card" />
        <Bone className="h-28 rounded-card" />
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Bone className="h-56 rounded-card" />
        <Bone className="h-56 rounded-card" />
      </div>
    </PageSkeleton>
  );
}
