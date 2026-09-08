# Rancangan: pipeline harian ekosistem 20FIT

> ## ⏱ DIUKUR: 7 September 2026, 14:00–18:00 UTC
>
> **Status: RANCANGAN. Nol tabel, nol migrasi, nol cron.** Dokumen ini tidak membangun apa pun.
> Ia mengukur ulang premisnya, menjawab enam pertanyaan rancangan dengan angka, lalu menyerahkan
> satu daftar keputusan ke pemilik.
>
> **Semua angka di bawah diukur 7 September 2026** dari basis data produksi
> (`cpvzwqptzcxnwzfzgrmt`), lewat `execute_sql`, bukan disalin dari dokumen lain. Sumber hidup
> bertumbuh setiap hari — angka ini akan meleset dalam hitungan minggu. **Ukur ulang sebelum
> memakainya untuk keputusan berikutnya** (T-63: register yang menua adalah bahaya).

---

## 0. Ringkasan untuk yang membaca satu halaman

Tiga hal yang mengubah gambaran, sebelum apa pun dirancang:

1. **`uob_users` bukan sumber terpisah.** 1.161 dari 1.174 emailnya sudah ada di
   `my20fit_profile`. Hanya **13** yang tidak. Premis putaran ini — "nilai tambahnya terutama
   my20fit (955) dan UOB (868)" — tidak bertahan: keduanya sebagian besar **orang yang sama**.
2. **`profiles` adalah kembaran persis `my20fit_profile`.** Irisan 1.355, nol unik di kedua sisi.
   Menghitung keduanya berarti menghitung ganda.
3. **Ada sumber hidup yang belum pernah masuk daftar sama sekali:** `talent_accounts`
   (682 orang baru, 497 di antaranya tidak ada di sumber lain mana pun) dan
   `arena_class_bookings` (405 baru, 357 eksklusif).

Setelah dedup lintas-sumber, **seluruh sumber HIDUP bersama menyumbang 1.867 orang baru**, bukan
2.923. Angka 2.923 milik pemilik benar untuk lima sumber yang diukur — tetapi 1.056 dari selisihnya
datang dari dua sumber yang **beku** (`event_transaction`, `cf_hyrox_participants`), yang tidak
butuh pipeline harian sama sekali. Itu kerja satu kali, dan sebagian besar sudah tercakup enam
berkas CSV yang menunggu di gerbang impor.

**Pipeline harian tetap masuk akal — tapi alasannya berbeda dari yang diperkirakan.** Alasannya
bukan 2.923 orang yang tertinggal; itu bisa diselesaikan sekali. Alasannya adalah **laju masuk yang
terus berjalan**: 322 orang baru dari my20fit dan 75 dari arena dalam 7 hari terakhir. Kolam yang
beku sejak 27 Agustus akan beku lagi dua minggu setelah impor manual berikutnya.

---

## 1. Rekonsiliasi dengan angka pemilik

Angka pemilik direproduksi **persis**, dan selisihnya dijelaskan — bukan ditutup.

| Ukuran | Pemilik | Saya | Selisih |
|---|---|---|---|
| Email unik, 5 sumber | 4.766 | 4.769 (mentah) / 4.760 (berbentuk email) | 3 / −6 |
| Sudah ada di `master_customer` | 1.843 | **1.843** (via `email_normalized`) | **0** |
| Orang baru | 2.923 | 2.926 (mentah) / 2.889 (berbentuk email) | 3 / −34 |

Dua sumber selisih, keduanya nyata:

- **14 email tak berbentuk email** di lima sumber itu (2 di `event_transaction`, 9 di
  `arena_class_bookings`, 3 di `cf_hyrox_participants`). Saya membuangnya; hitungan mentah tidak.
- **`email_normalized` tidak selalu terisi.** 127 baris `master_customer` punya `email` tetapi
  `email_normalized` NULL. **28** di antaranya cocok dengan sumber-sumber ini. Artinya:
  sudah-ada = 1.843 kalau di-join lewat `email_normalized` saja, **1.871** kalau lewat
  `coalesce(email_normalized, email)`.

