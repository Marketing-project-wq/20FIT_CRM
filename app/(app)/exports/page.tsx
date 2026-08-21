import type { Metadata } from "next";
import { ComingSoon } from "@/components/shell/coming-soon";
import { getServerDict } from "@/lib/i18n/server";

export const metadata: Metadata = { title: "Exports" };

export default function Page() {
  const { t } = getServerDict();
  return <ComingSoon title="Exports" description={t.stubs.exports} phase={t.stubs.phase3} />;
}
