# RENCANA — kirim massal berkelompok di proses latar (P0-3)

> Contacting-half. Menjawab **P0-3** di `ACUAN-UTAMA.md`: "Bangun jalur kirim massal berkelompok di
> proses latar — 8,1 jam berurutan tidak layak." Ini rancangan **plus** implementasi (berbeda dari
> `RENCANA-batas-kirim.md` yang murni rencana): dokumen ini ditulis berbarengan dengan kodenya.

## Masalah yang diperbaiki

Tiga celah, satu penyebab: **loop kirim berjalan sinkron di dalam satu HTTP request.**

1. **Kirim manual segera memblok browser.** `sendCampaignAction` menjalankan `sendCampaign` inline.
   Satu jatah harian (≤ `daily_limit` kirim @ ≥500 ms pacing) = ~8–14 menit HTTP request dari
   peramban. Kalau tab ditutup atau proxy timeout, run terputus (aman dari sisi data — resume-safe —
   tapi operator tidak tahu apakah selesai).
2. **Tidak ada sub-batch per-tick.** Satu panggilan `sendCampaign` menguras seluruh budget harian
   dalam satu invokasi. Kalau `daily_limit` dinaikkan (langkah ramp lanjut — lihat
   `RENCANA-batas-kirim.md`), satu invokasi berjalan berjam-jam — pg_net (yang memanggil endpoint)
   akan timeout.
3. **Executor scheduled membuang sisa.** `/api/campaigns/run-scheduled` memanggil `sendCampaign`
   sekali lalu menandai baris scheduled `sent`; run `sending` dengan sisa terdeferral **terlantar**
   (tak ada yang menjemputnya).

## Batas yang WAJIB dihormati — bukan diubah diam-diam

`lib/crm/send-plan.ts` (`planDailySpread`) memuat keputusan **terargumentasi**:

> "Sisa harian TIDAK dilanjutkan otomatis besok. Ia menunggu manusia me-run ulang kampanye yang sama.
> Auto-continue butuh scheduler DAN ramp reputasi domain … mengirim lintas hari secara senyap tanpa
> cek manusia adalah persis cara reputasi domain muda terbakar."

Rancangan ini **menghormati** keputusan itu, dengan satu penajaman yang tidak melanggarnya:

- **Dalam satu hari** (budget harian yang sudah diotorisasi manusia saat menekan Kirim): pengiriman
  dikuras di latar, berkelompok, tanpa memblok browser. Ini yang dulu sudah terjadi inline — sekarang
  hanya pindah ke latar dan dipecah jadi batch.
- **Lintas hari** (sisa setelah budget harian habis): TETAP menunggu tindakan manusia. Run masuk
  keadaan **jeda** (bukan "sedang mengirim"), dan manusia menekan **Lanjutkan** untuk menguras jatah
  hari berikutnya. Satu klik, dari tab Kiriman — bukan menyusun ulang kampanye di composer.

Jadi setiap hari kirim tetap satu langkah sadar (disiplin ramp), tetapi operator tidak lagi menunggui
browser selama satu jatah harian keluar.

## Bentuk (state di run, bukan tabel baru)

Keadaan "run ini mau dikuras di latar sekarang" tinggal di `crm_campaign_run` — bukan tabel antrean
terpisah — karena run itulah yang dikuras, dan idempotency key sudah men-scope-kan segalanya ke run.

Kolom baru (migrasi `..._crm_campaign_run_add_drain.sql`):

| Kolom | Arti |
|---|---|
| `drain_active boolean` | true → executor latar harus menguras run ini pada tick berikutnya |
| `drain_claimed_at timestamptz` | klaim executor (dijaga keusangan agar tick yang crash tidak mengunci run selamanya) |
| `drain_requested_by text` | siapa yang memulai kuras (jejak) |

Status run tetap: `sending` selagi menguras **atau** jeda-dengan-sisa. `drain_active` yang membedakan
"sedang jalan" dari "jeda menunggu Anda". Tidak ada status baru — hanya bendera latar.

## Mesin — batas batch (`send-run.ts`)

`SendConfig` dapat `maxPerInvocation`: berapa **kirim** (attempt yang diklaim) paling banyak dalam
SATU invokasi `runSend`. Setelah tercapai, loop berhenti dan `SendSummary.haltedForBatch = true`.

Tiga akhir yang bisa dibaca drainer dari satu batch:

| Kondisi summary | Arti | Tindakan drainer |
|---|---|---|
| `stoppedHighBounce` / `stoppedConsecutiveFailures` | tembok (rule 6/7) | `drain_active=false`, finalisasi `stopped` |
| `haltedForBatch` | masih ada penerima siklus ini (cap tercapai) | biarkan `drain_active=true`, lepas klaim → tick lanjut |
| `deferredDailyLimit > 0`, tak `haltedForBatch` | budget harian habis, sisa untuk besok | `drain_active=false`, run tetap `sending` (JEDA — manusia Lanjutkan) |
| selebihnya (loop selesai wajar) | daftar tuntas | `drain_active=false`, finalisasi `sent`/`partial`/`failed` |

