"use client";

import { useEffect, useState, useTransition } from "react";
import { MessageCircle, Mail, RefreshCw, LogOut, Link2, Unplug, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { connectionsAction, googleDisconnectAction, waConnectAction, waLogoutAction } from "./actions";
import { Notice, when } from "./ui";

type Conn = Extract<Awaited<ReturnType<typeof connectionsAction>>, { ok: true }>;

const WA_STATUS: Record<string, { label: string; tone: "green" | "amber" | "red" | "neutral" | "blue" }> = {
  WORKING: { label: "Tersambung", tone: "green" },
  SCAN_QR_CODE: { label: "Menunggu scan QR", tone: "amber" },
  STARTING: { label: "Memulai…", tone: "blue" },
  STOPPED: { label: "Berhenti", tone: "neutral" },
  FAILED: { label: "Gagal / logout", tone: "red" },
};

export function Connections({ canAdmin }: { canAdmin: boolean }) {
  const [c, setC] = useState<Conn | null>(null);
  const [notice, setNotice] = useState<{ tone: "red" | "green" | "blue"; text: string } | null>(null);
  const [qrTick, setQrTick] = useState(0);
  const [busy, start] = useTransition();

  const load = () => start(async () => { const r = await connectionsAction(); if (r.ok) setC(r); else setNotice({ tone: "red", text: r.error }); });
  useEffect(load, []);
  const waStatus = c?.wa.session?.status ?? (c?.wa.configured ? "TIDAK ADA" : "BELUM DIKONFIGURASI");
  useEffect(() => {
    if (waStatus !== "SCAN_QR_CODE" && waStatus !== "STARTING") return;
    const t = setInterval(() => { setQrTick((x) => x + 1); load(); }, 12_000);
    return () => clearInterval(t);
  }, [waStatus]);

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      {notice && <div className="lg:col-span-2"><Notice tone={notice.tone} text={notice.text} onClose={() => setNotice(null)} /></div>}

      <section className="flex flex-col gap-3 rounded-card border border-glass-border p-4">
        <h3 className="flex items-center gap-2 font-display text-[18px] font-bold uppercase text-ink"><MessageCircle className="h-5 w-5 text-green" /> WhatsApp partnership</h3>
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={WA_STATUS[waStatus]?.tone ?? "neutral"}>{WA_STATUS[waStatus]?.label ?? waStatus}</Badge>
          {c?.wa.session?.me?.id && <span className="font-mono text-[12px] text-ink-soft">{c.wa.session.me.id.split("@")[0]} {c.wa.session.me.pushName ? `· ${c.wa.session.me.pushName}` : ""}</span>}
        </div>
        {c?.wa.error && <p className="font-body text-[12px] text-red">{c.wa.error}</p>}
        <p className="font-body text-[12.5px] text-ink-soft">WhatsApp lewat WAHA (waha.20fit.id), sesi <code>partnership</code>. Pesan masuk otomatis jadi lead & percakapan; AI membalas sesuai playbook. Kalau tim membalas langsung dari HP, AI otomatis diam sementara.</p>
        {waStatus === "SCAN_QR_CODE" && (
          <div className="flex flex-col items-start gap-2">
            <p className="font-body text-[13px] text-ink">Buka WhatsApp di HP nomor partnership → <b>Perangkat tertaut</b> → <b>Tautkan perangkat</b>, lalu scan QR ini (diperbarui otomatis):</p>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`/api/partnership/waha/qr?t=${qrTick}`} alt="QR WhatsApp" className="h-64 w-64 rounded-sm border border-glass-border bg-white p-2" />
          </div>
        )}
        {canAdmin && (
          <div className="flex flex-wrap gap-2">
            <Button size="sm" disabled={busy} onClick={() => start(async () => { const r = await waConnectAction(); setNotice(r.ok ? { tone: "blue", text: `Sesi WhatsApp: ${r.status}. Kalau muncul QR, scan dari HP.` } : { tone: "red", text: r.error }); load(); })}>
              <RefreshCw /> {waStatus === "WORKING" ? "Perbarui webhook" : "Sambungkan / tampilkan QR"}
            </Button>
            {waStatus === "WORKING" && <Button size="sm" variant="outline" disabled={busy} onClick={() => { if (window.confirm("Putuskan nomor WhatsApp dari CRM?")) start(async () => { const r = await waLogoutAction(); setNotice(r.ok ? { tone: "green", text: "WhatsApp diputus." } : { tone: "red", text: r.error }); load(); }); }}><LogOut /> Putuskan</Button>}
          </div>
        )}
      </section>

      <section className="flex flex-col gap-3 rounded-card border border-glass-border p-4">
        <h3 className="flex items-center gap-2 font-display text-[18px] font-bold uppercase text-ink"><Mail className="h-5 w-5 text-blue" /> Google (Gmail + Calendar + Meet)</h3>
        {c?.google.connection ? (
          <>
            <span className="flex items-center gap-2 font-body text-[13px] text-ink"><CheckCircle2 className="h-4 w-4 text-green" /> Tersambung sebagai <b>{c.google.connection.email}</b> sejak {when(c.google.connection.connected_at)}</span>
            <p className="font-body text-[12.5px] text-ink-soft">Email partner ke kotak ini masuk ke inbox CRM tiap menit dan dibalas di thread yang sama. Meeting online otomatis dapat link Google Meet dan undangan dikirim Google.</p>
            {canAdmin && <Button size="sm" variant="outline" className="self-start" disabled={busy} onClick={() => { if (window.confirm("Putuskan Google?")) start(async () => { const r = await googleDisconnectAction(); setNotice(r.ok ? { tone: "green", text: "Google diputus." } : { tone: "red", text: r.error }); load(); }); }}><Unplug /> Putuskan</Button>}
          </>
        ) : c?.google.configured ? (
          <>
            <p className="font-body text-[13px] text-ink">Belum tersambung. Login dengan akun Google Workspace yang dipakai untuk partnership (mis. partnership@20fit.id).</p>
            {canAdmin && <a href="/api/partnership/google/connect" className="inline-flex w-fit items-center gap-2 rounded-sm bg-red px-4 py-2 font-display text-[14px] font-bold uppercase text-white"><Link2 className="h-4 w-4" /> Sambungkan Google</a>}
          </>
        ) : (
          <div className="flex flex-col gap-2 font-body text-[12.5px] text-ink">
            <p><b>Satu kali setup oleh admin Google Workspace 20fit.id</b> (±5 menit):</p>
            <ol className="list-decimal space-y-1 pl-5 text-ink-soft">
              <li>Buka console.cloud.google.com → buat project “20FIT CRM”.</li>
              <li>APIs & Services → Library: aktifkan <b>Gmail API</b> dan <b>Google Calendar API</b>.</li>
              <li>OAuth consent screen → User type <b>Internal</b> → isi nama app “20FIT CRM”.</li>
              <li>Credentials → Create OAuth client ID → <b>Web application</b> → Authorized redirect URI:<br /><code className="break-all text-ink">{c?.google.redirectUri ?? "https://crm.20fit.id/api/partnership/google/callback"}</code></li>
              <li>Kirim Client ID & Client Secret ke tim teknis (diisi sebagai env <code>GOOGLE_CLIENT_ID</code> / <code>GOOGLE_CLIENT_SECRET</code> di Railway), lalu kembali ke sini dan klik Sambungkan Google.</li>
            </ol>
            <p className="text-ink-soft">Sebelum tersambung: email keluar lewat Resend dengan Reply-To ke kotak di Playbook, meeting tetap tercatat dan undangan .ics dikirim ke partner (link Meet ditempel manual).</p>
          </div>
        )}
      </section>
    </div>
  );
}
