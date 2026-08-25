# RENCANA — crm_message_log (log pengiriman) — DISETUJUI + DITERAPKAN (dgn dua koreksi)

Langkah 1 dari urutan pengiriman (pemilik produk, 24 Agu). **Disetujui dengan dua koreksi**
(identity disimpan sebagai hash, bukan mentah; bentuk `idempotency_key` dibuat deterministik).
Migrasi final: `supabase/migrations/20260824160000_crm_message_log.sql` — diterapkan lewat
`apply_migration`, verifikasi di bawah.

## Dua koreksi (tinjauan 24 Agu)

**1. `identity_key` mentah → `identity_hash` (HMAC berkunci).** Tabel ini tumbuh satu baris per
kirim, dibaca layar Messages, tak pernah dipangkas. Menyimpan email/telepon mentah menjadikannya
**salinan kedua daftar kontak** dan pintu belakang yang melewati masking. Tiga pilihan ditimbang:

| Pilihan | Bounce bisa ditelusuri? | Jadi daftar kontak plaintext? | Putusan |
|---|---|---|---|
| Simpan mentah | ya | **ya** — harus diandalkan masking+ekspor-exclude tiap saat | ditolak |
| Simpan tersamar (`j***@d***`) | **tidak** cocok webhook penyedia | sebagian | ditolak |
| **Simpan hash berkunci (HMAC)** | **ya** (hash alamat masuk → cocokkan) | **tidak** | **dipilih** |

Alasan hash cukup: (a) **"ke siapa"** dijawab `customer_id` yang lewat masking `view_contact`
yang sudah ada — log tak perlu alamat terbaca untuk ditampilkan; (b) **penelusuran bounce**
mencocokkan `provider_message_id` (disimpan) atau, cadangan, hash alamat yang dipantulkan penyedia
— hash deterministik tetap cocok; (c) **korelasi unsubscribe** lewat `customer_id`+channel (token
tanda tangan membawa `customer_id`), bukan alamat. Jadi privasi *by construction*, bukan privasi
*karena ingat menyamarkan*. Tetap **dikecualikan dari ekspor** dan **tak pernah dirender** (bela
berlapis). Kunci: `UNSUBSCRIBE_TOKEN_SECRET` dengan pemisah domain `msglog-identity:` (lihat
`lib/crm/identity-hash.ts`); tabel mulai kosong, jadi rotasi kunci nanti = epoch baru tanpa migrasi.

**2. `idempotency_key` acak → deterministik.** Bentuknya **`{campaign_id}:{customer_id}:{channel}`**
(lihat `buildIdempotencyKey`, dan `comment on column` di migrasi). Karena murni turunan kampanye +
penerima + channel, **menjalankan ulang kirim yang terputus menghasilkan kunci yang sama**, dan
indeks unik melewati penerima yang sudah terkirim. Diuji dengan **pemutusan sungguhan** (jalankan
sebagian → ulang penuh → nol kirim ganda), bukan menyisipkan dua baris kembar — lihat
`lib/crm/send-run.test.ts`.

## Kenapa meniru `my20fit_message_log`, tapi berkunci `customer_id`

