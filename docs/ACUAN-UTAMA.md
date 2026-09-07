# ACUAN UTAMA — 20FIT CRM

> ## ⏱ DIUKUR: 7 September 2026, 17:30–18:00 UTC
>
> **Setiap angka di dokumen ini adalah potret pada jam itu, diukur langsung dari produksi
> (`cpvzwqptzcxnwzfzgrmt`) lewat `execute_sql`.** Sumber hidup bertumbuh setiap hari — antara dua
> pengukuran hari ini saja, "orang baru dari sumber hidup" naik dari 1.867 menjadi 1.872 dalam tiga
> jam.
>
> **Siapa pun yang memperbarui satu angka di dokumen ini WAJIB memperbarui tanggal dan jam di baris
> pertama.** Dokumen yang benar saat ditulis lalu berhenti benar adalah kelas kegagalan yang sudah
> menggigit proyek ini dua kali (T-50, T-63). Kalau Anda hanya membaca — perlakukan angka yang lebih
> tua dari dua minggu sebagai perlu diukur ulang, bukan sebagai fakta.

Dokumen ini menggantikan pemahaman lisan tentang "apa yang sedang dibangun". Kalau sebuah pekerjaan
tidak menjawab salah satu dari lima kebutuhan di bawah, ia butuh pembenaran tersendiri.

---

## Tujuan sistem (dinyatakan pemilik)

1. **Pool seluruh user/audiens 20FIT** yang masuk lewat sistem mana pun
2. **Semua data bisa dikelola, dihubungi, dan digunakan** oleh 20FIT
3. **Kelengkapan data** dapat digunakan
4. **Sistem impor** untuk audiens yang didaftarkan manual oleh CS
5. **Email sebagai penanda utama** (WhatsApp belum bisa dipakai)

---

## Ringkasan penilaian

| # | Kebutuhan | Status | Penghambat utama |
|---|---|---|---|
| 1 | Pool seluruh ekosistem | 🟡 **Sebagian** | Pool beku sejak 27 Agu; 1.872 orang di sumber hidup belum masuk |
| 2 | Bisa dikelola & dihubungi | 🔴 **Belum** | **0,2%** audiens pernah benar-benar sampai; kapasitas kirim tak diketahui; **1.358 akun bisa menulis pool langsung (T-17)** |
| 3 | Kelengkapan data | 🔴 **Belum** | Gender 0% · tanggal lahir 0% di pool · alamat 0% · kota 7% |
| 4 | Impor manual CS | 🟡 **Sebagian** | Impor CSV massal ada; **entri satu orang tidak ada** |
| 5 | Email penanda utama | 🟢 **Hampir** | Tiga cacat konkret, semuanya kecil dan bisa diperbaiki |

**Satu kalimat:** sistem ini sudah sangat baik dalam **mengenali** orang dan hampir belum mampu
**menghubungi** mereka. Dari 82.213 orang yang bisa dikirimi email, **126 pernah benar-benar
sampai** — 0,2%.

---

## 1 · Pool seluruh ekosistem — 🟡 Sebagian

### Yang sudah bisa

- **82.830 profil** dalam satu pool tunggal, dengan identitas terpadu (email + telepon
  ternormalisasi)
- Resolusi identitas lintas tabel sumber
- Cermin harian `crm_customer_mirror` untuk segmentasi — sebuah **materialized view**, bukan tabel;
  disegarkan cron `crm-refresh-customer-mirror` 20:00 UTC (03:00 WIB)
- Penandaan asal per orang (`source`, `tags`) sehingga tiap kelompok bisa ditelusuri dan dibatalkan
- Papan angka harian yang menyatakan sendiri apa yang belum masuk

### Yang belum

- **Pool beku sejak 27 Agustus 2026.** Tak ada satu pun proses yang menambah orang. Tiga muatan
  seumur sistem: 20 Apr (81.178, `20fit_data_import`) · 31 Jul (1.075, `live_txn_ingest`) ·
  27 Agu (577, `activity_ingest`).
- **1.872 orang** ada di sumber yang masih hidup dan belum ada di CRM.
- **1.549 orang lagi** hanya ada di dua sumber beku — kerja impor sekali jalan, bukan alasan cron.
- Rancangan pipeline harian **sudah selesai** (`docs/RANCANGAN-pipeline-harian.md`), pembangunannya
  belum dimulai dan **menunggu empat keputusan pemilik** (`docs/KEPUTUSAN-pipeline-harian.md`).

