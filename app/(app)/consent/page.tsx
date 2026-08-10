import type { Metadata } from "next";
import { ComingSoon } from "@/components/shell/coming-soon";

export const metadata: Metadata = { title: "Consent" };

export default function Page() {
  return (
    <ComingSoon
      title="Consent"
      description="Consent register, suppression list, dan unsubscribe. Prasyarat semua pengiriman marketing."
      phase="Fase 2"
    />
  );
}
