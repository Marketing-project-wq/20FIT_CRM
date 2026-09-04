# Register Temuan

Apa yang ditemukan, kapan, dan statusnya sekarang. Termasuk **kesalahan yang dibuat
sendiri** — bagian itu yang paling berguna dibaca ulang, dan yang paling mudah hilang
kalau tidak ditulis.

Status: **TERTUTUP** · **TERBUKA** · **MILIK TIM LAIN** · **DATA — tidak diremediasi**

---

## Keamanan

### T-01 · `crm_purge_audit_log` bisa dieksekusi `anon` — TERTUTUP
**Ditemukan 11 Agu (tinjauan), diperbaiki 11 Agu (migrasi 10).**
Fungsi yang menonaktifkan trigger append-only lalu menghapus baris audit adalah
`SECURITY DEFINER` dengan `EXECUTE` terbuka untuk `anon`. Siapa pun dengan anon key bisa
memanggilnya lewat `POST /rest/v1/rpc/crm_purge_audit_log` — tanpa login, tanpa peran,
melewati seluruh RBAC.

Dampak saat ditemukan terbatas: baris audit tertua 10 Agu, jadi belum ada yang >90 hari
dan panggilan hari itu menghapus nol baris; kategori kepatuhan dilindungi permanen. Yang
tetap bisa dilakukan: menulis baris `retention.purge_executed` tanpa batas ke tabel
append-only. Dan sekitar **8 November 2026** baris operasional pertama melewati 90 hari.

Pelajarannya: Sprint 3H menemukan pola auto-grant ini di migrasi 9 dan menutupnya, tapi
menilai fungsi lama "**mungkin** punya pola serupa" dan tidak memeriksa. Sudah pasti,
dan yang kena adalah fungsi paling berbahaya di sistem. **Curiga bukan pengganti
memeriksa.** Sekarang dijaga test (K-15).

### T-02 · Masking Sprint 3A bisa dilewati lewat `staging_20fit_data` — TERBUKA
**Ditemukan 11 Agu.** Tabel itu (88.536 baris, RLS OFF, sumber impor yang sama dengan
`master_customer`) bisa dibaca langsung siapa pun dengan anon key. Seorang `analyst`
tidak perlu melewati `/api/audience` untuk mendapat telepon dan email tanpa disamarkan,
dan pembacaan itu tidak meninggalkan satu pun baris `list.viewed`.

RLS OFF di tabel lama sendiri **bukan temuan** — itu sudah tercatat sebagai Fase 0 milik
tim (PRD 17.3). Yang baru adalah konsekuensinya terhadap kontrol yang baru dibangun:
kontrolnya tidak ditembus, melainkan **dilewati**.
→ `docs/RISIKO-masking-bypass.md`

### T-03 · 101 fungsi `SECURITY DEFINER` anon-executable di luar `crm_*` — MILIK TIM LAIN
**Ditemukan 11 Agu.** Pola auto-grant yang sama tersebar di sistem arena, clinic, shop,
rb, my20fit, rc, uob, talent. Angkanya **naik** tiap tim lain men-deploy (99 → 101 → 102 →
**109** pada 19 Agu 2026), yang justru membuktikan polanya sistemik. **Nol** di antaranya
milik `crm_*` (diverifikasi ulang 19 Agu: pagar EXECUTE + matview kita utuh — kenaikan murni
tim lain). Di luar lingkup sprint mana pun di sini; perlu diangkat ke pemilik proyek Supabase.
→ `docs/RISIKO-rpc-execute-terbuka.md`

### T-15 · NIK + data kesehatan ±1.100 orang terpapar anon (RLS OFF di tabel sumber) — MILIK TIM LAIN
**Ditemukan 11 Agu (Sprint 3O), diangkat dari poin 5 laporan 3N.** Sapuan seluruh skema
`public`: beberapa tabel sumber **RLS OFF** memuat data pribadi paling sensitif, terbaca
siapa pun dengan anon key tanpa login. Terberat: **`cf_hyrox_participants`** (1.038 baris) —
**NIK 1.030** (812 berbeda), tgl lahir 1.037, golongan darah 1.038, kontak darurat ~1.035.
Ditambah data medis RLS OFF: **`clinic_assessments`** (diagnosa 107), **`clinic_screenings`**
(riwayat operasi/obat/kondisi, 131 baris), dan **`cf_user`** (`password` — bernama polos, 4).
Total ±1.100 orang; NIK + kesehatan = kategori paling ketat UU 27/2022.

**Kelas berbeda dari T-02** (nama/telepon/email): ini identitas kependudukan + kesehatan.
**Bukan** kebocoran kontrol CRM — `master_customer`/`crm_*`/`customer_engagement` semua
**RLS ON** dan lapisan baca CRM tak menyentuh kolom sensitif (diperiksa 3O; test penjaga
kolom aman `customer_engagement` ditambahkan). Perbaikannya milik pemilik data: menyalakan
RLS **tanpa policy** memutus aplikasi tim lain yang membacanya lewat anon key — itulah kenapa
belum dikerjakan. Sprint ini **mengukur dan mengangkat**, tidak menyentuh.
→ `docs/ESKALASI-paparan-data-sensitif.md`

### T-17 · `master_customer` + `customer_engagement` terbuka BACA+TULIS untuk 887 akun login — MILIK TIM LAIN
**Ditemukan 11 Agu (Sprint 3Q).** Keduanya **RLS ON** tapi punya policy
`authenticated_full_access` (`PERMISSIVE · roles {authenticated} · cmd ALL · USING true`).
Artinya **setiap dari 887 akun `auth.users`** yang bisa login punya akses **BACA dan TULIS**
(`ALL` mencakup `UPDATE`/`DELETE`) ke seluruh **82.253 profil** (dan 90.419 baris engagement),
**tanpa masking, tanpa audit, melewati RBAC**. Anon key + sesi login = jalan langsung ke
PostgREST; keduanya ada di tiap bundel JS.

Klasifikasi ulang 383 tabel `public` (RLS × policy × grant, bukan RLS saja): **199 terbuka
`anon`**, **43 terbuka siapa pun yang login** (incl. `master_customer`, `customer_engagement`),
**141 terkunci**. Seluruh `crm_*` **terkunci** (RLS ON + 0 policy) — pola itu benar; yang
gagal adalah dua tabel utama produk yang punya policy permisif. **Bukan menembus, melewati:**
masking (K-02), read-only `master_customer`, jejak `list.viewed` semua di jalur aplikasi;
database tidak menegakkannya. Perbaikan (menyempitkan policy) **akan memutus aplikasi tim
lain** yang mengandalkannya → keputusan pemilik data + owner Supabase, bukan sepihak.
→ `docs/ESKALASI-paparan-data-sensitif.md`, K-23. Silang-rujuk T-02.

### T-23 · 5 view non-`crm_*` terbaca `anon` (`customer_360_v1`, `arena_dashboard`, `leaderboard_*`) — MILIK TIM LAIN
**Ditemukan 14 Agu (verifikasi grant migrasi 15/16).** Saat memverifikasi ACL matview cermin —
`has_table_privilege('anon', 'crm_customer_mirror', 'select') = false`, **benar** — sapuan
sekitarnya menemukan **lima view** dengan **`anon` SELECT = TRUE** (dan `authenticated` = TRUE),
terverifikasi 14 Agu: **`customer_360_v1`**, **`arena_dashboard`**, **`leaderboard_daily`**,
**`leaderboard_season`**, **`leaderboard_team`**. Kelas sama dengan T-03/T-17: kontrol CRM tak
ditembus, **dilewati** lewat objek milik subsistem lain (anon key ada di tiap bundel JS).
`crm_customer_mirror` sendiri **terkunci** (grant `service_role` saja) — pola cermin benar; yang
terbuka adalah view produk lain. **Di luar lingkup migrasi 16**; diukur & diangkat ke pemilik
data + owner Supabase, **tidak disentuh sepihak** (menyempitkan bisa memutus aplikasi tim lain).
Silang-rujuk T-17, K-23. **Nomor: `sprint-1` memakai T-19 untuk ini, tapi `main` sudah punya
T-19 (RFM); diselaraskan ke T-23** saat konsolidasi 2026-08-21 — lihat "Catatan penomoran".

---

## Korektness

### T-04 · Bentuk kanonik telepon tidak cocok dengan data — TERTUTUP
**Sprint 3B.** `normalizePhoneID()` menghasilkan `+62…`; seluruh 81.584 nomor tersimpan
sebagai `62…`, **nol** berawalan `+`. Pencocokan suppression akan mencocokkan nol baris,
tanpa satu pun error. Berkas `normalize.ts` sendiri menandai ini sebagai "verifikasi
Sprint-3" — verifikasinya dilakukan, dan gagal.

Jendela perbaikannya termurah saat itu karena fungsi tersebut **nol konsumen runtime**.
Setelah ingestion jalan, perubahan yang sama berarti migrasi data. → K-05

### T-05 · Kelas Tailwind bernomor tidak menghasilkan CSS — TERTUTUP
**Sprint 3B.** Banner kualitas di `/audience` tampil tanpa tint dan ikonnya tanpa warna
selama satu sprint penuh. Tidak ada yang error, jadi tidak ada yang sadar. → K-11

### T-06 · Daftar retensi hidup di tiga tempat — TERTUTUP
**Sprint 3E.** SQL migrasi 8, `classifyAction`, dan filter `.or()`. Kalau menyimpang
satu entri, layar audit memberi label "dilindungi permanen" pada baris yang sebenarnya
akan dihapus purge. → K-09

### T-07 · Kode mati di lapisan RBAC — TERTUTUP
**Sprint 3G.** `lib/auth/guard.ts` tidak pernah diimpor siapa pun (route memilih pola
inline), dan `hasAnyRole` nol referensi. Dua idiom auth dengan satu yang mati adalah
jebakan. Dihapus; jumlah test tidak berubah, yang justru membuktikan keduanya memang mati.

---

## Data — tidak diremediasi

### T-08 · `first_seen_at` adalah cap waktu muat untuk 98,7% pool
`20fit_data_import` (81.178 baris) punya `first_seen_at` **semuanya 2026-04-20** — satu
hari, nol variasi. Hanya 1.075 baris `live_txn_ingest` yang membawa tanggal nyata
(5 Feb – 8 Agu, 162 hari berbeda).

Ini membalik pemahaman temuan Sprint 2: `last_activity_at` dilarang karena 99,62% sama
dengan `first_seen_at` — ternyata itu tautologi, keduanya cap muat yang sama. Satu kolom
dilarang, pembandingnya dipertahankan, padahal sama tidak bermaknanya. → K-19

### T-09 · `live_txn_ingest` bukan feed berkelanjutan
1.075 baris, `created_at` **satu instan** (31 Juli 12:27). `20fit_data_import` juga satu
instan (20 April 11:28). Jadi dua muatan batch — sumber bernama "live" yang hanya pernah
berjalan sekali. Kartu "terakhir bertambah 31 Juli" akan terbaca "pipeline telat 11 hari"
dan menyuruh orang mencari pipeline rusak yang tidak pernah ada.

### T-10 · Satu baris `lifetime_value` negatif
−61.200.000. Jatuh di luar filter "punya revenue" (>0) **dan** "tanpa revenue" (0/NULL),
jadi hanya muncul di filter "Semua". Ditampilkan eksplisit di panel Anomali `/quality`.

### T-11 · 14 baris `first_seen_at` lebih baru dari `created_at`
Selisih terbesar 7 hari 11 jam; semuanya `live_txn_ingest`. "Pertama terlihat" setelah
barisnya sendiri dibuat adalah kontradiksi logis. Tidak bisa dihitung live (PostgREST
tak punya perbandingan antar-kolom), jadi masuk `VERIFIED_ARTIFACTS` dengan tanggal.

### T-12 · Kebisingan audit
Dari 25 baris pertama, 20 adalah `list.viewed` dari satu orang dalam satu sore. Baris
kepatuhan — alasan tabel ini ada — hanya tiga. Ditangani dengan default berpihak
kepatuhan di layar audit (3D); penjadwalan purge masih keputusan terbuka.
→ `docs/KEPUTUSAN-penjadwalan-purge.md`

### T-13 · Nilai filter tersimpan verbatim di `metadata`
Baris audit `id=18` menyimpan `filters.city = "tifany"` — ketikan pengguna, apa adanya.
Jaminan "metadata bebas PII" bersifat **perilaku, bukan struktur**. Diredam cap panjang
dan pemangkasan 90 hari. → K-17

### T-16 · `gmaol.com` (986 baris) adalah kerusakan impor SISTEMATIS, bukan 986 salah ketik — DATA, tidak diremediasi
**Ditemukan 11 Agu (Sprint 3P).** 986 baris `master_customer` berdomain email `@gmaol.com`.
**Seluruhnya `source='20fit_data_import'`, seluruhnya `created_at = 2026-04-20` pada satu
instan, satu `first_seen_at`.** 986 salah ketik independen tidak mendarat di satu instan —
ini **kerusakan sistematis** saat impor 20 April (find/replace meleset atau pemetaan kolom
salah). Implikasi lebih besar: **kolom lain di muatan yang sama mungkin rusak serupa** —
perlu diselidiki pemilik data. Domain typo lain (lebih kecil, mungkin salah ketik nyata):
`gmail.con` 204, `gmai.com` 82, `gamil.com` 49. **DITANDAI, tidak diperbaiki** — mengubah
email atas tebakan bisa mengirim data pribadi ke orang lain. Deteksi (`lib/crm/email-typo.ts`)
+ tanda per profil + hitungan `/quality`; jalur koreksi ber-audit direncanakan di
`docs/RENCANA-koreksi-kontak.md` (belum dibangun). → K-20 (anomali ditampilkan, bukan ditebak)

### T-15b · Nama campur-aduk (30.307) & bergelar — dirapikan di TAMPILAN, bukan di data
**Sprint 3P.** 30.307 nama tak-rapi, 23.415 huruf kecil semua, 3.525 kapital semua, 281
mengandung angka (kemungkinan sampah). `master_customer` read-only → dirapikan lewat fungsi
murni `lib/crm/display-name.ts` **saat menampilkan** (gelar `dr.`/`H.`/`S.Pd`, inisial
`A.M.`, partikel `bin`/`van`, tanda hubung/apostrof, spasi ganda). **Nama asli tetap
terlihat** di detail profil dan **pencarian tetap atas kolom sumber** — perapian tak boleh
membuat nama hilang. Nama berangka **ditandai** di `/quality` (bukan diperbaiki). → K-20

### T-14 · `last_seen_at` ekosistem adalah cap muat untuk 99,51% baris — DATA, tidak diremediasi
**Ditemukan 11 Agu (Sprint 3N).** `customer_engagement` (90.419 baris): **89.974 (99,51%)**
punya `last_seen_at = first_seen_at` — cap waktu muat, bukan aktivitas. Hanya **444 baris
(0,49%)** membawa aktivitas nyata (`last_seen_at > first_seen_at`, ≤ hari ini), **semuanya**
dari sumber `live_txn_sync` dan terpusat di dua produk: Transaksi Clinic (274) dan Transaksi
Arena (170). Plus **1 baris tanggal-masa-depan** (2026-12-05).

