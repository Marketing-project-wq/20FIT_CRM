# Usulan — penyaluran profil harian (belum dibangun)

**Status: USULAN. Tidak ada satu baris kode pun yang dibangun untuk ini.** Dokumen ini menyiapkan
keputusan pemilik, bukan melaksanakannya.

Semua angka di bawah diukur langsung di produksi `cpvzwqptzcxnwzfzgrmt` pada **7 September 2026**,
dan **akan sudah berubah saat Anda membacanya** — itu justru inti masalahnya.

---

## 1. Masalahnya dalam satu kalimat

Orang bertambah di sistem 20FIT lain setiap hari; di CRM mereka hanya bertambah ketika seseorang
menjalankan muatan manual. Tiga muatan sejauh ini:

| Muatan | Tanggal (WIB) | Profil masuk |
|---|---|---|
| 1 | 20 April 2026 | 81.178 |
| 2 | 31 Juli 2026 | 1.075 |
| 3 | 27 Agustus 2026 | 577 |
| | **Total** | **82.830** |

Setiap muatan adalah **satu sisipan borongan**: seluruh 81.178 baris muatan pertama memikul cap
waktu `created_at` yang identik sampai mikrodetik (`2026-04-20 18:28:33.232369`). Itulah buktinya
bahwa ini muatan, bukan aliran. Di antara ketiganya, **nol** profil masuk.

## 2. Sumber mana yang punya pendaftar baru, dan seberapa besar celahnya hari ini

Diukur 7 Sep 2026. "Celah" = orang di sistem sumber yang belum punya profil CRM, dicocokkan lewat
email ternormalisasi (klinik: telepon lebih dulu, lalu email — K-06).

| Sumber | Tabel | Orang di sumber | Sudah di CRM | **Celah** |
|---|---|---|---|---|
| my20fit | `my20fit_profile` | 1.334 | 394 | **940** |
| Arena | `arena_class_bookings`, `arena_bookings`, `arena_package_orders`, `arena_members` | 1.158 | 724 | **434** |
| Klinik | `clinic_patients` | 277 | 239 | **38** |
| Gym | `gym_class_bookings`, `gym_memberships`, `gym_membership_orders` | 24 | 13 | **11** |
| Hyrox | `cf_hyrox_participants` | 505 | 504 | **1** |
| | | | **jumlah per-sumber** | **1.424** |
| | | | **orang berbeda** | **1.374** |

Dua angka terakhir menjawab pertanyaan berbeda dan **tidak boleh dipertukarkan**. Jumlah per-sumber
menghitung ganda siapa pun yang ada di dua sistem; angka orang-berbeda tidak. Layar direksi memakai
yang **1.374**. Alasannya ada di `lib/crm/dashboard-sources.ts`.

**Yang paling banyak menganggur: `my20fit_profile`.** 940 dari 1.334 orangnya — 70% — tidak ada di
CRM. Itu bukan ekor panjang; itu sumber utama yang praktis tidak tersalurkan. Kalau hanya satu
sumber yang boleh disambungkan lebih dulu, ini dia.

**Hyrox nyaris tertutup (celah 1).** Bukan karena ada pipeline, tapi karena muatan 27 Agustus baru
saja mengangkat orang-orangnya. Itu memperlihatkan bentuk masalahnya: celah bukan cacat permanen,
ia **tumbuh kembali** setelah setiap muatan. Angka Hyrox hari ini adalah foto sesaat, bukan sifat
tetap — kesalahan baca yang sama persis dengan T-50.

## 3. Yang dibutuhkan kalau ini dibangun

1. **Fungsi ingest per sumber.** Sudah ada dua contoh yang bentuknya benar:
   `crm_ingest_activity_people` (migrasi 28) dan `crm_ingest_csv_people` (migrasi 37, diterapkan
   7 Sep 2026) — `SECURITY DEFINER`, EXECUTE hanya `service_role`, kolom aman saja, dedup
   email-primer (K-57), telepon bentrok dikosongkan, satu baris bukti `crm_consent` per orang.
   Yang belum ada bukan polanya, melainkan pemicunya.
2. **Penjadwal.** `pg_cron` sudah dipakai di proyek ini (`crm-run-scheduled-sends`, tiap 5 menit).
   Menambah satu job harian bukan teknologi baru.
