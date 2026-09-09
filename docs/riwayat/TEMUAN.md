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

## T-51 — Pola tag menolak 7 dari 22 tag yang dihasilkan pemiliknya sendiri — 4 Sep 2026

**Tertangkap di gerbang, sebelum satu baris kode pun ditulis. Nol data terpengaruh.**

Pola yang diusulkan untuk kanon tag, `^[a-z][a-z0-9-]*:[a-z0-9][a-z0-9-]*$`, diuji terhadap kosakata
nyata dari berkas pemilik (3.371 baris, 22 tag berbeda, 22.974 penempelan):

| Ditolak | penempelan | sebab |
|---|---:|---|
| `format-single` / `format-double` / `format-relay` | 549 | tanpa namespace |
| `kategori-laki-laki` / `kategori-perempuan` | 450 | tanpa namespace |
| **`nilai:<300k`** | **1.227** | mengandung `<` |
| **`nilai:>=1jt`** | **319** | mengandung `>` dan `=` |

Dua yang terakhir yang berbahaya: keduanya **bernamespace** dan terlihat benar sekilas, jadi tak
seorang pun mengantisipasinya. Karena tag tak sah **menggagalkan panggilan** (aturan yang benar), 1.546
penempelan itu akan membuat impor pertama gagal seluruhnya.

**Kelasnya sama persis dengan T-48:** aturan ditulis di satu tempat, nilai dihasilkan di tempat lain,
tak ada yang mempertemukan keduanya sampai produksi. Bedanya kali ini pertemuannya terjadi di gerbang,
karena polanya diuji terhadap data sebelum dipakai — itu satu-satunya perbedaan yang penting.

**Penyelesaian.** Pemilik menormalisasi datanya, bukan melonggarkan polanya: `format:`/`kategori:`
dinamespace, dan `nilai:` diganti nama jadi `di-bawah-300k` / `300k-1jt` / `1jt-ke-atas`. Alasannya
dicatat karena akan digoda untuk dibalik: `<`, `>`, `=` akan menggigit di URL, CSV, HTML, dan filter
UI mana pun — tag adalah nilai yang berkeliling ke semua tempat itu. Melonggarkan pola berarti
memasang karakter berbahaya ke kosakata permanen demi menghemat satu kali penulisan ulang.

Konsekuensi yang **sengaja tidak diselesaikan**: ketiga `nilai:` tak terurut alfabet sesuai
tingkatannya. **Jangan** menambahkan awalan urutan (`t1-`, `1-`) ke dalam tag; urutan tampilan
ditangani `NILAI_TAG_ORDER` di UI. Ditulis di sini supaya tak "diperbaiki" kelak oleh orang yang tak
tahu.

`status-bayar:lunas` juga dibuang — 3.180 penempelan, dan `sumber:mayar` juga tepat 3.180: konstan di
seluruh populasinya, nol daya pembeda. **Aturan yang layak diingat: tag yang tidak pernah bervariasi
di dalam populasinya bukan tag, melainkan nama lain untuk populasi itu.**

Kanon sekarang di `lib/crm/tags.ts`, dijaga `tags.parity.test.ts` — termasuk bukti bahwa ia **tidak**
menolak 577 baris `activity_ingest` yang sudah hidup di produksi. Kanon yang menyatakan produksi tidak
sah lebih buruk daripada tak ada kanon.

## T-52 — `batch:` pada orang yang sudah ada akan menghapus pelanggan asli, dengan seluruh penjaga utuh — 4 Sep 2026

**Tertangkap di tinjauan desain. Nol data terpengaruh.**

Rollback impor per-batch adalah:

```sql
delete from public.master_customer
 where source='csv_import' and tags @> array['batch:<BATCH_UUID>'] and merged_into is null;
```

Argumen awal untuk memakai penanda berbeda (`tagged:`) bagi orang yang sudah ada adalah "kalau
kedua populasi berbagi bentuk penanda, satu-satunya yang mencegah pelanggan asli terhapus adalah
kondisi `source` — dan kondisi itu bisa hilang saat query disalin". Benar, tapi butuh manusia yang
menyalin dengan buruk.

**Ada skenario yang tidak butuh kesalahan siapa pun:**

| langkah | keadaan |
|---|---|
| 1 | Orang P diimpor batch **B1** → `source='csv_import'`, `tags=['csv_import','batch:B1']` |
| 2 | Batch **B2** memuat P lagi → dedup melewatinya (email cocok) → P ditandai |
| 3 | Kalau penandanya `batch:B2`, `tags` P kini memuat **B1 dan B2** |
| 4 | Rollback B2 → `where source='csv_import' and tags @> array['batch:B2']` → **P TERHAPUS** |
| 5 | P milik B1. Rollback B2 tak pernah dimaksudkan menyentuhnya. |

Setiap penjaga bekerja persis seperti rancangannya. `source` cocok — karena P memang diimpor CSV.
Tak ada query yang disalin salah. **Penanda `tagged:` membuat ini mustahil karena BENTUKNYA**, bukan
karena seseorang ingat menambahkan klausa WHERE.

**Pelajaran yang lebih luas:** ketika dua populasi berbagi tabel dan salah satunya bisa dihapus
massal, yang membedakan keduanya harus **tak mungkin tertukar**, bukan sekadar "berbeda kalau
querynya benar". Penanda yang bentuknya sama adalah bom waktu yang menunggu populasi kedua tumpang
tindih dengan yang pertama.

## T-53 — Nomor keputusan bertabrakan antar-branch paralel (K-55 ganda) — 4 Sep 2026

PR #29 (sesi lain) menomori keputusan dedup email-primernya **K-55**. Di saat yang sama PR #32 (sesi
ini) memakai **K-55** untuk status run `partial`/`failed`, dan sudah merge ke `main` lebih dulu.
Keduanya benar secara lokal; keduanya membaca `KEPUTUSAN.md` saat nomor itu masih kosong.

Diselesaikan dengan menomori ulang #29 → **K-57** (11 rujukan di 5 berkas: `KEPUTUSAN.md`,
`RENCANA-impor-audiens.md`, `import-audience.ts`, `import-audience.test.ts`, dan
`components/audience/import-wizard.tsx` — berkas terakhir hampir terlewat karena sapuan pertama hanya
mencakup `lib/`, `app/`, dan `docs/`).

**Konsekuensi yang diterima sadar:** kalau #29 di-merge sebelum commit penomoran ulang, `main` memuat
dua K-55 selama beberapa menit. Nol kode bergantung pada nomor itu secara semantik — ia hanya rujukan
dokumen — jadi jendela itu tak berbahaya, hanya membingungkan. Di branch ini penomoran ulang menjadi
bagian dari commit merge-nya sendiri, sehingga `main` tak pernah melihatnya lewat jalur ini.

**Cara menghindarinya lain kali:** nomor keputusan diambil dari `main`, bukan dari branch. Dua branch
paralel yang sama-sama menambah keputusan akan selalu menebak nomor yang sama. Yang murah: sebelum
menulis `## K-nn`, `git fetch` lalu baca `KEPUTUSAN.md` **di `origin/main`**, dan kalau ada branch
lain yang sedang terbuka, ambil nomor setelah yang tertinggi di antara keduanya. Yang lebih baik lagi:
sebutkan nomor yang dipakai di deskripsi PR, supaya tabrakan terlihat saat tinjauan, bukan saat merge.

## T-54 — Migrasi 37 tidak pernah diurai Postgres sampai gerbang dibuka: satu koma hilang — 7 Sep 2026

**Apa yang terjadi.** `apply_migration` untuk migrasi 37 ditolak pada percobaan pertama:

```
ERROR: 42601: syntax error at or near "tag_targets"
```

Penyebabnya satu karakter. CTE `ins` ditutup di baris 175 dengan `  )` tanpa koma, lalu — dipisahkan
enam baris komentar — CTE berikutnya `tag_targets as (` dimulai. Berkas itu **tidak pernah bisa
dibuat**, dalam bentuk apa pun, di basis data mana pun.

**Mengapa tidak ada yang menangkapnya.** Ini satu lapis LEBIH AWAL dari T-48. T-48 berkata: `CREATE
FUNCTION` yang berhasil hanya membuktikan fungsi itu ADA, bukan bahwa ia BERJALAN. Yang ini berkata:
berkas migrasi di repo tidak pernah dibuktikan bahkan **bisa diurai**. Yang menjaga berkas ini adalah
`tags.parity.test.ts`, `consent-vocabulary.parity.test.ts` dan `dedup.parity.test.ts` — 31 pengujian,
dan **ketiga-tiganya lulus dengan koma yang hilang masih di tempatnya** (dijalankan sebelum dan
sesudah perbaikan: 31 lulus, 31 lulus). Itu bukan kegagalan pengujian-pengujian tersebut: mereka
memindai *teks sumber* untuk memastikan aturan yang sama muncul di TypeScript dan di SQL. Tidak ada
satu pun yang berpura-pura menjadi pengurai SQL.

Koma itu hilang saat `tag_targets`/`upd` disisipkan setelah CTE `ins` (pekerjaan TUGAS B). Kelas
kesalahan yang sama persis dengan `row_tags` yang tak pernah sampai ke INSERT: **menyisipkan CTE ke
tengah rantai `with` tidak diperiksa oleh apa pun kecuali Postgres sendiri.**

**Biayanya, dan mengapa kecil.** Nol. Kegagalan terjadi pada waktu urai, sebelum DDL apa pun berlaku,
dan `apply_migration` tidak menyetempel ledger untuk migrasi yang gagal. Keenam angka LANGKAH 1 diukur
ulang setelah penolakan dan **identik** (04:06:51 → 04:10:51 UTC): `pg_proc` 0, stempel 0,
`master_customer` 82.830, `crm_consent` 408.119, run draft/sending 0, kiriman terjadwal 0. Yang hilang
hanya satu siklus gerbang pemilik.

**Cara menghindarinya lain kali — dan koreksi atas usulan pertama saya.** Usulan awal saya adalah
`initdb` sebuah Postgres sekali pakai di CI. Itu bekerja (begitulah komanya diisolasi), tapi pemilik
menunjukkan yang lebih murah: **`libpg-query`**, tata bahasa Postgres sendiri dikompilasi jadi pustaka.
Tanpa server, tanpa keputusan CI, milidetik.

Tapi pemilik juga menemukan jebakannya, dan itu bagian terpentingnya. Ada **dua** API, dan yang jelas
namanya adalah yang salah:

```
parse_sql      versi rusak      -> OK      <- BUTA
parse_sql      versi diperbaiki -> OK
parse_plpgsql  versi rusak      -> MERAH: syntax error at or near "tag_targets"
parse_plpgsql  versi diperbaiki -> OK
```

Badan PL/pgSQL adalah **literal berkutip dolar**; tata bahasa SQL luar tak pernah melihat ke dalamnya.
Berhenti di `parse_sql` lalu melaporkan "terverifikasi" akan menjadi instans kesekian dari pola yang
sama — sebuah pemeriksaan yang hijau karena tak melihat, bukan karena tak ada yang salah.

Dikonfirmasi ulang secara mandiri lewat paket npm (`libpg-query@18.1.4`, yang memang mengekspos
`parsePlPgSQL`/`parsePlPgSQLSync`; versi 17.x **tidak**): kedua baris di atas terulang persis, dan
pesannya identik karakter-per-karakter dengan yang dikembalikan produksi.

**Pagar keenam dibangun di putaran ini**: `lib/crm/migration-parse-guard.test.ts` mengurai ke-47 berkas
migrasi dengan **kedua** pengurai, dan memuat dua kasus yang membuktikan ia **menggigit** — koma
antar-CTE yang hilang (ditolak `parse_plpgsql`, lolos `parse_sql`) dan statement rusak di luar badan
fungsi (ditolak `parse_sql`). Usulan `initdb` **dibatalkan**, bukan diparkir: ia tak lagi diperlukan.

Yang pagar ini **tidak** buktikan tetap sama: bahwa nama tabel/kolomnya ada. Itu T-48, dan hanya
panggilan sungguhan terhadap skema sungguhan yang menunjukkannya.

**Yang BELUM dibuktikan oleh pengurai.** Bahwa nama tabel dan kolomnya benar. Itu diperiksa terpisah
(lihat catatan uji coba lokal di bawah), bukan oleh `CREATE` yang berhasil.

## T-55 — Orang yang sudah digabung (`merged_into`) dihitung "akan ditandai" oleh perencana, tapi dilewati oleh SQL — 7 Sep 2026

**Statusnya: laten, belum menggigit.** Diukur 7 Sep 2026: `merged_into is not null` = **0** baris,
`is_merged = true` = **0** baris di `master_customer`. Jadi ini tidak memengaruhi impor yang sedang
digerbangi. Dicatat karena ia akan menggigit diam-diam pada penggabungan pertama.

**Ketidakcocokannya.** `app/api/audience/import/route.ts:97` mengisi `existingEmails` dengan:

```ts
await admin.from("master_customer").select("email_normalized").in("email_normalized", emails)
```