> **TEMUAN — ini bukan detail akademis.** Pipeline yang melakukan dedup hanya lewat
> `email_normalized` akan **membuat 28 duplikat orang yang sudah ada di CRM**, hari pertama ia
> jalan. Kunci dedup wajib `coalesce(email_normalized, email)`, atau 127 baris itu diperbaiki
> lebih dulu. Saya tidak memperbaikinya di putaran ini — itu tulisan ke `master_customer`.

---

## 2. Peta sumber: mana yang HIDUP, mana yang BEKU

Ini pertanyaan terpenting LANGKAH 0. Sumber yang beku tidak membenarkan cron; ia membenarkan satu
impor.

`n_live_tup` dari `pg_stat_user_tables` **tidak dipakai** — ia perkiraan dan membaca 0 untuk tabel
yang belum pernah di-`ANALYZE` (`event_transaction` membaca 0, isinya 4.790). Semua di bawah
`count(*)` nyata.

### HIDUP — ada baris dalam 7 hari terakhir

| Sumber | Baris | Email valid unik | Baru vs CRM | **Eksklusif** | Baru 7h | Baru 30h |
|---|---|---|---|---|---|---|
| `my20fit_profile` | 1.355 | 1.355 | 953 | 0 *(kembar `profiles`)* | 322 | 405 |
| `profiles` | 1.355 | 1.355 | 953 | 0 *(kembar my20fit)* | — | — |
| `uob_users` | 1.174 | 1.174 | 867 | **11** | 324 | 407 |
| `talent_accounts` | 727 | 726 | 682 | **497** | 677 | 681 |
| `arena_class_bookings` | 3.284 | 1.134 | 405 | **357** | 75 | 212 |
| `clinic_patients` | 283 | 129 | 31 | **28** | 14 | 31 |
| `my20fit_inbox` | 377 | 65 | 25 | 0 | 14 | 25 |
| `arena_package_orders` | 91 | 67 | 22 | **9** | 4 | 13 |
| `gym_membership_orders` | 30 | 16 | 10 | 0 | 5 | 9 |
| `gym_class_bookings` | 17 | 14 | 4 | **2** | 1 | 1 |
| `clinic_bookings` | 492 | 9 | 3 | **1** | 2 | 3 |
| `gym_memberships` | 3 | 3 | 2 | 0 | 2 | 2 |
| `arena_bookings` | 295 | 33 | 1 | 0 | 1 | 1 |

*"Eksklusif" = orang baru yang **hanya** sumber ini punya. Kolom inilah yang menentukan apakah
sebuah sumber layak dipasang, bukan kolom "Baru vs CRM".*

**Total sumber hidup setelah dedup lintas-sumber: 3.014 email unik → 1.867 orang baru,
1.147 sudah ada.** 1.286 email muncul di dua sumber hidup atau lebih.

### BEKU — tidak ada baris baru

| Sumber | Baris | Baris terakhir | Catatan |
|---|---|---|---|
| `event_transaction` | 4.790 | `paid_at` 11 Agu | Tak punya `created_at`. Sumbangan besar (1.733) tapi **satu kali** |
| `cf_hyrox_participants` | 1.038 | 30 Mei | Menyumbang **1** orang baru — konsisten dengan beku |
| `admin_hub_ext_customer` | 2.123 | 4 Sep | Hanya **2** hari `created_at` berbeda → impor massal, bukan umpan |
| `rc_ticket_invites` | 432 | 19 Jul | |
| `rc_participants` | 321 | 30 Mei | |
| `clinic_legacy_patient_import` | 876 | hanya `imported_at` | Namanya sudah menyatakan dirinya |
| `sales_pipeline_shop` | 356 | tanpa `created_at` | Tak bisa inkremental |
| `my20fit_user_activity` | 207 | tanpa `created_at` | Tak bisa inkremental |
| `rc_backpack_orders` | 75 | 28 Mei | |
| `arena_members` | 3 | 13 Apr | |