3. **Penanda batch per jalankan**, supaya setiap jalankan bisa dibatalkan sendiri — persis seperti
   `batch:<uuid>` pada impor CSV. Tanpa ini, "batalkan sinkron tadi malam" tak punya jawaban.
4. **Basis persetujuan per sumber.** Ini pekerjaan yang paling belum jelas, dan bukan pekerjaan
   teknis. Orang yang memesan kelas Arena tidak dengan sendirinya menyetujui pemasaran. K-36 tetap
   berlaku (persetujuan adalah bukti, suppression adalah gerbang), tapi `basis` yang ditulis untuk
   setiap sumber adalah **keputusan pemilik per sumber**, bukan default yang bisa dipilih diam-diam.
5. **Layar untuk melihat hasilnya**, dengan bentuk laporan yang sama seperti impor CSV: masuk,
   ditandai, dilewati, dan **alasannya** per baris.

## 4. Risiko — dan yang paling mahal disebut lebih dulu

**(a) Menyalurkan orang lebih cepat daripada kemampuan menghormati "berhenti".** Ini yang terbesar.
Hari ini ada **1** baris suppression aktif, dan `fetchSuppressedCustomerIds` memetakannya ke
`customer_id`, bukan ke saluran — jadi satu orang yang berhenti berlangganan email juga terblokir
di WhatsApp. Sementara itu `crm_suppression.identity_kind` menyiratkan penghentian per-saluran.
Dua bagian sistem menyiratkan dua hal berbeda (T-57). Menyalurkan ribuan orang otomatis ke dalam
ketidakjelasan itu akan memperbesarnya, bukan mengungkapnya.

**(b) Persetujuan yang tak pernah diberikan.** Lihat butir 3.4. Sebuah pipeline yang berjalan tiap
malam membuat pertanyaan "kenapa orang ini kami email?" harus terjawab dari data untuk setiap orang,
setiap malam, tanpa ada yang meninjau. Bukti harus ditulis pada saat sisip, bukan dipikirkan belakangan.

**(c) Penggabungan/duplikat masih pekerjaan manual.** `merged_into is not null` = **0** dan
`is_merged` = **0** hari ini, tapi `is_potential_duplicate` = **15**. Aliran harian akan menambah
duplikat lebih cepat daripada kemampuan siapa pun menyelesaikannya, dan indeks unik email bersifat
**parsial** (mengecualikan baris tergabung dan calon-duplikat) — jadi email yang sama BISA ada dua
kali secara sah. Perilaku penandaan untuk orang yang sudah digabung baru saja diputuskan (K-59) dan
sengaja tidak mengikuti ke baris penerus. Itu belum siap menerima aliran otomatis.

**(d) Kesalahan senyap dalam skala.** Impor manual ditinjau baris-per-baris oleh operator sebelum
dikonfirmasi. Pekerjaan tiap malam tidak ditinjau siapa pun. Semua pelajaran putaran ini — status
yang dibuang dua kali (T-41), pengiriman gagal yang tercatat "terkirim" (T-42), berkas migrasi yang
tak pernah diurai (T-54) — punya bentuk yang sama: **sesuatu berjalan tanpa ada yang melihat
hasilnya.** Pipeline harian adalah kelas kesalahan itu dalam bentuk paling murni. Kalau dibangun,
ia harus melapor dengan berisik dan berhenti sendiri saat ragu.

**(e) Angka layar direksi akan berubah artinya.** Kartu "Belum masuk CRM" mengukur biaya dari
ketiadaan pipeline. Begitu pipeline ada, angka itu berhenti berarti demikian — ia menjadi ukuran
seberapa baik pipeline itu bekerja. Captionnya harus ikut berubah pada hari yang sama, atau ia
menjadi kalimat berikutnya yang benar saat ditulis dan salah saat dibaca (K-60).

## 5. Yang TIDAK diusulkan dokumen ini

- Tidak mengusulkan jadwalnya (harian vs tiap jam) — itu bergantung pada butir 4.a dan 4.b.
- Tidak mengusulkan sumber mana yang lebih dulu, selain mencatat bahwa **my20fit** punya celah
  terbesar baik secara mutlak maupun proporsional.
- Tidak mengusulkan perubahan apa pun pada perilaku suppression. T-57 dicatat, bukan diperbaiki.

**Keputusan pemilik.** Sampai ada keputusan itu, celahnya naik sendiri — dan sekarang setidaknya
terlihat di layar, bukan hanya di dokumen ini.