### Angka

```
Profil di pool                    82.830
Orang baru dari sumber HIDUP       1.872   (my20fit 953 · talent 682 · arena 405 · lainnya)
Orang baru HANYA dari sumber BEKU  1.549   (event_transaction, cf_hyrox — sekali jalan)
Sumber HIDUP yang sudah dipetakan      13
Sumber BEKU yang sudah dipetakan       10
```

> **Catatan tentang penjumlahan.** Angka per sumber TIDAK boleh dijumlahkan: 1.286 email muncul di
> dua sumber hidup atau lebih. `uob_users` menyumbang 867 orang baru tetapi hanya **11** yang tidak
> dipunyai sumber lain — 1.161 dari 1.174 emailnya sudah ada di `my20fit_profile`. `profiles`
> adalah kembaran persis `my20fit_profile` (irisan 1.355, nol unik di kedua sisi).

---

## 2 · Bisa dikelola & dihubungi — 🔴 Belum

**Ini penghambat terbesar sistem, dan sebagian besarnya tidak bisa diselesaikan oleh pekerjaan
teknis.**

### Yang sudah bisa

- Segmentasi berdasarkan unit bisnis, sumber, kontaktabilitas, kebaruan, LTV (10 segmen tersimpan)
- Komposer kampanye dengan pratinjau, uji-kering, dan gerbang konfirmasi
- Suppression sebagai gerbang tunggal, dihormati lewat **nilai identitas** (bukan `customer_id`) —
  sehingga profil yang dibuat ulang tetap tersaring
- Tautan berhenti berlangganan berfungsi, terekam, dan bisa diaudit
- Kegagalan kirim kini mencatat sebabnya (sejak 3 Sep) — sebelumnya 18.119 kegagalan tercatat
  sebagai `unknown`
- Status run jujur: `partial` / `failed`, dan run dengan sisa penerima tetap bisa dilanjutkan

### Yang belum — berurut dari yang paling menghambat

**a. Siapa pun yang login bisa menulis ke pool (T-17).** `master_customer` punya RLS aktif tetapi
policy `authenticated_full_access` — `ALL`, `USING true`, `WITH CHECK true`, untuk peran
`authenticated`. Ditambah GRANT penuh (`INSERT/UPDATE/DELETE/TRUNCATE`). **1.358 akun di
`auth.users`** — pengguna aplikasi 20FIT mana pun yang berbagi proyek Supabase ini — dapat
menyisipkan, mengubah, atau menghapus baris pool langsung dari peramban, melewati CRM sepenuhnya.
Peran `anon` diblokir (tidak ada policy untuknya), jadi ini bukan lubang publik. Tapi setiap
pernyataan "pool ini terkendali" bergantung pada policy ini diperbaiki. **Ini bukan temuan baru
(T-17) — ia hanya belum pernah muncul di dokumen acuan.**

**b. Kapasitas provider tidak diketahui.** Pada 3 September, Mailtrap menerima **124 email** lalu
menolak **18.119** berikutnya selama 1 jam 48 menit. Status penolakannya dibuang, jadi sampai hari
ini tidak ada yang tahu apakah itu kuota harian, batas paket, atau rate limit. **Tanpa angka ini,
plafon kirim berapa pun hanya tebakan.**

**c. Plafon harian bukan plafon.** `crm_send_config.daily_limit` = 1000 (dan
`workflow_daily_cap` = 300), tapi:
- kegagalan tidak memakan budget (18.243 percobaan pada hari berplafon 1000)
- keberhasilan keluar dari penghitung saat webhook mengubah `sent` → `delivered`

Akibatnya plafon hanya membatasi pengiriman berhasil **di dalam satu run**. Rangkai dua run dalam
sehari dan plafon itu berlaku per-kampanye, bukan per-hari.

**d. Tidak ada jalur kirim massal.** Loop kirim berurutan, **2,81 email/detik** terukur dari jejak
3 Sep (18.243 baris dalam 108 menit). 82.214 alamat = **±8,1 jam** dalam satu permintaan HTTP dari
peramban. Untuk kiriman puluhan/ratusan ribu, dibutuhkan pengiriman berkelompok di proses latar —
belum ada.

