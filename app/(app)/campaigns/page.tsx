import type { Metadata } from "next";
import { ComingSoon } from "@/components/shell/coming-soon";

export const metadata: Metadata = { title: "Campaigns" };

export default function Page() {
  return (
    <ComingSoon
      title="Campaigns"
      description="Kampanye manual: pilih segmen, pilih template, lihat estimasi biaya, minta persetujuan, kirim."
      phase="Fase 4"
    />
  );
}