Ini **kali keempat** sebuah kolom waktu ternyata cap muat — setelah `created_at` (T-09),
`first_seen_at` (T-08), dan `last_activity_at` (Sprint 2). Empat kali bukan kebetulan; ini
**properti sumbernya**, bukan temuan per-kolom. Konsekuensi mengikat: **tidak ada kriteria
waktu** untuk ekosistem di segment builder — recency di atas kolom 99,51% cap muat sama tak
jujurnya seperti di `master_customer`. Perbandingan antar-kolom tak bisa dihitung live lewat
PostgREST → masuk `VERIFIED_ARTIFACTS` bertanggal (`ecosystem_last_seen_load_stamp`), sejajar
T-11. Baris masa-depan dihitung live di `/quality` (bandingkan ke literal waktu). → K-19

### T-18 · 7.260 baris "Fitco User" staging tak ter-resolve ke `master_customer` — DATA, tidak diremediasi
**Ditemukan 14 Agu (migrasi 16, kolom cermin Fitco).** `staging_20fit_data` memuat **74.914**
baris bertanda `"Fitco User" = 'Fitco User'` (**74.913 email unik**). Dicocokkan ke
`master_customer` lewat email `lower(btrim)`: **67.653 cocok**, **7.260 TIDAK** — email staging
tanpa padanan di `master_customer`. Kolom `crm_customer_mirror.is_fitco_member_matched` karena itu
hanya melihat 67.653; namanya memakai `_matched` untuk **jujur soal batas ini**. **Cermin tak bisa
memperbaikinya** — ini celah *identity resolution* di jalur ingestion (email tak ter-resolve saat
`master_customer` dibangun), **bukan** cacat matview. **Sengaja tidak diselesaikan di migrasi 16**;
memperbaikinya berarti menyentuh ingestion/identitas — tugas tersendiri dengan gate-nya. Konsekuensi
UI: label Fitco **dilarang** tampil polos "67.653" — wajib menyebut konteks "67.653 tercocokkan dari
74.914". → K-06 (satu kanon), K-08 (`0` vs `—`). **Nomor T-18 dirujuk komentar kolom
`crm_customer_mirror.is_fitco_member_matched` di DB** — itulah yang mengunci nomor ini lewat
tie-break saat konsolidasi 2026-08-21; lihat "Catatan penomoran".

### T-19 · RFM `staging_20fit_data` praktis tak bisa menyegmentasi — 92% dalam satu keranjang — DATA, tidak diremediasi
**Ditemukan 12 Agu (Sprint 3Y, diangkat dari laporan).** Sebaran `RFM per paid order`:
`New User` **81.213 (91,7%)** · `Potensial user` 7.057 · `-` 200 · `Loyal user` 65 ·
`Campion user` 1. **Satu keranjang memuat 92% pool, dan dua keranjang teratas
(`Loyal`+`Campion`) hanya berisi 66 orang.** Sebagai dimensi segmentasi ini **menyesatkan**:
ia tampak seperti sumbu RFM yang berguna, padahal menyaring "New User" = menyaring hampir semua
orang, dan menyaring "Loyal" = menyaring 65 orang dari 82 ribu. Ini **pola yang sama** dengan
`segment` terbalik (1.242 NULL justru LTV tertinggi) dan kolom waktu cap-muat: kolom yang ADA
tapi tak membawa sinyal yang dijanjikan namanya.

**Konsekuensi:** kriteria **tetap disediakan** (menghapusnya = menyembunyikan data yang
terukur), tetapi layar filter **memperingatkan** sebarannya supaya tak ada yang menyusun
kampanye di atasnya, dan `RFM per revenue` (0% terisi) tetap tak ditawarkan. **Tidak
diremediasi** — nilainya milik data impor, bukan untuk "diperbaiki". Disebut di layar segmen;
angka mentahnya juga di `/quality` (blok cakupan staging) dan `FAKTA-DATA`.

---

## Kesalahan sendiri

### S-01 · Saya mengklaim RLS OFF sebagai temuan baru
Prompt Sprint 3A sudah menyebutnya di tabel pembuka dan melabelinya item Fase 0 milik
tim. Tindakannya benar (tidak disentuh), framing-nya salah. Yang benar-benar baru hanya
konsekuensinya terhadap masking (T-02).

### S-02 · Saya menulis `live_txn_ingest` "mendarat dalam satu pekan"
Artefak dari `date_trunc('week')` yang saya pakai. Sebenarnya satu instan. Claude Code
mengukur ulang dan melaporkan selisihnya alih-alih menyesuaikan diam-diam — perilaku
yang benar, dan itu yang membuat kesalahan ini ketahuan.

### S-03 · Saya salah soal jumlah baris `staging_20fit_data`
Saya pakai 87.966 dari estimasi perencana (`pg_class.reltuples`) yang dikembalikan tool
daftar tabel. `count(*)` eksak = **88.536**. Estimasinya bahkan bergeser lagi ke 87.226
di sesi yang sama. Angka prompt 3A yang 88.536 benar sejak awal.

### S-04 · Sprint 3B menaikkan nol test padahal menambah aturan
Alasan "logika server-only tak bisa di-unit-test" benar untuk lapisan query, tapi tidak
untuk cap panjang, predikat kategori, dan perhitungan rasio — ketiganya fungsi murni.
Aturan sejak 3E: **aturan yang bisa jadi fungsi murni harus punya test.**

### S-05 · Status `origin/main` salah dilaporkan
Sprint 3B menyimpulkan `main` di `d92a92e` dan Sprint 3A belum di produksi, padahal PR #3
sudah ter-merge. Penyebabnya remote-tracking ref basi tanpa `git fetch`. Kesimpulan itu
sempat mengubah penilaian risiko merge. Sejak 3C, `git fetch` + melaporkan tiga keluaran
`git log` jadi langkah pertama wajib.
**Terulang, lebih mahal (24 Agu 2026):** ref basi yang sama menyesatkan `git log -S
"login.password_reset_requested" origin/main` → "nol", memicu kesimpulan **salah** "produksi =
branch" yang bertahan 5 hari (T-22/K-25/K-27, semua kini dikoreksi/dibatalkan). Commit itu sudah
di `main` lewat PR #10, 7 menit sebelum jejak yang dirujuk. Pelajaran S-05 **sudah ada** sejak 3C
namun tetap terlewat — jadi `git log -S ... origin/main` kini **tak sah sebagai bukti** tanpa
`git fetch` lebih dulu **dan** membandingkan waktu-merge PR dengan timestamp jejak. Lihat **T-27**.

### S-06 · Celah verifikasi sudah tertutup tanpa disadari
Lima sprint melaporkan "runtime belum pernah terbukti". Ketika laporan 3G ditulis,
buktinya sudah ada di baris audit `id=32` — `/consent` berjalan di produksi — dua baris
sebelum jumlah yang mereka hitung. Yang dicari ada di tempat yang sudah dibaca.

### S-07 · Bukti terlewat DUA KALI — ini pola, bukan kelalaian satu orang
`/consent` terbukti di `id=32` tapi terbaca "belum terbukti" **satu sprint penuh** (S-06).
`/settings` terbukti di `id` 44–47 dan baru ketahuan saat seseorang **memeriksa ulang**
(Sprint 3K). Lalu ketiga kalinya nyaris terjadi: V-6 tertutup di `id=51` (13:38:31 UTC,
`profile.viewed` pertama, `target_id` terisi) — prompt Sprint 3L masih menulis
"`profile.viewed` = 0" karena diukur sebelum sesi 13:38. **Penyebab yang sama tiap kali:**
status hidup di markdown yang harus diperbarui manusia, sementara bukti hidup di
`crm_audit_log` yang bergerak sendiri. Manusia lupa; tabel tidak. **Perbaikan pola
(bukan orangnya):** status diturunkan dari data di `/settings/diagnostik` → K-22. Bonus:
V-6 tertutup **membalik** kecurigaan 3K bahwa detail profil rusak — ia jalan; gap
`37,38,39` tunggal & tak berulang (sesi 13:37–13:39 sukses penuh, gap tak bertambah),
konsisten dengan kejadian transient, bukan cacat deterministik. Penyebab pastinya tetap
butuh log Railway jendela 08:01–08:58 UTC — belum terjawab.

**Pembaruan 11 Agu 15:07 UTC (Sprint 3R) — bobot diturunkan, TIDAK ditutup:** audit kini
**77 baris, `max(id)` 81, gap tetap `4, 37, 38, 39`.** Tiga puluh empat operasi teraudit
BARU sejak 3K — termasuk pembukaan detail profil (`profile.viewed`) — dan **nol gap baru**.
Hipotesis 3K "detail profil rusak" **praktis gugur**: rute yang dicurigai kini berjalan
puluhan kali tanpa meninggalkan lubang. Statusnya jadi **episode historis terbatas** (satu
jendela 08:01–08:58 UTC, 11 Agu), **bukan** cacat aktif. **Tetap terbuka**, bukan tertutup:
penyebab pasti ketiga gap itu tak pernah terbukti (butuh log Railway jendela itu), dan menutup
temuan yang belum terjawab hanya karena berhenti muncul adalah persis pola yang S-06/S-07
peringatkan. Gap tetap dipantau (`docs/PASCA-MERGE-monitoring-revert.md`, K-21).

### S-08 · Ukuran lebih sempit dari klaim: `relrowsecurity` dipakai untuk klaim "terlindungi"
**Sprint 3O → dikoreksi 3Q.** Inventaris 3O mengukur **`relrowsecurity`** (RLS on/off) lalu
menyimpulkan `master_customer`/`customer_engagement` "aman" dan menulisnya di dokumen
**eskalasi** — yang dibaca pengambil keputusan. Ternyata keduanya RLS ON **tapi** punya
policy `authenticated_full_access` (`ALL`/`USING true`) → terbuka baca+tulis untuk 887 akun
(T-17). **Ukuran (RLS) lebih sempit daripada klaim (terlindungi).**

Yang membuat ini pola, bukan kelalaian tunggal: **kehati-hatiannya sudah ditulis** — poin 8
laporan 3O menyatakan persis *"saya mengukur `relrowsecurity`, bukan tiap policy — tabel RLS
ON secara teoretis bisa punya policy permisif."* Keraguan itu benar, ditulis, lalu **tidak
ditindaklanjuti**. Ini **kali kedua** jawabannya sudah ada di tempat yang sudah dilihat
(bandingkan S-07: bukti ada di `crm_audit_log`, terlewat). **Perbaikan pola:** klaim keamanan
tabel kini **wajib** menyebut RLS **dan** policy **dan** grant (K-23), dan kueri klasifikasinya
masuk monitoring supaya bisa dijalankan ulang, bukan diandalkan pada ingatan.

## T-22 · Produksi menjalankan kode BRANCH, bukan `main` — **KESIMPULAN SALAH, DIKOREKSI 24 Agu 2026**
> **KOREKSI (24 Agu 2026) — kesimpulan ini terbalik dan ditarik.** Dashboard Railway
> (Settings → Source) menunjukkan produksi tersambung ke **`main`** dengan **auto-deploy saat
> push** — bukti dari luar repo yang tak pernah bisa saya lihat dari sandbox. Jadi produksi
> **selalu** dari `main`; kalimat asli README "push ke `main` memicu deploy" **benar sejak
> awal**, dan koreksi 12 Agu yang menandainya "salah" itulah yang keliru.
>
> **Bagaimana bukti 12 Agu menyesatkan (terbukti dari git, bukan tebakan):** temuan bersandar
> pada `git log -S "login.password_reset_requested" origin/main` → **nol**, lalu menyimpulkan
> "aksi ini hanya ada di branch, maka produksi menjalankan branch." Tetapi commit yang
> memperkenalkan aksi itu (`a9602d5`) **sudah masuk `main` lewat PR #10** — merge `1b13fa8`
> tercatat **12 Agu 04:41:32 UTC**, sedangkan baris audit reset produksi ditulis **04:48:41 /
> 04:48:44 / 04:57:35 UTC**, yaitu **7 menit setelah** kode itu ada di `main`. `git merge-base
> --is-ancestor a9602d5 1b13fa8` = **YA**. Maka "nol di `origin/main`" hanya mungkin bila
> `git log -S` dijalankan atas **ref `origin/main` basi** (belum di-fetch setelah PR #10 merge) —
> **pola S-05 (ref remote basi)**. Produksi menjalankan `main` yang baru saja di-deploy PR #10;
> reset mendarat di sana. Temuan menggambarkan keadaan `main` **sebelum** PR #10 sambil reset
> berjalan atas `main` **sesudah** PR #10.
>
> **Status:** kesimpulan "produksi = branch" **DITARIK.** K-25 dikoreksi, **K-27 dibatalkan
> seluruhnya** (keputusan "menerima deploy-from-branch" tak pernah punya kondisi yang
> diterimanya). Analisis kenapa ini lolos DUA kali → **T-27** (baru). Larangan "jangan merge ke
> `main` tanpa izin" **tetap** — kini lebih penting, karena **merge = deploy**.
>
> _Teks di bawah ini adalah rekaman asli (yang keliru), disimpan utuh agar jejak keputusan
> terbaca. Jangan dibaca sebagai keadaan sekarang._

**Migrasi 11/12 (12 Agu 2026).** Reset kata sandi nyata berhasil di produksi
(marketing@20fit.id masuk 04:58:21 UTC) dengan tiga baris audit
`login.password_reset_requested`, `actor_email='system:password-reset'`,
`metadata.outcome='sent'` (04:48:41 / 04:48:44 / 04:57:35 UTC).

**Bukti (TERBUKTI):** aksi audit itu ditulis HANYA oleh kode branch. `git log -S
"login.password_reset_requested"` dan `-S "system:password-reset"` → hanya commit branch
(3T + email-fix); **nol** di `origin/main`. `origin/main` versi `/forgot-password` adalah
komponen **klien** yang memanggil `resetPasswordForEmail` langsung dan **tak menulis audit
sama sekali**. Maka reset yang tercatat itu **tidak mungkin** dari kode `main` — ia dari kode
branch, dijalankan terhadap DB produksi (proyek Supabase yang sama).

**Kesimpulan (TERBUKTI):** kode branch `claude/lanjutkan-pekerjaan-mno804` melayani lalu-lintas
produksi. Push ke branch sepanjang sesi ini **langsung** masuk produksi.

**Yang masih perlu dikonfirmasi manusia (TAK bisa saya lihat):** setelan sumber di dashboard
Railway — apakah *service produksi* tersambung ke branch (README salah), atau ini deploy
**preview PR** dari branch yang menulis ke DB produksi bersama (service produksi tetap `main`).
Keduanya berarti kode branch berjalan atas data produksi; hanya mekanismenya beda. Cek:
Railway → project → service produksi → Settings → Source → branch tersambung + Deploy triggers.
Egress ke `20fitcrm-production.up.railway.app` diblokir proxy, jadi halaman live tak bisa saya
ambil untuk memastikan dari luar.

**JANGAN pakai `auth.users.recovery_sent_at` sebagai bukti jalur** — ia di-set oleh
`resetPasswordForEmail` (bukan `generateLink`) TAPI dibersihkan setelah reset berhasil, jadi
`null` sekarang tak membedakan kedua jalur. Diskriminatornya adalah **siapa yang menulis aksi
audit** (di atas), bukan `recovery_sent_at`.

**Dampak:** gate "jangan merge ke `main` tanpa izin" selama ~10 sprint **tidak pernah menahan
produksi** bila produksi memang dari branch — perlindungannya ilusi. → K-25. Dokumen yang
menyatakan "push ke `main` memicu auto-deploy" (README §Deploy, §MANDATORY DEPLOY ORDER)
dikoreksi ke keadaan terbukti + butir konfirmasi dashboard.

---

### T-20 · Ledger migrasi kini BERSAMA, dan branch kerja tertinggal 2 migrasi CRM dari produksi — DIUKUR 19 Agu 2026
**Ditemukan saat audit keadaan (19 Agu 2026).** Tiga hal, diukur langsung ke DB:

1. **Ledger `schema_migrations` bersama.** Tim lain (`my20fit_*`, `clinic_*`, `arena_*`,
   `talent_*`, `event_*`, `media_*`, `mcu_*`) menstempel ke ledger yang sama, terjalin di
   antara versi CRM (mis. `20260814081512 my20fit_corporate_member_add_division` dan
   `20260818041238 clinic_close_bill_multi_package` mendarat di antara/-setelah migrasi CRM).
   Rekonsiliasi ledger CRM **wajib disaring per nama**, bukan per rentang versi. Hitungan per
   nama: **18 entri ledger CRM** (termasuk apply-ganda migrasi 9).

2. **Branch ini tertinggal 2 migrasi CRM.** `add_is_fitco_member_matched_to_crm_customer_mirror`
   (`20260814040554`, migrasi 16) dan `crm_norm_phone_guard_empty_nsn` (`20260814055353`,
   migrasi 17) **sudah diterapkan ke DB** oleh sesi paralel (PR #13, branch
   `claude/20fit-crm-sprint-1-67vvhs`), tapi **berkas SQL-nya tidak ada di branch ini**. Jadi
   `supabase/migrations/` di sini bukan gambaran utuh ledger CRM produksi. (Migrasi 17 justru
   menutup celah `crm_norm_phone('62')` yang ditandai di Sprint 5A.)

3. **Pekerjaan bercabang jadi ≥3 PR terbuka ke `main`:** #11 (branch utama ini), #12 (sesi lain
   yang menduplikasi commit arsip handover), #13 (migrasi 16+17 + paritas telepon). Tiga sesi
   menulis paralel; "PR #11" bukan lagi satu-satunya jalur.