**e. Bounce keras tidak di-auto-suppress.** Alamat yang mem-bounce tetap "bisa dihubungi" dan akan
dicoba lagi. `crm_suppression` berisi **1 baris** seluruhnya.

**f. Reputasi domain belum terbangun.** `20fit.id` belum pernah mengirim volume. Kiriman besar
pertama dari domain berriwayat kosong adalah cara tercepat masuk folder spam secara permanen.

### Angka

```
Bisa dikirimi email               82.213   (dari cermin)
Punya baris kirim                 18.245   ← orang yang PERNAH DICOBA
Pernah benar-benar sampai            126   (0,2%) — terkirim 121 + bounce 5
Email sampai                         121
Bounce                                 5   (nol di-suppress)
Belum dikonfirmasi (`sent`)            2
Berhenti berlangganan                  1
Kegagalan tak terkirim            18.119   (3 Sep, penyebab kini tercatat)
```

> **Dua angka, dua arti.** 18.245 orang punya baris di `crm_message_log`; hanya 126 yang emailnya
> benar-benar meninggalkan sistem. Menyebut "126 pernah dikirimi" tanpa 18.245 di sebelahnya
> membuat kegagalan 3 September tampak seperti tidak pernah terjadi.

---

## 3 · Kelengkapan data — 🔴 Belum

### Yang sudah bisa

- Nama, email, telepon nyaris lengkap
- Riwayat transaksi lewat `customer_engagement` (unit, produk, periode)
- Tag per orang dengan kosakata terkunci dan uji paritas
- Halaman detail profil dengan kurasi demografi "isi-yang-kosong-saja"

### Yang belum

| Kolom | Terisi | Catatan |
|---|---|---|
| Nama | 82.815 (99,98%) | ✅ |
| Email (kolom `email`) | 82.341 (99,4%) | ✅ |
| Email ternormalisasi | 82.214 (99,3%) | Selisih 127 = cacat 5a |
| Telepon | 81.680 (98,6%) | ✅ |
| Kota | 5.786 (**7,0%**) | Segmentasi geografis tidak mungkin |
| Gender | **0** | Kolom ada, kosong seluruhnya |
| Tanggal lahir (di pool) | **0** | Kolom ada, kosong seluruhnya |
| Alamat | **0** | Kolom ada, kosong seluruhnya |
| LTV > 0 | 1.112 (1,3%) | Segmentasi berbasis nilai hampir tidak mungkin |
| `crm_profile_demographic` | 250 baris (246 punya tgl lahir) | Kurasi manual staf |

**Temuan yang paling layak ditindak — dan lebih maju dari yang diperkirakan.** `staging_20fit_data`
(88.536 baris) memuat **5.467 tanggal lahir**, dan **5.442 di antaranya (99,54%) cocok ke
`master_customer` lewat `email_normalized`** — pengukuran ini diulang hari ini, bukan diwarisi dari
24 Agustus.

**Jembatannya sudah setengah ada.** Ke-5.442 itu **sudah berada di cermin** sebagai
`crm_customer_mirror.staging_dob`. Yang belum:

1. `master_customer.date_of_birth` tetap **0** — jadi halaman profil dan setiap pembaca non-cermin
   tidak melihatnya
2. `SegmentCriteria` **tidak punya kriteria usia atau tanggal lahir sama sekali** (diverifikasi di
   `lib/crm/segment.ts`) — jadi angka yang ada di cermin belum bisa dipakai menyaring siapa pun
3. Ada peringatan kualitas yang sudah tercatat: **2.232 tanggal ambigu hari-bulan** (0 terbukti
   tertukar). Memindahkannya mentah-mentah berarti memindahkan ambiguitas itu juga

**Akibatnya untuk marketing:** segmentasi hari ini hanya bisa memakai unit bisnis, sumber,
kontaktabilitas, kebaruan, dan LTV. Kampanye berbasis usia, gender, atau lokasi tidak mungkin —
untuk usia, bukan karena datanya tidak ada dan bukan karena tidak sampai ke cermin, tapi karena
**tidak ada kriterianya di pembangun segmen**.

---

## 4 · Impor manual CS — 🟡 Sebagian

### Yang sudah bisa