— tanpa saringan `merged_into is null`. Maka baris yang sudah digabung ikut masuk. Perencana lalu
memasukkan email itu ke `tagTargets` dan menaikkan `summary.taggedExisting`, sehingga layar Ringkasan
menghitungnya sebagai "Akan ditandai (sudah ada)". Tetapi CTE `upd` di migrasi 37 menyaring
`m.merged_into is null` — sengaja, karena baris yang digabung sudah memindahkan datanya ke tempat
lain. Hasilnya orang itu **tidak disisipkan dan tidak ditandai**, dan `tagged_existing` yang
dikembalikan lebih kecil daripada angka uji-kering, tanpa satu baris pun yang menjelaskan selisihnya.

**Dibuktikan, bukan dinalar.** Dalam uji coba lokal (skema disalin dari produksi, di luar produksi),
dua baris `p_tag_rows` diberikan — satu orang biasa, satu orang dengan `merged_into` terisi — dan
fungsi mengembalikan `tagged_existing: 1`. Selisihnya senyap.

**Keputusan pemilik (7 Sep 2026): opsi (a) DAN (c) bersama, bukan salah satu.** Perencana ikut
menyaring, **dan** mengembalikan hitungan terpisah supaya penyaringan itu terlihat. Kalimat
pemiliknya: *"Angka boleh berkurang; tidak boleh berkurang diam-diam."* Opsi (b) — mengikuti orang itu
ke baris penerusnya — **ditunda**: keputusan perilaku tersendiri, dan `merged_into` masih nol.

**Cara menerapkannya, dan jebakan yang hampir saya masuki.** Godaan pertama adalah menyaring
`merged_into is null` langsung di query `existingEmails`. Itu **salah dan mencerminkan cacatnya**:
`existingEmails` memutuskan SISIP-atau-tidak dan harus setara dengan anti-join fungsi ingest, yang
**ikut** melihat baris tergabung. Sempitkan set itu dan barisnya diklasifikasikan `insert`, lalu SQL
menolak menyisipkannya — kesenyapan yang sama, hanya terbalik arah.

Jadi dua set, bukan satu: `existingEmails` (semua, cermin anti-join) dan `taggableEmails` (yang punya
setidaknya satu baris `merged_into is null`, cermin filter `upd`). Email yang ada di set pertama tapi
tidak di kedua → kelas `skip_merged`, dengan hitungan `skippedMerged` sendiri dan kartunya sendiri di
layar. Tiga pengujian menguncinya, termasuk kasus orang yang punya baris tergabung **dan** baris hidup
sekaligus (indeks unik email bersifat parsial, jadi itu mungkin) — di situ yang hidup menang.


## T-56 — Empat caption dashboard menyatakan hal yang tidak lagi benar, dan satu menamai kategori yang tak pernah ada — 7 Sep 2026

**Yang tertulis di layar versus yang terukur** (semua diukur ulang 7 Sep 2026):

| Caption | Menyatakan | Kenyataan terukur |
|---|---|---|
| `workflowActiveHint` | "belum ada tabel workflow" | `crm_workflow` ada sejak 27 Agu 2026, **1** baris, **36** enrollment `queued` |
| `lastProfileHint` | "2 muatan: 20 Apr & 31 Jul" | **tiga** muatan: 81.178 · 1.075 · 577 |
| `liveNote` | "muatan terakhir 31 Jul 2026" | muatan terakhir **27 Agu 2026** |
| `poolLayerC` | "nol profil baru sejak 1 Agustus" | **577** profil masuk 27 Agustus |
| `importDobHint` | "~99,5% cocok (diukur manual · 24 Agu)" | belum terbukti salah — tapi menua tanpa ada yang tahu |

**Kartu "Contactable" bukan sekadar usang — ia mengarang kategori.** Kartu itu menampilkan dua
angka, "Bisa dihubungi · marketing" dan "Bisa dihubungi · layanan", dari
`crm_contactable_counts()`. Keduanya **82.253**, dan itu bukan kebetulan: backfill Migrasi 11
menulis baris consent `marketing` DAN `transactional` untuk orang yang sama, jadi kartu itu
mencetak satu fakta dua kali. Lebih buruk lagi, label "layanan" memetakan `transactional`, dan
`crm_consent_purpose_check` hanya menerima **`marketing`** dan **`transactional`** — nol baris
memakai nilai lain (dihitung 7 Sep 2026). Tidak ada purpose bernama `service` di sistem ini. Kartu
itu memberi nama pada kategori yang tidak ada.

Penggantinya menjawab pertanyaan yang sebenarnya ditanyakan orang, dan ketiganya terukur:

- **Bisa dikirimi email — 82.213** (punya `email_normalized`, tidak ter-suppress aktif)
- **Bisa dihubungi WhatsApp — 81.679** (punya `phone_normalized`, tidak ter-suppress aktif)
- **Total profil — 82.830**

Selisih 534 antara kedua saluran itu nyata: orang yang punya email tanpa nomor, dan sebaliknya.
Dilebur jadi satu angka, informasinya hilang.

**Mekanismenya, dan kenapa menambal keempatnya saja tidak cukup.** Tak satu pun caption itu ditulis
untuk menyesatkan. Semuanya benar pada hari diketik. Yang rusak adalah **tempat faktanya disimpan**:
sebuah angka yang diletakkan di berkas terjemahan — lapisan yang tak pernah diperiksa ulang oleh
apa pun, tidak oleh pengujian, tidak oleh pagar, tidak oleh manusia. Memperbaiki teksnya hanya
menyetel ulang jamnya. Karena itu keputusannya adalah **K-60**: angka di layar dihitung dari data;
kalau benar-benar tak bisa dihitung, ia wajib membawa tanggal pengukuran DAN tanda visual manual.
Satu angka di layar sekarang memenuhi pengecualian itu (`importDobHint`) dan memikul lencana
"ANGKA MANUAL" — supaya ia menua di depan mata, bukan diam-diam.

## T-57 — `identity_kind` menyiratkan penghentian per-saluran; kodenya memblokir seluruh orang — 7 Sep 2026

**Dicatat, tidak diubah.** Perubahan perilaku suppression tidak termasuk lingkup putaran ini, dan
ini keputusan kebijakan, bukan cacat mekanis.

Ditemukan dari selisih satu orang. Angka WhatsApp saya 81.679; angka pemilik 81.680. Yang benar
81.679, dan sebabnya menjelaskan sesuatu yang lebih besar daripada satu baris:

- `master_customer` punya **82.214** baris dengan email dan **81.680** dengan telepon.
- Ada **1** baris suppression aktif.
- Baris itu mengurangi **keduanya** → 82.213 dan 81.679.

`fetchSuppressedCustomerIds` memetakan suppression ke **`customer_id`**, bukan ke saluran. Jadi
seseorang yang menekan "berhenti berlangganan" di sebuah email juga berhenti bisa dihubungi lewat
WhatsApp. Sementara itu `crm_suppression` menyimpan kolom **`identity_kind`**, yang secara jelas
menyiratkan penghentian dibedakan per identitas/saluran.

**Kolom itu dekoratif pada saat dibaca.** Dua bagian sistem menyiratkan dua kebijakan berbeda, dan
tak ada dokumen yang memutuskan mana yang berlaku.

Kebijakan yang berlaku sekarang mungkin justru yang benar — memperlakukan "stop" sebagai permintaan
orang, bukan permintaan per-saluran, adalah tafsir yang lebih aman dan bisa dibela. Yang menjadi
temuan bukan pilihannya, melainkan bahwa pilihan itu **tidak pernah diambil secara sadar**: ia
adalah akibat sampingan dari bentuk sebuah query. Dengan 1 baris suppression, taruhannya nol hari
ini. Dengan pipeline harian (`docs/USULAN-pipeline-harian.md` §4a) taruhannya tidak lagi nol.

**Yang harus diputuskan, bukan ditebak:** apakah "berhenti berlangganan" berlaku untuk orangnya,
atau untuk salurannya. Lalu buat kode dan skema mengatakan hal yang sama — entah dengan menghormati
`identity_kind` saat menyaring, atau dengan menghapus kolom yang menjanjikan sesuatu yang tak
dilakukan sistem.

**Catatan kecil dari pengukuran yang sama:** dari 126 orang yang pesannya pernah diterima penyedia,
**125** masih ada di `master_customer` — satu baris log menunjuk `customer_id` yang tak lagi ada di
sana. Tidak diselidiki putaran ini; disebut supaya rasio "126 dari 82.830" dibaca apa adanya.


## T-58 — Kategori karangan yang sama (`layanan`) masih hidup di segment builder, dan di sana kedua angkanya SELALU sama — 7 Sep 2026

**Dicatat, sengaja tidak diperbaiki.** Pemilik meminta ini didokumentasikan lengkap dengan lokasinya
supaya tidak ditemukan ulang dari nol beberapa minggu lagi.

T-56 memperbaiki kartu "Contactable · marketing / layanan" di dashboard. **Kategori yang sama masih
hidup di layar segmen**, dan sekarang ia satu-satunya tempat tersisa:

| Lapisan | Berkas | Baris |
|---|---|---|
| Baca | `lib/crm/segment-read.ts` | 35 (`contactableService`), 256–261 (`countContactableForPurpose(admin, 'transactional', …)`) |
| API | `app/api/segments/route.ts` | 117 (teks audit "layanan"), 148 (`contactable_service`), 175 |
| UI | `components/segments/segment-builder.tsx` | 22–23, 88, 221–226, 444–460 (kartu ketiga) |
| Teks | `lib/i18n/messages/id.ts` | 548 `countSvcLabel: "Boleh dihubungi · layanan"`, 549 `countSvcSub`, 682–684 `warn.svcZero*` |

**Yang lebih buruk dari sekadar nama, dan ini terukur.** Di dashboard, kedua angka kebetulan sama
besar. Di sini saya periksa apakah keduanya menghitung **orang yang sama**, dan jawabannya ya —
mutlak (diukur 7 Sep 2026):

```
marketing aktif (orang)                  : 82.253
transactional aktif (orang)              : 82.253
punya marketing TAPI tidak transactional :      0
punya transactional TAPI tidak marketing :      0
irisan                                   : 82.253
```

Nol di **kedua** arah. Kedua populasi itu identik, bukan sekadar sama besar. Karena kedua kartu
menyaring populasi identik dengan kriteria yang sama dan suppression yang sama, **kartu kedua tidak
akan pernah menampilkan angka berbeda dari kartu pertama, untuk kriteria apa pun.** Ia bukan angka;
ia gema. Operator yang melihat dua angka besar berdampingan wajar menyimpulkan ada dua populasi.

Penyebabnya sudah diketahui: backfill Migrasi 11 menulis baris `marketing` DAN `transactional` untuk
setiap orang. Rincian per saluran memperlihatkan mekanismenya — `marketing/email=81.637`,
`transactional/email=81.637` (angka yang sama persis), plus `transactional/phone_call=81.615` yang
tidak punya pasangan marketing. Dan **seluruh 408.119 baris consent berbasis
`legacy_import_unverified`**; nol `explicit_opt_in` sampai impor CSV pertama menulisnya.

**Pertanyaan yang HARUS dijawab sebelum ini dikerjakan** — dan ini pertanyaan produk, bukan teknis:

**Apa sebenarnya yang dimaksud kriteria "layanan" itu?** Ia tidak pernah punya rujukan di kosakata
consent: `crm_consent_purpose_check` hanya menerima `marketing` dan `transactional`, dan nol baris
memakai nilai lain. Label "layanan" adalah tafsir seseorang atas `transactional` yang tak pernah
dituliskan. Tiga kemungkinan, dan pilihannya mengubah apa yang harus dibangun:

1. **Ia memang berarti `transactional`** — pesan operasional (konfirmasi booking, pengingat jadwal).
   Maka labelnya diperbaiki menjadi "transaksional", dan pertanyaan berikutnya: kenapa layar SEGMEN
   (alat untuk menyusun kampanye) menampilkannya sama sekali? Segmen dipakai untuk mengirim
   kampanye pemasaran; hitungan transaksional tidak memandu keputusan itu.
2. **Ia dimaksudkan sebagai "boleh dihubungi CS"** — sebuah izin operasional yang tidak dimodelkan
   di mana pun. Maka ia butuh nilai `purpose` sendiri, backfill sendiri, dan keputusan hukum
   sendiri. Itu pekerjaan besar, bukan penggantian label.
3. **Ia tidak dimaksudkan apa-apa** — sekadar warisan backfill Migrasi 11 yang naik ke UI karena
   RPC-nya mengembalikan dua kunci. Maka kartunya dihapus, dan layar segmen menampilkan satu angka
   jangkauan yang benar.

Berdasarkan bukti di atas, **(3) yang paling mungkin** — tapi itu dugaan saya, bukan hasil
pengukuran, dan menghapus sebuah kartu dari layar operator adalah keputusan pemilik. Yang saya
ukur hanyalah bahwa kartu kedua tidak bisa berbeda dari kartu pertama.

