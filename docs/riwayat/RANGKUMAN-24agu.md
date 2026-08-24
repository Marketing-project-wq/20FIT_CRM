# RANGKUMAN 24 AGUSTUS 2026 — dan Apa yang Belum Dikerjakan

> Diverifikasi ulang terhadap DB langsung 24 Agu (lihat "Verifikasi" di bawah): seluruh angka
> dan daftar migrasi **cocok**, nol selisih.

## 1. Apa yang berubah hari ini

Hari ini adalah hari **re-scoping**: pemilik produk menyatakan ulang kebutuhan sistem secara
utuh, dan pekerjaannya berpindah dari separuh "mengenali" ke separuh "menghubungi".

### Koreksi yang menentukan

**Model deploy tercatat salah selama lima hari.** Screenshot dashboard Railway membuktikan
produksi men-deploy dari `main` dengan auto-deploy, bukan dari branch kerja. T-18 dan K-27
dikoreksi; baris README yang selama ini ditandai keliru ternyata benar sejak awal. Pelajaran
yang dicatat: pertanyaan ini tak bisa dijawab dari dalam repo — jawabannya satu screenshot
dashboard.

**PR #14 di-merge**, jadi C (precompute + perbaikan kebenaran RFM) dan D (redesign dashboard)
akhirnya tayang. Bucket `Campion user` kini tampil **0** alih-alih lenyap.

**Bug reset kata sandi ketemu dan diperbaiki** — dan bukan pada dua tempat yang dicurigai.
`verifyOtp` sukses, `updateUser` yang gagal dengan 422 karena kata sandi baru sama dengan
yang lama, lalu tiap percobaan ulang memverifikasi token yang sudah dipakai. **Satu pesan
galat untuk empat keadaan** menyembunyikannya berhari-hari. Kini empat keadaan, empat pesan,
empat tindakan.

**Reset kata sandi terbukti bekerja ujung ke ujung di produksi** — email dari `crm@20fit.id`
mendarat di Inbox, kode terverifikasi, kata sandi berubah. Fitur pertama yang benar-benar
dipakai manusia dan berhasil setelah beberapa sprint.

### Yang dibangun

| | |
|---|---|
| Dokumen kebutuhan | `docs/KEBUTUHAN-SISTEM.md` jadi rujukan lingkup teratas |
| Consent dibingkai ulang | Berhenti jadi gerbang; unsubscribe satu-satunya penentu (K-36) |
| Template | Kosakata variabel tertutup, divalidasi saat **simpan**, riwayat versi, penampung status persetujuan WhatsApp |
| Unsubscribe | Halaman publik, tautan bertanda tangan HMAC, menulis lewat jalur suppression 3H yang ada |
| Jalur kirim | Suppression diperiksa saat kirim, idempotensi tahan proses terputus, batas harian dari log |
| Webhook Mailtrap | Verifikasi tanda tangan dua nama header, anti-replay lewat isi-hanya-bila-NULL |
| Monitor bounce 5% | Dibangun, belum diaktifkan sampai ada data bounce nyata |
| Pagar terjemahan | Pemindai string Indonesia di layar dwibahasa |
| Gerbang ekspor | `crm_operator` dibuka di bawah ambang |

### Migrasi diterapkan hari ini

`crm_message_template` · `crm_message_log` · `crm_purge_audit_log_add_campaign_compliance` ·
`crm_segment` · `crm_campaign_run`

### Temuan hari ini

**Pagar terjemahan menemukan sesuatu di hari pertama:** layar `search` sudah ada di
`BILINGUAL_SCREENS` sambil merender blok akses-ditolak berbahasa Indonesia yang di-hardcode —
sudah tayang di produksi tanpa ada yang menyadari.

**Prefiks audit `export.campaign_sent` dibalik jadi `campaign.sent`.** Mengirim bukan
mengekspor; memakai prefiks `export.` akan membuat pertanyaan "data apa yang keluar sebagai
berkas" mendapat kampanye tercampur.