- Impor CSV empat fase: unggah → petakan → ringkasan → laporan
- Dedup email-primer; telepon bersama tetap masuk dan ditandai (rumah tangga, orang tua–anak)
- Bukti consent per baris dengan sumber pengumpulan wajib diisi
- Tag per baris dengan validasi bentuk; tag tak sah **menggagalkan** impor, tidak didiamkan
- Orang yang sudah ada **ditandai**, tidak dilewati diam-diam
- Rollback per batch, penanda `batch:` dan `tagged:` sengaja berbeda bentuk (T-52)
- Hanya kolom aman — NIK, tanggal lahir, golongan darah, kontak darurat, data kesehatan ditolak

### Yang belum

**a. Tidak ada entri satu orang.** Rute yang ada hanya `/audience`, `/audience/[id]`, dan
`/audience/import`. CS yang mendaftarkan satu orang harus membuat CSV satu baris — itu bukan alur
kerja, itu jalan memutar.

> **Tetapi jalur tulisnya sudah ada.** Aplikasi punya **tepat satu** jalur tulis ke
> `master_customer`: RPC `crm_ingest_csv_people` (`SECURITY DEFINER`), dipanggil dari
> `app/api/audience/import/route.ts`. Tidak ada `.insert/.update/.upsert/.delete` langsung di
> mana pun pada `app`, `lib`, atau `components` — diverifikasi dengan sapuan, dan lima RPC lain yang
> dipanggil aplikasi (`crm_record_suppression`, `crm_lift_suppression`,
> `crm_upsert_profile_demographic`, `crm_refresh_customer_mirror`, `crm_staging_segment_ids`)
> diperiksa dari katalog: **tidak satu pun menulis ke `master_customer`**.
>
> Artinya entri satu orang adalah **UI + validasi di atas RPC yang sudah teruji**, bukan membangun
> jalur tulis pertama. Pekerjaannya lebih kecil dari yang tertulis sebelumnya.

**b. Hanya super admin.** `audience.import` = `allow` untuk `super_admin`, `deny` untuk **setiap**
peran lain (diverifikasi di `lib/auth/roles.ts`). Perluasan menunggu persetujuan Jeff. CS tidak bisa
memakainya sama sekali hari ini.

**c. Batas 20.000 baris per berkas** (`MAX_IMPORT_ROWS`).

**d. Excel (`.xlsx`) belum didukung** — nol referensi di seluruh basis kode. CS hampir pasti bekerja
dengan Excel, bukan CSV.

---

## 5 · Email sebagai penanda utama — 🟢 Hampir

### Yang sudah bisa

- Dedup **email-primer** (K-57): email adalah kunci, telepon adalah penanda
- Normalisasi email terpusat, dijaga uji paritas TypeScript ↔ SQL
- Suppression diselesaikan lewat nilai email
- Indeks unik pada `email_normalized`

### Tiga cacat konkret

**a. 127 baris punya `email` tetapi `email_normalized` NULL.** 28 di antaranya cocok dengan sumber
pipeline — artinya **28 duplikat orang yang sudah ada** akan terbentuk pada malam pertama pipeline
berjalan kalau dedupnya memakai `email_normalized` saja. Kunci dedup wajib
`coalesce(email_normalized, email)`. Penyebab 127 baris itu belum diketahui; kalau mekanismenya
masih hidup, menambal 127 baris hanya memperbaiki hari ini.

**b. 489 orang tidak punya email sama sekali.** Di bawah model email-primer, mereka tidak bisa
di-dedup, tidak bisa dihubungi, dan tidak terlihat oleh sebagian besar logika sistem. Belum pernah
ada keputusan tentang nasib mereka.

> **Koreksi terhadap versi awal dokumen ini:** angka yang sebelumnya tertulis, 616, adalah
> 489 + 127 — ia menghitung ganda ke-127 baris cacat (a) sebagai "tanpa email". Keduanya butuh
> tindakan yang **berbeda**: 127 punya email yang bisa dinormalisasi, 489 tidak punya apa pun.

**c. Indeks unik email bersifat parsial** — mengecualikan baris `is_merged` dan
`is_potential_duplicate`. Aman hari ini (15 dugaan duplikat, 0 merged), tapi berarti keunikan email
bukan jaminan mutlak.

---

# PRIORITAS

Urutan ini mengikuti satu aturan: **kerjakan lebih dulu yang membuka pekerjaan lain.**

