import type { Metadata } from "next";
import { ComingSoon } from "@/components/shell/coming-soon";

export const metadata: Metadata = { title: "Exports" };

export default function Page() {
  return (
    <ComingSoon
      title="Exports"
      description="Riwayat ekspor dengan pemohon, tujuan, jumlah baris, dan status persetujuan."
      phase="Fase 3"
    />
  );
}