## T-59 — Potret harian menyeluruh untuk layar BOD butuh migrasi; empat dari lima kartu belum punya sumber harian — 7 Sep 2026

Konteks: K-61 memutuskan seluruh halaman BOD menjadi potret harian dengan satu cap waktu. Temuan
ini mencatat ongkos yang belum terlihat saat keputusan itu diambil — pemilik menyebutnya
"nol RPC, nol migrasi", dan bagian "nol migrasi" tidak benar. Diverifikasi 7 Sep 2026.

**Bagaimana potret harian ditulis hari ini.** Cron `crm-refresh-customer-mirror`, jadwal
`0 20 * * *` (20:00 UTC = 03:00 WIB), perintahnya `select public.crm_refresh_customer_mirror();` —
sebuah **fungsi SQL**, bukan rute aplikasi. Hasilnya mendarat di `crm_mirror_meta.dashboard_stats`,
yang hari ini memuat tepat enam kunci: `engagement`, `rfm`, `fitco`, `ecosystem`, `candidates`,
`sources`. Terbaca 7 Sep 2026: `refreshed_at = 2026-09-06 20:00:00 UTC`, `row_count = 82.830`.

**Per kartu:**

| Kartu | Bisa potret harian? | Kenapa |
|---|---|---|
| 3 · Unit bisnis | **Sudah** | `dashboard_stats.engagement`. Angkanya cocok orang-per-orang dengan hitungan langsung. |
| 1 · Jangkauan | Belum ada sumbernya | Butuh `emailable`/`whatsappable`/`everContacted` masuk blob → ubah fungsi → migrasi |
| 2 · Pertumbuhan | Belum ada sumbernya | idem |
| 4 · Kesehatan kirim | Belum ada sumbernya | idem |
| 5 · Celah CRM | Belum ada sumbernya | idem. Blob punya `candidates`, TAPI itu populasi berbeda — lihat di bawah |

**Tak satu pun kartu mustahil secara prinsip.** Keempatnya terhalang fakta praktis yang sama: tak
ada sumber hariannya, dan membuatnya berarti mengubah `crm_refresh_customer_mirror()`.

**Satu jebakan yang hampir memakan saya.** Blob sudah punya kunci `candidates`, dan menggodanya
dipakai untuk kartu 5 tanpa migrasi apa pun. **Itu populasi yang berbeda.** Kartu "Candidates not
yet in the pool" milik dashboard operasional menghitung 2.799 dengan rincian sumber yang memuat
`event_transaction` (1.887), `rc_ticket_invites`, `uob_users` — tabel yang **tidak ada sama sekali**
di daftar lima sumber yang dipakai kartu BOD (1.374). Memakai `candidates` untuk kartu 5 akan
mengganti arti angkanya tanpa mengganti judulnya. Itulah kenapa caption "apa yang dihitung" pada
kartu 5 (butir 1 putaran ini) bukan hiasan.

**Satu kartu yang layak dipertanyakan lagi saat gerbang dibuka: jangkauan (kartu 1).** Angka
jangkauan mengurangi suppression, dan komentar di `lib/crm/dashboard.ts` menyatakan angka itu
"never precomputed: a stale reach figure would say a person can be reached who has just asked to
stop". Untuk layar BOD keberatan itu **lebih lemah dari kedengarannya**: layar ini tidak mengirim
apa pun, dan jalur kirim memeriksa suppression secara langsung. Jadi jangkauan berumur 24 jam tak
membuat siapa pun terkontak keliru. Tapi aturannya ditulis untuk alasan yang baik, dan mengendurkan
sebagiannya harus disebut, bukan diselundupkan lewat.

**Yang TIDAK dilakukan, dan kenapa.** Halaman tidak diubah untuk menyatakan "per 03:00" sementara
empat kartunya dihitung saat request. Itu akan menjadi satu kalimat yang benar-benar salah tentang
data di bawahnya — kelas kesalahan yang sama persis dengan keempat caption di T-56, dibuat
sengaja kali ini. Halaman tetap apa adanya sampai gerbang migrasi dibuka.


## T-60 — Pemeriksaan basis-ganda sebelum impor: satu dari empat akan pecah — 7 Sep 2026

Seluruh 408.119 baris `crm_consent` hari ini berbasis `legacy_import_unverified`, dari satu
`source` (`20fit_data_import`), atas 82.253 orang — diverifikasi 7 Sep 2026, satu kelompok
homogen. Impor CSV pertama akan menulis `explicit_opt_in` dan menjadikan tabel ini **memuat dua
dasar untuk pertama kalinya dalam sejarah sistem**. Apa pun yang diam-diam mengandaikan dasarnya
seragam belum pernah diuji. Empat pemeriksaan, satu pecah.

### 1. Layar Arsip Consent — **AKAN PECAH**, diperbaiki

`consent-archive-panel.tsx` memilih spanduk dengan `consent.total > 0 ? BackfilledMeaning :
ZeroMeaning`. `BackfilledMeaning` menyatakan, tanpa syarat, bahwa tabel ini **adalah** backfill
legacy berbasis `legacy_import_unverified`, dan menutup dengan: *"Ini reversibel: nol trigger, dan
menghapus baris membatalkannya bersih."*

Hari ini kedua klaim itu benar, karena 408.119 dari 408.119 baris memang begitu. Sesudah impor,
keduanya salah — dan kalimat terakhirnya berubah dari benar menjadi **berbahaya**: menghapus baris
`explicit_opt_in` bukan membatalkan backfill, melainkan menghapus bukti persetujuan orang per
orang. Spanduk itu akan terus mengatakannya, karena syaratnya hanya "ada baris".

**Diperbaiki** (satu-satunya yang diperbaiki putaran ini, karena hanya ini yang pecah): tiga
keadaan, bukan dua. Nol baris → `ZeroMeaning`. Semua legacy → `BackfilledMeaning`, tak berubah.
Campuran → `MixedBasisMeaning`, yang menyebut jumlah **per dasar dari data** dan sengaja **tidak**
membawa kalimat "hapus untuk membatalkan": cara membatalkan tiap jalur tulis ada di berkas
migrasinya sendiri, disaring lewat `source`. Ditambah hitungan `other` — total dikurangi kedua
dasar yang dikenal — supaya dasar di luar kosakata tak bisa bersembunyi di dalam total.

### 2. Query `crm_consent` yang tak menyaring `basis` — aman, dengan satu catatan

Dua jalur baca menyentuh tabel ini:

- `fetchConsentScreen` (arsip) — tak menyaring dasar, dan memang tidak boleh: ia arsip.
- `countProfilesWithConsent` — menyaring `purpose` + `status`, bukan `basis`. Itu benar menurut
  **K-36**: consent adalah bukti, suppression adalah gerbang. Dan `BASIS_ALLOWED_PURPOSES` memberi
  izin `marketing` pada **kedua** dasar, jadi menyaring dasar pun tak akan mengubah angkanya.

**Catatannya, dan ini temuan tersendiri:** `purposePermittedForBasis` di `consent-policy.ts`
menyebut dirinya *"the ONE gate a write path must call before recording a consent row"*. Dipindai
7 Sep 2026: **tak ada satu pun kode produksi yang memanggilnya** — hanya pengujiannya sendiri.
Migrasi 37 tidak memanggilnya (ia SQL, dan menuliskan `'explicit_opt_in'` sebagai literal; itulah
sebabnya `consent-vocabulary.parity.test.ts` ada sebagai penggantinya). Jadi kalau
`LEGACY_IMPORT_ALLOWS_MARKETING` kelak dibalik ke `false`, **tak ada** jalur baca maupun tulis yang
akan menghormatinya — angka "bisa dihubungi" tidak berubah sedikit pun. Bendera itu hari ini
dokumentasi, bukan gerbang. Dicatat, tidak diubah.

### 3. Angka "contactable" — per ORANG, dan sudah terbukti tahan banyak-baris

Kekhawatiran yang tepat, tapi kasusnya **sudah hidup hari ini** — lewat saluran, bukan dasar.
Untuk `purpose='marketing'` yang aktif: **163.252 baris** atas **82.253 orang** (email + whatsapp
per orang). Kalau hitungannya per-baris, layar sudah lama menampilkan 163.252 — angka yang lebih
besar dari seluruh pool 82.830.

Yang membuatnya per-orang: `countProfilesWithConsent` menghitung `master_customer` dengan **inner
embed** `crm_consent!inner`, jadi `count` jatuh pada baris INDUK, satu per orang. Ini pernah
diverifikasi silang terhadap `count(distinct customer_id)` langsung — keduanya 82.253, sementara
tafsir baris-datar memberi 163.252 (dicatat di `contactability-read.ts`, 12 Agu 2026).

Dan penjaga strukturalnya lebih kuat lagi: `crm_consent` unik pada **(customer_id, channel,
purpose)** — dasar **bukan** bagian dari kunci itu. Jadi satu orang tak akan pernah bisa memiliki
dua baris untuk saluran+purpose yang sama betapa pun banyak dasar yang ada. Dasar kedua tidak
menambah bentuk baru apa pun bagi jalur hitung ini. **Tidak akan pecah.**

### 4. Retensi / purge — tidak ada aturan per-dasar, karena tidak menyentuh tabel ini

Kekhawatiran terbesar pemilik, dan ternyata paling kosong. `retention-policy.ts` beserta fungsi
purge-nya beroperasi **hanya atas `crm_audit_log`**, menyaring berdasarkan **nama aksi audit**.
Entri `{ kind: "prefix", value: "consent." }` di `COMPLIANCE_RULES` adalah aksi audit bernama
`consent.*` — bukan baris `crm_consent`. Dipindai: **nol** aturan retensi apa pun atas baris
`crm_consent`, dan nol penyebutan `basis` di seluruh jalur retensi/purge. Kedua dasar diperlakukan
sama karena retensi tak pernah membacanya.

**Sifat struktural yang menguntungkan, ditemukan saat memeriksa ini:** kedua resep rollback
disaring lewat **`source`**, bukan `basis` — backfill Migrasi 11 memakai
`where source = '20fit_data_import'`, impor CSV memakai `where source='csv_import' and
evidence->>'batch' = …`. Keduanya saling lepas. Rollback impor tak mungkin menyentuh baris legacy,
dan sebaliknya. Itulah alasan `MixedBasisMeaning` menunjuk ke `source`, bukan menawarkan satu
instruksi hapus menyeluruh.


## T-61 — Fungsi cermin CRM kini bergantung pada skema divisi lain, dan kegagalan cron-nya tak diawasi siapa pun — 7 Sep 2026

**Dicatat, tidak diperbaiki** — atas permintaan pemilik. Ini bukan cacat yang bisa ditambal; ia
konsekuensi arsitektural yang lahir hari ini dan pantas dilihat sebelum menggigit.

**Apa yang berubah.** Sampai 7 Sep 2026, `crm_refresh_customer_mirror()` hanya membaca tabel
`crm_*`, matview cermin, dan satu tabel staging — semuanya milik proyek ini. Migrasi
`crm_mirror_bod_daily_stats` menambahkan kartu "belum masuk CRM", dan celah itu **secara definisi**
adalah sumber-dikurangi-pool: cermin hanya memuat baris pool, jadi flag `has_*`-nya hanya bisa
menyatakan siapa yang **cocok**, tak pernah siapa yang **hilang**. Maka fungsi malam itu kini
membaca sepuluh tabel milik tim lain:

`my20fit_profile` · `cf_hyrox_participants` · `arena_class_bookings` · `arena_bookings` ·
`arena_package_orders` · `arena_members` · `gym_class_bookings` · `gym_memberships` ·
`gym_membership_orders` · `clinic_patients`

Kalau salah satu tim itu mengganti nama kolom `email` atau `phone`, refresh malam itu melempar galat
dan seluruh blob — termasuk keenam kunci lama yang tak ada hubungannya dengan sumber — berhenti
diperbarui. Satu perubahan skema di divisi lain membekukan seluruh layar direksi.

**Dan tak ada yang mengawasinya.** `cron.job_run_details` mencatat setiap jalannya. Diukur 7 Sep
2026:

| job | jalan tercatat | sukses | gagal | sejak |
|---|---|---|---|---|
| `crm-refresh-customer-mirror` (jobid 9) | 19 | **19** | 0 | 19 Agu 2026 |
| `crm-refresh-customer-activity` (jobid 17) | 11 | **11** | 0 | 27 Agu 2026 |

Riwayatnya bersih — dan itu justru sebabnya ini belum pernah terasa. **Nol kode membaca tabel itu.**
Dipindai: tak ada rute, tak ada layar, tak ada peringatan, tak ada apa pun di repo ini yang menyentuh
`cron.job_run_details`. Kegagalan pertama akan diketahui ketika seseorang kebetulan memperhatikan
sebuah angka terlihat aneh.