**Dua dari tujuh pemicu workflow tak punya sumber data:** "tidak kembali" (recency nyata
hanya untuk 47 profil my20fit) dan "fitpoint kedaluwarsa" (tak ada tabelnya di mana pun).

**`my20fit_message_log` punya skema kirim matang tapi nol baris**, dan berkunci `user_id`
auth my20fit — bukan `customer_id`. CRM berdiri sendiri, tapi meniru skemanya.

---

## 2. Keadaan sekarang

**Lima tabel menunggu baris pertamanya:** `crm_message_log`, `crm_segment`,
`crm_campaign_run`, `crm_suppression`, dan audit `campaign.%` — semuanya **0 baris**.

Seluruh separuh "menghubungi" sudah terbangun dan terverifikasi di sisi kode, tetapi **belum
satu pun jalurnya pernah dilalui**.

---

## 3. Yang belum dikerjakan

### Menunggu pemilik produk

| | Akibat bila ditunda |
|---|---|
| **Rotasi `MAILTRAP_API_TOKEN`** | Satu-satunya penghalang kampanye. Membuka empat verifikasi sekaligus |
| Kirim internal pertama | Membuktikan rantai kirim, dan menghasilkan baris `crm_suppression` pertama |
| Kredensial WhatsApp Business API | Kanal chat belum bisa dipakai |
| Sumber data fitpoint | Pemicu nomor 6 tak bisa dibangun |
| Batas paket Mailtrap | Menentukan apakah kampanye besar butuh antrean |
| Persetujuan Jeff untuk K-32 | Aksi `profile.edit_demographic` di luar PRD 17.2 |
| Merge PR #15 | Seluruh pekerjaan hari ini belum tayang |

### Menunggu dikerjakan

**5B-T2 — terjemahan detail profil.** ✅ **SELESAI 24 Agu** (setelah rangkuman ditulis): detail
profil sepenuhnya dwibahasa, `profile` di-flip ke `BILINGUAL_SCREENS`, pagar mengonfirmasi
(menangkap 5 sisa di berkas halaman, diperbaiki). Tinggal `/settings/diagnostik` yang `PENDING`.

**Form susun kampanye** disambungkan ke `crm_campaign_run` — resume versus mulai baru.

**Workflow dan pemicu.** Lima dari tujuh punya sumber; dua tidak. Arsitektur pemicunya belum
diputuskan — polling, webhook, atau tabel kejadian. Snapshot harian tak bisa menjawab "orang
ini baru saja login".

**`/settings/diagnostik`** masih `PENDING` terjemahan sejak Sprint 4F.

**Ingestion.** Yang terbesar dan belum disentuh: `master_customer` beku sejak 31 Juli, dan
**lebih dari 1.400 orang** ada di sistem 20FIT tetapi tidak di pool. Angka itu naik tiap hari.

---

## Verifikasi (terhadap DB langsung, 24 Agu)

| Klaim | Hasil kueri | Cocok? |
|---|---|---|
| 5 migrasi diterapkan hari ini | 5 baris di `schema_migrations` (message_template, message_log, campaign compliance, segment, campaign_run) | ✅ |
| 5 tabel 0 baris | `crm_message_log`=0, `crm_segment`=0, `crm_campaign_run`=0, `crm_suppression`=0, audit `campaign.%`=0 | ✅ |
| Pool 82.253 | `master_customer` = 82.253 | ✅ |
| `master_customer` beku sejak 31 Juli | `max(created_at)` = 2026-07-31 | ✅ |

_"Lebih dari 1.400 orang di 20FIT tapi tidak di pool" — konsisten dengan lapisan "gap" dashboard
(DASH-T1); dilaporkan pemilik produk, naik tiap hari, tidak dikueri ulang di sini karena butuh
lintas-tabel tim lain._
