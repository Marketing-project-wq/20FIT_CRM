import type { Metadata } from "next";
import { ComingSoon } from "@/components/shell/coming-soon";
import { getServerDict } from "@/lib/i18n/server";

export const metadata: Metadata = { title: "Messages" };

export default function Page() {
  const { t } = getServerDict();
  return <ComingSoon title="Messages" description={t.stubs.messages} phase={t.stubs.phase4} />;
}