**Yang sudah dipasang sebagai penggantinya, dan batasnya.** K-63 membuat cap waktu halaman berasal
dari `refreshed_at` blob, jadi refresh yang gagal membuat jamnya **berhenti** alih-alih maju di atas
angka basi, dan spanduk >26 jam mengubahnya jadi kalimat. Itu mengubah kegagalan senyap menjadi
kegagalan terlihat — **di satu layar**. Ia tidak memberi tahu siapa pun yang tidak sedang membuka
layar itu, dan ia tidak menyebutkan cron yang mana atau galatnya apa.

**Yang sebenarnya dibutuhkan, kalau kelak diputuskan:** pembacaan `cron.job_run_details` yang
memeriksa apakah setiap job `crm-*` sukses dalam 26 jam terakhir, dan berbunyi ke seseorang — bukan
ke sebuah halaman yang mungkin tak dibuka. Itu keputusan pemilik: ia butuh saluran pemberitahuan,
dan proyek ini belum punya satu pun yang dipakai untuk peringatan operasional.


## T-62 — Indikator deploy yang saya usulkan tidak memeriksa apa pun: setiap rute mengembalikan 200 — 7 Sep 2026

Setelah merge #33 saya tak bisa menjangkau `crm.20fit.id` (kebijakan egress lingkungan agen
memblokirnya, `CONNECT` 403). Saya mengusulkan indikator pengganti: *"`/bod` adalah rute baru —
kalau ia tayang, kode barunya hidup."* Pemilik mengujinya:

```
/bod                       HTTP 200 → halaman login
/audience/import           HTTP 200 → halaman login
/rute-yang-tidak-ada-xyz   HTTP 200 → halaman login
```

**Rute yang jelas tidak ada pun hijau.** Indikator itu tidak memeriksa apa pun.

**Mekanismenya, diverifikasi dari kode (bukan dari situsnya, yang tetap tak bisa saya buka).**
`middleware.ts` memasang matcher atas **setiap** path kecuali internal Next dan berkas statis:

```
"/((?!_next/static|_next/image|favicon.ico|icon.svg|brand/|.*\\.(?:png|jpg|…)$).*)"
```

`updateSession` lalu memanggil `redirectToLogin` untuk permintaan tanpa sesi. Middleware berjalan
**sebelum** routing, jadi rute yang tidak ada tak pernah sampai ke penanganan 404 Next — ia sudah
dialihkan ke `/login` lebih dulu, dan `/login` menjawab 200. Repo ini juga tak punya
`app/not-found.tsx`, jadi tak ada apa pun yang akan membedakannya.

**Kenapa ini pantas jadi temuan, bukan sekadar kekeliruan kecil.** Ia adalah kelas yang sedang
diberantas sepanjang sprint ini — **tanda centang hijau yang tidak memeriksa apa pun** — dan kali
ini ia muncul di dalam *saran verifikasi saya sendiri*. Sebuah pemeriksaan yang lulus untuk rute
karangan bukan pemeriksaan yang lemah; ia bukan pemeriksaan.

**Konsekuensi yang belum terpecahkan:** tanpa sesi, **tidak ada** cara mengetahui commit mana yang
ter-deploy. `/health` diizinkan lewat tanpa sesi tapi hanya mengembalikan
`{ok, timestamp, env, supabase}` — nol informasi build (dipindai: nol rujukan ke
`RAILWAY_GIT_COMMIT_SHA` di seluruh repo). Yang membuktikan deploy 7 Sep 2026 adalah **tangkapan
layar pemilik** yang sudah masuk ke aplikasi, bukan probe otomatis mana pun.

**Usulan, bukan perubahan:** tambahkan satu field build (mis. tujuh karakter commit) ke `/health`.
Itu mengubah endpoint publik, jadi ia keputusan pemilik — sebuah commit sha di endpoint terbuka
adalah kebocoran informasi kecil, dan sebagian organisasi menolaknya.

## T-63 — Runbook yang benar pada waktunya berhenti benar tiga hari kemudian, dan saya mempercayainya — 7 Sep 2026

**Yang saya laporkan** (6 Sep–7 Sep 2026): uji kirim internal lewat composer mustahil karena
`master_customer` memuat **nol** alamat `@20fit.id`, mengutip
`docs/RUNBOOK-kirim-internal-pertama.md` yang menyebutnya "DEADLOCK terverifikasi 24 Agu 2026".

**Yang benar**, diukur 7 Sep 2026 06:49 UTC:

```
@20fit.id di master_customer : 13
Masuk                        : 27 Agustus 2026, source='activity_ingest' (bagian muatan 577)
Ter-suppress: 0 · merged_into: 0 · punya email: 13 · pernah dikirimi: 0 · punya consent: 0
```

Runbook itu memverifikasinya **24 Agustus** — **tiga hari sebelum** ketiga belas alamat itu masuk.
Ia benar saat ditulis dan diam-diam berhenti benar.

**Ini T-50 persis, dan saya yang menulis T-50.** Potret satu momen diperlakukan sebagai sifat tetap.
Bedanya: di T-50 saya yang membuat klaimnya; di sini saya yang **tertipu olehnya** — dengan
mempercayai temuan terdokumentasi tanpa mengukur ulang.

**Dan mempercayai register adalah perilaku yang benar.** Kalau setiap catatan harus diukur ulang
sebelum boleh dipakai, register itu tak punya nilai sama sekali. Justru karena register memang
harus dipercaya, **register yang menua adalah bahaya** — bukan kelalaian pembacanya. Yang salah
bukan "saya percaya dokumen", melainkan "dokumen itu tidak membawa tanggal pengukuran di tempat
yang memaksa pembacanya berpikir tentang umurnya".

**Yang berubah karenanya:**
1. Runbook diperbarui dengan angka 7 Sep 2026 **beserta jam pengukurannya**, dan catatan 24 Agu
   **dipertahankan** sebagai bukti mekanismenya — bukan dihapus.
2. Aturan yang dinyatakan di sana: setiap klaim terukur membawa tanggal pengukurannya, dan klaim
   tanpa tanggal harus diukur ulang sebelum dipakai mengambil keputusan.

**Konsekuensi yang lebih besar bagi keputusan uji kirim:** deadlocknya terbuka, jadi
`SEND_TEST_INTERNAL_ADDRESS` dan redeploy tidak diperlukan. Nol baris consent pada ketiga belas
orang itu **tidak** menghalangi: `previewCampaign` menghitung `sendable = withEmail − suppressed`
lewat resolusi yang sama persis dengan jalur kirim, dan consent tidak ikut menyaring (K-36).

### Berapa dokumen lain membawa klaim terukur tanpa tanggal?

Dipindai 7 Sep 2026 dan diverifikasi terhadap produksi hari ini. Yang **terbukti sudah salah**:

| Klaim di dokumen | Nilai dikutip | Nilai 7 Sep 2026 | Jumlah dokumen |
|---|---|---|---|
| Ukuran pool `master_customer` | 82.253 | **82.830** | **17** |
| `my20fit_profile` | 886 | **1.337** | 3 |
| `arena_class_bookings` | 2.731 | **3.250** | 1 |
| `my20fit_user_activity` | 193 | **206** | ≥1 |

Ketujuh belas dokumen yang mengutip 82.253 sebagai ukuran pool: `CEKLIS-verifikasi-live.md`,
`ESKALASI-paparan-data-sensitif.md`, `KEBUTUHAN-SISTEM.md`, `KOLOM-WAKTU.md`, `KOREKSI-DEPLOY.md`,
`PETA-JALAN-menghubungi.md`, `PR-11-PANDUAN-TINJAU.md`, `PR-sprint-3r.md`,
`RENCANA-batas-kirim.md`, `RENCANA-ingest-ticket.md`, `RENCANA-message-log.md`,
`RENCANA-render-data-nyata.md`, `RENCANA-template-simpan.md`, `RINGKASAN-keputusan-merge.md`,
`RISIKO-masking-bypass.md`, `SIGNOFF-legal-consent.md`, `SUMBER-AKTIVITAS.md`.

**Tidak diperbaiki** (permintaan pemilik: laporkan daftarnya, jangan perbaiki semuanya). Catatan
jujur soal daftar ini: sebagian besar dokumen itu adalah **catatan sprint bertanggal** — laporan
tentang apa yang terjadi saat itu, dan angka lama di dalamnya justru benar sebagai riwayat. Yang
berbahaya adalah dokumen **operasional** yang dibaca untuk mengambil keputusan hari ini; dalam
daftar di atas itu terutama `CEKLIS-verifikasi-live.md` (dipakai untuk memverifikasi deploy) dan
`KEBUTUHAN-SISTEM.md`. Membedakan keduanya adalah keputusan pemilik, bukan sapuan otomatis.


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

## T-64 — Tembok 3 September: dugaan rate-limit, dan jalur kirim tanpa jeda apa pun — 8 Sep 2026

**Ini DUGAAN, bukan fakta terverifikasi. Kode status penolakan provider dibuang** (T-41 baru menutup
lubang itu *setelah* insiden), jadi tak ada yang tahu pasti apakah tembok 3 Sep adalah rate limit,
batas paket, atau penangguhan. Yang tercoret oleh pemilik: token (sehat, uji hari ini lolos), kuota
akun, penangguhan. Yang tersisa sebagai hipotesis terbaik: **CRM kena rate limit dan tak pernah
lepas karena tidak punya jeda** — 2,8 permintaan/detik selama 108 menit tanpa berhenti (18.243 baris
dalam jendela 07:00–09:00 UTC), sementara uji hari ini (4 email, jeda alami antar klik) langsung
lolos. Konsisten dengan rate limit; **tidak membuktikannya**.

**Yang dibangun (Bagian A, 8 Sep):** backoff + pacing di mesin kirim (`lib/crm/send-run.ts`).
- Kesalahan yang bisa diulang (throttle 429/402/503, atau galat jaringan tanpa status HTTP) → jeda
  lalu coba ulang penerima yang **sama**, maksimum 4 percobaan; backoff eksponensial 1s→2s→4s dengan
  *equal jitter* (`backoffDelayMs`). Percobaan terakhir gagal → penerima dicatat gagal seperti biasa,
  `provider_throttled` + kode status tetap tercatat.
- Penolakan tingkat-penerima (4xx non-throttle, alamat tak sah, hard bounce) **tidak** diulang —
  mengulangnya hanya mengulang penolakan yang sama.
- Jeda dasar 500 ms setelah **setiap** percobaan nyata (bukan hanya saat galat). Membatasi laju di
  ~2 kirim/detik; hari penuh 1.000 kirim ≈ 8–9 menit (dari ≈ 6). Penerima yang di-*skip* / ditunda /
  sudah-diklaim tidak menyentuh provider dan tidak menambah jeda.
- **Interaksi dengan tembok 20-gagal-beruntun (rule 7):** penghitung beruntun menghitung *penerima*
  yang gagal total, dinaikkan **sekali** setelah semua percobaan habis — bukan per percobaan. Jadi
  temboknya tetap "20 penerima gagal berturut-turut"; backoff hanya **memperlambat** tercapainya
  (tiap penerima gagal kini memakan hingga ~7 detik jeda), dan satu keberhasilan me-*reset* beruntun.
  Konsekuensi yang diinginkan: kedipan throttle sesaat yang sembuh oleh retry tak lagi membakar slot
  dalam hitungan 20 — run berhenti pada tembok sungguhan, bukan pada goyangan.
- Angka jeda (4 percobaan · 1s base · 500 ms pacing) adalah **usulan**; keduanya knob di
  `DEFAULT_SEND_CONFIG`, mudah diubah kalau kode status yang sesungguhnya kelak terlihat.

## T-65 — Impor pertama tidak menulis audit, karena auditnya ada di RUTE, bukan di RPC — 8 Sep 2026

Impor pertama dalam sejarah sistem (2 orang, batch `a27e3b8c-…`, 04:16:32 UTC) **tidak
meninggalkan satu pun baris `audience.imported`** di `crm_audit_log` (dikonfirmasi: 0 total, bukan
hanya untuk batch itu).

**Sebab:** audit `audience.imported` ditulis oleh **rute** `app/api/audience/import/route.ts:160`,
sesudah RPC `crm_ingest_csv_people` (yang tidak menulis audit sendiri). Impor itu dijalankan lewat
panggilan RPC **langsung** (MCP `execute_sql`), melewati rute — jadi tulisannya terjadi, auditnya
tidak. Tulisan dan auditnya **tidak atomik**: audit hidup di lapisan aplikasi dan bisa dilewati.

**Pelajaran, dan mengapa ia mengubah Bagian B:** audit yang hidup di rute bisa dilewati; audit yang
hidup **di dalam** RPC `SECURITY DEFINER` tidak bisa — pemanggil mana pun mendapatkannya, atomik
(K-14). RPC edit profil Bagian B menulis auditnya sendiri, di dalam transaksi yang sama dengan
tulisannya. Perbaikan yang menggeneralisasi untuk jalur impor — memindahkan audit ke dalam
`crm_ingest_csv_people` — adalah migrasi tersendiri, **di luar lingkup putaran ini** (LARANGAN:
migrasi lain), dicatat sebagai tindak lanjut.

