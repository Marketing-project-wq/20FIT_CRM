import type { Metadata } from "next";
import { ComingSoon } from "@/components/shell/coming-soon";

export const metadata: Metadata = { title: "Settings" };

export default function Page() {
  return (
    <ComingSoon
      title="Settings"
      description="Peran RBAC enam peran, ambang, jam tenang, batas frekuensi, bobot skor, status integrasi."
      phase="Sprint 2"
    />
  );
}