`my20fit_message_log` punya skema kirim matang tapi **di-key pada `user_id` (auth my20fit)** —
tak mencakup pool CRM (hanya ~47/82.253). **Skemanya ditiru** (kolom siklus kirim yang sama, jadi
analitik lintas-tim berbaris), **kuncinya diganti** ke `master_customer.customer_id` (K-37 #1).
Kolom my20fit-spesifik (`meal_window`) dibuang; ditambah yang CRM butuh (identitas tujuan +
referensi template + status `skipped_suppressed`).

## Diverifikasi terhadap skema langsung (24 Agu 2026)

Kolom `my20fit_message_log` dibaca dari `information_schema` (bukan diingat). Perbandingan:

| Kolom my20fit | Aksi di CRM | Alasan |
|---|---|---|
| `id, channel, subject, idempotency_key, provider_message_id, status, error_message` | **ditiru apa adanya** | inti jalur kirim + korelasi penyedia |
| `sent_at … unsubscribed_at, created_at, language` | **ditiru apa adanya** | cap-waktu siklus + bahasa; analitik lintas-tim berbaris |
| `user_id (uuid)` | **diganti** → `customer_id (uuid) not null` | K-37 #1: kunci CRM, bukan auth my20fit |
| `campaign_id (text)` | **ditiru tipe `text`** | dipertahankan `text` (bukan uuid) agar union lintas-tim tak perlu cast |
| `template_id (text)` | **diganti** → `template_key text` + `template_version integer` | template CRM **berversi**; "apa yang benar-benar diterima" butuh versi eksak |
| `meal_window (text)` | **dibuang** | spesifik my20fit, tak relevan CRM |
| — | **ditambah** `identity_hash` (HMAC, koreksi 1) | tujuan tercocokkan tapi tak terbaca (bukan salinan kontak) |
| — | **ditambah** `failure_cause` (check) | sebab gagal dibedakan (pelajaran reset), bukan satu status |
| `idempotency_key` **nullable** | **diperkuat** → `not null` + `unique` + **bentuk deterministik** | idempotensi resume-aman (koreksi 2) |
| `status` (bebas) | **dibatasi** `check(...)` + nilai `skipped_suppressed` | bukti pemeriksaan suppression **saat kirim** |

## SQL final (DITERAPKAN — ledger `20260824145501`)

File: `supabase/migrations/20260824145501_crm_message_log.sql` (identik dengan yang diterapkan).
Verifikasi: RLS on, 0 policy, `relacl {postgres, service_role}`, 22 kolom, 4 check, 0 baris.
Poin skema (lihat file untuk SQL lengkap + `comment on column`):

- `identity_hash text` — HMAC berkunci tujuan ternormalisasi (koreksi 1); **bukan** alamat mentah.
- `idempotency_key text not null unique` — bentuk **`{campaign_id}:{customer_id}:{channel}`**
  (koreksi 2), didokumentasikan di `comment on column`.
- `failure_cause` ∈ {`invalid_address`,`hard_bounce`,`provider_rejected`,`daily_limit`,`unknown`}
  — sebab gagal dibedakan (pelajaran reset).
- `status` ∈ {`queued`,`sent`,`delivered`,`bounced`,`complained`,`failed`,`skipped_suppressed`}.
- Cap waktu siklus ditiru dari `my20fit_message_log`; diisi webhook penyedia (satu-satunya alasan
  `update` di-grant — isi pesan tak pernah di-UPDATE).

## Revert

`drop table if exists public.crm_message_log;` — aditif, nol data pelanggan, aman.

## Status langkah kirim (K-38)

- **Langkah 1 (skema):** ✅ diterapkan + diverifikasi.
- **Langkah 2 (jalur kirim):** ✅ dibangun + diuji — `lib/crm/send-run.ts` (inti murni, port-injected),
  `lib/crm/send-campaign.ts` (adapter Supabase+Mailtrap), `lib/crm/identity-hash.ts`,
  `lib/crm/send-gate.ts`, `lib/crm/send-constants.ts`. Uji termasuk **resume setelah pemutusan
  sungguhan** (nol kirim ganda). Kirim nyata ke pelanggan **diblokir** gerbang `CAMPAIGN_SEND_ENABLED`
  sampai token Mailtrap dirotasi + DNS diatur; hanya `@20fit.id` internal yang bisa dikirimi.
- **Langkah 3 (layar):** Messages (baca log apa adanya) + Campaigns (konsol alur+batas+blok
  pra-luncur) menggantikan ComingSoon. Form susun-dan-kirim di layar **menyusul** (menunggu segmen
  bisa disimpan + dua prasyarat kirim).
