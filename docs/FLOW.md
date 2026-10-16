# Flow — journey automation lintas produk 20FIT

> Dibangun 16 Okt 2026. Blueprint 60 logic: artifact "Benang merah 360 20FIT".

## Di mana apa

| Bagian | Tempat | Isi |
|---|---|---|
| UI builder | CRM `/flows`, `/flows/[id]` (`app/(app)/flows/`) | daftar flow, kanvas (Masuk → Email / Tunggu / Kondisi / Cabang / Keluar), statistik per node, uji, aktivasi |
| Engine | c360-api (`Database/dashboard/flow.mjs`, project Railway "20FIT Database") | pemicu (SQL di atas `c360.*` + `ticket.peserta`), kondisi, penjaga, konversi, statistik |
| Data flow | Postgres data20fit, schema `flow` (`Database/c360/flow.sql`) | `flow.flow`, `flow.enrollment`, `flow.step`, `flow.flow_history` |
| 60 flow blueprint | `Database/dashboard/flow-seed.mjs` | dimuat sebagai Draft lewat `POST /api/flow/seed-default` (tidak menimpa editan) |
| Kirim email | CRM `lib/crm/flow/tick.ts` | pool identity, suppression, gate kirim nyata, unsubscribe, `crm_message_log` |

## Siklus tiap menit (`/api/campaigns/run-scheduled` PASS 3, pg_cron)

1. CRM kirim cap waktu open/klik/bounce email flow (`crm_message_log.campaign_id like 'flow%'`) ke engine.
2. Engine: (tiap menit ke-5) ambil peserta baru dari pemicu flow **Aktif**; majukan peserta yang jatuh tempo; kembalikan outbox.
3. CRM kirim outbox. Kunci idempotensi `flow:<enrollment>:<node>` → tidak pernah kirim dobel.
   `campaign_id = flow:<flow>:<node>` (uji: `flowtest:…`).
4. CRM ack hasil per email ke engine.

Matikan darurat: env `FLOW_ENGINE_ENABLED=false` di service CRM, atau Jeda flow di UI.

## Pengaman (berlaku di engine/CRM, bukan per flow)

G01 unsubscribe (suppression CRM) · G02 maks 1 email marketing/hari & 3/7 hari per orang (transaksional bebas) ·
G03 prioritas flow · G04 isi Clinic netral (aturan menulis) · G06 email dummy/internal/anonim Fitco dikecualikan ·
G07 B2B dikecualikan kecuali flow mengizinkan · G09 jam kirim 07–20 WIB · G10 grup kontrol per flow (default 10%) ·
G11 UTM otomatis + kode promo wajib untuk email bertanda `requires_promo` sebelum Aktif · G12 12 email flow tak dibuka → berhenti marketing.

## Uji

Tombol **Uji** di builder: satu peserta uji (profil dipinjam dari orang yang cocok dengan pemicu supaya cabang
dievaluasi realistis, nama ditampilkan "Peserta Uji") dan email hanya ke alamat @20fit.id. Waktu tunggu dipercepat:
1 hari = 1 menit. Statistik uji terpisah ("Data uji").

## Batas yang diketahui

- "Fotomu sudah ada" (L13) belum tahu hasil face search per orang; isinya umum sampai feed Photo tersedia.
- Saldo paket Arena/Clinic, skor NPS, klik artikel Media per orang, scan booth: belum ada di Customer 360 —
  flow terkait (L12, L24, L32, L41, L58) memakai pendekatan yang ditulis di deskripsinya.
- Orang yang belum ada di `master_customer` dilewati (`not_in_pool`) — ±4% pembeli baru per 16 Okt 2026.