**Dampak:** README ledger diperbarui (baris 16/17 ditandai "no file on this branch" + catatan
ledger-bersama). Sebelum sprint fitur berikutnya menyentuh `crm_customer_mirror` atau
`crm_norm_phone`, **tarik dulu migrasi 16/17 ke branch ini** (atau merge PR #13) agar repo dan DB
tidak makin menyimpang — dua salinan yang menyimpang adalah pola yang sudah menggigit proyek ini
(kanon telepon, daftar retensi). Remediasi milik manusia (merge/koordinasi antar-sesi), bukan
sesuatu yang diperbaiki dari audit ini.

---

### T-21 · Label "· dari klinik" membocorkan keanggotaan klinik ke peran `view_contact` — DIPERBAIKI (kasarkan derajat), 19 Agu 2026
**Latar:** Setelah K-31, peran ber-`view_contact` (mis. `crm_operator`, `data_steward`) melihat
NIK/alamat yang berasal dari `clinic_patients`, dengan label provenans "· dari klinik". **Nilainya
boleh** mereka lihat (identitas). **Labelnya** yang bocor: ia memberi tahu orang ini pasien klinik —
status kesehatan yang justru dijaga `profile.view_health`. Ini juga membuat sistem tak konsisten
dengan dirinya sendiri: filter segmen menggerbangi kriteria "pasien klinik" di `view_health` dengan
alasan yang sama (`hasClinicalCriteria`), sementara layar profil membocorkannya lewat pintu lain.

**Perbaikan:** **kasarkan derajat label**, jangan hilangkan provenansnya. Untuk peran tanpa
`view_health`, provenans identitas ber-sumber-klinik menjadi **"· dari sumber ekosistem"** (benar —
memang dari sumber ekosistem — tapi tak menyebut kliniknya). Aturan "selalu tandai asalnya" tetap
berlaku; yang berubah hanya seberapa spesifik, untuk siapa.
- **Satu tempat, di server:** `lib/crm/demographic-pick.ts` `clinicProvenanceLabel(canSeeMedical)`;
  rute `/api/audience/[id]` menghitung dari `canViewHealth` dan mengirim string `clinicSourceLabel`.
  Klien hanya me-render string itu — tak ada "klinik" yang dikirim ke peran non-`view_health`, jadi
  tak bisa dipulihkan di klien (pengasaran di server, bukan sembunyi di klien). Dipakai untuk
  provenans NIK, tanggal lahir, dan gender.
- **Test:** `demographic-pick.test.ts` mengunci `clinicProvenanceLabel(false) !== "klinik"` (dan
  `=== "sumber ekosistem"`), `clinicProvenanceLabel(true) === "klinik"`.

**Bentuk halaman (diperiksa):** blok **"Klinik — keterlibatan"** (jumlah kunjungan, kode pasien,
booking) sudah sepenuhnya digerbangi `view_health` — untuk peran non-`view_health` ia **tak pernah
dirender** (`ClinicLines` mengembalikan null saat `clinical` null; grup klinik tak "live"; baris
"tidak tersambung" pun menjatuhkan klinik untuk mereka). Jadi **tak ada perbedaan bentuk** antara
profil yang punya data klinik dan yang tidak, untuk peran tanpa `view_health` — bagian klinik yang
muncul-sama-sekali bukan sinyal.

**Sumber lain (diperiksa, aman):** provenans Hyrox ("Hyrox") dan my20fit ("my20fit") bukan data
kesehatan — partisipasi event & keanggotaan; keduanya tak mengungkap fakta yang digerbangi. Golongan
darah (satu-satunya medis dari baris Hyrox) hanya tampil untuk `view_health`. Jadi hanya label klinik
yang perlu dikasarkan.

**Konsekuensi tercatat di K-31** (sisa "sinyal-lunak keanggotaan klinik" sprint sebelumnya kini punya
jawaban). Remediasi = kode ini; tak ada perubahan data.

---

## T-24 · Form pendaftaran event mengumpulkan waiver kesehatan, BUKAN consent pemasaran (Sprint identitas-A+, 2026-08-21)

**Konteks:** saat memetakan `rc_ticket_invites.form_data` untuk backfill demografi (Migrasi 23),
diperiksa apakah pembeli/peserta tiket pernah memberi izin dihubungi untuk pemasaran.

**Temuan (TERBUKTI, dibaca dari data):** satu-satunya field mirip-consent di form adalah
`ticket_fields.health_fitness_declaration_*` — sebuah **waiver risiko kesehatan/olahraga**
("…I voluntarily participate at my own risk…"), hadir di 374 dari 410 undangan terisi. **Tidak ada**
checkbox "boleh dihubungi untuk promosi/pemasaran" di mana pun di form. Allowlist peserta yang diambil =
name/email/phone/gender/DOB; field terlarang (NIK, golongan darah, kontak darurat) tak diambil — dan
**nol field consent pemasaran** ada untuk diambil.

**Konsekuensi:** membeli tiket / mengisi form event = **hubungan kontraktual**, **bukan** opt-in
pemasaran. Maka seluruh identitas dari sumber-sumber ini (termasuk 2.797 kandidat `crm_identity_candidate`
dan 248 peserta yang di-backfill demografinya) tetap **`legacy_import_unverified`** — ada di pool/kandidat,
**tidak boleh** dikirimi pemasaran — sama seperti 82.253 lainnya. Menaikkan basis di atas itu butuh bukti
titik consent eksplisit yang **tidak ada** di data ini.

**Sifat:** DATA/kebijakan, tidak diremediasi — ini batas hukum, bukan bug. Menyambung ke sprint
opt-out/unsubscribe (basis per populasi menunggu sign-off legal) dan ke rekomendasi berulang "tambah satu
checkbox consent pemasaran di form event" (form ini terbukti mengumpulkan gender 100% & DOB 92% dengan
baik — satu checkbox lagi menghasilkan `explicit_opt_in` sejak hari pertama, jauh lebih bernilai daripada
backfill apa pun).

---

## T-25 · INSIDEN — saturasi pool koneksi Supabase mengganggu PRODUKSI (~10:09 UTC, 21 Agu 2026)

**Dicatat sebagai bukti nyata untuk batas K-24 — bukan untuk menyalahkan; supaya batasnya tak abstrak.**

**Apa yang terjadi:** saat memvalidasi query backfill Migrasi 23 lewat Supabase MCP `execute_sql`, sebuah
query berat memakai **OR-join** (`email = ek OR phone = pk`) yang mematikan hash-join → timeout **klien**
60 dtk, sementara backend Postgres **terus berjalan** (K-24: klien putus ≠ query batal). Lalu beberapa
poll pendek (`select 1`, cek indeks) saat menunggu **ikut timeout karena tak dapat koneksi** — tiap poll
gagal meninggalkan backend hidup, **menahan pemulihan**. Persis langkah-3 K-24 yang melarang poll berulang.
Instance kecil → pool koneksi jenuh.

**Dampak PRODUKSI (dilaporkan + diverifikasi eksternal oleh pemilik):** `/health` →
`{"ok":false,"supabase":"unreachable"}` **HTTP 503**, tiga kali berturut ~4,2 dtk; `select 1` dari sisi
pemilik juga timeout. Saturasi **sampai ke pengguna**, bukan hanya sesi agen. **Jendela gangguan
~10:09–14:19 UTC 21 Agu 2026 — ≈4 JAM**, bukan beberapa menit: perkiraan awalku ("menit") **KELIRU** dan
dikoreksi di sini. Pool **tidak** pulih instan setelah backend mati; butuh ~4 jam sampai `/health`
`ok:true` stabil (0,65 → 0,29 dtk, membaik). **Untuk penilaian risiko ke depan: skala pemulihan = JAM,
bukan menit.** Catatan penting: MCP `execute_sql` menyentuh instance Supabase yang **SAMA** dengan
produksi — **tak ada isolasi** antara "sesi agen" dan "produksi".

**Akar:** (1) query berat non-optimal (OR-join) dijalankan langsung di DB produksi bersama tanpa `explain`/
`limit` lebih dulu; (2) poll berulang saat menunggu — memperpanjang saturasi.

**Remediasi saat kejadian:** BERHENTI total menyentuh DB; pantau pemulihan lewat `/health` **eksternal**
(bukan query); konfirmasi pulih dengan DUA bukti (`/health` `ok:true` reachable **dan** satu `select 1`
berhasil) sebelum menyentuh DB lagi. Query OR-join sudah diganti equi-join `UNION ALL` + CTE `materialized`.

**Pelajaran (memperkuat K-24):** untuk DB produksi bersama — (a) uji query berat dengan `explain`/`limit`
dulu, jangan langsung jalankan bentuk yang bisa seq-scan berulang; (b) saat menunggu, **diamkan DB**, jangan
poll; (c) apply operasi besar **hindari jendela cron** (refresh cermin 20:00 UTC / 03:00 WIB, K-30). Sifat:
INSIDEN operasional; tertutup setelah pool pulih; **tak ada perubahan data** (semua query gagal = rollback
bersih / read-only).

---

## Catatan penomoran — penyelarasan T-18/T-19 saat konsolidasi (2026-08-21)

Dua jalur kerja paralel (`main`/`mno804` dan `sprint-1`) menomori temuan secara **independen**, lalu
bertemu saat konsolidasi ke `main`. Diselaraskan **2026-08-21** dengan tie-break yang sudah
ditetapkan: **nomor yang dirujuk dari komentar DB menang atas teks dokumen.**

- **T-18** sempat dipakai untuk temuan *deploy-from-branch* di dokumen `main`, dan untuk *celah Fitco
  7.260* di jalur `sprint-1`. Diselaraskan ke **Fitco = T-18** karena nomor itu dirujuk komentar
  kolom `crm_customer_mirror.is_fitco_member_matched` di DB; temuan **deploy dipindah ke T-22**,
  **anon-views ke T-23**.
- **T-19** tetap = *RFM `staging_20fit_data` tak bisa menyegmentasi* (temuan `main`, tak dikontes
  komentar DB). Temuan **anon-SELECT view** yang di `sprint-1` bernomor T-19 → **T-23**.
- **Referensi lama tetap "T-18"** di arsip prompt (`sprint-3v/`, `sprint-3y/`, `sprint-deploy/`,
  `PR-*.md`) dan beberapa dokumen `main` (README, KEPUTUSAN, PANDUAN-LANJUTAN, KOREKSI-DEPLOY): itu
  **rekaman bertanggal** yang memang menulis "T-18" untuk temuan deploy pada saat itu — **sengaja
  TIDAK ditulis ulang** (menulis ulang arsip = memalsukan catatan). Catatan ini jembatannya: di
  dokumen lama, "T-18 = deploy-from-branch" kini berarti **T-22**.
- Jejak lebih lama: di gate migrasi 16, Fitco sempat bernomor **T-25** dan anon-views **T-24**
  sebelum direkonsiliasi ke T-18/T-19 di `sprint-1` (lalu ke **T-18 / T-23** di sini).
- **T-24 kini permanen (2026-08-21, Sprint identitas-A+)** = temuan *waiver-bukan-consent* (di atas).
  Label transien lamanya (anon-views) sudah pensiun ke **T-23**, jadi nomor T-24 bebas dipakai ulang
  untuk temuan baru ini; tak ada tabrakan yang tersisa.
- **T-25 kini permanen (2026-08-21)** = INSIDEN saturasi pool (di atas). Label transien lamanya (Fitco)
  sudah pensiun ke **T-18**, jadi nomor T-25 bebas untuk insiden ini; tak ada tabrakan tersisa.

**Tanpa catatan ini, orang yang membaca transkrip lama akan mengira ada temuan yang hilang.**

---

## T-26 · Screenshot fixture `/dev/preview` salah dibaca sebagai PRODUKSI — kemiripan terlalu sempurna (2026-08-24)

**Apa yang terjadi.** Saat tinjauan dashboard C+D, screenshot pratinjau menampilkan "bisa
dihubungi · marketing 82.089 / layanan 81.760". Peninjau mencocokkannya ke DB — `crm_contactable_counts()`
mengembalikan **82.253/82.253**, suppression 0 — dan wajar menduga ada **bug produksi** atau jalur
perhitungan kedua. Ditelusuri dari kode: jalur dashboard tunggal (`fetchContactableBlock` → RPC saja,
diteruskan apa adanya; test mengunci ini). Angka 82.089/81.760 **tidak pernah dihasilkan kode apa pun**
— itu **konstanta fixture** di `app/dev/preview/page.tsx`, usang. Produksi selalu benar.

**Sebab sesungguhnya — bukan angkanya, tapi ketaktampakannya.** Fixture `/dev/preview` memakai angka
nyata untuk hampir semua blok (my20fit 919, kandidat 2.799, RFM cermin) supaya render realistis. Itu
membuat screenshot fixture **tak bisa dibedakan** dari screenshot produksi tanpa memeriksa DB. Ketika
nilai contactable yang usang "diperbaiki" jadi 82.253 agar cocok produksi, kemiripan malah **makin
sempurna** — jebakan yang sama akan terulang pada peninjau berikutnya.

**Penutupan.** Penanda pratinjau yang **ikut ter-render** di dalam `DashboardContent` sendiri (bukan
hanya di URL `/dev/preview`): pita amber "⚠ PRATINJAU · DATA FIXTURE — BUKAN ANGKA PRODUKSI", tampil
HANYA saat `isPreview` (yang hanya pernah true di `/dev/preview`, 404 di produksi). Karena screenshot
memotret elemen `DashboardContent`, pitanya ikut di setiap gambar fixture. Pola sama dengan
`CoverageNotice` ("belum tersedia dalam Inggris") dan penanda kesegaran per blok: **buat keadaan
kelihatan di layar, jangan andalkan konteks di luar gambar.**

