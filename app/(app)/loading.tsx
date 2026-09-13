import { PageSkeleton, GenericSkeleton } from "@/components/shell/page-skeleton";

export default function Loading() {
  return (
    <PageSkeleton>
      <GenericSkeleton />
    </PageSkeleton>
  );
}
