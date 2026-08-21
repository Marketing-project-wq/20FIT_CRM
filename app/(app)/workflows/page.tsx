import type { Metadata } from "next";
import { ComingSoon } from "@/components/shell/coming-soon";
import { getServerDict } from "@/lib/i18n/server";

export const metadata: Metadata = { title: "Workflows" };

export default function Page() {
  const { t } = getServerDict();
  return <ComingSoon title="Workflows" description={t.stubs.workflows} phase={t.stubs.phase4} />;
}