**Pelajaran.** Data pratinjau yang makin akurat makin berbahaya kalau tak ditandai — sebab ia makin
meyakinkan sebagai produksi. Fixture apa pun yang bisa masuk screenshot keputusan HARUS membawa
penanda yang ikut ter-render.

---

## T-27 · Model deploy tercatat salah DUA kali — pertanyaan yang tak boleh dijawab dari dalam repo (2026-08-24)

**Apa yang terjadi (dua kali, arah berlawanan).** Sumber deploy produksi salah dicatat dua kali:
1. **~12 sprint pertama:** dokumen menulis "auto-deploy dari `main`" — **benar**, tapi ditulis
   sebagai asumsi tanpa bukti.
2. **12 Agu 2026 (T-22/K-25/K-27):** "koreksi" menyimpulkan produksi menjalankan **branch** —
   **salah**, dan bertahan 5 hari lintas puluhan prompt sampai dashboard Railway (24 Agu)
   membalikkannya kembali ke `main`.

Pola berulang-terbalik itu sendiri adalah temuannya.

**Apa yang terlewat (terbukti, bukan tebakan).** Bukti 12 Agu terasa kuat: aksi audit
`login.password_reset_requested` tampak "hanya di branch" per `git log -S origin/main`, padahal
produksi menulisnya. Yang terlewat: commit itu (`a9602d5`) **sudah** di `main` lewat **PR #10**
(merge `1b13fa8`, **04:41:32 UTC**) — **7 menit sebelum** baris audit reset ditulis (04:48–04:57
UTC). `git merge-base --is-ancestor a9602d5 1b13fa8` = **YA**. Jadi "nol di `origin/main`" hanya
mungkin dari **ref `origin/main` basi** (belum di-fetch setelah PR #10) — **pola S-05**. Reset
mendarat di `main` yang baru saja di-deploy, bukan di kode branch.

**Kesalahan penalaran yang lebih dalam (ini yang harus tak terulang).** Bahkan seandainya ref
tidak basi, bukti baris-audit **secara struktural tak bisa** menjawab pertanyaannya. Yang
dibuktikan bukti itu paling jauh adalah **"kode branch pernah menyentuh DB produksi"** — dan itu
bisa terjadi lewat **beberapa** mekanisme yang tak terbedakan dari dalam repo: (a) service
produksi memang dari branch; (b) **deploy preview PR** dari branch menulis ke Supabase produksi
yang **dibagi**; (c) kode branch dijalankan **lokal** terhadap DB produksi. T-22 sendiri
**menyebut** alternatif (b) ("service produksi tetap `main`") lalu tetap menyimpulkan (a) sebagai
fakta. Pertanyaan sebenarnya — **"branch mana yang disetel service produksi?"** — jawabannya ada
**satu** tempat: **Railway → Settings → Source**, satu screenshot, **di luar repo dan diblokir
egress dari sandbox**. Menutup pertanyaan empiris memakai bukti yang tak sanggup menjawabnya
itulah cacatnya, bukan sekadar ref basi.

**Pelajaran permanen (→ K-25 dikoreksi, K-27 dibatalkan, S-05 diperkuat).** Kelas pertanyaan
"apa yang sebenarnya berjalan di produksi / setelan platform mana yang aktif" **tidak boleh
dijawab dari dalam kode.** Bukti dari-dalam-repo (git log, isi audit, migrasi) bisa **menyanggah**
sebuah klaim tapi jarang bisa **memastikan** setelan platform. Bila jawabannya butuh satu layar
dashboard yang tak bisa saya lihat, hasil yang benar adalah **"belum diketahui — butuh
konfirmasi manusia di Railway"**, bukan kesimpulan berbungkus rapi.

**Bukti yang harus dicari lain kali (checklist verifikasi sumber deploy):**
- **Railway → service produksi → Settings → Source** — branch tersambung + "auto deploy on push".
  Ini otoritatif; semua yang lain turunan. (Diblokir dari sandbox → minta screenshot pemilik.)
- Sebelum `git log -S` menyimpulkan "hanya di branch": **`git fetch origin main` dulu**, lalu
  bandingkan **waktu merge PR** (`git show -s --format=%cd <merge>`) dengan **timestamp jejak
  produksi**. Bila kode sudah di `main` sebelum jejak, "hanya di branch" itu artefak ref basi.
- Ingat DB Supabase **dibagi** semua environment: baris di DB produksi **tak** membuktikan
  environment mana yang menulisnya. Untuk memisah preview vs produksi butuh sinyal sisi-Railway
  (log deploy, domain yang memanggil), bukan sinyal sisi-DB.

**Konsekuensi gate:** larangan "jangan merge ke `main` tanpa izin eksplisit" **tetap** dan kini
**lebih penting** — dengan model yang benar, **merge = deploy produksi seketika**.

---

## Temuan 24 Agu 2026 (separuh "menghubungi")

- **Pagar terjemahan menggigit di hari pertama:** layar `search` (`app/(app)/audience/page.tsx`)
  merender blok akses-ditolak berbahasa Indonesia yang di-hardcode **padahal sudah di
  `BILINGUAL_SCREENS`** — campuran-bahasa senyap yang sudah tayang di produksi tanpa disadari.
  Ini persis alasan pagar `untranslated-scan` dibangun lebih dulu. Diperbaiki.
- **Prefiks audit `export.campaign_sent` → `campaign.sent` (K-39).** Mengirim bukan mengekspor:
  memakai `export.%` membuat layar audit yang menyaring "ekspor" menampilkan kampanye. `campaign.%`
  jadi famili kepatuhan sendiri (ditambah ke denylist pemangkas dengan cara K-09).
- **Dua dari tujuh pemicu workflow tak punya sumber data:** "tidak kembali" (recency nyata hanya
  ~47 profil my20fit) dan "fitpoint kedaluwarsa" (tak ada tabelnya). Arsitektur pemicu (polling vs
  webhook vs tabel kejadian) belum diputuskan — snapshot harian tak bisa menjawab "baru saja login".
- **CVE-2026-45755 (bridge Mailtrap Symfony)** = mode kegagalan webhook ini persis: secret diterima
  tapi tak dipakai → bounce palsu bisa meracuni suppression. Webhook CRM **memverifikasi** (HMAC dua
  nama header + anti-replay isi-hanya-bila-NULL), jadi aman; alasan itu dicatat di komentar agar tak
  "disederhanakan" nanti.

---

## T-28 · Deadlock uji internal: dua pengaman yang benar, bersama-sama membuat pengujian mustahil (25 Agu 2026)

Saat hendak menjalankan kirim internal pertama, verifikasi independen ke DB langsung menemukan
**tak ada satu jalur pun bisa mengirim ke staf internal lewat composer:**

- **`master_customer` memuat 0 alamat `@20fit.id`** (staf bukan pelanggan — `count(*) where
  email_normalized like '%@20fit.id'` = 0).
- Segmen menarik penerima **hanya** dari `master_customer` (`resolveRecipients`).
- Dengan `CAMPAIGN_SEND_ENABLED` mati, gerbang pra-luncur (`maySendTo`) **hanya** mengizinkan
  `@20fit.id`.

Dua aturan yang masing-masing **benar** — pool baca-saja beku; kirim nyata diblokir sampai token+DNS
beres — **berpotongan kosong**: domain yang diizinkan tak ada di sumber yang dibaca. Uji internal-saja
lewat composer menghasilkan **0 "Akan dikirimi"**; tak ada `provider_message_id`, tak ada baris log,
tak ada yang bisa dibuktikan. Juga: 0 template & 0 segmen tersimpan, jadi composer bahkan menolak
sebelum sampai ke sana.

**Perbaikan (bukan diam-diam):** harness `lib/crm/send-test-harness.ts` — menyuntikkan satu alamat
internal (dari env `SEND_TEST_INTERNAL_ADDRESS`, tak di-hardcode) ke **`sendCampaign` yang sama
persis** (engine, ports, audit, gerbang), hanya penerimanya yang berbeda. Menghasilkan artefak nyata
(baris `crm_message_log` + `provider_message_id`, satu `campaign.sent`, baris `crm_campaign_run`).
Guard: hanya jalan saat kirim nyata mati; menolak alamat non-`@20fit.id`. Panel di /campaigns tampil
hanya pra-luncur. **Belum dijalankan manusia** saat temuan ini ditulis — laporan ketujuh butir menyusul
setelah `SEND_TEST_INTERNAL_ADDRESS` diset di Railway dan tombolnya ditekan.

## T-29 · `crm_user_role` = 3 akun; login di `auth.users` BUKAN bukti pemakaian CRM (koreksi, 25 Agu 2026)

Klaim awal "jb@, hazel@, zidni@, ferdinand@ sudah punya aktivitas login → sistem mulai dipakai orang
sungguhan" **dikoreksi oleh verifikasi independen.** `auth.users` **dipakai bersama seluruh ekosistem
20FIT** (my20fit, shop, dll.), jadi timestamp login di sana bukan bukti pemakaian CRM.

- **`crm_user_role` hanya 3 baris, semuanya `super_admin`:** tifany@, zidni@, marketing@.
- **jb@, hazel@, ferdinand@ (dan ~25 akun `@20fit.id` lain) login di `auth.users` tapi TIDAK punya
  `crm_user_role`** → jika mereka buka CRM, mereka tak dapat akses (tak ada peran).
- **Bukti pemakaian CRM nyata = audit log-nya sendiri** (`crm_audit_log`): praktis satu pengguna berat
  (tifany@) plus marketing@; zidni@ punya peran tapi nol baris audit.

**Pelajaran permanen:** "sistem dipakai" hanya bisa dijawab dari `crm_audit_log` + `crm_user_role`,
**bukan** dari `auth.users` yang dibagi lintas produk. Konsekuensi peran: bila jb@/hazel@/ferdinand@
memang akan pakai CRM, mereka perlu **diberi peran** (least-privilege, bukan `super_admin` seperti 3
akun sekarang).

**Syarat pembalikan K-27 → usang, bukan "terpenuhi".** K-27 (deploy-dari-branch) **dibatalkan** 24 Agu
karena premisnya salah: produksi **selalu** dari `main`. Tindakan yang diresepkan syaratnya ("arahkan
Railway ke `main` begitu staf luar memakai rutin") sudah jadi kenyataan sejak awal — tak ada yang bisa
dipicu. Yang berlaku: **merge = deploy produksi**, jadi disiplin gate makin penting, bukan makin longgar.

## T-30 · Kirim pertama gagal SENYAP: secret wajib absen → throw sebelum baris pertama, tak berjejak (25 Agu 2026)

Tekan pertama tombol uji kirim internal (tifany@, 07:41 & 07:42 UTC) **tak menghasilkan apa pun yang
bisa dilacak**: `crm_message_log` 0, audit `campaign.sent` 0, dua `crm_campaign_run` berhenti di
`draft`, inbox nol. Persiapan jalan (template + segmen + run dibuat), lalu diam.

**Sebab (jejak kode + bukti, bukan tebakan):** `sendCampaign` melempar di `send-campaign.ts:214`,
`const identitySecret = identityHashSecret();`. Helper itu membaca **`UNSUBSCRIBE_TOKEN_SECRET`** dan
fail-closed melempar bila kosong/pendek. Variabel itu **absen dari Railway** (terbukti dari daftar 7
variabel pemilik produk). Lemparan terjadi **setelah** resolusi penerima + gerbang tapi **sebelum**
`runSend`/`claim` (INSERT pertama) dan **sebelum** audit → nol baris, run tetap `draft`, Mailtrap tak
pernah dipanggil. Konsisten dengan seluruh bukti. **Bukan** pola ekspor-terputus (di sana throw di
tengah aliran setelah header; di sini sebelum baris pertama).

**Yang disingkirkan:** `SEND_TEST_INTERNAL_ADDRESS` terisi & internal (bukan penyebab); gerbang/peran
lolos (template+segmen+run terbuat); `CAMPAIGN_SEND_ENABLED` absen **benar** (`undefined` =
`realSendEnabled()` false = mode aman); Mailtrap tak pernah dipanggil (inbox nol).

**Masalah kedua — lebih penting daripada bug-nya:** kegagalan tak meninggalkan jejak sebab di mana
pun (tak ada kolom galat di run, tak ada baris `failed`, tak ada audit). Kalau pemilik produk tak
melapor, tak seorang pun tahu ini terjadi. **Sepola dengan reset kata sandi empat-keadaan** (satu
pesan menyembunyikan empat sebab) **dan ekspor terpotong tanpa penanda akhir** — tiap kali biayanya
berhari-hari.

**Perbaikan (BAGIAN A):**
- Kolom **`crm_campaign_run.last_error`** (migrasi `20260825080504`). Run yang gagal sebelum kirim →
  `status='stopped'` + `last_error` (sebab terklasifikasi, bebas-PII). Dua run yatim ditandai retroaktif.
- **`try/catch` di sekitar `sendCampaign`** di harness **dan** jalur kirim nyata → `recordRunError` +
  galat terstruktur ke panel/composer, tampil di layar, bukan senyap.
- **Pra-cek `missingSendEnv()`** melaporkan **semua** variabel wajib yang kurang **sekaligus** (bukan
  berhenti di yang pertama), sebelum membuat run — menghentikan pola "temukan satu variabel kurang per
  percobaan gagal".
- **Test mengunci `realSendEnabled`**: `undefined`/`"false"`/`"0"`/`"TRUE"` = mati; hanya `"true"` = nyala.

**Yang harus dipasang pemilik produk (satu kali):** `UNSUBSCRIBE_TOKEN_SECRET` (≥16, WAJIB),
`MAILTRAP_WEBHOOK_SECRET` (webhook), konfirmasi `NEXT_PUBLIC_APP_URL`. **Jangan** set
`CAMPAIGN_SEND_ENABLED`.

## T-31 · Celah audit bertambah jadi 179 & 187 — bukan kegagalan baru, dua rollback baca 19 Agu yang baru TERSINGKAP (25 Agu 2026)

Celah id `crm_audit_log` kini: **4, 37, 38, 39, 179, 187** (max_id 239, 233 baris, 6 hilang). Dua yang
"baru" — 179 dan 187 — **diselidiki sebelum menyentuh kode lain** (permintaan pemilik).

**Sebab (dari cap waktu tetangga, bukan tebakan):** `id` = `GENERATED ALWAYS AS IDENTITY`; celah =
INSERT audit mengambil nomornya lalu transaksinya rollback sebelum commit (K-21: baris yang hilang
ITULAH jejaknya). Keduanya jatuh di tengah penjelajahan **baca-saja** `tifany@` pada **19 Agu 2026**:
- **179** di antara id 178 (`profile.viewed`, 11:03) dan 180 (`profile.viewed`, 13:57) — pelanggan sama.
- **187** di antara id 186 (`list.viewed`, 15:20) dan 188 (`list.viewed`, 16:06).
Operasi yang gagal sekelas tetangganya: satu `profile.viewed`, satu `list.viewed` yang request-nya
error setelah tulis audit. Kelas **benign** yang sama dengan 4/37/38/39.

**Disingkirkan — jalur tulis sesi ini.** Semua baris audit tulis sesi ini di **id ≥ 214, 24–25 Agu**:
`campaign.sent` = **id 232** (25 Agu 08:12); pemberian peran = baris seed 11 Agu (id 2, 3, 113); **nol**
baris `suppression.*`. Tak satu pun memetakan ke 179/187. **Kenapa baru muncul:** penyelidikan celah
lalu (3K) berjalan saat max_id ~47 dan hanya melihat 4/37/38/39; penjelajahan 19 Agu mendorong urutan
melewati 187 dan menghasilkan dua lubang rollback lagi berpola sama — **19-Agu yang baru tersingkap,
bukan kegagalan minggu ini.** Tak ada perbaikan kode: monitor celah (banner audit) sudah menampilkannya
dengan benar; keduanya masuk hitungan `knownLegit`.

## T-32 · Form pemberian peran akan MELEMPAR di render pertama — const diekspor dari modul `"use server"` (ditemukan & diperbaiki 25 Agu 2026)

Saat membangun tab **20FIT Manager**, fixture `/dev/preview-settings` **500**:
`GRANTABLE_ROLES.map is not a function`. Sebab: `GRANTABLE_ROLES` (sebuah const array) diekspor dari
`app/(app)/settings/roles/actions.ts` yang ber-`"use server"`. **Modul `"use server"` hanya boleh
mengekspor fungsi async** — const/tipe yang diekspor darinya menjadi **stub tak-terpakai di klien**, jadi
`.map` melempar. Ini **bug laten di kode lama** (form mengimpor const itu dari actions sejak commit
`696a142`): `tsc`/build hijau karena tipe terhapus saat kompilasi, tapi **jalur render nyata tak pernah
dijalankan** — sepola T-30/reset/ekspor: hijau di gerbang, patah saat dipakai.

**Perbaikan:** `GRANTABLE_ROLES` + tipe `RoleActionError`/`RoleActionResult` pindah ke
`lib/auth/role-admin.ts` (modul biasa); `actions.ts` kini **hanya** mengekspor fungsi async; form
mengimpor const+tipe dari modul biasa, fungsi dari actions. Fixture kini render 200. Pelajaran:
**satu-satunya bukti sebuah komponen server-action benar-benar merender adalah merendernya**, bukan
tsc/build.

**Tindak lanjut (25 Agu 2026): kelas ini kini dipagari** — `lib/dev/use-server-exports.ts` +
test memindai SETIAP modul `"use server"` dan gagal bila ada ekspor selain fungsi async. Terbukti
menggigit: menyisipkan `export const PROBE` ke `actions.ts` menggagalkan pindaian (menyebut berkas +
cuplikan), lalu dikembalikan. Menutup seluruh kelas untuk jalur server berikutnya.

## T-33 · Tab 20FIT Manager menampilkan UUID, bukan email — `listUsers()` hanya halaman 1 dari kolam 935 akun (25 Agu 2026)

Layar peran menampilkan `61a71f7f-…`, bukan email — padahal ketiga `user_id` punya baris di
`auth.users` dan emailnya bisa diresolusi. Fallback UUID menyala tanpa sebab yang tampak.

**Sebab (diverifikasi via SQL):** `auth.users` berisi **935** akun (kolam auth **bersama** seluruh
ekosistem 20FIT). `admin.auth.admin.listUsers()` tanpa argumen hanya mengembalikan **halaman 1
(default 50)**. Anggota CRM berada di peringkat-pembuatan 2, 3, dan **110** → setidaknya `zidni@`
(peringkat 110) **tak pernah** ada di halaman 1 → petanya kosong untuk baris itu → UUID. Kegagalan
senyap lagi: tak melempar, hanya menampilkan yang salah; `tsc`/lint/build hijau.

**Perbaikan (`lib/auth/user-directory.ts`):** resolusi **tertarget** per anggota lewat
`getUserById(user_id)` — tanpa paginasi, tanpa mengurai seluruh 935 akun (juga menghormati LARANGAN
lama "jangan tampilkan seluruh auth.users"). Bila email **benar-benar** tak teresolusi, layar
**mengatakannya** (tag "email tak teresolusi"), bukan menyodorkan UUID seolah jawaban. Jalur
tulis (grant email→id) memakai `findUserIdByEmail` yang **berpaginasi sengaja** (bukan halaman 1
saja) — menutup silent false-negative yang sama.

## T-34 · Pertanyaan "apakah kode di produksi" salah dijawab TIGA kali — buktinya selalu di LUAR repo (25 Agu 2026)

Pemilik produk mengirim screenshot `20fitcrm-production.up.railway.app/settings?tab=manager` dengan
keempat tab → kode branch **tayang di produksi**. Ini kali **ketiga** pertanyaan deploy muncul, dan
tiap kali jawabannya beda dari yang tercatat (12 Agu "deploy dari branch" — salah; 24 Agu "deploy
dari main" — benar, T-27; kini).

**Bagaimana kode sampai ke sana (dua sumber independen):** PR #15 **ter-merge** ke `main` —
(1) **git**: `82c38e1` adalah leluhur `origin/main` di commit merge `df54688`
(`git merge-base --is-ancestor` = YA); (2) **GitHub API**: `merged:true`, `merged_by
Marketing-project-wq`, `merged_at 2026-08-25T09:59:15Z`. Railway auto-deploy dari `main` → produksi.
**Tak ada jalur deploy lain**; branch tayang di produksi **karena branch itu MENJADI `main`**.

**Kenapa berulang salah:** bukti yang tersedia **di dalam repo** secara struktural tak bisa
membedakan "produksi = kode ini" dari "kode ini menulis ke DB bersama" (T-27), dan `git log` atas ref
`origin/*` yang **basi** memberi jawaban lama (pola S-05, sudah terulang). **Diskriminator sejati
selalu di LUAR repo**: setelan Railway Source, keadaan merge GitHub, dan mata pemilik produk di URL
produksi. **Yang menyelesaikan:** beberapa sumber **luar-repo** yang sepakat — di sini git-ancestry +
GitHub `merged:true` + screenshot produksi. Pelajaran permanen: **jangan jawab pertanyaan deploy dari
`git log` sendirian; minta/lihat bukti luar-repo, dan `git fetch` dulu supaya ref tak basi.**

## T-35 · Pihak lain menulis ke tabel `crm_*` — 248 baris `crm_profile_demographic` dari batch eksternal (25 Agu 2026)

**Asumsi yang runtuh:** "`crm_*` hanya ditulis service-role CRM." **Salah.**

**Bukti (diverifikasi SQL):** `crm_profile_demographic` = **248 baris**, seluruhnya
`gender_source='progressive_profiling'` (246 juga `date_of_birth_source='progressive_profiling'`, 2
DOB null), **semua ditulis pada cap waktu IDENTIK `2026-08-21 15:44:15.665587+00`** — satu batch, satu
transaksi, 248 pelanggan berbeda. Bukan progressive-profiling bertahap (itu akan bertimestamp
tersebar); ini **backfill massal** yang MELABELI dirinya progressive_profiling. CRM tak menulisnya:
form isian adminnya (`demographic-write.ts`) baru dibangun setelah 21 Agu dan hanya menulis
`staff_entry`. Tabel **tak punya kolom penulis/provenance** (hanya `updated_at`), jadi baris tak bisa
menyebut siapa penulisnya.

**Siapa & lewat jalur apa — audit grant SELURUH 13 tabel `crm_*`:**

- **Terkunci benar** (`relacl` = {postgres, service_role} saja) — 6 tabel, semua dibuat sprint 3H+/
  KIRIM/5A: `crm_campaign_run`, `crm_identity_candidate`, `crm_message_log`, `crm_message_template`,
  `crm_mirror_meta`, `crm_segment`.
- **Grant longgar** — `arwdDxtm` (SEMUA privilege, termasuk INSERT/UPDATE/DELETE) juga ke **`anon`
  DAN `authenticated`** — 7 tabel, semua era 2B (T-17): `crm_audit_log`, `crm_consent`,
  `crm_profile_behavior`, **`crm_profile_demographic`**, `crm_profile_scores`, `crm_suppression`,
  `crm_user_role`.

**Semua 13 tabel: RLS ON, 0 policy.** Artinya `anon`/`authenticated` **tetap diblokir RLS** (deny-all
tanpa policy permisif) MESKIPUN punya grant — sesuai ukur-ulang 3Q (grant ≠ akses saat RLS ON + 0
policy). Jadi 248 baris itu **bukan** ditulis lewat web anon; ditulis lewat peran **BYPASSRLS**
(`service_role`/`postgres`) yang **dibagi seluruh proyek Supabase bersama** (T-20). Kesimpulan: **tim
lain memakai service-role/postgres bersama** untuk menulis ke `crm_profile_demographic`.

**Dua risiko berbeda, jangan dicampur:**
1. **Yang terjadi** — penulisan lintas-tim lewat BYPASSRLS di proyek bersama. `crm_*` **bukan milik
   CRM sepenuhnya**; siapa pun pemegang service-role/postgres proyek bisa menulis.
2. **Laten** — 7 tabel era-2B masih meng-grant SEMUA privilege ke `anon`/`authenticated`. Dinetralkan
   RLS **hari ini**, tapi **satu policy permisif** (`using(true)`) dari langkah ceroboh mana pun akan
   langsung membuka tulis-penuh anon/authenticated ke consent, suppression, user_role, dan ketiga tabel
   profil. Tabel yang terkunci benar (6) bahkan tak meng-grant `authenticated`, jadi risiko ini khusus
   7 tabel lama.

**Konsekuensi — rantai prioritas tanggal lahir.** `DOB_PRIORITY = [nik, staging, clinic, hyrox,
staff]` (`demographic-pick.ts`); "staff" = nilai `crm_profile_demographic`, dibaca **tanpa** memeriksa
`*_source` di dalamnya. Jadi 246 DOB `progressive_profiling` kini **tampil berprovenance "staff"** —
salah label, dan mungkin salah prioritas. **Usulan posisi (belum diterapkan — mengubah 246 DOB tampil
adalah keputusan kepercayaan, dilaporkan dulu):** sisipkan `progressive` **tepat di atas `staff`** →
`[nik, staging, clinic, hyrox, progressive, staff]`. **Alasan:** self-report DOB seseorang pada
prinsipnya andal (ia tahu tanggal lahirnya), jadi ≥ entri staff kosong-fallback; TAPI ia masuk lewat
jalur eksternal tak-teraudit dengan mutu-koleksi tak diketahui (backfill massal, bukan bertahap), jadi
< sumber berprovenance-diketahui (NIK gov-ID, staging impor) dan bahkan < rekaman ekosistem
(clinic/hyrox). Saat ragu soal provenance/mutu sumber baru yang ditulis pihak luar, peringkat
konservatif; ia tetap muncul sebagai isyarat konflik bila berbeda, jadi tak ada yang disembunyikan.

**Larangan dipatuhi (fase laporan):** 248 baris TAK disentuh; dilaporkan dulu. **Menunggu tindakan
manusia:** (a) konfirmasi tim/sistem penulis 248 baris (tak bisa dari DB — tak ada kolom provenance;
butuh log Postgres 21 Agu 15:44 atau tanya tim), (b) keputusan remediasi grant longgar 7 tabel,
(c) persetujuan posisi `progressive_profiling` di rantai DOB.

---

**TINDAK LANJUT — 25 Agu 2026 (sesi lanjutan, pemilik produk menyetujui (b) dan (c)):**

- **(b) Grant dicabut — K-47. DITERAPKAN 25 Agu 2026** (ledger `20260825164301`, berkas
  `20260825150000_revoke_...`). Mencabut `anon`+`authenticated` dari ketujuh tabel ke
  `{postgres, service_role}`. **Verifikasi pasca-apply:** ke-13 tabel `crm_*` kini `{postgres,
  service_role}`, RLS tetap ON di ke-13, 0 tabel memberi anon/authenticated. Ini pekerjaan CRM sendiri
  (tabel milik CRM, cabut grant tak menyentuh data).
  Ketergantungan diperiksa via SQL (bukan diasumsikan): **0** policy, **0** view milik anon/authenticated,
  **0** pewarisan peran; 248 baris ditulis via BYPASSRLS yang grant-nya tetap → cabut aman. **Pagar
  permanen dipasang:** `scanCrmTableGrantsToAnonAuth` (di `migration-execute-guard.test.ts`) — gagal bila
  migrasi mana pun memberi privilege ke anon/authenticated pada relasi `crm_*`; terbukti menggigit atas
  input sintetis, pola sama seperti pagar EXECUTE/matview. Larangan awal ("jangan ubah grant") **dicabut
  oleh pemilik produk untuk kasus ini**: ia meminta pencabutan eksplisit dan menegaskan itu ranah CRM.
- **(c) Rantai DOB diperbaiki — K-48, DITERAPKAN.** `DOB_PRIORITY`/`GENDER_PRIORITY` kini menyertakan
  `progressive` tepat di atas `staff`. Lapisan baca (`demographic-read.ts`) kini mengambil
  `date_of_birth_source`/`gender_source`; perakit (`resolveIdentity`) merutekan tiap nilai ke slot
  `progressive` atau `staff` lewat `demographicProvenance` — **kolom `*_source` diperiksa, tak lagi
  dianggap semua staff.** 246 DOB yang tadinya salah label "staff" kini berlabel "isian mandiri /
  self-reported". Label i18n `srcProgressive` ditambah (id+en). Test rantai diperbarui.
- **(a) MASIH menunggu manusia (B10a).** Setelah grant dicabut, jalur BYPASSRLS jadi satu-satunya cara
  masuk — jauh lebih sempit dan lebih mudah ditanyakan ke tim pemegang `service_role`.

---

## T-36 — Kampanye gagal 9× (0 terkirim): id penerima bukan uuid — 31 Agu 2026

**Gejala.** `crm_campaign_run` = 1 berhasil (uji internal 25 Agu), **9 stopped**. Tujuh stopped
28 Agu (bukan enam — prompt melewatkan run 06:55) memakai segmen daftar email manual "Testing Team"
(`0fe871ff`, `emailList: [tifany@20fit.id, marketing@20fit.id]`), `last_error='unexpected_error'`,
**0** baris `crm_message_log`. Sejak sistem ada, **belum satu pun kampanye nyata terkirim**.

**Sebab (dibuktikan, bukan hipotesis).** `emailListToRecipients` membangun `customer_id =
"manual:<email>"`. Tapi `crm_message_log.customer_id` **dan** `crm_suppression.customer_id` keduanya
`uuid`. Di penerima pertama, insert `crm_message_log` menjalankan `'manual:...'::uuid` →
`22P02 invalid input syntax for type uuid` (direproduksi langsung ke produksi). Lemparan itu di LUAR
try per-penerima (`send-run.ts:273`) → naik ke `sendCampaignAction` → `classifySendThrow` →
`unexpected_error`. Gagal SETELAH run dibuat, SEBELUM baris log — persis buktinya. Uji 25 Agu berhasil
karena harness menyuntik sentinel **uuid valid**.

**Temuan kedua (lebih parah).** Karena `crm_suppression.customer_id` juga `uuid`, andai insert log
lolos, tautan unsubscribe (membawa `manual:<email>`) tak pernah bisa menulis suppression → orang tak
bisa berhenti berlangganan. Id sintetis **ganda** invalid.

**Temuan ketiga.** Harness `crm_test_recipient` juga rusak sejak 26 Agu: ia membangun
`${SENTINEL}-${i}` = `...f1770-0`, yang **juga bukan uuid valid** (diverifikasi). "Mekanisme yang
dirancang untuk ini" pun tak berfungsi.

**Keputusan (sesuai LARANGAN yang ada + skema).** Penerima kampanye WAJIB id `master_customer` nyata
(uuid). Daftar email manual berarti "orang yang SUDAH ada di data audiens 20FIT": tiap alamat
diresolusi ke `customer_id`; alamat di luar pool **ditolak sebelum run dibuat, disebut namanya**, dan
diarahkan ke Kirim uji. Kirim ke luar pool: TIDAK untuk pelanggan (tanpa uuid, unsubscribe tak punya
identitas), hanya penerima uji internal lewat jalur harness (sentinel uuid, gerbang aman).

**Perbaikan.** `resolveEmailListRecipients` (resolve ke uuid nyata + daftar `unresolved`);
`sendCampaignAction`/`scheduleCampaignAction`/executor terjadwal menolak lebih awal dengan
`unresolvable_recipients` (nama alamat); harness memakai `internalTestCustomerId(i)` (uuid valid,
indeks 0 = sentinel lama); `classifySendThrow` menambah `invalid_recipient_id` supaya kegagalan
resolusi identitas tak pernah lagi "unexpected". 9 run stopped kini beranotasi retroaktif. Mekanisme
ganda dihapus: `emailListToRecipients` (sintetis) dibuang. Test: resolver, `internalTestCustomerId`,
`classifySendThrow`.

**Belum tuntas — TIDAK bisa diverifikasi dari sesi ini.** "Kirim satu kampanye uji sungguhan lewat
`crm_test_recipient`" butuh env kirim (UNSUBSCRIBE_TOKEN_SECRET / MAILTRAP_API_TOKEN / MAILTRAP_FROM /
SEND_TEST_INTERNAL_ADDRESS) — **semua kosong di kontainer ini** — dan berjalan di produksi (deploy dari
`main`, yang butuh izin manusia). Jadi uji nyata menunggu deploy + operator. Lihat MENUNGGU.

---

## T-37 — Email "berantakan" = jalur kirim merusak template yang benar — 31 Agu 2026

**Klaim awal:** kampanye pertama sampai, tapi tampilannya berantakan di Gmail (ponsel DAN desktop):
kolom sempit di tengah, jarak antar-kartu sangat besar, latar gelap. Diduga template tak tahan ponsel.

**Diagnosis dari HTML sebenarnya (bukan screenshot).** Badan `email_1787897773605` (v1) diperiksa
langsung ke produksi:
- **19,3 KB** (19.734 byte) — jauh di bawah batas potong Gmail ~102 KB → **risiko terpotong rendah**
  (melawan dugaan "8 kartu ~102 KB").
- **Berbasis tabel:** 16 `<table>`, lebar `width=600` + `max-width:600` ×2; 3 `<div>`, **0** dipakai
  untuk lebar → bukan masalah "lebar di div".
- **Jarak:** padding ×30; 20 `margin` inline yang sebagian besar `margin:0` (reset), bukan jarak tata letak.
- **flex/grid/position:** tak ada.
- **Gambar:** 1, punya `alt="20FIT"`, `width="140"`, `height:auto` → benar.
- **Kepala dokumen:** DOCTYPE, xmlns VML/office, viewport, MSO PixelsPerInch → email **buatan alat
  yang kompatibel Outlook**, bukan buatan asal.
- **Cacat NYATA:** (a) **latar gelap** `#0b0b0d`/`#141416` → risiko inversi mode gelap; (b) sebagian
  `@media`/reset ada di `<style>` (dibuang sebagian klien) — tapi tata letak dasar inline, jadi bertahan.

**Sebab sebenarnya (bukan template).** Jalur kirim menyusun HTML sebagai
`<div>${body.replace(/\n/g,"<br/>")}</div>` (`send-campaign.ts`). Pada dokumen HTML 19 KB berformat,
ini menyuntik `<br/>` di **setiap** baris baru (ratusan) → **jarak vertikal raksasa**, dan
membungkus `<!DOCTYPE html><html>…</html>` di dalam `<div>` → sanitizer Gmail membuang `<html>/<head>`
(hilang `<style>`/aturan MSO) → **struktur ambruk / kolom sempit**. **Jalur kirim merusak template
yang benar.**

**Perbaikan.** `lib/crm/email-document.ts` — `renderEmailDocument` (murni, dipakai kirim DAN pratinjau,
"satu aturan"): dokumen HTML dikirim **apa adanya** (tak lagi di-`<br/>`); fragmen/teks dibungkus
**kerangka tabel 600px, inline, LATAR TERANG** (`wrapEmailSkeleton`), dengan footer unsubscribe di
kerangka. Pratinjau composer kini merender HTML final sebenarnya + **toggle Desktop/Ponsel** + catatan
"pratinjau ≠ klien email → Send test". Send-test (`sendPreviewEmailAction`) memakai kerangka yang sama.
Test: `email-document.test.ts` (dokumen apa adanya; tanpa mangling `<br/>`; kerangka terang 600;
unsubscribe dijamin & tak ganda; teks alt simpan URL).

**Keputusan yang DISERAHKAN ke pemilik (bukan diputus sendiri):**
1. **Latar terang vs gelap.** Rekomendasi: **terang** sebagai bawaan (inversi lebih dapat diduga).
   `email_1787897773605` **gelap** — perlu di-author ulang jadi terang **atau** diuji di keenam
   kombinasi mode-gelap sebelum dipakai lagi. **Isi lama TIDAK diubah diam-diam** (berversi).
2. **Panjang (8 kartu).** 19,3 KB — aman dari potong; tapi banyak gulir. Pertahankan atau ringkas ke
   beberapa bagian teratas + tautan? **Keputusan isi**, bukan teknis.
3. **Uji lintas klien** sebelum kirim massal: `docs/CEKLIS-email-lintas-klien.md`.

**TIDAK bisa diverifikasi dari sesi ini:** rupa akhir di Gmail/Outlook/Apple Mail (perlu Send test di
produksi; env kirim ada di produksi, tidak di kontainer ini). Kode + pratinjau terbukti; rupa klien
nyata menunggu Send test.

---

## T-38 — Workflow "cek konfigurasi kirim" = FK violation, bukan konfigurasi kirim — 31 Agu 2026

Workflow pertama "Welcoming Message": 36 enrolled (queued), **0 terkirim**, galat "cek konfigurasi
kirim". Diselidiki langsung ke produksi (bukan tebak):

**Sebab (terverifikasi).** `crm_campaign_run.segment_id` **NOT NULL** dengan **FK →
`crm_segment(id)`**. `runWorkflowAction` memanggil `createRun({ segmentId: workflowId })` — tapi id
workflow (`afac3264…`) **bukan** id crm_segment (`count=0` di crm_segment). INSERT run → **pelanggaran
FK** → `createRun` menangkap error & mengembalikan `null` → aksi mengembalikan `run_create_failed` →
UI meruntuhkannya jadi satu pesan kasar "cek konfigurasi kirim". **Run tak pernah bisa dibuat; SETIAP
kirim workflow mati di sini.** Bukti: 0 baris `crm_campaign_run` dengan `segment_id`=workflow, 0
`crm_message_log`. Enrollment (36 queued) berhasil karena tak punya FK itu.

**Bukan soal konfigurasi kirim sama sekali** (env, token, gerbang) — murni ketidakcocokan struktural:
crm_campaign_run dipakai ulang untuk workflow, tapi `segment_id` mengharap segmen, diberi workflow.

**Kelas galat yang sama dengan `unexpected_error` (T-36).** Pesan tunggal menutupi 5 kode berbeda
(`denied`/`not_found`/`resolve_failed`/`run_create_failed`/`send_threw`). Perbaikan menunggu keputusan:
(i) `crm_campaign_run.segment_id` jadikan nullable + kolom `workflow_id` nullable (minimal, jaga
pelacakan run) — **butuh migrasi (gated)**; (ii) buat crm_segment nyata per workflow (mengotori
segmen); (iii) jangan pakai crm_campaign_run untuk workflow. Rekomendasi (i). Ditahan untuk konfirmasi.

**Terkait:** UI pembuat workflow tak menawarkan `trigger_source` → semua workflow lahir 'activity'
(cakupan 0,88%), tak pernah 'pool'. Dan engine tak memeriksa `is_active` — workflow ter-jeda pun bisa
dijalankan.

## T-39 — POLA: tabel tim lain memakai kunci berbeda dari `master_customer.customer_id` — 31 Agu 2026

Bukan tiga kejadian terpisah, satu **pola** yang akan terus muncul:
- `customer_identity.is_paying`/`total_nett` — tak ber-key `customer_id` (tak bisa diiris ke master).
- `my20fit_message_log` — ber-key `user_id`, bukan customer_id (K-37 #1, alasan crm_message_log dibuat).
- `my20fit_campaign_enrollments` — ber-key `user_id` juga.

**Implikasi:** setiap kali CRM ingin memakai data tim lain (nilai bayar, riwayat pesan, enrollment),
kunci HARUS dipetakan dulu ke customer_id lewat lapisan identitas (mirror/identity map). Anggap ini
biaya tetap tiap integrasi lintas-tim, bukan kejutan per kasus. Lebih murah diantisipasi: sebelum
menjanjikan segmen/fitur berbasis tabel tim lain, cek dulu apakah kuncinya sudah dipetakan ke
customer_id. Yang belum: `customer_identity` (butuh peta sebelum "pelanggan membayar" bisa disegmen).

## T-40 — POLA: "satu pesan menyembunyikan banyak keadaan" — 31 Agu 2026

Bukan satu bug, satu **pola** yang sudah muncul tujuh kali. Setiap kali, satu jalur kode meruntuhkan
beberapa keadaan yang berbeda-beda jadi **satu string keluaran**, lalu penyelidikan berikutnya harus
dimulai dari nol karena pesannya tak menunjuk keadaan mana yang terjadi. Kejadian yang tercatat:

1. **`unexpected_error` (T-36).** Kirim gagal setelah run dibuat, sebelum baris log — satu label
   menutupi invalid-address, provider-reject, throw, dan token/env, sehingga "9 kampanye gagal, 0
   terkirim" tak bisa dibaca tanpa masuk ke produksi.
2. **Ekspor CSV terpotong (baris ~694 TEMUAN).** Satu pesan menutupi empat sebab kegagalan resolver,
   dan potongan tak diberi penanda akhir → tak terlihat bahwa hasilnya tak lengkap.
3. **Reset dua-fase (RESET-FIX).** Satu status "gagal" menyatukan verify-gagal, token-kedaluwarsa, dan
   kirim-gagal; dibedakan jadi kode terpisah + logging 3K.
4. **Kirim: deferred vs failed (KEPUTUSAN ~725).** Menyatukan "ditunda" (bukan gagal, boleh diulang)
   dengan "gagal" menyembunyikan apakah auto-stop bounce 5% seharusnya menyala.
5. **`send_threw` di composer campaign (i18n ~1354).** Run ditandai berhenti **dengan sebabnya**
   alih-alih satu "gagal".
6. **Workflow "cek konfigurasi kirim" (T-38).** Pelanggaran FK (`run_create_failed`) tampil sebagai
   nasihat "cek konfigurasi kirim" — menuduh env/token padahal murni struktural.
7. **Kelima kode galat workflow (sprint ini).** `denied` / `not_found` / `resolve_failed` /
   `run_create_failed` / `send_threw` + `workflow_inactive` kini masing-masing punya pesan sendiri di
   `runWorkflowAction` + `runErrText` di UI; tak ada lagi satu "Gagal menjalankan." yang menelan semua.
8. **Penjadwalan gagal senyap (31 Agu).** Cron `crm-run-scheduled-sends` (jobid 18) mencatat 807 run
   **semua "succeeded"**, tapi pg_net (`net._http_response`) menyimpan **HTTP 200 = HALAMAN LOGIN**:
   middleware auth mengalihkan POST cron ke `/login` sebelum route jalan, jadi `x-cron-secret` tak
   pernah dicek dan `last_error` tak pernah terisi. Baris `pending` 85 menit tanpa sebab. Tiga lapis
   menyembunyikannya: cron sukses (POST ter-antre), pg_net 200 (tapi login HTML), baris diam. Perbaikan:
   allowlist `/api/campaigns/run-scheduled` di `isPublicPath` + penanda TERLEWAT di UI untuk executor
   yang diam-diam berhenti. **Pelajaran tambahan pola ini: "200 OK" dari pg_net BUKAN bukti sukses —
   badan responsnya bisa halaman login. Verifikasi status DAN isi, bukan hanya kode cron.**

**Aturan yang diambil dari pola ini.** Ketika sebuah aksi bisa gagal karena >1 sebab yang menuntut
tindakan berbeda, kembalikan **kode bernama per sebab** dari sisi server, dan petakan tiap kode ke
pesan/UI sendiri — jangan pernah meruntuhkannya jadi satu string. Biaya diam-diamnya bukan estetika:
tiap peruntuhan memaksa penyelidikan produksi berikutnya mulai dari nol. Cek cepat sebelum menulis
handler `catch` tunggal: "apakah dua pemanggil akan bertindak beda tergantung sebabnya?" — jika ya,
pisahkan sekarang.

---

## T-41 — Status HTTP dibuang DUA KALI → 18.119 baris `unknown` + NULL — 3 Sep 2026

Run `5f5f3a57-72b8-431b-8818-298fef5027d5` ("Ajakan beli tiket PLN Mobile 5K Series"). Setelah 124
pengiriman diterima provider, tembok jatuh pada **07:20:13 UTC** dan **18.119** percobaan berikutnya
gagal berturut-turut sampai 09:07:28 — tanpa satu pun menyimpan alasannya.

**Terukur (SQL langsung ke produksi, 3 Sep 2026):**

| status | n | `created_at` pertama | `created_at` terakhir | `failure_cause` | `error_message` |
|---|---:|---|---|---|---|
| `delivered` | 117 | 07:19:23.775 | 07:20:12.852 | NULL | NULL |
| `sent` | 2 | 07:19:26.789 | 07:20:06.923 | NULL | NULL |
| `bounced` | 5 | 07:19:30.056 | 07:20:10.859 | `hard_bounce` | NULL |
| `failed` | **18.119** | **07:20:13.276** | 09:07:28.973 | **`unknown` (18.119/18.119)** | **NULL (18.119/18.119)** |

Nol pengecualian: setiap baris gagal berkelas `unknown` dengan `error_message` kosong. Run dibuat
07:18:54.775 — jendela sukses hanya **±49 detik**, lalu ±165 kegagalan/menit selama 1 jam 47 menit.

**Sebab: status dibuang dua kali, di dua berkas berbeda.**
1. `lib/email/mailtrap.ts` melempar `new Error(\`Mailtrap send failed with HTTP ${res.status}.\`)` —
   statusnya hanya ada di dalam **teks pesan**, tidak pernah sebagai properti.
2. `classifySendFailure` (`lib/crm/send-run.ts`) membaca `e.status`, yang **tak pernah terisi** →
   cabang kata-kunci tak cocok ("Mailtrap send failed with HTTP 429." tak memuat kata kunci apa pun)
   → `unknown`. Lalu `runSend` mengambil `err.status ?? err.code ?? null` → **null** →
   `error_message` NULL.

Dua penjaga yang seharusnya saling menutupi justru gagal pada satu akar yang sama. Aturan 5
send-run.ts ("sebab adalah kolom kelas satu") benar; yang tak ada adalah datanya.

**Yang TIDAK boleh jadi perbaikan:** menyimpan potongan body respons provider. `crm_message_log`
dirancang bebas PII (identitas hanya keyed-HMAC; komentar kolom `identity_hash`: *"Raw contact never
stored"*), dan komentar sengaja di `mailtrap.ts` baris 69 melarangnya karena body bisa meng-echo
alamat penerima. Usulan awal "+ potongan body provider" **ditarik sebelum ditulis**.

**KETERBATASAN yang harus dinyatakan apa adanya.** Himpunan throttle `{429, 402, 503}` adalah
**hipotesis, bukan turunan dari insiden ini**. Status sebenarnya dari 18.119 kegagalan itu dibuang —
itulah temuannya — jadi **kami masih tidak tahu tembok apa yang jatuh pada 07:20:13**. Kalau
ternyata `403` (kuota/plan habis), kode baru akan melabelinya `provider_rejected`, bukan
`provider_throttled`. Itu tidak fatal: `sendFailureCode` tetap menyimpan angka statusnya di
`error_message`, jadi salah-klasifikasi bisa dipulihkan dari data tanpa mengirim ulang apa pun, dan
penyesuaian himpunannya sebaris. Pemilik akan memeriksa dashboard Mailtrap untuk 3 Sep guna
mengetahui status sebenarnya; jangan sajikan himpunan ini seolah terukur sampai itu ada.

**Perbaikan (sprint ini).** `err.status` dibawa sebagai properti (pesan tak berubah);
`classifySendFailure` memeriksa status lebih dulu; kegagalan jaringan dicatat sebagai **kode saja**
(`ECONNRESET`/`ETIMEDOUT`, lewat `err.cause.code`), disaring pola `^[A-Za-z0-9_.-]{1,40}$` sehingga
teks bebas dijatuhkan utuh, bukan dipotong ke kolom. Dikunci di `send-run.test.ts`: untuk sembilan
status (400/401/402/403/422/429/500/503/504) tak ada satu pun yang mendarat `unknown` + NULL.

## T-42 — `nextRunStatus` tak pernah melihat jumlah gagal → run 99,3% gagal ditandai `sent` — 3 Sep 2026

Run yang sama tercatat di `crm_campaign_run` dengan **`status = 'sent'`** dan `last_error = NULL`,
padahal 18.119 dari 18.243 penerima (99,3%) gagal.

**Sebab.** `nextRunStatus(summary)` hanya menerima `{ deferredDailyLimit, stoppedHighBounce }`.
Jumlah gagal **tidak pernah menjadi masukan**, jadi tak ada nilai kegagalan yang bisa mengubah
jawabannya. Tiga pemanggil (`app/(app)/campaigns/actions.ts`, `app/api/campaigns/run-scheduled/route.ts`,
`lib/crm/send-test-harness.ts`) masing-masing menyusun sendiri objek dua-field itu dari `summary` yang
lengkap — kegagalan tersedia di ruang lingkup, tak ada yang meneruskannya.

Akibatnya layar Riwayat Pengiriman, baris run, dan hasil di composer semuanya berkata kampanye sudah
terkirim. Ini bukan salah baca operator: sistem memang melaporkannya begitu.

**Perbaikan.** `nextRunStatus` menerima `{ sent, failed, deferredDailyLimit, stoppedHighBounce,
stoppedConsecutiveFailures }`; `finalizeRunStatus` menerima **seluruh** summary (bukan dua field
pilihan) sehingga pemanggil tak bisa lupa; status baru `partial`/`failed` (Migrasi B). Urutan
cabangnya: auto-stop → **deferral** → kegagalan → `sent`. Versi pertama menaruh kegagalan di atas
deferral dan itu **salah** — lihat **T-46**. **`partial` dan `failed` tidak resumable** —
`RESUMABLE_RUN_STATUSES = {draft, sending}`, dijaga di `listResumableRuns`, di `getRunForPair`, dan
oleh test. Status run lama **tidak** di-backfill (keputusan pemilik terpisah).

## T-43 — Plafon harian membatasi KEBERHASILAN, bukan PERCOBAAN — 3 Sep 2026

`crm_send_config.daily_limit` = **1000** hari itu. `crm_message_log` bertambah **18.243 baris** pada
hari yang sama.

**Terukur:**

| hari UTC | total baris | sent | delivered | bounced | failed |
|---|---:|---:|---:|---:|---:|
| 2026-09-03 | **18.243** | 2 | 117 | 5 | 18.119 |
| 2026-08-31 | 3 | 0 | 3 | 0 | 0 |
| 2026-08-25 | 1 | 0 | 1 | 0 | 0 |

**Sebab (kode).** `lib/crm/send-run.ts`: `budget--` berada di dalam blok `try`, **setelah**
`ports.record(..., {status:"sent"})` berhasil. Cabang `catch` mencatat kegagalan dan **tak pernah
menyentuh budget**. Jadi budget hanya turun 124 kali sepanjang run; ia tak pernah mencapai 0, nol
penerima ditangguhkan, dan 18.119 percobaan gagal berjalan tanpa rem.

Plafon itu memang plafon **pengiriman berhasil di dalam satu run** — bukan plafon percobaan, dan
(lihat T-44) bukan plafon harian. Sebutan "batas harian" di UI menjanjikan sesuatu yang tak
diberikannya.

**Tidak diperbaiki di sprint ini — sengaja.** Menghitung percobaan alih-alih keberhasilan mengubah
arti jatah 300 workflow / 700 manual yang sudah diputuskan pemilik (PETA-WORKFLOW §7). Dieskalasikan
utuh dengan opsi + trade-off di **`docs/ESKALASI-plafon-kirim.md`**; keputusannya milik pemilik.

## T-44 — Keberhasilan KELUAR dari penghitung plafon saat webhook mengubah `sent` → `delivered` — 3 Sep 2026

Temuan turunan dari T-43 tapi **sebab dan perbaikannya berbeda**, jadi dicatat terpisah.

`todaySentCount()` (`lib/crm/send-campaign.ts`) menghitung `crm_message_log` dengan
`.eq("status","sent")` saja. Webhook Mailtrap kemudian memindahkan baris yang sama ke `delivered`
(`app/api/mailtrap/webhook/route.ts`, `patch.status = effect.status`). Baris yang paling terbukti
berhasil justru berhenti dihitung.

**Terukur untuk 3 Sep 2026:**

```
todaySentCount() akan mengembalikan : 2
Diterima provider hari itu (2xx)    : 124
→ 98,4% pengiriman berhasil hilang dari penghitung plafon
```

**Batas dampaknya — jangan dilebihkan.** `todaySentCount()` dipanggil **sekali** di awal run, lalu
budget dilacak di memori. Maka:
- **Dalam satu run:** tak berpengaruh. Budget in-memory tetap membatasi.
- **Run kedua di hari yang sama:** `alreadyToday` = 2 → budget = 998, padahal 124 sudah terkirim.
  Rantai tiga kampanye berarti plafon 1000 berlaku **per kampanye**, bukan per hari.

**Kesimpulan gabungan T-43 + T-44, apa adanya:** `crm_send_config.daily_limit` **bukan plafon harian
atas apa pun**. Ia membatasi pengiriman berhasil di dalam satu run, dan tidak lebih. Ini penting
sekarang karena kampanye penyelesaian ke ~12.021 orang (angka pemilik) harus berjalan lintas hari/run — persis
skenario yang dibocorkan T-44. Opsi perbaikan ada di `docs/ESKALASI-plafon-kirim.md`; **tidak dibangun
di sprint ini.**

## T-45 — Bounce keras tak pernah di-auto-suppress: nol suppression aktif — 3 Sep 2026

> **DIKOREKSI SEBAGIAN — lihat T-50.** Kalimat "nol suppression aktif" adalah potret satu momen
> (benar saat diukur), bukan keadaan permanen. Bagian bounce-tak-pernah-di-auto-suppress tetap berlaku.

**Terukur:** `crm_suppression` berisi **1 baris**, berstatus **`lifted`** → **nol suppression aktif**
di seluruh sistem. Kelima hard bounce dari run 3 Sep di-join ke `crm_suppression`: **0** baris
suppression, **0** aktif. Kelima orang itu masih sepenuhnya kontaktabel dan akan menerima kampanye
berikutnya.

Jalur bounce sendiri berjalan benar: webhook memverifikasi tanda tangan, mengisi `bounced_at`,
menetapkan `failure_cause='hard_bounce'` (kelima baris punya `provider_message_id` + `sent_at` +
`bounced_at`). Yang tak ada adalah langkah berikutnya — tak ada kode yang menulis `crm_suppression`
saat bounce keras masuk.

Ini penting karena menurut `docs/KEBUTUHAN-SISTEM.md` **suppression adalah satu-satunya gerbang
nyata** (K-36): consent bukan gerbang, jadi tak ada lapisan lain yang menahan pengiriman ke alamat
yang sudah terbukti mati.

**TIDAK diperbaiki, sengaja.** Menulis baris `crm_suppression` = rekonsiliasi, keputusan pemilik
terpisah, dan tabel ini append-only (tak bisa dibatalkan seperti backfill consent). Dicatat sebagai
temuan agar berhenti menjadi asumsi.

## T-46 — Aturan status yang diam-diam mengambil keputusan operasional → kirim ganda — 3 Sep 2026

**Tertangkap di tinjauan pemilik, BUKAN di produksi.** Tak ada baris data yang terpengaruh; aturannya
diperbaiki sebelum di-merge. Dicatat justru karena itu: pola yang sama dengan T-42, tapi bermuara pada
kirim ganda ke ribuan orang, bukan sekadar label yang salah.

**Aturan yang salah** (versi pertama `nextRunStatus`, perbaikan T-42):

```ts
if (outcome.failed > 0) return outcome.sent > 0 ? "partial" : "failed";
if (outcome.deferredDailyLimit > 0) return "sending";
```

Alasannya terdengar benar dan ditulis sebagai komentar di kode: *"run yang gagal tak boleh mengundang
resume"*. Dijalankan terhadap kampanye penyelesaian (~12.021 orang, angka pemilik) yang **harus**
dipecah lintas hari oleh plafon harian:

| langkah | keadaan |
|---|---|
| 1 | Hari 1: 1.000 terkirim, ~11.000 ditangguhkan plafon, **3** kegagalan sesaat |
| 2 | `failed > 0` menang → status **`partial`** |
| 3 | `partial` bukan resumable (K-55, sengaja) → **11.000 sisanya terlantar** |
| 4 | Satu-satunya langkah operator: **run baru** → `campaign_id` baru |
| 5 | `buildIdempotencyKey` = `{campaign_id}:{customer}:{channel}` → **kunci seluruhnya baru** |
| 6 | 1.000 orang yang sudah menerima **menerima lagi** |

**Tiga kegagalan sesaat menghasilkan kirim ganda ke seribu orang.** Idempotency bekerja persis
seperti rancangannya — kunci deterministik per run — jadi tak ada penjaga di bawahnya yang menangkap
ini. Yang rusak adalah statusnya, dan status itulah satu-satunya hal yang menentukan apakah run boleh
dilanjutkan.

**Akar masalahnya sebuah penyamaan.** *"Ada 3 kegagalan"* dan *"run ini gagal"* bukan hal yang sama,
tapi `failed > 0` memperlakukannya sama. Selama masih ada penerima tertangguhkan, tindakan yang benar
adalah **melanjutkan**. Kekhawatiran asli ("run yang gagal jangan mengundang resume") sudah punya
jalurnya sendiri di cabang teratas: kegagalan **sistemik** (`stoppedHighBounce`,
`stoppedConsecutiveFailures`) keluar sebagai `stopped` dan tak pernah sampai ke `sending`. Jadi cabang
kegagalan hanya perlu memutuskan keadaan **akhir** run yang sudah tak punya sisa kirim.

**Urutan yang benar** (dipakai sekarang):

```
1. stoppedHighBounce || stoppedConsecutiveFailures  → stopped
2. deferredDailyLimit > 0                           → sending
3. failed > 0                                       → sent > 0 ? partial : failed
4. selain itu                                       → sent
```

Dikunci tiga test eksplisit di `lib/crm/campaign-run.test.ts`: `{sent:1000, failed:3,
deferred:11000}` → `sending` **dan** resumable (dengan langkah 1–6 di atas ditulis sebagai komentar,
supaya siapa pun yang tergoda membalik urutannya membaca akibatnya lebih dulu); `{sent:0, failed:5,
deferred:0}` → `failed`; `{sent:100, failed:5, deferred:0}` → `partial`; plus satu test bahwa tembok
nyata tetap `stopped` walau ada 11.000 tertangguhkan.

**Kegagalan tetap terlihat meski statusnya `sending`.** `lib/crm/deliveries.ts` menghitung baris gagal
untuk **setiap** run tanpa memandang statusnya, dan barisnya menampilkan angka itu begitu > 0 — jadi
"run ini masih berjalan" tak pernah berarti "kegagalannya hilang dari layar".

**Pelajaran (nyambung ke T-40).** Aturan status terlihat seperti pelabelan, padahal ia **keputusan
operasional**: di sistem ini status run adalah satu-satunya hal yang memutuskan apakah pekerjaan
boleh dilanjutkan atau harus dimulai ulang. Sebelum mengubah urutan cabang di aturan seperti ini,
tanyakan bukan "label mana yang paling akurat?" melainkan **"tindakan apa yang dipaksakan label ini,
dan apa yang terjadi kalau operator terpaksa memulai ulang?"**

## T-47 — Delapan migrasi CRM diterapkan TANPA stempel ledger; satu tak pernah diterapkan — 3 Sep 2026

Sapuan rekonsiliasi ledger (repo ↔ `supabase_migrations.schema_migrations`, difilter **per nama**,
bukan rentang versi). Hasilnya menjelaskan mengapa `supabase db push` masih berbahaya, dan menemukan
satu berkas yang selama ini dianggap sudah jalan padahal tidak.

### Angka pokok (47 berkas repo)

| | jumlah |
|---|---:|
| Stempel **identik** dengan nama berkas | 17 |
| Stempel **divergen** (waktu apply ≠ nama berkas) | 21 |
| **Tanpa stempel sama sekali** | 9 |
| **Stempel yatim** (versi di ledger tanpa berkas repo) | **0** |

Ketidakcocokannya **satu arah**: ada berkas tanpa stempel, tak ada stempel tanpa berkas.

### Temuan 1 — jendela 26–28 Agu benar-benar kosong di ledger

Seluruh `schema_migrations` untuk 26–28 Agu 2026 hanya berisi **tiga** baris, semuanya milik tim lain
(`backup_event_positions_i18n_20260828`, `guest_scan_quota`, `guest_scan_quota_lifetime_5`). **Nol**
stempel CRM. Bahkan tak ada stempel apa pun antara `20260825162238` dan `20260828041518`.

Artinya delapan berkas CRM bertanggal 26–28 Agu dijalankan lewat jalur yang **tidak menstempel**
(`execute_sql` atau SQL editor), bukan `apply_migration`. Tujuh di antaranya **terbukti sudah
diterapkan** — objek dan datanya hidup, diukur 3 Sep 2026:

| berkas | bukti hidup |
|---|---|
| `…0826090000_seed_default_email_template` | 2 baris `default_newsletter` (id+en) di `crm_message_template` |
| `…0826110000_crm_test_recipient` | tabel ada, 1 baris |
| `…0827090000_crm_activity_layer` | `crm_activity_event` 1.525 baris, `crm_customer_activity` 741 baris, 2 fungsi di katalog |
| `…0827100000_ingest_activity_people` | `crm_ingest_activity_people` ada (1 overload) |
| `…0827110000_crm_workflow` | `crm_workflow` 1 baris, `crm_workflow_enrollment` 36 baris |
| `…0828090000_crm_brand_asset` | tabel 1 baris + bucket Storage `brand-assets` (`public = true`) |
| `…0828100000_crm_scheduled_send` | tabel 1 baris + job pg_cron `crm-run-scheduled-sends` (jobid 18, aktif) |

Bukti silang tambahan untuk `crm_workflow`: migrasi 32 (`crm_campaign_run_owner_xor`, **berstempel**,
31 Agu) memasang FK ke `crm_workflow(id)` dan berhasil — tabel itu pasti sudah ada sebelumnya.

### Temuan 2 — `crm_email_unsubscribe` TIDAK PERNAH diterapkan

`to_regclass('public.crm_email_unsubscribe')` = **NULL**. Berkasnya ada di repo sejak 26 Agu,
tak punya stempel, dan tabelnya tak pernah dibuat. Selama ini ia terhitung sebagai "migrasi 26–28
Agu dari sesi lain" — satu kelompok dengan tujuh yang benar-benar jalan, sehingga ketidakhadirannya
tak pernah terlihat.

**Tidak ada yang rusak hari ini:** pemindaian kode 3 Sep 2026 menemukan **nol** rujukan ke
`crm_email_unsubscribe` di luar berkas migrasinya sendiri. Unsubscribe yang nyata berjalan lewat
`crm_suppression` (K-36), bukan tabel ini. Jadi ini "berkas tanpa pemakai", bukan galat runtime yang
menunggu.

**TIDAK saya terapkan** (perintah eksplisit: jangan tambal sendiri). Keputusannya milik pemilik, dan
ada dua arah yang sama sahnya: menerapkannya kalau log unsubscribe per-template memang masih
diinginkan, **atau menghapus berkasnya** kalau `crm_suppression` sudah menjawab kebutuhannya —
membiarkan berkas migrasi yang tak pernah dijalankan di repo persis yang membuat `db push` berbahaya.

### Temuan 3 — tiga stempel di ledger README ternyata salah

Baris 34/35/36 README mencatat stempel yang **sama dengan nama berkas**. `schema_migrations` berkata
lain:

| baris | nama berkas | tercatat di README | stempel sebenarnya |
|---|---|---|---|
| 34 | `20260901031500_crm_backfill_run_labels` | `20260901031500` | **`20260901074234`** |
| 35 | `20260901032000_crm_run_label_not_null` | `20260901032000` | **`20260901081307`** |
| 36 | `20260901083000_crm_cleanup_uji_iso_labels` | `20260901083000` | **`20260901083824`** |

Ketiganya **memang diterapkan** — hanya stempelnya yang salah dicatat. Nilai lamanya tidak ada di
ledger sama sekali, jadi ini bukan kasus ambigu. **Dikoreksi ke nilai terukur** (ini pencatatan
ulang fakta, bukan menambal celah). Baris 23 juga dirapikan: kolom nama berkasnya menuliskan stempel
ledger (`…154415`), padahal berkas nyatanya `20260821060000_unify_identity_sources_aplus.sql`.

### Kenapa ini penting melampaui kerapian

Ledger adalah **satu-satunya** hal yang memberi tahu `supabase db push` apa yang sudah jalan. Karena
mayoritas berkas memakai `create table if not exists` / `create or replace`, sebuah `db push` tidak
akan meledak dengan rapi — sebagian besar akan **lolos diam-diam** sambil menyisipkan ulang data
seed, menulis ulang grant dan policy, tanpa apa pun yang menandainya. Kegagalan keras masih lebih
baik daripada itu.

**Pelajaran, sejalur dengan T-20:** stempel ledger dibuat oleh **jalur** yang dipakai, bukan oleh
berkas yang ditulis. `apply_migration` menstempel; `execute_sql` dan SQL editor tidak. Menaruh
berkas `.sql` di `supabase/migrations/` **bukan** tindakan yang membuat migrasi tercatat.

### Syarat agar `supabase db push` aman (belum satu pun terpenuhi)

1. Setiap berkas repo punya stempel ledger — lewat `--include-all` + repair, atau `migration repair`
   per versi, bukan dengan menjalankan ulang SQL-nya.
2. `crm_email_unsubscribe` diputuskan: diterapkan, atau berkasnya dihapus.
3. `crm_ingest_csv_people` (bergate) dikeluarkan dari jalur push sampai pemilik menyetujuinya —
   `db push` tidak mengenal konsep "bergate", dan akan menerapkannya tanpa bertanya.
4. Ledger **bersama** dengan tim lain: setiap repair harus menargetkan versi CRM per nama, tak
   pernah per rentang versi (T-20).

Sampai keempatnya beres, jalurnya tetap `apply_migration` satu per satu.

## T-48 — Migrasi 37 menulis `basis='opt_in'`, nilai yang tak pernah ada di skema — 3 Sep 2026

**Tertangkap di tinjauan, sebelum diterapkan. Nol baris data terpengaruh.**

Migrasi `20260902050000_crm_ingest_csv_people` menyisipkan baris `crm_consent` dengan
`basis = 'opt_in'`. CHECK yang hidup menerima **dua** nilai saja:

```
crm_consent_basis_check
  CHECK ((basis = ANY (ARRAY['legacy_import_unverified'::text, 'explicit_opt_in'::text])))
crm_consent : 408.119 baris   ← CHECK-nya nyata, bukan rencana
```

Nilai yang benar adalah **`explicit_opt_in`**; komentar migrasinya sendiri sudah menyatakan
maksudnya ("it does NOT land as `legacy_import_unverified`"), penulisnya hanya memakai nama pendek
yang tidak ada di skema.

### (i) `CREATE FUNCTION` yang sukses BUKAN bukti fungsi itu jalan

Ini inti temuannya. PL/pgSQL **tidak** menyelesaikan nama tabel/kolom dan **tidak** memvalidasi
nilai terhadap constraint saat `CREATE` — badan fungsi hanya di-parse. Jadi kalau migrasi ini
diterapkan apa adanya:

1. `apply_migration` **berhasil**;
2. verifikasi katalog (`pg_proc`, tanda tangan, grant) **semuanya hijau**;
3. impor pertama gagal `23514`, transaksi rollback, nol baris masuk;
4. pemilik melihat pesan galat yang sama persis seperti sebelumnya.

Satu siklus gerbang penuh terbuang untuk kembali ke titik yang sama. **Konsekuensi prosedural:**
verifikasi pasca-apply untuk sebuah fungsi wajib menyertakan **panggilan sungguhan** — satu baris
sintetis di dalam transaksi yang di-`rollback` — bukan hanya pembacaan katalog. Membaca katalog
membuktikan fungsi itu **ada**, bukan bahwa ia **jalan**.

### (ii) Tidak ada preseden yang pernah jalan untuk disalin

Header migrasi 37 berkata ia "mirrors `crm_ingest_activity_people` (migrasi 28)". Diperiksa di
katalog: `position('crm_consent' in pg_get_functiondef(...))` untuk fungsi itu = **false** — migrasi
28 **sama sekali tidak menyentuh `crm_consent`**. Yang dicerminkan hanyalah pola `SECURITY DEFINER`
+ insert `master_customer`; bagian consent-nya **baru**, tanpa contoh yang pernah berhasil.

Itu penjelasan paling meyakinkan kenapa nilai salah bisa lolos: penulisnya tidak punya baris kerja
untuk disalin, dan tak ada apa pun di jalur itu yang memvalidasi tebakannya.

### (iii) Gerbang consent dilewati sepenuhnya oleh jalur tulis SQL

`lib/crm/consent-policy.ts` menyebut `purposePermittedForBasis` sebagai *"the **ONE gate** a write
path must call before recording a consent row… **fail-closed** on unknown input"*. Migrasi 37
menulis barisnya **di dalam SQL** — tak satu baris TypeScript pun berjalan, gerbang itu tak pernah
dipanggil. Kalau ia dipanggil, `isConsentBasis('opt_in')` mengembalikan `false` dan kesalahannya
muncul saat menulis kode, bukan di produksi.

Gerbang itu tak bisa dipanggil dari SQL. Penutupnya: **`lib/crm/consent-vocabulary.parity.test.ts`**
— membaca SQL sebagai teks dan menerapkan kanon yang sama padanya. Tiga lapis: (A) kanon TS ==
CHECK yang direkam live 3 Sep 2026; (B) kanon TS == CHECK yang didefinisikan berkas migrasi
(otomatis merah kalau migrasi mendatang mengubah CHECK tanpa TS ikut); (C) setiap literal
`basis`/`purpose`/`status`/`channel` yang ditulis SQL ke `crm_consent` harus ada di kanon, dan tiap
pasangan `(basis, purpose)` harus lolos `purposePermittedForBasis` — gerbangnya sendiri. Ketiganya
**fail-closed**: parser yang tak paham sebuah CHECK atau sebuah insert akan GAGAL, bukan melewatinya.
Dibuktikan menggigit pada kedua arah (kembalikan `'opt_in'` → 2 test merah; ubah CHECK di migrasi
tanpa mengubah TS → lapis B merah).

**Perbaikan:** `'opt_in'` → `'explicit_opt_in'` di enam tempat (migrasi 37 baris 13 + 114, `README.md`
ledger #37, `RENCANA-ingest-ticket.md`, `RENCANA-impor-audiens.md`, `KEPUTUSAN.md`). **Nol perubahan
kode aplikasi** — jalur impor TypeScript tak pernah menyebut `basis`; nilainya diputuskan seluruhnya
di dalam fungsi SQL. CHECK **tidak** dilebarkan: dua nama untuk satu hal adalah pola yang sudah
berkali-kali menggigit proyek ini.

## T-49 — Pesan galat impor menelan penyebab, dan membocorkan prosa Postgres ke field kode — 3 Sep 2026

Instans **ketujuh** (hitungan pemilik) dari pola kegagalan senyap di `RANGKUMAN.md` §5 + T-41.

`app/api/audience/import/route.ts` menjawab **setiap** kegagalan impor dengan satu kalimat:

```ts
logApiFailure("/audience/import", "import_failed", { code: e.message.slice(0, 60) });
return NextResponse.json({ error: "import_failed", message: "Gagal memproses impor. Coba lagi." });
```

**Dua cacat, dan yang kedua lebih serius.**

1. *"Coba lagi"* adalah saran yang **tidak akan pernah berhasil** untuk sebagian besar penyebabnya.
   Kalau RPC-nya tidak ada (`PGRST202`), atau nilainya melanggar CHECK (`23514`), mengulang dijamin
   gagal lagi. Pemilik menekan tombol itu berkali-kali karena sistem menyuruhnya.
2. Field `ctx.code` di `logApiFailure` **bertipe kode**, tapi yang dijejalkan ke sana adalah **pesan
   Postgres bebas, dipotong 60 karakter**. Isi pesan itu bukan milik kita: sebagian mengutip baris
   yang bermasalah (`Key (email_normalized)=(…) already exists`). Jadi ini **jalur kebocoran PII**,
   bukan sekadar pesan yang buruk — dan pemotongan tidak menolong: kebocoran yang lebih pendek tetap
   kebocoran, sekaligus merusak kodenya.

**Perbaikan.** Kode saja, disaring bentuk. Aturan bentuknya dipindah ke satu kanon bersama,
`lib/crm/safe-code.ts` (`^[A-Za-z0-9_.-]{1,40}$`), dipakai oleh **dua** jalur tulis: `sendFailureCode`
(T-41) dan rute impor — karena "aturan yang ditulis dua kali akan menyimpang" sudah terbukti di
proyek ini. Nilai diambil **utuh atau tidak sama sekali**; prosa dijatuhkan, tak pernah dipotong.
`importFailureMessage(code)` (murni, teruji) menamai kelasnya dan menyatakan terus terang apakah
mengulang bisa menolong — dan *"Coba lagi"* kini hanya muncul untuk `57014` (timeout), satu-satunya
kelas di mana itu saran yang nyata.

## T-50 — Koreksi T-45: potret satu momen disajikan sebagai keadaan permanen — 3 Sep 2026

T-45 menulis: *"`crm_suppression` berisi 1 baris berstatus `lifted` → nol suppression aktif"*. Beberapa
jam kemudian query dengan bentuk yang sama mengembalikan `active`, baris yang sama (id dan
`created_at` identik). Saat itu saya tidak bisa memastikan mana yang salah.

**Audit log menjawabnya, dan pengukuran saya waktu itu BENAR:**

| Waktu (UTC) | Aksi |
|---|---|
| 31 Agu 04:37:19 | `suppression.added` — klik pertama |
| 31 Agu 04:39:52 | `suppression.lifted` — dicabut 2,5 menit kemudian (uji coba) |
| 3 Sep 13:38:44 | `suppression.added` — klik uji pemilik |

Jadi pada saat T-45 ditulis, barisnya memang `lifted`. Yang salah bukan pengukurannya melainkan
**klaimnya**: T-45 menyajikan potret satu momen ("nol suppression aktif") sebagai sifat sistem.
Suppression adalah keadaan yang hidup — orang bisa berhenti berlangganan kapan saja — jadi angkanya
hanya sah dengan cap waktunya. **Aturan yang diambil:** setiap angka dari tabel yang berubah karena
tindakan pengguna ditulis dengan cap waktu pengukuran, dan jangan pernah dinyatakan sebagai keadaan
permanen.

Bagian T-45 yang lain **tetap berlaku**, diverifikasi ulang 3 Sep: kelima penerima hard-bounce run
`5f5f3a57` punya **0** baris suppression, **0** aktif. Bounce keras masih tidak pernah di-auto-suppress.

**Temuan turunan — `created_at` tidak menjawab "kapan orang ini minta berhenti".** RPC unsubscribe
**mengaktifkan ulang baris lama** alih-alih menyisipkan yang baru, jadi `created_at` baris itu masih
tertulis **31 Agustus** padahal permintaan terakhirnya 3 September. Rantai lengkapnya hanya ada di
`crm_audit_log`. Untuk pertanyaan kepatuhan ("kapan persisnya orang ini menarik consent?") tabel
`crm_suppression` **bukan** sumber yang benar — audit log yang benar. Dicatat, **tidak diubah**:
memperbaikinya butuh keputusan (kolom `reactivated_at`, atau baris baru per permintaan) dan sebuah
migrasi.

## Catatan — rekonsiliasi Mailchimp belum bisa diturunkan

Angka irisan Mailchimp ∩ CRM dari laporan 3 Sep **tidak dicatat di sini sebagai angka**: laporan itu
adalah laporan yang sama yang menghasilkan cap waktu "07:18:26" yang kini terbukti tidak diukur, jadi
seluruh angka turunannya berstatus **belum terverifikasi**, bukan "tinggal pilih basis".

Rekonsiliasi menunggu ekspor sumber; **tidak dapat diturunkan dari basis data ini** — nol tabel
Mailchimp di proyek `cpvzwqptzcxnwzfzgrmt` (dicari lewat `information_schema.tables`, terverifikasi
3 Sep 2026). Segmen run ini (`cd20a01f`, "Seluruh Peserta Event 20FIT") adalah kriteria
`ecoUnit='event'`, bukan daftar email tempelan dari Mailchimp.

**Metode saat ekspornya ada** (belum dijalankan): muat ekspor ke tabel staging sementara → normalisasi
email lewat `lib/crm/normalize.ts` (kanon yang sama dengan pool) → join ke
`master_customer.email_normalized` → `customer_id` → join ke `crm_message_log` pada
`campaign_id = '5f5f3a57-72b8-431b-8818-298fef5027d5'` → hitung irisan **per status**, dan nyatakan
basisnya secara eksplisit (117 `delivered` / 119 tak-diketahui-gagal / 124 diterima provider). Jangan
pernah menempelkan alamat pelanggan ke dalam laporan atau konteks percakapan; yang dilaporkan hanya
hitungan. Catatan logika: bila klaim "irisan ∩ bounced = 0" benar, pertanyaan basis larut sendiri
(119 dan 124 memberi angka sama) — tapi klaim itu berasal dari laporan yang sama, jadi tetap harus
diturunkan ulang.