> **Jawaban langsung atas pertanyaan pemilik:** `uob_users` **tidak** beku (364 baris dalam 7 hari).
> Tetapi 867 orang barunya **hampir seluruhnya orang yang sama dengan `my20fit_profile`** — grafik
> mingguannya nyaris identik minggu demi minggu (190/183, 106/112, 96/98, 16/16, 54/55, 22/22,
> 12/12, 31/31, 316/318). Keduanya satu alur pendaftaran, bukan dua kolam.

### Kualitas email per sumber

| Sumber | Kosong | Tak berbentuk email | Baris → email unik |
|---|---|---|---|
| `my20fit_profile` · `profiles` · `uob_users` | 0 | 0 | 1:1 — bersih |
| `talent_accounts` (kolom `login`) | 0 | 1 | 727 → 726 |
| `arena_class_bookings` | 0 | 9 | 3.284 → 1.134 (2,9 baris/orang) |
| `cf_hyrox_participants` | 0 | 3 | 1.038 → 504 |
| `event_transaction` | 0 | 2 | 4.790 → 3.178 |
| **`clinic_bookings`** | **473 dari 492** | 0 | **→ 9** |
| **`clinic_patients`** | **154 dari 283** | 0 | **→ 129** |
| **`arena_bookings`** | **57 dari 295** | 0 | **→ 33** |
| `my20fit_inbox` | 4 | 0 | 377 → 65 |

`clinic_bookings` 96% tanpa email. Ia tidak layak jadi sumber email; kalau klinik akan dipakai,
kuncinya telepon (lihat `docs/RENCANA-multisumber.md`: klinik memang phone-first, 12 cocok lewat
email vs 106 lewat telepon).

### Penanda "dihapus/nonaktif" di sumber — **tidak ada yang berfungsi**

Empat tabel punya kolom yang terlihat seperti penanda. Semuanya **100% `true`**:

| Kolom | Nilai |
|---|---|
| `uob_users.is_active` | `true` 1.174 · `false` 0 |
| `clinic_patients.is_active` | `true` 283 · `false` 0 |
| `gym_memberships.is_active` | `true` 3 · `false` 0 |
| `my20fit_profile` | tak ada kolom sejenis |

`arena_class_bookings.status` punya 474 `cancelled` dari 3.284 — tetapi itu status **pemesanan**,
bukan status orang; orang yang membatalkan kelas tetap orang.

> **TEMUAN:** tidak ada satu pun sumber yang menandai penghapusan. Kalau seseorang dihapus di
> sumber, barisnya **hilang tanpa jejak**. Ini menentukan jawaban pertanyaan 3 di bawah, dan
> menutup satu opsi rancangan sepenuhnya.

---

## 3. Bentuk yang diusulkan: dua lapisan, dipisah gerbang

**Usulan: tarikan harian dan penulisan ke `master_customer` adalah dua hal yang berbeda, dan
di antaranya ada gerbang.**

```
  sumber hidup ──(harian, otomatis)──▶  LAPISAN A: singgahan   ──(gerbang)──▶  LAPISAN B: promosi ──▶ master_customer
                                        (tulis-saja, tak                        (dijalankan
                                         pernah sentuh CRM)                       terpisah)
```

**Alasannya bukan kehati-hatian abstrak.** Tiga alasan terukur:

1. **Consent.** 1.867 orang ini tidak pernah menyetujui apa pun dari 20FIT sebagai satu perusahaan.
   Begitu mereka ada di `master_customer` dengan email, mereka **dapat dikirimi** — karena
   suppression adalah satu-satunya gerbang kirim (K-36), dan suppression sekarang berisi **1 baris**.
   Bukti empirisnya sudah ada di produksi: **704 orang punya email dan tidak punya baris consent
   sama sekali, dan mereka tetap `sendable` hari ini.** Menaruh consent di lapisan A berarti
   keputusan itu bisa dibuat sebelum orangnya bisa dikirimi, bukan sesudah.
2. **Data sensitif.** `clinic_patients` menyimpan NIK, tanggal lahir, alamat, kontak darurat —
   semuanya di balik izin `profile.view_health` (temuan 12 Agu, `docs/RENCANA-multisumber.md`).
   Pipeline yang menulis langsung ke `master_customer` melewati gerbang itu tanpa ada yang
   memutuskannya.
