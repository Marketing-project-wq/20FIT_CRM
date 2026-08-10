import type { Metadata } from "next";
import { ComingSoon } from "@/components/shell/coming-soon";

export const metadata: Metadata = { title: "Messages" };

export default function Page() {
  return (
    <ComingSoon
      title="Messages"
      description="Log setiap pengiriman — kanal, status, dan alasan pemblokiran yang selalu terlihat."
      phase="Fase 4"
    />
  );
}
