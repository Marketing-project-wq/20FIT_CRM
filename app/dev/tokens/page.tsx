import type { Metadata } from "next";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DevBanner } from "@/components/dev/dev-banner";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogClose,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { StatCard } from "@/components/dashboard/stat-card";

export const metadata: Metadata = { title: "Design tokens" };

const SWATCHES = [
  { token: "--red", cls: "bg-red" },
  { token: "--blue", cls: "bg-blue" },
  { token: "--amber", cls: "bg-amber" },
  { token: "--green", cls: "bg-green" },
  { token: "--ink", cls: "bg-ink" },
  { token: "--ink-soft", cls: "bg-ink-soft" },
  { token: "--ink-faint", cls: "bg-ink-faint" },
] as const;

const STATES = [
  { tone: "red", label: "Suppressed", note: "stop · risiko kepatuhan" },
  { tone: "blue", label: "Workflow berjalan", note: "pekerjaan berjalan" },
  { tone: "amber", label: "Menunggu approval", note: "tertahan manusia / pihak luar" },
  { tone: "green", label: "Konsen diberikan", note: "sukses terkonfirmasi" },
  { tone: "neutral", label: "Belum pernah engage", note: "ketiadaan · field kosong" },
] as const;

const SAMPLE_ROWS = [
  { id: "628123456789", name: "Andi Wijaya", ref: "PKG-004821", tone: "green", state: "Terkirim" },
  { id: "628987654321", name: "Siti Rahmawati", ref: "MBR-118273", tone: "amber", state: "Belum verif" },
  { id: "628555000111", name: "Budi Santoso", ref: "PTP-009142", tone: "red", state: "Suppressed" },
] as const;

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-4">
      <h2 className="font-display text-[22px] font-extrabold uppercase tracking-wide text-ink">
        {title}
      </h2>
      {children}
    </section>
  );
}