3. **Kebalikan.** Satu tarikan yang salah di lapisan A dibuang dengan `delete from ... where
   run_id = ...`, tanpa menyentuh satu baris pun CRM. Satu tarikan yang salah langsung ke
   `master_customer` harus di-rollback lewat penanda tag — mekanisme yang ada, tapi jauh lebih
   mahal untuk dijalankan setiap hari.

Yang **tidak** saya usulkan: menulis ke `crm_consent` dari pipeline. Sumber tidak memberi kita
basis consent apa pun yang jujur; menuliskannya berarti mengarang bukti.

---

## 4. Enam pertanyaan rancangan

### 4.1 Penuh atau inkremental, per sumber?

| Sumber | Kolom waktu | Bisa inkremental? | Usul |
|---|---|---|---|
| `my20fit_profile` | `created_at`, `updated_at` | ya | **inkremental** `updated_at > checkpoint` |
| `uob_users` | `created_at`, `updated_at` | ya | inkremental — tapi lihat 4.7 |
| `talent_accounts` | `created_at` saja | sebagian | inkremental `created_at`; perubahan tak terdeteksi |
| `arena_class_bookings` | `created_at`, `updated_at` | ya | inkremental |
| `clinic_patients` | `created_at`, `updated_at` | ya | inkremental — **kalau** diputuskan ikut |
| `profiles` | `created_at` saja | — | **jangan dipasang** (kembaran) |
| `event_transaction` | hanya `paid_at`, `imported_at` | tidak | **beku — impor sekali, bukan cron** |
| `sales_pipeline_shop`, `my20fit_user_activity` | tak ada | tidak | tak bisa; abaikan |

Ukurannya kecil. Tarikan penuh atas **seluruh** sumber hidup = 3.014 email unik dari ~9.500 baris.
Itu bukan beban. **Karena itu usulan sesungguhnya: tarikan PENUH, harian.** Inkremental menambah
satu keadaan yang bisa rusak diam-diam (checkpoint yang tertinggal = orang yang hilang selamanya)
demi menghemat sesuatu yang tidak perlu dihemat pada skala ini. Inkremental baru layak kalau satu
sumber melewati ~100 ribu baris.

**Kecuali `talent_accounts`, yang perlu dilihat dulu.** 715 dari 726 emailnya muncul dalam 7 hari
terakhir, dan tabelnya baru berumur 15 hari — 592 orang dalam satu minggu (31 Agu). Itu **satu
ledakan pendaftaran atau satu migrasi**, bukan laju harian yang terbukti. Sumber ini butuh dua
minggu pengamatan sebelum dipercaya sebagai umpan.

### 4.2 Apa yang terjadi kalau sumber mengubah email seseorang?

Kondisi hari ini: kunci dedup satu-satunya adalah email. Jadi **email lama dan email baru menjadi
dua orang.** Tidak ada yang mencegahnya, dan tidak ada yang melaporkannya.

Ada kunci yang lebih stabil yang tersedia dan belum dipakai:

- `my20fit_profile.auth_user_id` (uuid) — identitas login, tak berubah saat email berubah
- `uob_users.id` / `uob_users.employee_id` / `uob_users.nik`
- `talent_accounts.id`
- `clinic_patients.patient_code`

**Usul:** singgahan menyimpan **`(sumber, kunci_sumber, email)`** — bukan email saja. Kalau
`(sumber, kunci_sumber)` yang sama muncul dengan email berbeda dari tarikan kemarin, itu **bukan
orang baru**; itu **perubahan email**, dan ia masuk antrean tinjauan manusia, bukan ke
`master_customer`.

Saya **tidak bisa mengukur seberapa sering ini terjadi** — basis data hanya memberi keadaan hari
ini, bukan riwayat. Menyimpan `kunci_sumber` sejak hari pertama adalah satu-satunya cara
mengetahuinya nanti. Yang bisa saya ukur: `master_customer` **tidak punya** kolom untuk menyimpan
kunci sumber apa pun (`source` hanya berisi tiga nilai: `20fit_data_import` 81.178,
`live_txn_ingest` 1.075, `activity_ingest` 577). Jadi kunci sumber tidak punya tempat di CRM hari
ini — di singgahan, ia punya.