**Dua baris yang telanjur masuk:** keduanya nyata dan benar (consent `explicit_opt_in`, batch tag).
Apakah perlu baris audit susulan adalah **keputusan pemilik** (usulan di laporan penutup, bukan
diputuskan di sini).

**`full_name` NULL pada kedua baris:** bukan kolom tak terpetakan. JSON yang saya kirim ke RPC
memuat `"full_name": null` **secara sengaja** — saya tak punya nama yang bisa diverifikasi untuk
`marketing@20fit.id` / `tifany@20fit.id` dan memilih tidak mengarang. CSV tak dipakai sama sekali;
tak ada berkas dengan kolom nama yang bisa salah petakan.

## T-66 — RPC edit inti: bug `array_append` yang berulang (ditangkap uji), + celah aktor `crm_ingest_csv_people` — 8 Sep 2026

**Bug yang berulang, ditangkap oleh disiplin yang tepat.** `crm_update_master_fields` apply pertama
(`20260908051258`) memakai `v_changed := v_changed || 'city'`. `CREATE FUNCTION` lolos; panggilan
sungguhan gagal `22P02: malformed array literal: "city"` — Postgres menyelesaikan `text[] || 'literal'`
sebagai `array_cat`, bukan `array_append`. **Ini persis migrasi 9 dan 17, dan komentarnya saya baca
sendiri lalu ulangi.** Diperbaiki ke `array_append` (apply kedua `20260908051431`, definisi FINAL).
Yang menangkapnya bukan tinjauan mata, melainkan **aturan "panggilan sungguhan dalam transaksi
rollback, CREATE yang berhasil tak membuktikan apa pun" (T-48)** — enam uji jalur dijalankan, jalur
sukses langsung memunculkannya. Bukti bahwa gerbang uji itu bekerja.

**Celah aktor yang BELUM ditutup — tindak lanjut, bukan pekerjaan putaran ini.**
`crm_update_master_fields` kini **menolak** panggilan tanpa aktor (T5). `crm_ingest_csv_people`
**tidak** — ia menerima `p_uploaded_by` yang boleh null, dan auditnya ditulis oleh RUTE, bukan RPC
(T-65). Jadi kelemahan yang sama masih terbuka di jalur impor: panggilan langsung tanpa aktor
menulis ke `master_customer` tanpa jejak. Menutupnya (mewajibkan aktor + memindahkan audit ke dalam
RPC) adalah migrasi tersendiri, **di luar lingkup putaran ini** (LARANGAN). Dicatat di sini supaya
tak hilang: 355/356 baris `crm_audit_log` punya aktor — satu-satunya jalur yang bisa memproduksi
baris tanpa aktor adalah dua RPC ini, dan kini hanya satu yang ditutup.

## T-67 — Tombol impor digerbang pada `netInsert`, mengabaikan `taggedExisting` — impor hanya-tandai mustahil dijalankan — 8 Sep 2026

Pemilik mencoba mengimpor `email_20fit_admin.csv` (2 baris) dan tombolnya mati. Kedua alamat sudah
ada di pool sejak impor 04:16, jadi ringkasan benar: `Akan masuk 0 · Akan ditandai 2`. Tapi tombol
digerbang `summary.netInsert === 0` dan berbunyi "Konfirmasi & impor **0** orang" — nonaktif.

**Akibatnya: impor yang HANYA menandai orang yang sudah ada tak bisa dijalankan sama sekali** — dan
itu separuh dari pekerjaan yang K-58 bangun (peserta yang sudah jadi pelanggan tetap mendapat tag
event-nya). Jalurnya ada di RPC (`tagged_existing`); UI tak bisa memicunya.

**Perbaikan:** gerbang pada `importActionableTotal = netInsert + taggedExisting > 0` (pure + teruji,
`canRunImport`). Label jujur soal keduanya: "Konfirmasi · N masuk, M ditandai". Kedua nol → tombol
tetap nonaktif dengan alasan dinyatakan ("Tak ada yang berubah — 0 masuk dan 0 ditandai"). Layar
Laporan sudah menyebut keduanya.

**Cara ia lolos, dan cara ia ditemukan:** uji jalur-bahagia (ada yang masuk) tak pernah menyentuh
gerbang saat `netInsert=0`. Yang menemukannya adalah **masukan yang seluruhnya "sudah ada"** —
pemilik mencobanya, bukan meninjau. Test pengunci `{netInsert:0, taggedExisting:2}` → aktif kini
menutupnya. Kelas yang sama dengan gerbang kirim yang tak pernah melihat kegagalan (T-42): sebuah
kondisi boolean yang benar untuk kasus umum dan salah untuk kasus yang justru jadi alasan fitur ada.

**Catatan terkait (BUG 2, bukan bug):** wizard MENGENALI header `Nama` (dan `Nama Lengkap`/`nama`/
`name`) dan membaca namanya, serta menangani pemisah `;` (Excel Indonesia) — diuji langsung atas
berkas pemilik (`import-name-header.test.ts`). Nama NULL pada 2 baris berasal dari impor 04:16 lewat
**RPC langsung** (`full_name:null`, T-65), bukan wizard. Konsekuensi K-58: orang yang sudah ada
dengan nama kosong TAK terisi oleh impor (tagged_existing hanya menyentuh `tags`) — satu-satunya
jalan mengisi namanya hari ini adalah tombol edit. Keputusan pemilik (K-58 tak diubah): biarkan
tombol edit mengisinya, atau kelak izinkan impor mengisi field KOSONG pada orang yang sudah ada
(bukan menimpa).

## T-68 — Batas impor 20.000 ditulis tanpa pernah diuji; gagal `57014` di 1.432 (7%), dan sebabnya seq-scan telepon per-baris — 8 Sep 2026

Pemilik gagal mengimpor `audiens-sportfest-2-2026-02.csv` (1.432 baris) dengan **`57014`
statement timeout**. Nol baris tertulis (transaksi rollback utuh). Berkas kecil berhasil (334 orang,
5 batch). Layar menjanjikan **20.000 baris**; sistem gagal di **1.432 — 7% dari yang dijanjikan
sendiri**. Angka 20.000 tak pernah diukur — kelas yang sama dengan caption yang menua (T-50/T-56):
angka di layar yang tak pernah dijalankan.

**Sebab, diukur ulang hari ini** (`EXPLAIN ANALYZE` tiap tahap fungsi `crm_ingest_csv_people`):

| Tahap | Lookup | Rencana | Biaya |
|---|---|---|---|
| `new_people` (anti-join) | `email_normalized` | **Hash Right Anti Join → satu seq scan** | ~31 ms, tetap berapa pun N |
| `upd` (tag_targets) | `email_normalized` | **Hash Join → satu seq scan** | ~33 ms, tetap |
| **`phone_safe`** | **`phone_normalized`** | **SubPlan → seq scan PER BARIS** | **~70 ms × jumlah baris bertelepon** |
| `cons` | (dari `ins`) | insert, tak memindai master | O(n) |

Kedua indeks yang ada **parsial**: email `WHERE …is_merged=false AND is_potential_duplicate=false`,
telepon `WHERE …is_merged=false`. Fungsi mencari tanpa predikat itu, jadi Postgres tak memakainya →
seq scan.

**Ambang nyata terukur** (baris sintetis, transaksi rollback):
- 100 baris **dengan** telepon → **7.174 ms**; 500 → 12.131 ms
- 100 baris **tanpa** telepon → **110 ms** (65× lebih cepat); 1.000 tanpa telepon → 813 ms

**Timeout sepenuhnya dari `phone_safe`.** Email di-hash (satu scan ~31 ms, negligible berapa pun N);
`phone_safe.exists` adalah subplan korelasi yang di-seq-scan **per baris**. Anggaran nyata jalur app
= **`statement_timeout=8s`** (peran `authenticated`/`authenticator`; bukan 2 menit sesi). Jadi ambang
aman hari ini ≈ **~100 baris bertelepon** — jauh di bawah 20.000.

Perbaikan (BERGATE): indeks **biasa** pada `phone_normalized` (subplan per-baris jadi index probe
<1 ms). Indeks email tak diperlukan — biaya email tetap ~60 ms total berapa pun N. Batas layar 20.000
diturunkan ke angka terbukti setelah indeks, dengan pesan galat yang menyebut batasnya.

### T-68 (lanjutan) — indeks diterapkan, ambang baru diukur, batas jadi 15.000 — ⏱ DIUKUR 8 Sep 2026

**Migrasi diterapkan** (gerbang dibuka, opsi (a) CREATE INDEX biasa lewat `apply_migration`):
`create index idx_master_customer_phone_lookup on public.master_customer (phone_normalized);`
Diverifikasi dari `pg_indexes` — indeks ada, **2552 kB** (~2,5 MB, sesuai perkiraan). Kedua indeks
unik parsial tetap utuh (indeks biasa ini melayani lookup tanpa-predikat; yang unik tetap menjaga
keunikan). Alasan bukan `CONCURRENTLY`: `pg_stat_user_tables` = 6.524 insert / 675 update / 0 delete
seumur hidup — kolam nyaris beku, jadi lock ACCESS EXCLUSIVE sesaat tak menghalangi tulis apa pun.

**EXPLAIN sebelum vs sesudah** (probe `exists` pada `phone_normalized`):
- Sebelum: **Seq Scan** on `master_customer` (cost 3769,88).
- Sesudah: **Index Only Scan using idx_master_customer_phone_lookup** (cost 2,68). Seq scan per-baris hilang.

**Ambang baru terukur** (baris sintetis bertelepon, transaksi rollback, sesi hangat):

| Baris | Sebelum indeks | Sesudah indeks |
|---:|---:|---:|
| 100 | 7.174 ms | **183 ms** |
| 500 | 12.131 ms | **503 ms** |
| 1.000 | (timeout) | **844 ms** |
| 1.500 | (timeout) | **1.071 ms** |
| 3.000 | — | **1.625 ms** |
| 15.000 | — | **~3.792 ms** |
| 20.000 | — | **~3.069–4.264 ms** (2 run) |
| 25.000 | — | **~6.032 ms** |

Fungsi sekarang **linear** (~0,45 ms/baris + ~280 ms dasar), bukan kuadratik.

**Anggaran 8 detik — diverifikasi, bukan diasumsikan.** RPC dipanggil klien service-role
(`admin.rpc`), dan `service_role` tak punya `statement_timeout`. Tapi PostgREST login sebagai peran
**`authenticator`** yang `rolconfig`-nya `statement_timeout=8s` (+`lock_timeout=8s`); setelan
login itu **bertahan** melewati `SET ROLE service_role` per-request — itulah sebab file 1.432-baris
kena `57014` padahal jalur service-role. Diverifikasi dari `pg_roles`/`pg_db_role_setting`: hanya
`anon`=3s, `authenticated`/`authenticator`=8s; tak ada setelan level-database.

**Batas layar → 15.000** (`MAX_IMPORT_ROWS`, dari 20.000). Bukan angka terbesar yang lolos: 20.000
pun terukur ~4,3 s (di bawah 8 s), tapi 15.000 duduk di **bawah setengah** plafon 8 s — margin ~2×
untuk cold-cache/variasi peran yang **tak bisa** saya ukur tanpa impor produksi nyata (dilarang ronde
ini). Batas dinyatakan **di langkah unggah** (bukan hanya pesan galat) beserta alasannya (anggaran 8
detik), dan pra-cek `too_many_rows` menolak file besar di fase `analyze` — cepat, tanpa menunggu RPC.
Pesan `57014` tak lagi menyalahkan berkas: menyebut batas 15.000 dan menyarankan memecah file; jika
file sudah di bawah batas, menyatakan itu di luar dugaan dan minta dilaporkan.

**Pelajaran (dicatat atas permintaan pemilik).** Diagnosis awal pihak #2 — "seq scan 83k baris per
pencarian **email**" (anti-join) — **salah**. Pengukuran per-tahap menemukan penyebab sebenarnya:
`phone_safe` (SubPlan telepon per-baris); email di-hash dan negligible. Hipotesis yang masuk akal dari
**membaca definisi indeks** (dua indeks parsial → "pasti seq scan") tetap harus **diukur per tahap**
sebelum diputuskan — kalau saya menuruti diagnosis email, saya akan menambah indeks email yang tak
berguna dan membiarkan penyebab telepon tetap ada. Ukur dulu, baru simpulkan.

## T-69 — Impor besar melapor "selesai" tapi separuh: `.in(email)` > ~24 KB URL → HTTP 400 ditelan → kunci dedup kosong — ⏱ DIUKUR 8 Sep 2026

Pemilik mengimpor beberapa berkas besar setelah perbaikan indeks (T-68). Layar berbunyi **"Impor
selesai" ✓** padahal data tidak lengkap. Kegagalan indeks kemarin gagal-keras (57014); ini
gagal-separuh dengan centang hijau — lebih berbahaya.