export default function TokensPage() {
  return (
    <div className="mx-auto max-w-5xl space-y-12 px-6 py-10">
      <DevBanner mode="fixture" note="Katalog token & komponen statis — bukan data, bukan produksi." />
      <header className="space-y-2">
        <Badge tone="blue">Dev only</Badge>
        <h1 className="font-display text-[32px] font-black uppercase leading-none text-ink">
          Design tokens &amp; komponen
        </h1>
        <p className="max-w-2xl font-body text-[14px] leading-relaxed text-ink-soft">
          Verifikasi visual 20FIT Design System v1.0. Semua warna berasal dari CSS
          variable di <span className="font-mono text-ink">globals.css</span> — tidak
          ada hex yang di-hardcode di komponen. Ganti tema lewat toggle di sidebar
          untuk melihat token beralih.
        </p>
      </header>

      <Section title="Token warna">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
          {SWATCHES.map((s) => (
            <div key={s.token} className="space-y-2">
              <div className={`h-16 rounded-sm border border-glass-border ${s.cls}`} />
              <p className="font-mono text-[11px] text-ink-soft">{s.token}</p>
            </div>
          ))}
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="glass p-4">
            <p className="font-display text-[13px] font-bold uppercase text-ink">.glass</p>
            <p className="font-body text-[12px] text-ink-soft">kartu standar · 55%</p>
          </div>
          <div className="glass-strong p-4">
            <p className="font-display text-[13px] font-bold uppercase text-ink">.glass-strong</p>
            <p className="font-body text-[12px] text-ink-soft">panel terangkat · 72%</p>
          </div>
          <div className="rounded-card border border-dashed border-glass-border p-4">
            <p className="font-display text-[13px] font-bold uppercase text-ink">--glass-border</p>
            <p className="font-body text-[12px] text-ink-soft">tepi kartu · 90%</p>
          </div>
        </div>
      </Section>

      <Section title="Status — empat warna + neutral">
        <div className="flex flex-wrap gap-3">
          {STATES.map((s) => (
            <div key={s.label} className="flex flex-col gap-1">
              <Badge tone={s.tone}>{s.label}</Badge>
              <span className="font-body text-[11px] text-ink-faint">{s.note}</span>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Tipografi — tiga font, tiga tugas">
        <div className="space-y-4">
          <div className="glass p-5">
            <p className="font-mono text-[11px] uppercase text-ink-faint">Barlow Condensed · display</p>
            <p className="mt-1 font-display text-[32px] font-black uppercase leading-none text-ink">
              Audience &amp; Campaigns
            </p>
            <p className="font-body text-[12px] text-ink-soft">judul, nav, tombol, tag, angka KPI · UPPERCASE</p>
          </div>
          <div className="glass p-5">
            <p className="font-mono text-[11px] uppercase text-ink-faint">JetBrains Mono · data</p>
            <p className="mt-1 font-mono text-[20px] font-medium text-ink">
              628123456789 · PKG-004821 · Rp 2.520.881
            </p>
            <p className="font-body text-[12px] text-ink-soft">id, telepon, referensi order, nominal, skor, timestamp</p>
          </div>
          <div className="glass p-5">
            <p className="font-mono text-[11px] uppercase text-ink-faint">Manrope · prosa</p>
            <p className="mt-1 font-body text-[15px] font-bold text-ink">Andi Wijaya</p>
            <p className="max-w-xl font-body text-[13px] leading-relaxed text-ink-soft">
              Nama orang, isi pesan, deskripsi segmen, alasan pemblokiran, dan setiap
              paragraf penjelasan di antarmuka ditulis dengan Manrope, sentence case.
            </p>
          </div>
        </div>
      </Section>

      <Section title="Buttons">
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="primary">Buat segmen</Button>
          <Button variant="secondary">Batal</Button>
          <Button variant="outline">Ekspor</Button>
          <Button variant="ghost">Lewati</Button>
          <Button variant="link">Pelajari</Button>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Button size="sm">Small</Button>
          <Button size="md">Medium</Button>
          <Button size="lg">Large</Button>
          <Button disabled>Disabled</Button>
        </div>
      </Section>

      <Section title="Form — Input, Label, Select">
        <div className="grid max-w-xl gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="demo-email">Email</Label>
            <Input id="demo-email" placeholder="nama@20fit.id" className="font-mono" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="demo-channel">Kanal</Label>
            <Select>
              <SelectTrigger id="demo-channel">
                <SelectValue placeholder="Pilih kanal" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="wa">WhatsApp</SelectItem>
                <SelectItem value="email">Email</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </Section>

      <Section title="Table">
        <Card className="overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>customer_id</TableHead>
                <TableHead>Nama</TableHead>
                <TableHead>Referensi</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {SAMPLE_ROWS.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-mono text-[13px] text-ink-soft">{r.id}</TableCell>
                  <TableCell className="font-body font-bold">{r.name}</TableCell>
                  <TableCell className="font-mono text-[13px] text-ink-soft">{r.ref}</TableCell>
                  <TableCell>
                    <Badge tone={r.tone}>{r.state}</Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      </Section>

      <Section title="Cards & KPI">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="Ukuran audiens" hint="belum terhubung" />
          <StatCard label="Bisa dihubungi" value="—" hint="belum terhubung" />
          <Card className="sm:col-span-2">
            <CardHeader>
              <CardTitle>Glass card</CardTitle>
              <CardDescription>
                Radius 22px, blur 28px, tepi 90%. Dipakai untuk setiap panel.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Dialog>
                <DialogTrigger asChild>
                  <Button variant="secondary" size="sm">
                    Buka dialog
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Konfirmasi ekspor</DialogTitle>
                    <DialogDescription>
                      Aksi destruktif dikonfirmasi dengan ketik ulang, bukan satu klik.
                      Ketik <span className="font-mono text-ink">EKSPOR</span> untuk lanjut.
                    </DialogDescription>
                  </DialogHeader>
                  <Input placeholder="EKSPOR" className="font-mono" />
                  <DialogFooter>
                    <DialogClose asChild>
                      <Button variant="secondary">Batal</Button>
                    </DialogClose>
                    <Button variant="primary">Konfirmasi</Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </CardContent>
          </Card>
        </div>
      </Section>

      <Section title="Nav pill — sidebar (selalu gelap)">
        <div data-theme="dark" className="max-w-xs space-y-1 rounded-card bg-[var(--bg-to)] p-3">
          <div className="flex items-center gap-3 rounded-full bg-red px-3 py-2 font-display text-[14px] font-bold uppercase tracking-wide text-white">
            Dashboard
          </div>
          <div className="flex items-center gap-3 rounded-full px-3 py-2 font-display text-[14px] font-bold uppercase tracking-wide text-ink-soft">
            Audience
          </div>
          <div className="flex items-center gap-3 rounded-full px-3 py-2 font-display text-[14px] font-bold uppercase tracking-wide text-ink-soft">
            Segments
          </div>
        </div>
      </Section>

      <Section title="Radius">
        <div className="flex flex-wrap items-end gap-4">
          <div className="flex flex-col items-center gap-2">
            <div className="h-20 w-20 rounded-sm border border-glass-border bg-glass" />
            <span className="font-mono text-[11px] text-ink-soft">--radius-sm · 14px</span>
          </div>
          <div className="flex flex-col items-center gap-2">
            <div className="h-20 w-20 rounded-card border border-glass-border bg-glass" />
            <span className="font-mono text-[11px] text-ink-soft">--radius · 22px</span>
          </div>
          <div className="flex flex-col items-center gap-2">
            <div className="h-20 w-20 rounded-full border border-glass-border bg-glass" />
            <span className="font-mono text-[11px] text-ink-soft">pill · full</span>
          </div>
        </div>
      </Section>

      <Section title="Tema — light vs dark berdampingan">
        <div className="grid gap-4 sm:grid-cols-2">
          <div
            data-theme="light"
            className="space-y-3 rounded-card border border-glass-border bg-[linear-gradient(150deg,var(--bg-from),var(--bg-to))] p-5"
          >
            <p className="font-display text-[13px] font-bold uppercase text-ink">Light</p>
            <div className="glass p-3">
              <p className="font-body text-[13px] text-ink">Kartu di atas gradasi terang.</p>
            </div>
            <div className="flex gap-2">
              <Badge tone="green">Terkirim</Badge>
              <Badge tone="amber">Review</Badge>
            </div>
          </div>
          <div
            data-theme="dark"
            className="space-y-3 rounded-card border border-glass-border bg-[linear-gradient(150deg,var(--bg-from),var(--bg-to))] p-5"
          >
            <p className="font-display text-[13px] font-bold uppercase text-ink">Dark</p>
            <div className="glass p-3">
              <p className="font-body text-[13px] text-ink">Kartu di atas gradasi gelap.</p>
            </div>
            <div className="flex gap-2">
              <Badge tone="green">Terkirim</Badge>
              <Badge tone="amber">Review</Badge>
            </div>
          </div>
        </div>
      </Section>
    </div>
  );
}