### 4.3 Penghapusan di hulu?

Sudah diukur di §2: **tidak ada penanda yang berfungsi.** `is_active` ada di tiga tabel dan
bernilai `true` 100% di ketiganya. Penghapusan, kalau terjadi, adalah `DELETE` senyap.

Konsekuensinya tegas, dan saya lebih suka menyatakannya daripada merancang di sekitarnya:

- Dengan tarikan **penuh**, hilangnya sebuah baris **bisa** dideteksi (ada kemarin, tidak ada
  hari ini). Dengan tarikan **inkremental**, tidak bisa sama sekali. Ini alasan kedua memilih penuh.
- **Tetapi menghapus orang dari `master_customer` karena ia hilang dari satu sumber adalah salah.**
  Orang yang berhenti dari aplikasi my20fit tidak berhenti menjadi pelanggan 20FIT. Dan yang lebih
  penting: sebuah tabel yang di-truncate lalu diisi ulang oleh tim lain akan terlihat persis seperti
  "semua orang menghapus akunnya".
- **Usul:** tarikan penuh **mencatat** kehilangan (`hilang_sejak` di singgahan) dan **tidak pernah**
  menghapus, menekan, atau menonaktifkan apa pun di `master_customer`. Kehilangan lebih dari
  ambang tertentu dalam satu malam adalah **alarm operasional**, bukan instruksi.
- Penghapusan sungguhan atas permintaan orangnya adalah jalur yang berbeda dan sudah ada:
  suppression + purge (`docs/KEPUTUSAN-penjadwalan-purge.md`). Pipeline tidak boleh menyentuhnya.

### 4.4 Kegagalan sebagian — "jangan sampai gagal senyap"

Ini justru kelemahan yang **sudah ada di produksi hari ini**, dan pipeline akan memperbanyaknya
kalau disalin polanya. `crm_refresh_customer_mirror` (cron 20:00 UTC) membaca tabel milik sepuluh
divisi lain. Kalau salah satu tim mengganti nama kolom, refresh malam itu gagal, blob
`dashboard_stats` menyimpan isi kemarin — dan **tidak ada yang mengawasi `cron.job_run_details`**
(T-61, belum ditutup). Yang menyelamatkan layar direksi bukan pemantauan, melainkan K-63: cap waktu
diambil dari `refreshed_at` blob-nya sendiri, jadi jam berhenti dan jam yang berhenti adalah alarm.

**Usul untuk pipeline, tiga lapis:**

1. **Per sumber, bukan per jalan.** Satu sumber gagal → sumber itu ditandai `gagal` dengan pesan
   errornya, sumber lain tetap jalan. Satu tabel yang di-rename tim lain tidak boleh menghentikan
   dua belas tarikan lain.
2. **Baris jalan ditulis DULU, statusnya diperbarui BELAKANGAN.** Baris `crm_source_pull` dibuat
   dengan status `berjalan` sebelum sumber pertama disentuh. Kalau prosesnya mati total di
   tengah — timeout, koneksi putus, cron dibunuh — yang tertinggal adalah baris `berjalan` yang
   tidak pernah selesai. **Itu terlihat.** Pola sebaliknya (menulis baris hanya kalau berhasil)
   membuat kegagalan total tampak persis seperti "belum pernah dijadwalkan".
3. **Jumlah yang diharapkan, bukan hanya jumlah.** Setiap tarikan mencatat `baris_dibaca` per
   sumber. Sumber yang biasanya memberi 1.174 baris lalu memberi 0 **berhasil** secara teknis.
   Nol dari sumber yang tidak pernah nol adalah kegagalan, dan hanya bisa dinamai kegagalan kalau
   angka kemarin tersimpan.

Ketiganya bertahan tanpa pemantauan eksternal. Itu syaratnya — memasang pipeline yang bergantung
pada seseorang membaca log berarti memasang T-61 untuk kedua kalinya.

