import type { Metadata } from "next";
import { ComingSoon } from "@/components/shell/coming-soon";
import { getServerDict } from "@/lib/i18n/server";

export const metadata: Metadata = { title: "Campaigns" };

export default function Page() {
  const { t } = getServerDict();
  return <ComingSoon title="Campaigns" description={t.stubs.campaigns} phase={t.stubs.phase4} />;
}
