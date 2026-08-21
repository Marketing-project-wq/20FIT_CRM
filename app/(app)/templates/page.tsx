import type { Metadata } from "next";
import { ComingSoon } from "@/components/shell/coming-soon";
import { getServerDict } from "@/lib/i18n/server";

export const metadata: Metadata = { title: "Templates" };

export default function Page() {
  const { t } = getServerDict();
  return <ComingSoon title="Templates" description={t.stubs.templates} phase={t.stubs.phase4} />;
}