### 4.5 Bagaimana operator tahu ia sudah jalan?

Yang ada sekarang untuk cron: tidak ada. Itu T-61.

**Usul:** satu baris di layar Dashboard **lapisan operasional** (bukan lapisan direksi — lapisan
direksi punya satu cap waktu potret harian, K-61/K-63, dan menambahkan kesegaran kedua ke sana
akan mengulang persis bug yang baru ditutup):

> `Tarikan ekosistem terakhir: 7 Sep 2026 19:00 · 13 sumber · 12 berhasil · 1 gagal
> (talent_accounts: relation does not exist) · 41 orang menunggu tinjauan`

Aturannya sama dengan K-63 dan alasannya sama: **cap waktu diambil dari baris `crm_source_pull`
terakhir, bukan dari jam.** Kalau pipeline mati tiga hari, garis itu berhenti di tanggal tiga hari
lalu — dan berhenti adalah alarm. Ditambah peringatan eksplisit di atas ambang (>26 jam, sama
seperti potret direksi, karena alasan slack-nya sama).

Ini juga jawaban paling murah untuk T-61 secara umum: begitu polanya ada untuk satu cron, ia bisa
dipakai untuk `crm_refresh_customer_mirror` dan `crm_refresh_customer_activity` juga.

### 4.6 Penanda rollback per jalan — bentuknya wajib berbeda

`batch:<uuid>` menentukan apa yang **DIHAPUS** oleh rollback per-batch. `tagged:<uuid>` menandai
orang yang sudah ada dan hanya dianotasi — bentuknya berbeda supaya rollback tidak akan pernah
bisa menjangkaunya, **secara BENTUK, bukan karena mengingat klausa WHERE** (T-52).

Penanda pipeline harus tunduk aturan yang sama, dan lebih ketat: ia dibuat **setiap hari, otomatis,
tanpa ada manusia yang melihatnya**.

**Usul:**

| Peran | Penanda | Dihapus rollback? |
|---|---|---|
| Orang BARU yang dipromosikan dari satu jalan | `tarikan:<run_id>` | **ya** — inilah kuncinya |
| Orang LAMA yang jalan itu hanya sentuh | `terlihat:<run_id>` | **tidak pernah** |

Empat sifat yang wajib, dan alasan masing-masing:

1. **Namespace baru, bukan `batch:`.** Rollback CSV menghapus `batch:` — dan tidak boleh pernah
   secara tak sengaja menghapus orang yang dibawa pipeline. Dua mekanisme, dua namespace.
2. **Bukan `tagged:` juga.** `tagged:` sudah punya arti ("orang lama disentuh impor CSV"). Memakai
   ulang berarti rollback CSV dan rollback pipeline saling melihat baris satu sama lain.
3. **`SYSTEM_TAG_NAMESPACES` bertambah dua, `TAG_NAMESPACES` tidak bertambah.** Operator tidak boleh
   bisa mengetik `tarikan:<id>` di kolom `tags` sebuah CSV — persis alasan `batch:` ditolak dari
   input operator hari ini (`lib/crm/tags.ts`). `isOperatorTag` menolak, `isStoredTag` menerima.
   `tags.parity.test.ts` sudah membandingkan daftar TS dengan regex di dalam
   `crm_ingest_csv_people` karakter demi karakter — pagar itu harus ikut mencakup namespace baru,
   atau ia akan hijau sambil tidak memeriksa apa pun.
4. **`run_id` adalah uuid, bukan tanggal.** Dua jalan dalam satu hari (satu gagal, satu diulang)
   akan berbagi tanggal yang sama, dan rollback yang menghapus `tarikan:2026-09-07` akan menghapus
   keduanya.

### 4.7 Sumber mana yang layak dipasang (yang sebenarnya ditanyakan angka)

Diurutkan menurut kolom **eksklusif**, bukan kolom "baru vs CRM":

