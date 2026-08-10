import type { Metadata } from "next";
import { ComingSoon } from "@/components/shell/coming-soon";

export const metadata: Metadata = { title: "Templates" };

export default function Page() {
  return (
    <ComingSoon
      title="Templates"
      description="Register template WhatsApp dan email dengan status persetujuan Meta dan kategori."
      phase="Fase 4"
    />
  );
}
