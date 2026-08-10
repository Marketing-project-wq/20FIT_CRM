import type { Metadata } from "next";
import { ComingSoon } from "@/components/shell/coming-soon";

export const metadata: Metadata = { title: "Segments" };

export default function Page() {
  return (
    <ComingSoon
      title="Segments"
      description="Segment builder visual dengan aturan bersarang AND/OR dan hitungan langsung yang bisa dihubungi."
      phase="Fase 3"
    />
  );
}
