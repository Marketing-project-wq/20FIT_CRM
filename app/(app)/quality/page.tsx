import type { Metadata } from "next";
import { ComingSoon } from "@/components/shell/coming-soon";

export const metadata: Metadata = { title: "Quality" };

export default function Page() {
  return (
    <ComingSoon
      title="Quality"
      description="Kualitas data: fill rate, antrean orphan, duplikat, identifier tidak valid, skor basi."
      phase="Fase 1"
    />
  );
}