## P0 — Menghambat seluruh nilai sistem

Tanpa ini, semua data yang dikumpulkan tetap tidak bisa dipakai.

| # | Pekerjaan | Milik | Catatan |
|---|---|---|---|
| P0-1 | **Cek dashboard Mailtrap 3 Sep** — kode status penolakan pukul 07:20 UTC | Pemilik | Satu tugas 10 menit yang menghambat P0-2 |
| P0-2 | **Putuskan plafon kirim** + perbaiki penghitung | Pemilik → Teknis | Menghambat kampanye apa pun ke audiens nyata |
| P0-3 | **Bangun jalur kirim massal** berkelompok di proses latar | Teknis | 8,1 jam berurutan tidak layak |
| P0-4 | **Auto-suppress bounce keras** | Teknis | Melindungi reputasi domain |
| P0-5 | **Jadwal ramp bertahap** — mulai ribuan, naik setelah melihat bounce | Pemilik | Bukan batas teknis, tapi disiplin |
| P0-6 | **Perbaiki policy `authenticated_full_access` (T-17)** | Teknis + Jeff | 1.358 akun bisa menulis pool langsung; naik ke P0 karena setiap klaim kendali atas pool bergantung padanya |

## P1 — Menghambat tujuan "hub seluruh ekosistem"

| # | Pekerjaan | Milik | Catatan |
|---|---|---|---|
| P1-1 | **Jalankan impor 6 berkas CSV** (siap, angka dari putaran sebelumnya — hitung ulang saat gerbang dibuka) | Pemilik | Mulai dari berkas terkecil |
| P1-2 | **Selidiki + perbaiki 127 `email_normalized` NULL** | Teknis | Prasyarat pipeline; cari sebabnya, bukan hanya tambal |
| P1-3 | **Jawab 4 keputusan pipeline**, lalu bangun fase 1: my20fit + arena | Pemilik → Teknis | Rancangan selesai; consent lewat singgahan + gerbang |
| P1-4 | **Impor sekali jalan sumber beku** (1.549 orang) | Teknis | `event_transaction`, `cf_hyrox` |
| P1-5 | **Tinjau `talent_accounts`** setelah 2 minggu | Pemilik | 682 orang baru (497 eksklusif); tabel baru berumur 15 hari — pastikan laju, bukan backfill |

## P2 — Menghambat "data bisa dikelola dan digunakan"

| # | Pekerjaan | Milik | Catatan |
|---|---|---|---|
| P2-1 | **Entri satu orang untuk CS** | Teknis | UI + validasi di atas `crm_ingest_csv_people`; jalur tulisnya sudah ada dan teruji |
| P2-2 | **Kriteria usia/tgl lahir di pembangun segmen** | Teknis | 5.442 sudah ada di cermin; yang hilang kriterianya, bukan datanya. Tangani 2.232 tanggal ambigu lebih dulu |
| P2-3 | **Segmentasi berbasis tag** — kolom `tags` di cermin + kriteria | Teknis | Tanpa ini, tag tersimpan tapi tak berguna |
| P2-4 | **Perluas RBAC `audience.import`** ke CS/manager | Jeff | Tanpa ini hanya super admin bisa mengimpor |
| P2-5 | **Dukungan Excel** untuk impor | Teknis | CS bekerja dengan `.xlsx` |
| P2-6 | **Pindahkan tgl lahir ke `master_customer`** | Teknis | Melengkapi P2-2 untuk pembaca non-cermin (halaman profil) |

## P3 — Utang yang tidak menghambat, tapi menua

| # | Pekerjaan | Catatan |
|---|---|---|
| P3-1 | Nasib **489 orang tanpa email** | Keputusan pemilik |
| P3-2 | **T-57** — suppression per-orang atau per-saluran | Belum pernah diputuskan sadar |
| P3-3 | **T-61** — kegagalan cron tak diawasi siapa pun | Butuh saluran pemberitahuan |
| P3-4 | **36 antrean workflow** dari jalur rusak 31 Agu | Pemilik sudah minta dikosongkan |
| P3-5 | **Aktifkan workflow** — `crm_workflow` berisi 1, nol pernah jalan | Sambutan lebih dulu |
| P3-6 | `crm_email_unsubscribe` — hapus atau terapkan | `supabase db push` tetap tidak aman sampai selesai |
| P3-7 | **Sapuan `migration repair`** 30 berkas | Sama seperti di atas |
| P3-8 | **Menu Analytics event** — kohort peserta | Rancangan selesai |