**Penyebab (TERBUKTI, bukan dugaan).** `loadKeys` menaruh SELURUH daftar email di URL query PostgREST
(`admin.from('master_customer').select(...).in('email_normalized', emails)`). Di atas batas URL
gateway (~24–25 KB), request ditolak **HTTP 400**. supabase-js mengembalikan `{ data: null, error }`,
tapi kode menulis `const { data } =` — **`error` dibuang**. `data` null → `existingEmails`/
`taggableEmails` **kosong** → `planImport` anggap semua baris baru → `insertRows`=semua, `tagTargets`=[]
→ anti-join RPC menyisipkan yang benar-benar baru dan **diam-diam melewati** yang sudah ada → **insert
separuh + nol tag**, dilaporkan sukses.

**Bukti terukur:**
- Audit `audience.imported` — tiga batch bercap-jari bug (`duplicatesEmail=0`, `netInsert=read`,
  `inserted<netInsert`): `34e865c0` sportfest-2 (read 1.432, inserted 857, dilewati 575),
  `b825228e` sportfest-3 (read 1.561, inserted 659, dilewati 902), `742e874c` hyrox-sim-half (read
  591, inserted 11, dilewati 580). Berkas ≤490 baris lolos (dup>0, tagged>0).
- Reproduksi URL (SELECT, read-only): email 37-char → 490 (20,2 KB)=**200**, 591 (24,3 KB)=**400**,
  1.432 (58,8 KB)=**520**. Worst-case 54-char (maks tabel; p99=32) → 450 (23,4 KB)=**200**, 500
  (26 KB)=**400**. Konfirmasi silang: berkas 591-baris punya `sharedPhone=180` — query TELEPON `.in()`
  (nilai lebih pendek, URL ~8 KB) berhasil sementara query EMAIL gagal. Ukuran URL yang menentukan,
  bukan jumlah baris.
- Anggaran 8 detik TIDAK terlibat: impor selesai (audit tertulis); 400 seketika, bukan timeout.

**KOREKSI angka (dicatat atas permintaan pemilik agar tak diwarisi).** Framing "1.118 orang hilang"
**salah**. Tidak ada orang hilang dari CRM — profil mereka utuh; anti-join memang benar melewati yang
sudah ada. Yang tidak terjadi adalah **penandaan event**. Kerusakan lebih sempit: riwayat event tak
lengkap. sportfest-2 **395 tak bertag** (1.037 dari 1.432), sportfest-3 **723 tak bertag** (838 dari
1.561), hyrox-sim-half ~580 tak bertag. RPC jujur soal insert: dikembalikan = ditulis (857/659/11
persis, diverifikasi dari `batch:` tag di master).

**Perbaikan (ronde ini):**
- **TUGAS 1 — gagal keras.** Tiap baca di `loadKeys` jadi `const { data, error } =` dan melempar bila
  error. Impor yang tak bisa membaca kunci dedup gagal keras, bukan sukses berbohong. Karena loadKeys
  panggilan dep pertama, lemparan membatalkan sebelum tulisan apa pun (TUGAS 4, atomik keras — nol
  tulis sebagian, dibuktikan uji).
- **Pagar sumber (pagar keenam):** `supabase-read-guard.test.ts` memindai lib+app untuk
  `const { data } =` dari query `.from().<verb>()` yang membuang error. **19 situs warisan** (jalur
  campaign/send/workflow yang toleran baca-null) dibekukan di `KNOWN_UNCHECKED_READS` — daftar HANYA
  BOLEH MENGECIL; pola baru gagal-test. (Bukan diperbaiki ronde ini, hanya dibekukan + dicatat.)
- **TUGAS 2 — potong `.in()`.** Ukuran 300 = konvensi repo (enrichment/multisource/clinic-source) DAN
  terukur aman (300 email 54-char ≈ 15,6 KB < 24 KB). Reader diekstrak ke `lib/crm/import-keys.ts`
  agar teruji dengan klien palsu — versi inline lama tak bisa diuji, dan begitulah swallow bersembunyi.
- **TUGAS 3 — laporan jujur.** `reconcileImport(plan, hasil)`: bila `inserted≠netInsert` atau
  `tagged≠taggedExisting`, layar menampilkan peringatan MERAH "Impor TIDAK lengkap" dengan angka, bukan
  centang hijau; server mencatat `import_reconcile_mismatch`. Invarian `inserted+tagged == email unik
  valid − merged − suppressed-dilewati` (= `netInsert+taggedExisting`).
- **TUGAS 6 — impor ulang aman (dibuktikan, transaksi rollback, TIDAK dijalankan pada berkas nyata):**
  skenario A (5 sudah-ada + 3 baru, alur planner terperbaiki): inserted=3, tagged=5, inserted+tagged=8
  (invarian), **0 duplikat**, tag event e1 muncul **1×** (menyatu via `distinct` di `upd`, tidak
  ganda), 8 orang bertag event. Skenario B (robustness: 8 email dikirim ke p_rows termasuk 5 yang
  sudah ada): inserted=3, total 8 baris (bukan 13), **0 duplikat** — anti-join mencegah duplikat
  bahkan bila planner salah kirim. Nol kebocoran (diverifikasi dari katalog setelah rollback).

**Jawaban benar jangka panjang (ii) — dicatat, BUKAN dibangun ronde ini (butuh migrasi bergerbang).**
Hari ini planner (TypeScript) dan anti-join (SQL) masing-masing memutuskan "siapa yang baru" — **dua
sumber kebenaran atas satu pertanyaan**, kelas yang sudah menggigit proyek ini berkali-kali (kanon
telepon, kosakata consent, kosakata tag, nomor keputusan, gerbang consent). Meruntuhkannya jadi satu:
kirim daftar email sebagai BODY ke fungsi SQL yang melakukan lookup + anti-join di satu tempat — tanpa
batas URL sekalian. Ronde tersendiri.

**Pertanyaan terbuka (jangan diblokir olehnya).** 180 orang membawa tag `event:sportfest-2-2026-02` di
luar 857 yang disisipkan batch `34e865c0` (1.037 − 857). Asalnya belum tertelusuri dari penanda batch
saja. Tidak menghalangi perbaikan — impor ulang setelah ronde ini akan membuat angkanya benar apa pun
asalnya.

## T-70 — Dua gerbang salah: impor tanda-saja ditolak, dan 401 tanpa pesan menyalahkan berkas (instans keduabelas) — 8 Sep 2026

Dua bug kecil, sekelas yang sudah dikenal.

