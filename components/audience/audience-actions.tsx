"use client";

import Link from "next/link";
import { Upload } from "lucide-react";
import { useI18n } from "@/components/i18n/lang-provider";
import { AddContactDialog } from "./add-contact-dialog";
import { DownloadTemplateBtn } from "./download-template-btn";

export function AudienceActions() {
  const { t } = useI18n();
  return (
    <div className="flex flex-wrap items-center gap-2">
      <AddContactDialog />
      <DownloadTemplateBtn />
      <Link
        href="/audience/import"
        className="inline-flex items-center gap-1.5 rounded-sm border border-glass-border bg-glass px-3 py-1.5 font-body text-[13px] text-ink hover:border-red"
      >
        <Upload className="h-4 w-4" aria-hidden />
        {t.audience.importCsv}
      </Link>
    </div>
  );
}