`maxPerInvocation` default **sangat besar** (`Number.MAX_SAFE_INTEGER`) sehingga jalur sinkron lama
(uji-kirim internal, dsb.) tidak berubah perilaku. Hanya drainer yang menyetelnya ke `DRAIN_BATCH`.

## Drainer (`send-drain.ts`) + executor (route)

`drainRunOnce(runId, config, nowIso)`: menguras **satu batch** run lewat `sendCampaign`
(`maxPerInvocation = DRAIN_BATCH`), lalu menerjemahkan summary ke keadaan drain berikutnya lewat
`nextDrainState(...)` — helper **murni**, teruji satuan, sehingga aturan di tabel di atas provable
tanpa I/O.

Executor `/api/campaigns/run-scheduled` jadi **dua lintasan** (gerbang `x-cron-secret` tetap):

1. **Enqueue** — baris `crm_scheduled_send` yang jatuh tempo diubah menjadi drain aktif: buat run,
   `drain_active=true`, tandai baris scheduled `sent` (run-nya kini mewakilinya). Jadi scheduled send
   besar pun dikuras benar, bukan membuang sisa.
2. **Kuras** — tiap run `drain_active=true` (diklaim via `drain_claimed_at`, dijaga keusangan) dikuras
   satu batch lewat `drainRunOnce`.

Idempotency membuat dua tick yang tumpang-tindih tetap aman (klaim ganda pada `crm_message_log`
ditolak unique index) — klaim hanya penjaga efisiensi, bukan kebenaran.

### Budget harian bersama

`daily_limit` dibaca dari log (global) tiap invokasi. Kalau dua run menguras di hari yang sama, yang
diklaim lebih dulu memakai jatah; yang lain melihat budget 0 → JEDA seketika. Ini konsekuensi jujur
dari plafon **bersama** (satu kampanye per hari mendapat jatah hari itu), bukan bug.

## UI — semua kirim jadi latar (async)

`sendCampaignAction` **tidak** lagi memanggil `sendCampaign` inline. Setelah semua gerbang lolos
(klinis, unsubscribe, host, env, drift, konfirmasi >500) dan run diselesaikan, ia menyetel
`drain_active=true` dan **kembali seketika**: run masuk latar. Composer Step 4 menampilkan
"pengiriman dimulai di latar — pantau di tab Kiriman", bukan blok ringkasan sinkron.

Latensi mulai: cron tiap 5 menit → kirim dimulai ≤5 menit. Untuk kirim marketing massal, itu sepele
dan dinyatakan di layar; kami TIDAK memicu dari sisi peramban (itu mengembalikan kerja panjang ke
request). Progres tampil di **Kiriman** — run muncul "Sedang mengirim (latar)" dengan hitungan
terkirim/gagal yang naik tiap tick (dibaca langsung dari `crm_message_log`, sudah ada).

## Kiriman — keadaan & kontrol baru

- Run `sending` + `drain_active` → **Sedang mengirim (latar)**.
- Run `sending` + tak `drain_active` → **Jeda: batas harian — Lanjutkan** (sisa menunggu Anda).
- Tombol **Lanjutkan** (set `drain_active=true`) dan **Hentikan** (set `drain_active=false` +
  `stopped`) untuk run, digerbang peran yang sama dengan kirim.

## Batas yang diketahui (jujur) + tindak lanjut

- **Re-resolve per tick O(N).** Tiap tick, drainer memanggil `sendCampaign` yang me-resolve ulang
  seluruh segmen dan meng-claim-skip yang sudah terkirim. Untuk volume ramp (ratusan–seribu per hari)
  ini memadai. Untuk menguras 82 ribu penuh lintas banyak hari, biaya scan menumpuk. **Tindak lanjut
  (P0-3b):** antrean penerima ter-materialisasi (`crm_send_queue`) atau kursor `customer_id` pada
  run, menukar O(N) per tick jadi O(batch). Tidak mengubah UX/kontrak — pertukaran efisiensi internal
  belaka, aman ditunda.
- **Audit per batch.** `sendCampaign` menulis satu baris audit `campaign.sent` per panggilan, jadi
  drain berbatch menulis beberapa baris per run — konsisten dengan perilaku resume manual yang sudah
  ada (setiap resume juga menulis baris audit). `deliveryDetail` membaca baris audit terbaru untuk
  empat angka audiens; itu ketidaktepatan kecil yang sudah ada sebelumnya, bukan regresi.

## Yang TIDAK dibangun di sini

- Auto-continue lintas hari tanpa cek manusia (keputusan `planDailySpread`, milik pemilik + ramp).
- Perubahan cadence cron atau plafon paket provider (P0-1/P0-2, milik pemilik).
