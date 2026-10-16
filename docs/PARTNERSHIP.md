# Partnership — pipeline, kalender, inbox WhatsApp & email dengan AI agent

> Dibangun 16 Okt 2026. Halaman: `crm.20fit.id/partnership` (tab Pipeline · Kalender & kasus · WhatsApp & Email · AI Agent · Koneksi).

## Di mana apa

| Bagian | Tempat |
|---|---|
| UI | `app/(app)/partnership/*` (gate: `workflow.create ≠ deny`; playbook/KB/koneksi/hapus: `workflow.activate`) |
| Data | Service **Postgres** di project Railway CRM (`cfc08642-…`), env `PARTNER_DATABASE_URL=${{Postgres.DATABASE_URL}}` (private network). Skema dibuat otomatis saat pertama dipakai (`lib/partnership/db.ts`), tabel `p_*`. |
| Engine | `lib/partnership/engine.ts` — `run-scheduled` PASS 4 tiap menit (pg_cron). Matikan darurat: env `PARTNER_ENGINE_ENABLED=false`. |
| AI agent | `lib/partnership/agent.ts` — OpenRouter (`SEGMENT_AI_API_KEY`/`SEGMENT_AI_BASE_URL`, atau `PARTNER_AI_*`), model di Playbook (default `deepseek/deepseek-chat`), keluaran JSON. |
| WhatsApp | WAHA `https://waha.20fit.id`, sesi `partnership` (`WAHA_SESSION`), webhook `POST /api/partnership/webhooks/waha` dengan header `X-Partner-Secret` = `WAHA_WEBHOOK_SECRET` (path publik di middleware). |
| Email | Gmail akun yang di-connect (OAuth, `GOOGLE_CLIENT_ID/SECRET`, redirect `/api/partnership/google/callback`, token disegel `PARTNER_ENC_KEY`), cadangan Resend (`email_from`, Reply-To di Playbook). |
| Kalender | Google Calendar + Meet (event `sendUpdates=all`); tanpa Google: meeting CRM + undangan `.ics` via Resend. |

## Alur kasus

- **Lead masuk** — WA ke nomor partnership (lead dibuat otomatis dari nama WA), email: hanya balasan di thread yang sudah dilacak, email dari kontak partner terdaftar, atau email yang diberi label Gmail **Partnership** (kotak tersambung = inbox umum Marketing@20fit.id; email lain tidak pernah jadi lead; pengirim otomatis/bulk/internal diabaikan), input manual, atau import CSV.
- **Pesan pertama** — lead manual/CSV dengan autopilot: AI menulis outreach di jam proaktif (email kalau ada, WA dingin dibatasi per hari).
- **Balasan** — pesan masuk → AI membalas 40 detik kemudian (beberapa bubble dijawab sekali), di jam balas.
- **Meeting** — AI hanya menawarkan slot kosong (jam meeting − meeting CRM − Google busy); partner memilih → event Google Meet / tatap muka, tahap "Meeting dijadwalkan", pengingat H-1 & 1 jam via WA/email, cek hasil 2 jam setelah selesai.
- **Setelah meeting** — tim isi Selesai + catatan → AI kirim terima kasih & langkah berikutnya; Tidak hadir → AI tawarkan jadwal ulang; Jadwal ulang / Batal → Google event ikut diubah.
- **Follow-up → Ghosting → Revive → Nanti** — tanpa balasan: follow-up tiap `followup_days` (default 2, 5, 10 hari); habis → Ghosting; setelah `revive_after_days` AI menyapa sekali lagi → "Nanti"; disapa lagi setelah `nurture_after_days`. Balasan kapan pun mengembalikan lead ke tahap sebelumnya.
- **Serah ke manusia** — harga/kontrak/legal/negosiasi/keluhan, slot di luar jadwal, kontak tidak lengkap, sinyal deal → `needs_human`, autopilot berhenti untuk lead itu, email notifikasi ke `notify_email`.
- **Ambil alih** — tim membalas dari CRM, dari HP (WA fromMe), atau dari Gmail → percakapan "manual" selama `manual_takeover_hours`, AI hanya membuat draft.
- **Lainnya** — out-of-office tidak dibalas; spam → Batal + autopilot mati; rujukan ke orang lain → kontak baru + intro; pesan suara/gambar → AI minta ditulis; maks pesan AI per percakapan per 24 jam.

## Yang harus dilakukan manusia

1. **Scan QR WhatsApp** (tab Koneksi) dari HP nomor partnership — sesi WAHA kedaluwarsa kalau QR tidak di-scan; klik "Sambungkan / tampilkan QR" untuk QR baru.
2. **Google**: buat OAuth client (langkah ada di tab Koneksi), set `GOOGLE_CLIENT_ID` + `GOOGLE_CLIENT_SECRET` di service CRM, lalu klik "Sambungkan Google" dengan akun partnership.
