"use client";

import { useCallback } from "react";
import { Download } from "lucide-react";
import { useI18n } from "@/components/i18n/lang-provider";

const HEADER = [
  "Email",
  "Nama Lengkap",
  "No Telepon",
  "Gender",
  "Domisili",
  "Tanggal Lahir",
  "Acara",
  "Kategori",
  "Sumber",
  "Tipe",
  "Peran",
  "Produk",
  "Format",
  "Nilai",
];

const EXAMPLE_ROWS = [
  [
    "budi@contoh.com",
    "Budi Santoso",
    "08123456789",
    "L",
    "Jakarta",
    "1990-05-15",
    "sportfest-2",
    "5k",
    "instagram",
    "member",
    "peserta",
    "gym-membership",
    "offline",
    "300k-1jt",
  ],
  [
    "sari@contoh.com",
    "Sari Dewi",
    "08198765432",
    "P",
    "Bandung",
    "1985-12-03",
    "",
    "10k",
    "referral",
    "",
    "",
    "",
    "online",
    "",
  ],
];

function toCsvLine(cells: string[]): string {
  return cells
    .map((c) => {
      if (c.includes(",") || c.includes('"') || c.includes("\n")) {
        return `"${c.replace(/"/g, '""')}"`;
      }
      return c;
    })
    .join(",");
}

export function DownloadTemplateBtn() {
  const { t } = useI18n();

  const handleDownload = useCallback(() => {
    const lines = [toCsvLine(HEADER), ...EXAMPLE_ROWS.map(toCsvLine)];
    const csv = lines.join("\r\n") + "\r\n";
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "template-import-crm-20fit.csv";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, []);

  return (
    <button
      type="button"
      onClick={handleDownload}
      className="inline-flex items-center gap-1.5 rounded-sm border border-glass-border bg-glass px-3 py-1.5 font-body text-[13px] text-ink hover:border-red"
    >
      <Download className="h-4 w-4" aria-hidden />
      {t.audience.downloadTemplate}
    </button>
  );
}
