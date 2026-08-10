import { Badge } from "@/components/ui/badge";
import { StatCard } from "./stat-card";

function todayWIB(): string {
  return new Intl.DateTimeFormat("id-ID", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Asia/Jakarta",
  }).format(new Date());
}

/** Dashboard body. Shared by the authenticated route and the dev shell preview. */
export function DashboardContent() {
  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-[32px] font-black uppercase leading-none text-ink">
            Dashboard
          </h1>
          <p className="mt-2 font-body text-[14px] text-ink-soft">Audience Data &amp; CRM 20FIT</p>
        </div>
        <p className="font-mono text-[12px] text-ink-faint">{todayWIB()} · WIB</p>
      </header>

      {/* Never a total without a contactable count (PRD §18.8) — both placeholders here. */}
      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Ukuran audiens" hint="belum terhubung" />
        <StatCard label="Bisa dihubungi" hint="belum terhubung" />
        <StatCard label="Profil baru · 7 hari" hint="belum terhubung" />
        <StatCard label="Workflow aktif" hint="belum terhubung" />
      </section>

      <section className="glass shadow-glass p-6">
        <div className="flex items-center gap-3">
          <Badge tone="amber">Sprint 1</Badge>
          <h2 className="font-display text-[22px] font-extrabold uppercase tracking-wide text-ink">
            Fondasi terpasang
          </h2>
        </div>
        <p className="mt-3 max-w-2xl font-body text-[14px] leading-relaxed text-ink-soft">
          Ini shell aplikasi. Data pelanggan belum terhubung — angka menyala setelah migrasi{" "}
          <span className="font-mono text-ink">crm_*</span> dan ingestion di Sprint 2–3. Tidak ada
          tabel pelanggan yang dikueri di sprint ini.
        </p>
        <p className="mt-4 max-w-2xl font-body text-[13px] leading-relaxed text-ink-soft">
          Prinsip antarmuka yang dipegang sejak awal: total selalu berdampingan dengan jumlah yang
          bisa dihubungi, biaya tampil sebelum kirim, dan pemblokiran selalu terlihat beserta
          alasannya.
        </p>
      </section>
    </div>
  );
}