**A. `nothing_to_import` mengabaikan `taggedExisting`.** `import-audience-run.ts` memeriksa
`plan.insertRows.length === 0` saja, lalu menolak. Ini gerbang yang SAMA dengan tombol impor (T-67)
yang gated pada `netInsert > 0` — diperbaiki di UI, terlewat di jalur galat. Impor yang HANYA menandai
adalah pekerjaan sah (K-58): 0 masuk + 1.432 ditandai harus berhasil, bukan galat. Diperbaiki:
`insertRows.length === 0 && tagTargets.length === 0`. Teks pesan juga salah ("semua duplikat atau tak
valid" bohong saat 1.432 akan ditandai) — ditulis ulang. Uji pengunci: {0 insert, 2 tag} → ok;
{0, 0} → galat. Sapuan: hanya SATU proxy `insertRows.length`/`netInsert`-sendiri yang tersisa (line
110); tombol sudah pakai `importActionableTotal`, `reconcileImport` pakai keduanya — tak ada instans
keempat.

**B. 401 tanpa `message` — tebakan yang menyalahkan pengguna (instans keduabelas).** `route.ts`
mengembalikan `{ error: "unauthenticated" }` TANPA `message`, satu-satunya jalur galat impor yang
begitu. UI jatuh ke teks cadangan "File tidak bisa dibaca" — menyalahkan BERKAS untuk SESI yang
kedaluwarsa. Ini kelas T-41/T-49/T-54/T-69: penyebab dibuang, digantikan tebakan yang salah — kali ini
tebakannya menyalahkan pengguna, dan pemilik kehilangan waktu karenanya. Diperbaiki: pesan benar
("Sesi Anda berakhir — muat ulang halaman dan masuk lagi"). **Pagar:** `import-route-error-message.test.ts`
memastikan setiap `NextResponse.json` berstatus ≥400 di rute impor membawa `message`; uji sintetis
membuktikan pagar menggigit.

**Sapuan repo (dilaporkan, BUKAN diperbaiki ronde ini).** ~**68 respons ≥400 tanpa `message`** di ~18
rute API lain (`audience/[id]/*`, `suppression/*`, `templates`, `dashboard`, `search`, `segments`,
`consent`, `audit`, `quality`, `unsubscribe`, dll). Dikonsumsi UI berbeda (sebagian teksnya Inggris),
jadi pembersihan tersendiri yang lebih besar — dicatat di sini agar tidak hilang, tidak diberkati diam-
diam. Rute impor kini bersih.

## T-71 — Tag bisa disegmentasi (TUGAS D): TANPA migrasi, tanpa kolom cermin — ⏱ DIUKUR 8 Sep 2026

Pemilik gagal membuat segmen berbasis event; asisten AI menolak memetakan "iss jhr 2026" (penolakan
yang BENAR — dipertahankan). Diagnosis awal (prompt): tambah kolom `tags` ke `crm_customer_mirror`
lewat migrasi bergerbang, dan tag baru tak terlihat sampai refresh cron 20:00.

**Pengukuran membantah premis itu — tidak perlu migrasi sama sekali.**
- `master_customer.tags` (text[]) SUDAH ada dan SUDAH ber-GIN-index (`idx_master_customer_tags`).
- Hitung segmen (`applyCriteria`) memfilter **`master_customer` langsung**, bukan cermin. Jadi tag
  bisa disegmentasi **tanpa** kolom cermin, dan **tanpa** menunggu refresh 20:00 — langsung terlihat.
- Biaya kueri terukur atas 84.904 baris (GIN Bitmap Index Scan): `tags && ...` (tagsAny) ~6 ms hangat,
  `tags @> ...` (tagsAll) ~5 ms. Konsistensi diverifikasi: contains-satu=1.432, negated-overlap=83.472
  (=84.904−1.432), contains-dua=40, overlap-dua=1.882 (=1.432+490−40). Index GIN sudah cukup — tak
  ada indeks baru diperlukan.

**Keputusan (menyimpang dari premis prompt, atas dasar ukuran):** TIDAK menambah kolom `tags` ke
cermin, TIDAK ada migrasi. Filter langsung di master lebih sederhana DAN menghapus masalah "tak
terlihat sampai refresh" yang dikhawatirkan. Kalau pemilik tetap ingin tag di cermin karena alasan
lain, itu ronde migrasi tersendiri — tapi TUGAS D tak membutuhkannya.

**Dibangun (kode murni, tanpa gerbang):**
- `SegmentCriteria.tagsAny` (overlap "salah satu"), `tagsAll` (contains "semua"), `exclude.tagsAny`
  (negated overlap, inline di applyCriteria — bukan id-set). `parseCriteria` memvalidasi bentuk tag
  operator (`isOperatorTag`); tag tak dikenal DIBUANG, tak pernah ditebak. Cap `MAX_TAG_VALUES=50`.
- `applyCriteria` (segment-read): overlaps/contains/not-overlaps pada `master_customer.tags`.
- Deskripsi (segment-describe + describeProposal) memakai LABEL yang sudah ada (tagValueLabel/
  namespaceLabel) — bukan daftar label kedua (dijaga tags.parity.test).
- Vocab: `lib/crm/tag-vocab.ts` `fetchPoolTagVocab` — 28 tag operator distinct di pool (dibaca dari
  ~3.781 baris ber-tag, gagal-keras bila baca error). Dipakai UI picker + prompt AI.
- Asisten AI: prompt memuat vocab tag NYATA per namespace; sanitizer memvalidasi tag usulan terhadap
  vocab pool (`allowedTags`) — tag yang tak ada di pool dibuang → proposal kosong → **penolakan tetap
  terjaga** meski model mengabaikan prompt. Uji pengunci menutup perilaku ini.
- UI: pemilih tag berkelompok per namespace (`TagCheckboxGroups`) memakai label yang sama; mode
  "salah satu / semua"; pengecualian per tag. Layar menyatakan tag impor langsung bisa dipakai.

**BELUM dikerjakan (ronde tersendiri, seperti diizinkan prompt):** Bagian B (impor→segmen emailList)
dan Bagian C (impor isi-kolom-kosong — melonggarkan K-58, butuh migrasi bergerbang + entri KEPUTUSAN).

## T-72 — Segment builder ringkas/berangka/AI-di-depan; tabrakan kosakata "hybrid race" (display fix, bukan data) — ⏱ DIUKUR 8 Sep 2026

Pemilik: "filtering segment jadi panjang & membingungkan — buat lengkap tapi ringkas; syarat rumit
harusnya dibantu AI." Masalah bukan terlalu banyak fitur, tapi semua ditampilkan setara sekaligus:
8 namespace terbuka penuh (~28 kotak), blok pengecualian menggandakan seluruh daftar (~28 lagi), nol
angka, dan AI terkubur berlabel "opsional".

**TUGAS 0 — tabrakan kosakata (terukur atas 28 tag operator distinct).** Hanya SATU tabrakan nilai
lintas-namespace yang eksak: **`hybrid-race`** muncul di **produk** (3.371) DAN **peran** (109) → di
chip (tanpa header namespace) terbaca identik. Ditambah keluarga tiga-arah "hybrid race" yang dibuat
pihak #2 di dua sesi penyiapan berkas terpisah:
- `produk:hybrid-race` (3.371) — produk race nasional (berkas Hyrox/Sportfest)
- `produk:jakarta-hybrid-race` (322) — produk ISS (Jakarta)
- `peran:hybrid-race` (109) — PERAN di dalam ISS
Tak ada tabrakan nilai lintas-namespace lain (diperiksa seluruh 28 tag).

**Usulan penamaan (operasi DATA — TIDAK dijalankan ronde ini; 3.371 baris terdampak, gerbang
tersendiri):** bedakan makna dengan namespace+nilai eksplisit —
`produk:hybrid-race` → tetap produk race nasional (atau `produk:hyrox-hybrid-race`);
`produk:jakarta-hybrid-race` → `produk:iss-hybrid-race` (tandai event ISS);
`peran:hybrid-race` → `peran:atlet-hybrid-race` (tandai ini PERAN, bukan produk).
Keputusan + eksekusi = ronde data tersendiri.

**Perbaikan tampilan (bukan data, ronde ini):** `disambiguateTagLabel` memberi prefiks namespace
HANYA saat nilai ambigu — "Produk · Hybrid Race" vs "Peran · Hybrid Race" — di chip & kalimat
terbaca; mengomposisi `namespaceLabel`+`tagValueLabel` (bukan daftar label kedua).

**TUGAS 1 — angka di tiap tag.** Jumlah orang per tag, diurut menurun. Biaya: satu agregat DB
(`unnest+group by` atas 84.904 baris) ~92 ms hangat tapi butuh seq scan penuh (GIN tak melayani
group-by-semua-tag), jadi dihitung SEKALI saat layar dibuka — di memori atas ~3.781 baris ber-tag yang
sudah dibaca `fetchPoolTagCounts` (nol kueri per-tag, nol migrasi).

**TUGAS 2 — pengecualian jadi chip.** Satu daftar, tiap tag chip dengan sakelar sertakan⇄kecualikan.
Blok "kecualikan yang bertag" (menggandakan 28 kotak) DIHAPUS. Pengecualian non-tag tetap.

**TUGAS 3 — tag dilipat + pencarian.** Namespace tertutup default (header: nama · {dipilih}/{jumlah
nilai}), buka saat klik/ada pilihan/cocok pencarian. Satu kotak cari menyaring lintas namespace.

**TUGAS 4 — AI ke depan.** Dari `<details>` "opsional" jadi kartu terbuka menonjol di bawah kartu
pintasan, sebelum filter mentah; label "cara tercepat untuk syarat rumit"; contoh klik diambil dari
tag pool NYATA (`buildAiExamples` — event teratas per jumlah), tak pernah contoh yang tak ada.
Penolakan (`sanitizeAssistOutput` validasi vs vocab pool) TETAP — tak dilonggarkan. Usulan tetap
mengisi filter di bawah untuk ditinjau.

**TUGAS 5 — kartu pintasan.** Data pemakaian per-kartu TIDAK ADA di `crm_audit_log` (0 penanda quick;
kartu tak mencatat mana yang dipakai — hanya 21 compute builder & 10 pakai AI total). Sesuai aturan:
pertahankan semua, ringkas jadi 3 terlihat + "Lihat semua ({n})".

**Panjang halaman (metrik terhitung dari kode + 28-tag vocab; BUKAN piksel — piksel butuh sesi
browser ter-autentikasi berdata pool yang tak bisa saya tegakkan andal di sini):**
- Baris nilai-tag selalu-terlihat: **56 → 0** (8 header namespace terlipat).
- Daftar pengecualian-tag duplikat: **28 baris → 0** (dihapus, jadi chip).
- Kartu pintasan terlihat: **9 → 3** (+ "lihat semua").

## T-73 — Segmen manual dari CSV: satu parser dipakai ulang, pratinjau 4-angka sebelum simpan, batas terukur; + bug URL `.in()` laten di jalur KIRIM ditutup — ⏱ DIUKUR 9 Sep 2026

Pemilik: "operator dapat berkas CSV dari CS berisi daftar undangan satu kampanye (wave, slot jam) —
biar bisa diunggah jadi segmen manual, DI SAMPING kotak tempel, tanpa parser CSV kedua, tanpa bikin
orang baru." Plus batas kanon tag: usul pihak #2 menambah `wave`/`jadwal` ke kanon DITOLAK pemilik
(benar). Batas dicatat di **KEPUTUSAN K-64**: tag kanon = atribut orang yang berulang lintas-event
(`event, peran, format, kategori, tipe, nilai, sumber, produk`); segmen manual = daftar sekali-pakai
(wave, slot jam, grup bus, nomor meja). Uji satu-baris: "kalau nilainya tak akan muncul lagi di event
berikutnya, itu bukan tag — itu daftar kirim." `wave:`/`jadwal:` di berkas ISS DITOLAK penjaga-tag
dengan benar → itulah asal impor separuh `iss-jhr-hybrid-race.csv` (109 dari 677 baris).

**TUGAS 2 — unggah CSV, SATU parser (T-73).** Unggah CSV di samping kotak tempel (bukan pengganti).
Parser audience import dipakai ulang lewat helper bersama `parseCsvText` (papaparse + deteksi pemisah;
berkas CS pakai `;`) — `import "server-only"`. Rute impor `app/api/audience/import/route.ts` kini
memanggil `parseCsvText` yang sama (bukan `Papa.parse` inline) → bukti satu parser, bukan dua. Pemetik
kolom muncul saat >1 kolom (tebak kolom email via `guessColumnMapping` yang sama, bisa disunting).
Ekstraksi + normalisasi lewat `parseEmailListInput` bersama (split `[\s,;]`, trim, lowercase, `@`,
dedup) — kaidah SAMA yang disimpan aksi save, jadi angka pratinjau = yang tersimpan.

**Pratinjau 4-angka SEBELUM simpan (kejujuran K-40).** Tombol Pratinjau memakai
`resolveEmailListRecipients` — resolver YANG SAMA dengan jalur kirim — jadi pratinjau tak bisa
menjanjikan penerima yang kirim akan buang. Empat angka: dibaca, cocok di pool (penerima), tidak di
pool (tak dikirim — impor dulu), ter-suppress. Tombol Simpan tetap MATI sampai ada pratinjau segar
untuk daftar saat ini (`previewSig === emails.join("|")`) — mengubah daftar mereset pratinjau. TIDAK
bikin orang baru: alamat di luar pool dilaporkan, tak disisipkan. `unresolvable_recipients` tak
disentuh. Audit pratinjau = ANGKA saja (nol PII).

**Batas terukur (bukan angka tak teruji).** `MAX_EMAIL_LIST = 5.000`. Biaya pengikat = RESOLVE: tiap
potongan 300-alamat = satu seq scan penuh `master_customer` (~34 ms hangat / ~600 ms dingin — indeks
email PARSIAL, `IN(list)` tak bisa pakai, T-68), tabel di-cache setelah scan pertama → resolve 5.000
alamat ≈ satu scan dingin + 16 potongan hangat ≈ ~1,5 s — ~5× di bawah anggaran 8 s (sama seperti
batas impor 15.000). Wave nyata terbesar = 258; 5.000 ≈ 20× itu. Dijaga di pratinjau DAN save.

**Bug laten ditutup (jalur KIRIM).** `resolveEmailListRecipients` memotong `.in(email_normalized)`
pada `PAGE = 1000` → URL ~30 KB → HTTP 400 ditelan (persis pola T-69) untuk daftar >~450. Diturunkan
ke `EMAIL_IN_CHUNK = 300` (URL-aman, ≤~16 KB). Belum pernah pecah di produksi (wave nyata ≤258), tapi
laten sampai wave pertama >450. `PAGE = 1000` tetap untuk paginasi `.range()`.

**TUGAS 3 — sambungkan layar + dua rapi kecil.** (a) Layar manual: `notInPoolHint` = "alamat yang
belum di pool TIDAK ditambah di sini — impor dulu lewat Audience → Impor"; `choiceHint` = "filter
otomatis untuk yang berulang (event, peran); daftar manual untuk sekali-pakai (wave, slot jam)";
`snapshotNote` = "segmen daftar-email adalah POTRET, tanggal dibuat ditambah otomatis ke nama".
(b) Judul ganda: `SegmentBuilder` di dalam tab kini `embedded` → header `<h1>SEGMENTS</h1>` internal +
deskripsi berulang ditekan, sisakan satu "BUAT SEGMEN BARU". (c) Header namespace terlipat kini
menambah jumlah-ORANG distinct per namespace (`fetchPoolTagCounts` menghitung distinct-per-namespace
di lintasan baris yang sama — menjumlah per-tag akan overcount orang multi-tag) → operator lihat
cakupan orang tiap namespace walau terlipat, bukan sekadar "7 nilai". (Angka distinct per-namespace
dihitung saat layar dibuka dari data pool nyata; belum saya jalankan atas produksi ronde ini — uji
memakai data sintetis yang membuktikan hitungannya distinct, bukan angka pool yang sebenarnya.)

## T-74 — Nama pengirim ditulis untuk email reset, diwarisi diam-diam oleh jalur kampanye; + field "Nama Pengirim" di editor template tak berujung ke mana pun — 9 Sep 2026

Pemilik: "nama pengirim di-hardcode `20FIT CRM` di `lib/email/mailtrap.ts`, tak pernah baca template.
Aku atur di template, tak berpengaruh." Benar — tapi bukan gagal simpan, melainkan **tak pernah
dibaca**, dan lebih dalam dari satu baris.

**LANGKAH 0 — diukur dulu (kode dibaca, bukan ditebak):**

1. **Apakah `crm_message_template` punya kolom nama pengirim? TIDAK.** 14 kolom
   (`id, template_key, channel, language, version, name, subject, body, variables,
   wa_approval_status, wa_provider_template_id, is_active, created_at, created_by`). `name` = LABEL
   template (dipakai hanya sebagai cadangan subjek `subject ?? name`), bukan nama pengirim. Jadi
   pemilik memang tak bisa menyimpan nama pengirim ke template hari ini.

2. **Berapa jalur memanggil `sendTransactionalEmail`? TIGA:**
   - `lib/auth/recovery.ts:83` — reset kata sandi. Butuh nama tetap `20FIT CRM` (alat internal).
   - `app/(app)/campaigns/actions.ts:529` — pratinjau kampanye.
   - `lib/crm/send-campaign.ts:364` — kirim kampanye.
   Dua terakhir mau nama dari template. Perbaikan tak boleh membuat reset mengaku sebagai merek.

3. **Apakah ada jalur Mailtrap Email Marketing (kuota terpisah, 30 ribu) dengan pengaturan nama
   sendiri? TIDAK ada di kode.** Satu-satunya jalur keluar hari ini adalah Sending API
   (`send.api.mailtrap.io`) via `sendTransactionalEmail`. Tak ada klien bulk/marketing. (Angka kuota
   dari pemilik, belum saya verifikasi.) Implikasi: JANGAN bangun tempat pengaturan kedua — kalau
   kelak pindah ke jalur marketing, ia harus membaca nama pengirim dari template yang sama.

**Temuan majemuk — field yang tak berujung ke mana pun.** Editor template
(`components/templates/email-template-builder.tsx`) PUNYA field "Nama Pengirim" (default `20FIT`),
menampilkannya di pratinjau (`From: {senderName} <crm@20fit.id>`), dan MENGIRIM `sender_name` saat
simpan (baris 160). Tapi `POST /api/templates` men-destructure `{ template_key, channel, language,
name, subject, body }` — **tak pernah membaca `sender_name`** — dan tabelnya tak punya kolomnya. Jadi
nilai itu hilang di DUA lapis sebelum bahkan bertemu hardcode di jalur kirim: operator mengetik nama,
melihatnya di pratinjau (memperkuat keyakinan bahwa itu bekerja), menyimpan — dan nilai itu menguap.

**Kelas kegagalan.** Bukan senyap yang biasa (nilai ditulis, gagal tersimpan). Ini saudaranya:
**nilai yang benar dalam satu konteks (email reset ke staf internal) diwarisi diam-diam oleh konteks
kedua (email pelanggan) yang dibangun di atas fungsi yang sama, tanpa ada yang memeriksa saat konteks
bertambah.** `sendTransactionalEmail` dibuat untuk reset; jalur kampanye menumpang, dan ikut
memakai "20FIT CRM".

**Nilai lain yang diwarisi cara serupa — diperiksa:**
- **Alamat pengirim** (`MAILTRAP_FROM` = crm@20fit.id): dipakai bersama SEMUA jalur, tapi ini
  **disengaja** — satu-satunya domain terverifikasi; alamat berbeda butuh verifikasi domain sendiri.
  Bukan bug warisan, biarkan.
- **Reply-to:** TIDAK diset di mana pun (body Sending tak punya `reply_to`). Bukan warisan, melainkan
  absen — balasan kampanye kini jatuh ke crm@20fit.id. Catatan, bukan cacat ronde ini.
- **Footer / unsubscribe:** TIDAK diwarisi. Reset memakai komposer sendiri (`buildRecoveryEmail`,
  tanpa footer/unsubscribe); kampanye memakai `renderEmailDocument` (dengan footer unsubscribe). Dua
  komposer terpisah — benar secara konstruksi.

**Perbaikan ronde ini (aman, tanpa DB):** `sendTransactionalEmail` menerima `senderName` sebagai
parameter, default `"20FIT CRM"` → jalur reset byte-for-byte tak berubah (diuji). Ini menghapus
hardcode sebagai satu-satunya sumber; nilai kini bisa disuntik.

**Bergerbang (BELUM dijalankan — tunggu gerbang):** kolom `sender_name` belum ada, jadi wiring jalur
kampanye (baca dari template → kirim ke `senderName`) menunggu migrasi. SQL diajukan di laporan +
badan PR; API `POST /api/templates` yang membuang `sender_name` DAN select di jalur kirim/pratinjau
baru disambungkan setelah kolomnya ada (select kolom yang belum ada = PostgREST 400 → memecah kirim).

### T-74 (lanjutan) — rantai disambungkan penuh + dikunci uji lintas-lapis — ⏱ DITERAPKAN 9 Sep 2026

Migrasi `sender_name` disetujui pemilik lalu **diterapkan sekali** (apply_migration; stempel ledger
`20260909060215` ≠ nama berkas `20260909050000` — pola divergensi yang sama dengan 15/28/30/37/38/39/40).
Diverifikasi dari `information_schema`: kolom `sender_name text`, nullable YES, default null; 23 baris,
**0** ber-`sender_name` (semua NULL → jalur kirim jatuh ke default "20FIT CRM"). Ledger README baris 41.

Ketiga lapis disambungkan: (1) `POST /api/templates` kini men-destructure/menyimpan `sender_name`
(dulu dibuang senyap — inti T-74); (2) `loadTemplates` di jalur kirim men-`select` `sender_name` +
memetakannya; (3) jalur pratinjau + kirim meneruskannya ke `sendTransactionalEmail`.

**Batas panjang + pembersihan (helper bersama `lib/email/sender-name.ts`):** `MAX_SENDER_NAME = 64`
— TIDAK diukur dari data (kolom baru, 0 baris), melainkan **dinalar**: default "20FIT" (5), string
merek+lokasi terpanjang realistis ~30, klien email memotong nama ~30–40; 64 = ruang lega di atas
realistis, jauh di bawah rentang render rusak. Disiplin "maks realistis + ruang" yang sama dengan cap
full_name (120, maks nyata 46) — di sini "realistis" menggantikan "terukur" karena belum ada baris.
Ditegakkan DI RUTE (jalur tulis, bukan hanya input) — pola full_name/city di crm_update_master_fields;
baris baru + spasi berlebih dibersihkan (collapse+trim) di pintu; dibersihkan+diklamp defensif sekali
lagi tepat sebelum kawat (`senderNameForWire`).

**Uji lintas-lapis (bukan per-lapis):** `lib/crm/sender-name-chain.test.ts` memasukkan nilai SEKALI
di payload editor dan memeriksanya SEKALI di `from.name` kawat, menjalankan rute nyata → `loadTemplates`
nyata → `sendTransactionalEmail` nyata (hanya `fetch` + Supabase yang dipalsu). **Terbukti merah** saat
rute membuang `sender_name` DAN saat select jalur kirim membuangnya (dua-duanya diuji dengan mematahkan
lapis lalu memulihkan). Inilah yang uji per-lapis lewatkan: tiap lapis hijau sendiri.

**Audit field editor↔rute (dilaporkan, tak semua diperbaiki):** di `/api/templates`, `sender_name`
adalah SATU-SATUNYA field yang dibuang (kini diperbaiki). Editor WhatsApp mengirim
{template_key, channel, language, name, body} — semuanya dikonsumsi rute. Editor lain (segment,
consent, suppression, profile-search) memakai **server action bertipe**, bukan rute JSON mentah, jadi
celah buang-senyap tak berlaku. Satu-satunya rute JSON lain (`/api/audience/import`) domain berbeda —
ditandai, di luar lingkup perbaikan ini.

## T-75 — Pindah ke Resend membuat plafon CRM jadi satu-satunya rem atas kuota yang dibagi sembilan sistem; nol yang memantau agregatnya — 9 Sep 2026

Pemilik memindahkan email CRM ke Resend (kuota + biaya). Akun Resend **dipakai bersama sembilan kunci
20FIT**, delapan aktif (angka dari pemilik, belum saya verifikasi ke dasbor Resend):
`Ticket.20fit.id`, `telent_reset password`, `Photo.20fit.id`, `coach-portal`, `My.20fit.id`, `POS`,
`RMTN`, `racelabtiming`, dan **`CRM`** (Sending, belum pernah dipakai).

```
Transaksional : 16.487 / 50.000 per bulan  (≈550/hari dari delapan sistem lain)
Batas harian  : TIDAK ADA di sisi Resend
Perpanjangan  : 10 September
```

**Perubahan kelas risiko.** Di Mailtrap, CRM punya kuota 4.000 sendiri — kampanye lepas kendali hanya
melukai dirinya. Di Resend, kuota yang sama dipakai **konfirmasi tiket, struk POS, atur ulang kata
sandi**. Yang berhenti duluan bukan kampanyenya, melainkan email konfirmasi pelanggan yang baru beli
tiket. Karena Resend tak punya batas harian, **`crm_send_config.daily_limit` menjadi satu-satunya rem
yang ada** untuk melindungi delapan sistem lain.

**Tak ada pengawas agregat.** Sembilan kunci menembak kuota 50.000 yang sama; **nol** yang memantau
totalnya. Tiap sistem hanya tahu kirimannya sendiri. Tak ada alarm saat agregat mendekati 50.000 —
yang tahu duluan adalah sistem yang gagal kirim. Ini utang terpisah (pemantauan lintas-tim), dicatat
di sini supaya tak hilang; bukan sesuatu yang bisa ditutup CRM sendiri.

**Perbaikan prasyarat (T-43/T-44, ronde ini).** Sebelum adaptor Resend, penghitung plafon diperbaiki
ke **opsi (a) — hitung baris ber-`sent_at`** (bukan `status='sent'`), supaya webhook `sent→delivered`
tak lagi mengosongkan hitungan dan run kedua di hari sama melihat total nyata (dikunci
`lib/crm/send-daily-count.test.ts`). Tanpa ini, rem satu-satunya itu bocor lintas-run — tak boleh
dibiarkan saat kuota dibagi.

**Teks layar diperbarui** (kelas T-56): `sendLimitsPage.intro` dulu berkata "kontrol reputasi domain,
bukan kuota Mailtrap" — kini menyebut rem lintas-sistem + kuota bersama Resend.

### PERTANYAAN TERBUKA untuk pemilik — nilai `daily_limit` (TIDAK diubah ronde ini)

Nilai yang benar bergantung berapa yang tim lain butuhkan — percakapan lintas-tim, bukan keputusan
teknis. Aritmetikanya (angka dari pemilik, per 9 Sep, kuota mungkin berubah 10 Sep saat perpanjangan):

```
Baseline delapan sistem lain : ≈550/hari  ≈ 16.500/bulan
Kuota bersama                : 50.000/bulan
Plafon CRM sekarang          : 1.000/hari ≈ 30.000/bulan ≈ 60% kuota bersama
550/hari + 1.000/hari CRM    ≈ 46.500/bulan → ~93% kuota, margin ~3.500 (~7%)
```

Pada 1.000/hari CRM penuh + baseline sistem lain, kuota bersama nyaris habis. Pertanyaan ke pemilik:
berapa plafon CRM yang aman setelah menyisakan ruang untuk delapan sistem lain (yang baseline-nya bisa
naik)? Keputusan + nilai barunya milik pemilik; `daily_limit` dibiarkan `1000` sampai itu diputuskan.

## T-76 — Adaptor Resend: detail API diverifikasi ke dokumentasi Resend sendiri (bukan prompt); THROTTLE_STATUSES 429 terbukti, sisanya hipotesis — 9 Sep 2026

Pindah penyedia email CRM ke Resend (sakelar `EMAIL_PROVIDER`, default `mailtrap`). **resend.com
DIBLOKIR egress dari lingkungan ini**, jadi detail API diverifikasi silang dari **repo resmi Resend
`github.com/resend/resend-skills`** + pencarian web — BUKAN halaman dokumen live. Kalau nanti bisa
akses langsung, konfirmasi ulang.

**Detail API (terverifikasi) — dan yang BERBEDA dari dugaan awal:**
- **Kirim:** `POST https://api.resend.com/emails`, `Authorization: Bearer <RESEND_API_KEY>` (kunci
  ber-awalan `re_`).
- **`from` adalah SATU string `"Nama <email>"`** — BUKAN objek `{email,name}` seperti Mailtrap. (Beda #1
  — adaptor membangun `${senderNameForWire(name)} <${RESEND_FROM}>`.)
- Body: `from`, `to` (array), `subject`, `html`, `text`, opsional `reply_to`/`tags`/`headers`. Kategori
  dipetakan ke `tags:[{name:"category",value:…}]` (nilai tag Resend harus `[A-Za-z0-9_-]`).
- **Id pesan ada di TOP-LEVEL `id`** pada respons HTTP mentah (`{ "id": "<uuid>" }`); SDK membungkusnya
  jadi `data.id`. Adaptor pakai fetch mentah → baca `body.id`. (Beda #2 dari asumsi "data.id".)
- **Webhook: SATU event per POST** `{ type, created_at, data:{ email_id, to, … } }` — BUKAN array
  `events[]` batch seperti Mailtrap. (Beda #3 — parser & rute terpisah.) Event: `email.sent`,
  `email.delivered`, `email.bounced`, `email.complained` (+ opened/clicked/delivery_delayed/failed).
  `email.sent` DIABAIKAN (status/sent_at distempel saat kirim, bukan dari webhook). Bounce `soft`
  diabaikan (tak auto-suppress); hanya `hard` → bounced.
- **Tanda tangan webhook: Svix** — header `svix-id`/`svix-timestamp`/`svix-signature`, secret `whsec_…`,
  HMAC-SHA256(base64) atas `${id}.${timestamp}.${rawBody}`, header berisi token `v1,<sig>` dipisah spasi
  (cocok satu = sah). (Beda #4 — Mailtrap pakai HMAC-hex atas raw body dengan header sendiri.)

**THROTTLE_STATUSES — TUGAS 6, jujur:**
- **429 = rate limit → TERBUKTI** di dokumentasi Resend (rate limit per-tim; header `ratelimit-*` +
  `retry-after`). 429 sudah ada di set `{429,402,503}`, jadi backoff (T-64) memperlakukan throttle Resend
  dengan benar **tanpa mengubah `send-run.ts`** (dibuktikan diff kosong).
- **Angka rate-nya sendiri TAK PASTI**: satu sumber "10 req/s", sumber lain "2 req/s" — persis kasus
  "pengetahuan pihak #2 kedaluwarsa". Yang PENTING (status 429) konsisten.
- **Kode status kuota-bulanan-habis TIDAK terdokumentasi** di sumber yang bisa dijangkau → **HIPOTESIS**,
  tidak disajikan sebagai fakta. `402` di set adalah warisan Mailtrap (payment-required) — untuk Resend
  **inert** (kemungkinan tak pernah dikembalikan), jadi tak menimbulkan salah-klasifikasi; `503` generik.
  Set dibiarkan `{429,402,503}` **tanpa perubahan** — bukan karena disalin buta, tapi karena 429
  (satu-satunya yang terbukti untuk Resend) sudah tercakup dan sisanya tak memicu salah bagi Resend.
  Kalau uji kirim menunjukkan `failure_cause=unknown` pada throttle nyata, itu sinyal untuk menambah
  status yang teramati — ditulis di runbook langkah 6.

**Kontrak identik dibuktikan uji** (`lib/email/resend.test.ts`): `err.status` sebagai properti (T-41),
nol PII di pesan galat (tak ada penerima, tak ada body respons), id dari `body.id`, config-missing tak
mengirim. Sakelar penyedia (`lib/email/send.ts`) + rute webhook + verifikasi Svix semuanya diuji.

**Verifikasi domain 20fit.id di Resend: DI LUAR KENDALI KODE** — status ada di dasbor Resend milik
pemilik; runbook langkah 1 memintanya dikonfirmasi Verified sebelum peralihan. Saya tak bisa (dan tak
seharusnya) memverifikasinya dari sini.