---

## Pola yang harus terus dijaga

Delapan instans **kegagalan senyap** tercatat sepanjang pembangunan sistem ini. Semuanya berbentuk
sama: sesuatu gagal, penyebabnya dibuang, dan sistem melaporkan keadaan yang lebih baik daripada
kenyataannya.

Kampanye yang dilaporkan "terkirim" padahal 99,3% gagal. Hitungan audiens yang menyusut diam-diam.
Impor yang menyarankan "coba lagi" untuk sesuatu yang tak akan pernah berhasil. Caption dashboard
yang benar saat ditulis lalu berhenti benar. Runbook yang kedaluwarsa tiga hari setelah ditulis.

Yang menghentikan kelasnya bukan perbaikan satu per satu, melainkan **pagar yang membaca sumber**:
enam pagar terpasang hari ini, masing-masing dibuktikan menggigit sebelum diterima. Setiap pekerjaan
baru yang menciptakan kosakata, aturan, atau angka di dua tempat wajib membawa pagar yang
mempertemukan keduanya.

**Dan yang belum punya pagar sama sekali: kalimat.** Caption, runbook, dan deskripsi PR menua tanpa
ada yang memberi tahu. Angka yang muncul di layar harus dihitung dari data; kalau benar-benar tidak
bisa, ia wajib membawa tanggal pengukuran dan tanda visual bahwa ia manual.

Dokumen ini **termasuk di dalamnya**. Lihat bagian berikut.

---

## Cara memakai dokumen ini

- Setiap pekerjaan baru harus bisa ditunjuk ke salah satu baris prioritas di atas. Kalau tidak bisa,
  ia butuh pembenaran tersendiri sebelum dikerjakan.
- Angka di dokumen ini adalah **potret 7 September 2026, 17:30–18:00 UTC**. Sumber hidup bertumbuh.
  Ukur ulang sebelum memakainya untuk keputusan baru — dan **kalau Anda memperbarui angkanya,
  perbarui tanggal di baris pertama**.
- Nomor temuan (T-xx) dan keputusan (K-xx) merujuk `docs/riwayat/TEMUAN.md` dan
  `docs/riwayat/KEPUTUSAN.md`.

### Kenapa dokumen ini akan menua, dan apa yang bisa memeriksanya

Pagar yang membaca sumber **tidak bisa memeriksa prosa** — ia tidak tahu apakah "82.830" masih benar.
Tetapi ada satu hal yang bisa diperiksa secara mekanis, dan itu justru bagian yang paling berbahaya:
**apakah dokumen ini menyatakan kapan ia diukur.**

Yang bisa dibangun (**belum dibangun — usulan saja**):

1. **Pagar umur, bukan pagar nilai.** Sebuah pengujian membaca baris `⏱ DIUKUR:` di kepala berkas,
   mem-parse tanggalnya, dan **GAGAL kalau lebih tua dari 30 hari**. Ia tidak memeriksa satu angka
   pun — ia memaksa seseorang membukanya kembali. Kegagalannya bukan "angka ini salah" melainkan
   "tak ada yang tahu apakah angka ini masih benar", yang persis keadaan sebenarnya.
2. **Pagar bentuk.** Berkas yang memuat angka besar (`\d{2}\.\d{3}`) tanpa baris `⏱ DIUKUR:`
   ditolak. Ini bisa diterapkan ke seluruh `docs/`, bukan hanya berkas ini — dan itulah yang akan
   menangkap runbook berikutnya sebelum ia menggigit.
3. **Yang TIDAK saya usulkan:** membuat angkanya dihitung otomatis saat build. Itu memindahkan
   dokumen acuan ke dalam pipeline build, membuat `docs/` tak bisa dibaca tanpa basis data, dan
   menukar satu kelas kegagalan senyap dengan yang lain (kueri berubah arti, teksnya ikut berubah,
   tak ada yang menyadari).

Nomor 1 dan 2 kecil dan bisa dibuktikan menggigit. Keduanya **belum dibangun** — pemilik yang
memutuskan apakah putaran berikutnya membangunnya.
