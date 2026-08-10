import type { Metadata } from "next";
import { ComingSoon } from "@/components/shell/coming-soon";

export const metadata: Metadata = { title: "Audience" };

export default function Page() {
  return (
    <ComingSoon
      title="Audience"
      description="Pool audiens tunggal 82.253 baris — tabel tervirtualisasi, filter, saved views, dan segment builder inline."
      phase="Sprint 3"
    />
  );
}
