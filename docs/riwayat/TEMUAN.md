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

## T-18 · Produksi menjalankan kode BRANCH, bukan `main` — dokumentasi deploy salah
> **DITUTUP (Sprint 3Y, 12 Agu 2026).** Pemilik produk **menerima secara sadar** bahwa produksi
> men-deploy dari branch untuk sekarang (kecepatan > gate merge; belum ada pengguna eksternal),
> dengan syarat pembalikan tercatat: begitu staf luar memakai sistem rutin → arahkan ke `main`
> (merge dulu, repoint kemudian). Lihat **K-27**. Pertanyaan "branch atau main?" kini
> **diketahui (branch) dan diterima** — bukan lagi kondisi tak disadari. Konfirmasi dashboard
> Railway turun jadi kebersihan (MENUNGGU #3/#4), bukan penghalang. Detail bukti tetap di bawah.

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
