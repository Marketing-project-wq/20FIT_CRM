import type { Metadata } from "next";
import { ComingSoon } from "@/components/shell/coming-soon";

export const metadata: Metadata = { title: "Workflows" };

export default function Page() {
  return (
    <ComingSoon
      title="Workflows"
      description="Mesin workflow marketing dengan sembilan guard. Diblokir sampai consent register aktif."
      phase="Fase 4"
    />
  );
}