| Sumber | Eksklusif | Baru/7h | Layak? |
|---|---|---|---|
| `talent_accounts` | **497** | 677 | **Ya — tapi tunggu.** Tabel berumur 15 hari; 592 dari 682 datang dalam satu minggu. Amati 2 minggu dulu |
| `arena_class_bookings` | **357** | 75 | **Ya.** Laju stabil dan nyata: 42·55·34·35·71 per minggu sejak awal Agustus |
| `my20fit_profile` | 953 (bersama `profiles`) | 322 | **Ya — ini intinya.** Alur pendaftaran utama |
| `uob_users` | **11** | 324 | **Tidak sebagai sumber orang.** 98,9% termuat di my20fit. Nilainya adalah *kolom*-nya (`department`, `employee_id`, `team`), bukan orangnya |
| `clinic_patients` | 28 | 14 | **Keputusan pemilik.** 28 orang tidak sebanding dengan membawa NIK/alamat/kontak darurat melewati gerbang `profile.view_health` |
| `profiles` | 0 | — | **Tidak.** Kembaran persis |
| `my20fit_inbox` | 0 | 14 | **Tidak.** Nol eksklusif |
| `arena_package_orders` | 9 | 4 | Marginal |
| `gym_*`, `arena_bookings`, `clinic_bookings` | ≤2 | ≤2 | **Tidak.** Di bawah kebisingan |

**Fase satu yang diusulkan: tiga sumber** — `my20fit_profile`, `arena_class_bookings`,
`talent_accounts` (yang ketiga setelah dua minggu pengamatan). Ketiganya menutup
**1.807 dari 1.867** orang baru sumber hidup. Sepuluh sumber sisanya bersama-sama menambah 60.

### 4.8 Jam berapa?

Slot yang sudah terpakai (dari `cron.job`, diukur 7 Sep):

| Jam UTC | Pekerjaan |
|---|---|
| 20:00 | `crm-refresh-customer-mirror` |
| 20:30 | `crm-refresh-customer-activity` |
| 21:00 | `sync-ticket-events-daily` |
| tiap jam :00 | `cancel-expired-bookings` |
| tiap 5 menit | `crm-run-scheduled-sends` |

**Usul: 19:00 UTC (02:00 WIB).** Bukan sekadar slot kosong — **satu jam sebelum** refresh mirror
20:00, supaya orang yang dipromosikan malam itu sudah terhitung di potret yang dibaca direksi pagi
harinya. Menjadwalkannya setelah 20:00 berarti setiap orang baru tampil di layar direksi
terlambat satu hari penuh, dan tak akan ada yang tahu kenapa.

---

## 5. Yang TIDAK dirancang dokumen ini, dan alasannya

- **Menulis `crm_consent`.** Sumber tidak memberi basis consent yang jujur. Ini keputusan 1 di
  bawah, bukan detail implementasi.
- **Memperbaiki 127 baris `email_normalized` NULL.** Itu tulisan ke `master_customer`.
- **Menutup T-61 secara umum.** §4.5 mengusulkan polanya; memasangnya ke dua cron yang sudah ada
  adalah putaran tersendiri.
- **Menggabungkan orang duplikat.** `is_potential_duplicate` sudah ada di skema dan di luar lingkup.
- **Menyentuh `fetchSuppressedCustomerIds`.** Diselesaikan pemilik: suppression diselesaikan lewat
  nilai identitas (email/telepon), bukan `customer_id`, jadi profil yang diimpor ulang dengan email
  yang sama tetap tersaring. Rancangannya sudah benar.

---

## 6. Bukti pengukuran

Semua angka di atas berasal dari `execute_sql` pada `cpvzwqptzcxnwzfzgrmt`, 7 September 2026.
Bentuk email yang dipakai di seluruh dokumen:

```sql
lower(btrim(email)) ~ '^[^@[:space:]]+@[^@[:space:]]+\.[a-z]{2,}$'
```

Kunci pembanding CRM: `coalesce(email_normalized, email)` — bukan `email_normalized` saja
(lihat §1).

Sumber yang **tidak** dipakai dan alasannya: `n_live_tup` (perkiraan, membaca 0 untuk tabel yang
belum di-`ANALYZE`); jumlah mana pun dari dokumen lain di repo ini (T-63).
