# Register Keputusan

Keputusan yang sudah diambil, kenapa, dan **apa yang akan membalikkannya**. Kolom
terakhir itu yang paling penting: keputusan tanpa syarat pembalikan berubah jadi dogma,
dan orang berikutnya akan melanggarnya diam-diam alih-alih mengubahnya terbuka.

Sebagian besar alasan di bawah sebelumnya hanya hidup di komentar kode. Kalau berbeda
dengan komentar, **komentar yang menang** — perbarui berkas ini, jangan sebaliknya.

---

## K-01 · Matriks izin mengikuti PRD 17.2, bukan inferensi
**Sprint 3A.** Empat nilai bukan boolean dan tidak boleh dipipihkan jadi ya/tidak:
`masked`, `own_unit`, `approval`, `draft`/`request`. Fail-closed di semua jalur: peran
tak dikenal ditolak, `unit_manager` tanpa tabel scope ditolak.
**Membalikkan:** perubahan PRD, bukan perubahan kode. → `lib/auth/roles.ts`

## K-02 · Penyamaran kontak di server, bukan di UI
**Sprint 3A.** Data asli tidak boleh sampai ke browser untuk peran tanpa
`profile.view_contact`. Masking di klien berarti nilai aslinya sudah terkirim.
**Membalikkan:** tidak ada alasan yang bisa diterima. → `lib/crm/mask.ts`

## K-03 · Ketiadaan baris = penolakan, di mana pun
RBAC tanpa baris peran → nol akses. Consent tanpa baris → tidak boleh dihubungi.
Konsisten di seluruh sistem, dan itulah kenapa **tidak ada backfill consent**:
mem-`INSERT` 82.253 baris `legacy_import_unverified` akan membuat seluruh pool tampak
punya dasar hukum yang tak pernah diverifikasi siapa pun.
**Membalikkan:** keputusan legal + tim, bukan keputusan teknis.

## K-04 · Retensi audit: allowlist, bukan denylist
**Sprint 3A, migrasi 8.** Yang boleh dipangkas disebutkan eksplisit
(`profile.viewed`, `list.viewed`, `search.%`, `login.%`); kategori kepatuhan
(`consent.%`, `suppression.%`, `role.%`, `profile.deleted`, `export.%`, `retention.%`)
dikecualikan permanen, dengan denylist sebagai jaring pengaman kedua.
**Konsekuensi yang mengikat:** aksi audit baru yang tidak masuk salah satu daftar akan
menumpuk selamanya tanpa ada yang sadar. Karena itu **jangan buat aksi audit baru**
kecuali ia jatuh di bawah prefiks yang sudah ada.
**Membalikkan:** migrasi baru + perbarui `retention-policy.ts` bersamaan (lihat K-09).

## K-05 · Bentuk kanonik telepon mengikuti `master_customer`, bukan E.164
**Sprint 3B.** `normalizePhoneID()` menghasilkan `62…` tanpa `+`. E.164 murni akan
menulis `+62…`, dan **nol** dari 81.584 nomor tersimpan berawalan `+` — pencocokan
suppression akan gagal mencocokkan apa pun, diam-diam. Komentar migrasi `crm_suppression`
sudah menuntut paritas dengan `master_customer`, dan `master_customer` tidak boleh diubah.
**Membalikkan:** hanya bila `master_customer.phone_normalized` dimigrasi lebih dulu.
→ `lib/crm/normalize.ts`

## K-06 · Normalisasi hanya di satu tempat, tidak pernah di SQL
**Sprint 2, ditegakkan 3H.** `identity_key` wajib diproduksi `lib/crm/normalize.ts`.
Fungsi Postgres hanya boleh **menolak** masukan yang jelas belum ternormalisasi sebagai
jaring pengaman — tidak pernah menormalkan sendiri. Implementasi kedua yang berbeda satu
kasus = suppression gagal cocok tanpa error.
**Membalikkan:** tidak ada.

## K-07 · Audit hanya untuk yang menyentuh individu
**Sprint 3E.** Wajib audit bila respons memuat baris individual **atau** agregatnya
dibentuk parameter pengguna. Agregat tetap tanpa parameter tidak diaudit — hitungan
tidak punya sisi "siapa" pada objeknya.
**Konsekuensi:** `/api/quality` dan `/api/dashboard` tidak menulis audit;
`/api/audience`, `/api/audience/[id]`, `/api/audit`, `/api/consent` wajib dan menolak
sajikan (503) bila audit gagal.
**Membalikkan:** begitu `/quality` diberi filter, audit wajib kembali. Peringatan itu
ada di dalam berkas route-nya.

## K-08 · `0` berarti terukur nol; `—` berarti tidak ada sumbernya
**Sprint 3B.** Keduanya tidak boleh tertukar. "Workflow aktif" tetap `—` karena tak ada
tabelnya; "Bisa dihubungi" adalah `0` karena aturannya benar-benar dijalankan.
Menampilkan `0` untuk sesuatu yang tak punya sumber adalah kebohongan yang menyerupai data.
**Membalikkan:** tidak ada.

## K-09 · Daftar retensi punya satu sumber, dan paritasnya diuji
**Sprint 3E.** Daftar sempat hidup di tiga tempat (SQL migrasi 8, `classifyAction`,
filter `.or()`). Kini `lib/crm/retention-policy.ts` jadi sumber tunggal untuk sisi
TypeScript, dan sebuah test membaca berkas migrasi 8 lalu membandingkannya — kalau
menyimpang, test gagal menyebut sisi mana.
**Membalikkan:** tidak ada; kalau daftarnya berubah, ubah keduanya dalam satu commit.

## K-10 · Angka tidak boleh ditulis tangan di komponen
**Sprint 3B.** Banner kualitas sempat memuat `0%`, `7,03%`, `98,65%` sebagai teks.
Angka yang ditulis di komponen tetap tampil percaya diri lama setelah datanya bergerak.
Semua angka dihitung per request di `/quality`.
**Membalikkan:** tidak ada.

## K-11 · Kelas warna bernomor dilarang
**Sprint 3B.** `tailwind.config.ts` memetakan token ke `var(--…)` polos, yang menghapus
skala numerik **dan** memblokir modifier opacity. `text-amber-500` dan `bg-red/10` tidak
menghasilkan CSS sama sekali — bukan warna salah, melainkan tidak ada aturan. Gunakan
kelas token datar (`text-amber`) atau utilitas `.tint-*`. Dijaga test.
**Membalikkan:** ubah `tailwind.config.ts` lebih dulu.

## K-12 · Migrasi 3 `crm_consent` dijalankan apa adanya
**Sprint 3F.** Legal mengizinkan; berkasnya tidak dirapikan, tidak ditambah indeks,
tidak diubah satu constraint pun — yang dijalankan harus yang ditinjau.
**Masih terbuka:** syarat K-1 (pengosongan `evidence` saat anonimisasi) dan daftar final
kosakata `basis` belum dijawab legal. Dua nilai sementara ditampilkan **sebagai
sementara** di layar. → `docs/SIGNOFF-legal-consent.md`

## K-13 · Jalur tulis pertama adalah suppression, bukan consent
**Sprint 3H.** Permintaan berhenti dihubungi adalah peristiwa yang benar-benar terjadi
hari ini; opt-in tidak — tak ada formulir atau kanal yang menghasilkannya. Mencatat
`explicit_opt_in` tanpa peristiwanya berarti mengarang dasar hukum. Arah kesalahannya
juga berlawanan: suppression selalu melindungi.
**Membalikkan:** setelah ada kanal opt-in nyata. → `docs/RENCANA-jalur-tulis-consent.md`

## K-14 · Tulis consent/suppression wajib atomik dengan audit (K-3 PRD)
**Sprint 3H.** Baris current-state bisa di-`UPDATE`, jadi ia bukan bukti — buktinya
adalah audit trail. PostgREST tak bisa membungkus dua `INSERT` dalam satu transaksi,
jadi jalur tulis **wajib** fungsi Postgres. Suppression bersifat sticky: nol `DELETE`,
pencabutan lewat `status='lifted'`.
**Membalikkan:** tidak ada.

## K-15 · Setiap fungsi baru wajib mencabut `EXECUTE`
**Sprint 3I.** Supabase otomatis memberi `EXECUTE` ke `anon` dan `authenticated` pada
setiap fungsi baru di `public`, dan `revoke … from public` **tidak** mencabut grant
eksplisit per-peran. Wajib `revoke … from public, anon, authenticated` lalu
`grant execute … to service_role`, di berkas migrasi yang sama. Dijaga test.
**Membalikkan:** tidak ada.

## K-16 · Kueri pencarian tidak masuk `metadata` audit
**Sprint 3J (diimplementasikan; commit `6504645`, belum ter-merge).** Berbeda dari nilai
filter kota (K-17): kueri pencarian **adalah** identitas orang. Yang dicatat adalah `kind`,
`result_count`, dan `target_id` bila hasilnya tepat satu — itu justru menjawab "siapa
mencari siapa" lebih baik. Telepon/email dicari **sama persis saja**, tak pernah awalan
atau substring, supaya layar ini tidak jadi alat panen. Batasnya fungsi murni ber-test
(`lib/crm/search.ts`): min 3 huruf nama, cap 10 + hasil `too_many`, tolak pola sapuan.
**Membalikkan (ke pencarian awalan):** itu fitur ekspor menyamar — butuh indeks, ambang,
gerbang, dan audit berbeda. → `docs/PENCARIAN-exact-match.md`

## K-17 · Nilai filter kota disimpan, dibatasi panjangnya
**Sprint 3D/3H.** Audit harus menjawab "apa yang dicari". Risiko sisa (operator
menempel PII) dibatasi tiga cara: cap panjang, pemangkasan operasional 90 hari, dan
catatan di layar bahwa nilai filter berasal dari ketikan pengguna.
**Membalikkan:** ganti ke penanda ya/tidak — perubahan satu baris, bila tim menilai
risikonya terlalu tinggi.

## K-18 · `railway.json` memaksa `NODE_ENV=production` saat build
**Sprint 1.** Railway bisa mewariskan `NODE_ENV` yang salah; tanpa prefix ini,
`next build` gagal di semua halaman dengan `useContext` null. **Uji lokal bisa
hijau palsu**: `NODE_ENV` yang kosong atau tak diset diam-diam jadi `production`. Untuk
mereproduksi kegagalan aslinya, `NODE_ENV=development npm run build`.
**Membalikkan:** hanya setelah build Railway nyata terbukti hijau tanpanya. Sudah nyaris
dihapus dua kali. → `README.md`

## K-19 · Kolom waktu tidak dipakai sebagai sinyal
**Sprint 3E; diperluas 3N.** `created_at` adalah cap waktu muat (satu instan per sumber).
`first_seen_at` juga cap muat untuk 98,7% pool. `last_activity_at` dilarang sejak
Sprint 2. **Sprint 3N** menambah yang keempat: `customer_engagement.last_seen_at` cap
muat untuk **99,51%** baris (T-14). Empat kolom waktu, empat kali cap muat — ini properti
sumber, bukan kejutan per-kolom. Segmentasi berbasis recency **tidak mungkin jujur** dengan
data hari ini, termasuk di segment builder ekosistem (tak ada kotak waktu di sana).
**Membalikkan:** setelah ada ingestion berkelanjutan. → `docs/KOLOM-WAKTU.md`

## K-20 · Data anomali dibuat terlihat, bukan diperbaiki
LTV negatif (1 baris) dan `first_seen_at > created_at` (14 baris) ditampilkan di
`/quality`. Remediasi data milik tim pemilik data.
**Membalikkan:** keputusan tim.

## K-21 · Gap id `crm_audit_log` adalah SINYAL, bukan cacat kosmetik
**Sprint 3K.** `crm_audit_log.id` memakai sequence. Sebuah `INSERT` yang gagal atau
di-rollback tetap **mengambil** nomornya lalu tak meninggalkan baris — jadi lubang di
urutan id adalah **satu-satunya jejak** operasi teraudit yang gagal (barisnya yang
seharusnya mencatatnya justru yang tak pernah mendarat). Ditemukan lewat gap `37,38,39`
(di samping `id=4` yang sah dari uji purge 3A), di jendela pemakaian nyata `tifany@20fit.id`
11 Agu 2026, dengan `profile.viewed` tetap 0.
**Konsekuensi yang mengikat:** **JANGAN PERNAH** menjalankan `setval`/`ALTER SEQUENCE …
RESTART`/mengisi ulang `crm_audit_log_id_seq`, dan jangan "merapikan" gap — itu menghapus
satu-satunya bukti yang tersisa. Gap ditampilkan di layar audit `/settings` (banner
"tidak lengkap") dan dipantau lewat SQL di `docs/PASCA-MERGE-monitoring-revert.md`.
Kegagalan route kini juga meninggalkan jejak PII-free di log Railway
(`lib/crm/failure-log.ts`), supaya gap berikutnya bisa ditelusuri, bukan hanya dihitung.
**Membalikkan:** tidak ada.

## K-22 · Status verifikasi DIHITUNG dari data, dokumen tidak lagi memegang status
**Sprint 3L.** Status "terbukti/belum terbukti" tiap rute diturunkan dari `crm_audit_log`
(`lib/crm/verification-status.ts`), bukan diketik ke markdown. Alasannya adalah kegagalan
yang sudah terjadi **dua kali**: bukti hidup di tabel yang bergerak sendiri, status hidup
di dokumen yang harus diperbarui manusia — jadi status basi (`/consent` terbukti di `id=32`
tapi terbaca "belum" satu sprint; `/settings` terbukti di `id` 44–47, baru ketahuan saat
dicek ulang; V-6 tertutup di `id=51` tanpa ada yang tahu sampai dihitung). → TEMUAN **S-07**.
**Tiga kategori, dan yang ketiga tak boleh disatukan dengan kedua:** `proven`,
`unproven`, dan **`not_auditable`** (`/`, `/quality` sengaja tak menulis audit — K-07; nol
baris di sana **benar**, bukan kurang bukti). Menyatukan `not_auditable` ke `unproven`
membalik aturan Sprint 3E. Ditampilkan di `/settings/diagnostik`; ceklis + skrip jadi
jalur cadangan (untuk saat aplikasi tak bisa dibuka).
**Membalikkan:** tidak ada — kembali ke status-diketik-tangan mengembalikan bug basi ini.

## K-23 · Klaim keamanan tabel = RLS **dan** policy **dan** grant, bukan salah satunya
**Sprint 3Q.** Sebuah tabel bisa **RLS ON dan tetap terbuka lebar** lewat policy permisif
(`master_customer`/`customer_engagement`: `authenticated_full_access`, `ALL`/`USING true` →
887 akun baca+tulis, T-17). Sebaliknya RLS ON + **0 policy** = tolak-default (pola `crm_*`,
benar). Maka **klaim "tabel X terlindungi" hanya sah bila menyebut ketiganya**:
`relrowsecurity` (RLS on/off), **policy** yang berlaku (peran/`cmd`/`permissive`/`USING`/
`WITH CHECK`), dan **grant** tabel (`role_table_grants` — RLS tak berlaku bila `SELECT` tak
di-grant, dan sebaliknya). Menyebut `relrowsecurity` saja adalah ukuran yang lebih sempit
daripada klaimnya — itu yang membuat dokumen eskalasi 3O keliru (S-08). Kueri klasifikasi
tiga-tingkat (anon-open / login-open / terkunci) ada di
`docs/PASCA-MERGE-monitoring-revert.md`, dapat dijalankan ulang kapan saja — policy bisa
berubah tanpa memberi tahu tim ini (proyek dipakai bersama).
**Membalikkan:** tidak ada.

## K-24 · Operasi besar: batas 60 dtk klien MCP ≠ `statement_timeout` server, dan cara menjalankannya
**Migrasi 11.** Backfill 408.119 baris consent tak selesai dalam 60 detik. Ada **dua batas
berbeda** yang mudah tertukar, dan menukarnya membuat orang mengira operasi **gagal padahal
berhasil** lalu menjalankannya ulang — untuk operasi non-idempoten, itu merusak.

- **Batas klien MCP `execute_sql` = 60 detik.** Saat lewat, klien menyerah — **tetapi backend
  Postgres TERUS berjalan** (dikonfirmasi: `pg_stat_activity` menunjukkan pid `state=active`,
  `now()-query_start` naik terus setelah klien putus). Klien putus **bukan** berarti query
  dibatalkan.
- **`statement_timeout` server = 2 menit (default proyek ini).** INI yang benar-benar
  membunuh query panjang → `ERROR: canceling statement due to statement timeout` → rollback.

**Cara menjalankan operasi besar (>60 dtk, ≤ apa pun):**
1. Naikkan timeout **di sesi yang sama**, sebelum operasinya, dalam satu kiriman:
   `set statement_timeout = '15min'; select public.fungsi_besar();`
   SET berlaku untuk sesi itu; backend lanjut sampai selesai walau klien MCP putus di 60 dtk.
2. **Pastikan lewat `pg_stat_activity`**, jangan lewat `count(*)` (MVCC menyembunyikan baris
   belum-commit → count 0 tidak membedakan "masih jalan" dari "rollback"):
   `select pid, state, now()-query_start from pg_stat_activity where query ilike '%nama_fungsi%' and pid<>pg_backend_pid();`
   `state=active` = masih jalan; baris hilang = selesai/mati.
3. **Jangan poll `count(*)` berulang saat menunggu** — tiap poll yang time-out juga
   meninggalkan backend hidup ~2 menit → menjenuhkan pool koneksi instance kecil → poll
   berikutnya ikut time-out. Diamkan DB (tunggu di luar DB), lalu poll **satu kali**.

**Kenapa aman diulang saat ragu:** fungsi backfill **atomik** (satu transaksi, K-14). Percobaan
yang time-out/mati **rollback bersih** — 0 baris parsial (diverifikasi: `crm_consent` 0 baris
setelah tiap percobaan gagal, lalu 408.119 tepat setelah yang berhasil). Untuk fungsi atomik,
menjalankan ulang aman; untuk operasi **non-idempoten non-atomik**, langkah 2 (cek
`pg_stat_activity`) wajib sebelum memutuskan menjalankan ulang.
**Membalikkan:** tidak ada — ini pengetahuan operasional, bukan perubahan sistem.

## K-25 · Sumber deploy = pertanyaan empiris, bukan asumsi dari README
> **KOREKSI (24 Agu 2026).** Premis di bawah — "bukti menunjukkan kode branch melayani produksi"
> — **salah**. Dashboard Railway (Settings → Source) menunjukkan produksi dari **`main`**,
> auto-deploy saat push; kalimat README yang dulu dianggap keliru **benar sejak awal**. "Bukti"
> itu adalah `git log -S` atas ref `origin/main` **basi**: commit aksi audit sudah masuk `main`
> lewat PR #10 (04:41 UTC), 7 menit sebelum reset produksi (04:48 UTC). Lihat **T-22 (dikoreksi)**
> dan **T-27**. **Yang tetap benar dari K-25:** prinsip metodologisnya — "sumber deploy adalah
> pertanyaan empiris, jawab dengan bukti, bukan asumsi." Yang salah cuma **jawaban** yang ditarik
> saat itu (branch), plus keyakinan bahwa bukti dari-dalam-repo sanggup menjawabnya (tak sanggup —
> T-27). Diskriminator sah bukan `git log -S` melainkan **Railway → Settings → Source**.

**Migrasi 11/12.** README menyatakan "auto-deploy on `main`" dan "push ke `main` memicu
deploy" — tapi bukti menunjukkan **kode branch melayani produksi** (aksi audit yang hanya ada
di branch tertulis oleh produksi; `main` bahkan tak menulis audit reset). → T-18.
_(Alinea ini adalah rekaman asli yang keliru; lihat koreksi di atas.)_

**Keputusan:** status deploy **diturunkan dari bukti**, bukan dari klaim dokumen. Diskriminator
yang sah: **siapa yang menulis baris audit** (`git log -S` pada string aksi → cek apakah commit
itu ada di `origin/main`). Bukan `recovery_sent_at` (dibersihkan setelah reset, tak
membedakan jalur), bukan "README bilang begitu".

**Konsekuensi operasional sampai dashboard Railway dikonfirmasi manusia:** perlakukan **setiap
push ke branch sebagai berpotensi langsung ke produksi**. Gate "jangan merge `main`" bisa jadi
**tidak melindungi apa pun** — jadi disiplin gate (nol perubahan data tanpa izin, nol setelan
bersama disentuh) berlaku pada **setiap push**, bukan hanya pada merge. Larangan "jangan merge
ke `main` tanpa izin" tetap berlaku; ia sekadar bukan satu-satunya pintu ke produksi.
**Membalikkan:** tidak ada — ini pengetahuan operasional; koreksi dokumen mengikuti bukti.

## K-26 · Granularitas suppression: per-identitas cocok → SELURUH profil gugur, SEMUA purpose
**Migrasi 13.** Saat menulis RPC contactability, pertanyaan yang belum pernah diputuskan
mengeras: bila SATU identitas seseorang di-suppress, apakah SELURUH pelanggan gugur, atau
hanya identitas/purpose itu?

**Yang sebenarnya berlaku sekarang (dibaca, bukan diasumsikan):** `isContactableForPurpose`
(lib/crm/contactability.ts) mengulang SEMUA identitas profil; bila **salah satu** ada di set
suppression aktif → `return false`, **tanpa memandang purpose**. Jadi: **per-identitas cocok →
seluruh profil gugur → untuk marketing DAN transactional**. `crm_suppression` sendiri
**per-identitas global** (D-3: "per identitas, bukan per channel"), **tanpa kolom
purpose/channel** — jadi suppression memang berarti "jangan hubungi orang ini sama sekali",
bukan "jangan marketing".

**Keputusan:** granularitas itu **disahkan** — per-identitas cocok, seluruh profil gugur,
semua purpose. RPC `crm_contactable_counts` (Migrasi 13) memakai anti-join yang **identik**
maknanya (pelanggan gugur bila salah satu identitasnya tersuppress aktif), jadi RPC dan aturan
TypeScript **tidak diverge** (K-09). Dikunci oleh test fungsi murni (telepon di-suppress, email
bersih → tidak contactable untuk marketing DAN transactional) — karena dengan nol baris
suppression, database tak bisa menangkap divergensi.

**Konsekuensi bisnis yang diterima sadar:** seseorang yang minta "jangan telepon" juga tak akan
dikirimi email (marketing maupun invoice layanan). Itu sisi ketat; dipilih karena suppression
tak punya granularitas purpose untuk dibedakan.

**Syarat pembalikan:** bila `crm_suppression` kelak diberi kolom `purpose`/`channel` (mis.
"berhenti marketing saja"), keputusan ini **wajib ditinjau ulang di DUA tempat sekaligus** —
`isContactableForPurpose` DAN `crm_contactable_counts` — atau keduanya diverge diam-diam lagi.
**Membalikkan:** ubah kedua tempat itu bersama + perbarui test pengunci; jangan satu saja.

## K-27 · ~~Produksi men-deploy dari branch kerja — keputusan sadar pemilik produk~~ — **DIBATALKAN 24 Agu 2026**
> **DIBATALKAN SELURUHNYA (24 Agu 2026).** Keputusan ini "menerima secara sadar" sebuah kondisi
> yang **tak pernah ada**: produksi tak pernah men-deploy dari branch — ia dari `main` sejak awal
> (dashboard Railway, Settings → Source). Karena premisnya (K-25 versi lama, T-22) terbukti salah,
> tak ada yang tersisa untuk "diterima". Jangan pakai K-27 sebagai preseden untuk apa pun. Model
> yang benar: **`main` = produksi, merge = deploy.** Larangan merge tanpa izin **tetap** dan
> makin penting. Lihat T-22 (dikoreksi), T-27, K-25 (dikoreksi). Teks asli disimpan di bawah
> sebagai jejak, bukan sebagai keputusan yang berlaku.

**Latar:** K-25 (Sprint 3Y sebelumnya) **menurunkan dari bukti** bahwa produksi Railway
menjalankan kode **branch**, bukan `main` — dan T-18 mengangkat "sumber deploy mana yang
benar" sebagai pertanyaan terbuka. Sprint ini pemilik produk **memutuskan dan menerima**
kondisi itu, bukan sekadar mencatatnya sebagai kejutan.

**Keputusan:** produksi **tetap men-deploy dari branch kerja untuk sekarang.** Belum ada
pengguna aktif di luar tim pengembang, dan **kecepatan iterasi lebih berharga** daripada
disiplin gate merge-dulu pada tahap ini. Ini **sah selama tercatat sebagai pilihan sadar** —
bukan kondisi yang tak disadari selama dua belas sprint (itulah yang T-18/K-25 perbaiki).

**Konsekuensi yang tetap berlaku:** setiap push ke branch **berpotensi langsung ke produksi**
(K-25). Maka disiplin gate — nol perubahan data tanpa izin, nol setelan bersama disentuh, nol
tulis ke tabel tim lain — berlaku pada **setiap push**, bukan hanya merge. Larangan "jangan
merge ke `main` tanpa izin" tetap ada; ia sekadar bukan satu-satunya pintu ke produksi.

**Syarat pembalikan (eksplisit):** begitu **staf di luar tim pengembang memakai sistem ini
secara rutin**, produksi **diarahkan ke `main`**. Urutannya **wajib**: merge dulu, arahkan
kemudian (jangan repoint ke `main` yang belum berisi kode yang sedang berjalan — itu
malah menurunkan versi produksi). Sampai saat itu, "konfirmasi Railway" dan "merge PR" turun
dari **penghalang** jadi **kebersihan** yang bisa dikerjakan kapan saja.

**Status T-18:** **DITUTUP.** Pertanyaan "produksi deploy dari branch atau main?" kini
**diketahui (branch) dan diterima (sadar, dengan syarat pembalikan di atas).**

## K-28 · Peringatan kualitas data: satu baris di titik pakai, sebab di balik pengungkapan (Sprint 5A)
**Latar:** Selama belasan sprint aturannya adalah "peringatan kualitas data jangan pernah
diperhalus, jangan disembunyikan, selalu sertakan sebabnya." Itu benar dan tetap benar untuk
**isi**. Tapi efek kumulatif pada **tampilan** menjadi masalah tersendiri: tiap layar berbunyi
seperti dokumen desain, dan datanya terkubur di bawah penjelasannya. `/audience` memakai
separuh layar untuk banner sebelum satu baris data muncul; detail profil menampilkan delapan
blok "tidak ada data untuk profil ini"; `/segments` mengubur kontrolnya di antara paragraf
tentang PostgREST dan kode `K-`. Ini **membalik penekanan** K-08/K-19 dkk — bukan
membatalkannya — jadi dicatat sebagai keputusan agar orang berikutnya tahu itu disengaja.

**Keputusan (aturan tampilan, bukan aturan makna):**
1. **Satu baris di titik pakai.** Peringatan tampil sebagai satu kalimat pendek tepat di
   sebelah data/kontrol yang dipengaruhinya — bukan blok di puncak halaman.
2. **Sebab panjang di balik pengungkapan.** Penjelasan pindah ke elemen yang bisa dibuka
   (`<details>` "Kenapa?"), tertutup secara bawaan. **Isi tidak dipotong** — hanya tidak lagi
   dibaca paksa.
3. **Maksimum satu banner per layar**, dan hanya untuk peringatan yang berlaku ke SELURUH
   layar, bukan satu bagian.
4. **Nol paragraf batasan teknis di antarmuka.** Kalimat tentang PostgREST, nama migrasi,
   kode keputusan (`K-19`), dan nama berkas `docs/*.md` **dikeluarkan dari layar** dan tetap
   hidup di kode + dokumen. Pemakai butuh tahu **apa** yang terbatas, bukan **kenapa
   arsitekturnya begitu**.
5. **Bagian kosong menyusut.** Banyak blok "tidak ada data untuk profil ini" menjadi satu
   baris yang menyebut sumber-sumber yang tak tersambung; blok penuh hanya untuk sumber yang
   benar-benar berisi.

**Yang TIDAK berubah (tetap dari K-08/K-19/K-06):** pembedaan `0` versus `—`, penandaan asal
data, "tidak terekam" versus "belum terisi", dan gerbang peran. Ini soal **panjang dan
tempat**, bukan makna.

**Uji lima detik (syarat penerimaan):** setelah tiap layar disederhanakan, pemakai harus tetap
menyadari peringatan yang relevan dalam lima detik pertama. Bila sebuah peringatan jadi tak
terlihat sama sekali, ia terlalu jauh disembunyikan — tarik kembali satu tingkat (jadikan baris
terlihat, bukan hanya di dalam "Kenapa?").

**Membalikkan:** bila kelak audiens layar berubah (mis. auditor eksternal yang justru butuh
sebab arsitektural tampil), tinjau ulang butir 4 — tapi butir 1–3 dan 5 adalah higiene tampilan
yang jarang perlu dibatalkan.

## K-29 · Volume audit: satu baris per muat bertahap, tidak digabung (Sprint 5A)
**Latar:** `/audience` kini memuat sepuluh baris per klik "Muat lagi" (bukan sekaligus). Tiap
muatan menulis satu baris audit `list.viewed`. Muncul godaan untuk "menggabungkan" beberapa
muatan menjadi satu baris audit demi menekan volume — sepuluh klik jadi satu catatan.

**Keputusan:** **tetap satu baris audit per muatan.** Tidak digabung, tidak ditunda, tidak
disampel. Tiap kali baris pelanggan tambahan benar-benar diambil ke layar, itu adalah **satu
peristiwa akses** dan dicatat sebagai satu peristiwa.

**Alasan:** audit ini menjawab "siapa melihat data siapa, kapan". Menggabungkan sepuluh
pengambilan menjadi satu baris **mengaburkan justru pertanyaan yang audit itu ada untuk
jawab** — berapa banyak yang benar-benar dilihat dan pada rentang waktu apa. Volume audit yang
sedikit lebih besar adalah harga yang benar untuk kejujuran akses; ia bukan beban yang perlu
"dioptimalkan". Ini konsisten dengan K-11 (aturan audit baca-agregat): peristiwa akses dicatat
apa adanya, bukan versi yang dirapikan.

**Yang TIDAK berubah:** metadata audit tetap tanpa PII dan tanpa nilai query (K-lama); yang
dicatat adalah *bahwa* sekumpulan baris diambil dan berapa banyak, bukan *siapa* barisnya.

**Membalikkan:** bila kelak volume audit jadi masalah operasional nyata (bukan hipotetis),
jalur yang benar adalah **retensi/pemangkasan kategori operasional** (K-sudah-ada soal retensi),
bukan menggabungkan peristiwa di titik tulis. Pangkas yang lama; jangan pernah gagal mencatat
yang baru.

## K-30 · Refresh cermin dijadwalkan (pg_cron harian 03:00 WIB) — larangan "nol jadwal otomatis" dicabut KHUSUS untuk cermin (Migrasi 19)
**Latar:** Sejak Sprint 3A ada larangan keras "nol penjadwalan otomatis" — lahir dari kehati-hatian
terhadap operasi yang berjalan diam-diam tanpa pengawasan (purge audit yang menghapus baris, refresh
yang menutupi kebasian). Larangan itu tetap benar untuk operasi yang **mengubah atau menghapus data**.
Tapi `crm_customer_mirror` adalah snapshot refresh-manual; sumbernya tumbuh harian, dan tanpa jadwal
snapshot itu terus tertinggal sampai seseorang ingat menyegarkannya. Pemilik produk menyetujui jadwal.

**Keputusan:** larangan penjadwalan otomatis **dicabut KHUSUS untuk `crm_refresh_customer_mirror`**.
Migrasi 19 memasang job pg_cron `crm-refresh-customer-mirror`, `0 20 * * *` (= **03:00 WIB**, karena
DB di UTC dan WIB = UTC+7; `0 3 * * *` justru jadi 10:00 WIB — jam sibuk). Job memanggil fungsi refresh
**yang sudah ada** (satu aturan, satu tempat), yang menyegarkan matview + memperbarui `crm_mirror_meta`
secara atomik.

**Yang TIDAK ikut dicabut:** **purge audit tetap TIDAK dijadwalkan** — ia menghapus baris audit, kelas
risiko yang berbeda; penjadwalannya tetap keputusan manusia yang belum diambil. Pencabutan ini sempit,
untuk satu fungsi read-only yang hanya menghitung ulang.

**Yang TIDAK berubah:** refresh manual tetap ada; `refreshed_at` tetap tampil; **ambang basi 24 jam
tetap** (K-tak-berkode di komponen dashboard). Cron **memperkecil peluang** basi, tidak menjaminnya —
job yang gagal diam justru muncul sebagai peringatan basi 24 jam itu, dan `cron.job_run_details`
(status='failed') adalah jejak keduanya.

**Syarat pembalikan:** bila kelak (a) refresh jadi mahal/mengganggu (mis. matview tumbuh besar, lock
non-concurrent terasa), atau (b) cermin diganti mekanisme lain (incremental, trigger), **cabut jadwal
ini** dan tinjau ulang. Sampai itu, satu refresh/hari di jam sepi adalah biaya nihil untuk snapshot yang
tetap dalam ≤24 jam dari sumber hidup.

## K-31 · NIK adalah identitas: gerbang pindah ke `profile.view_contact`; satu tanggal lahir dari rantai prioritas (Sprint NIK-2)
**Status: DISETUJUI + BERLAKU (19 Agu 2026).** Diusulkan sprint sebelumnya (`docs/RENCANA-gerbang-nik.md`),
disetujui pemilik produk, diterapkan di sprint ini. Bagian tab-move + tampil-penuh sudah berlaku sprint
sebelumnya; bagian **gerbang** kini juga diterapkan.

**Latar:** NIK dan turunannya (tanggal lahir, gender, provinsi KTP) + alamat + kontak darurat
tampil di tab **Perilaku** karena blok dikelompokkan per **tabel sumber** (cf_hyrox_participants,
clinic_patients). Itu salah: NIK adalah **identitas** ("siapa orang ini"), bukan perilaku. Selain
itu RFM + program dari `staging_20fit_data` tampil bersama demografi padahal itu **partisipasi**
(perilaku).

**Keputusan yang SUDAH berlaku sprint ini (final):**
1. **Kelompokkan menurut MAKNA, bukan tabel sumber.** NIK + turunan + alamat + kontak darurat
   pindah ke **Demografi** (`IdentitySection`). RFM + program pindah ke **Perilaku**
   (`ImportSection`). Label sumber per-field tetap ("· dari Hyrox / klinik"). Partisipasi event
   Hyrox + kunjungan klinik + booking kelas tetap perilaku di Perilaku.
2. **NIK tampil PENUH, tanpa langkah buka/reveal** (keputusan pemilik produk — setiap orang sudah
   menyerahkan NIK untuk acara/layanan; staf butuh untuk verifikasi identitas).
3. **Nilai NIK TIDAK pernah** masuk `metadata` audit atau log (audit append-only + dipangkas
   terjadwal → menaruh identitas di sana menyalinnya ke tempat yang tak bisa dibersihkan;
   **alasannya BUKAN consent**). Audit tetap satu `profile.viewed` per buka, dengan **jenis**
   field (`sensitive_fields`), bukan nilai.
4. **NIK tidak pernah** di ekspor CSV (`EXPORT_FORBIDDEN_COLUMNS`), dan **tidak pernah** jadi
   kunci pencocokan profil.
5. **Data klinis tetap tersamar/digerbangi** — pembukaan masker **khusus NIK**. **Golongan
   darah** (medis) tetap `view_health`.

**Kualitas NIK dipertahankan (final):** NIK yang panjangnya bukan 16 digit **tidak diurai**
(ditandai, tidak dipaksakan-sebagian); hari-bulan ambigu (day & month ≤12) **ditandai ambigu,
tidak ditebak**; provinsi dari NIK = **tempat KTP diterbitkan, bukan domisili** (label tak boleh
jadi "alamat").

**PERUBAHAN GERBANG (diterapkan sprint ini):** NIK + turunannya (gender, tanggal lahir, provinsi
KTP) + alamat + kontak darurat pindah dari `profile.view_health` ke **`profile.view_contact`** —
gerbang yang sama dengan telepon/email tanpa masker. **Alasan:** `view_health` ada untuk **data
medis** (diagnosa, skrining, riwayat obat, golongan darah); NIK bukan medis, ia **identitas**,
sekelas telepon/email. Ia berakhir di gerbang kesehatan hanya karena tabel asalnya kebetulan
klinik/event — kesalahan yang sama dengan NIK yang tampil di tab Perilaku.
- **Siapa jadi bisa melihat** (saat perannya dibuat): `crm_operator` (CS harian — paling butuh
  untuk verifikasi identitas di telepon), `data_steward` (NIK = kunci dedup terkuat), dan
  `unit_manager` ber-scope (fail-closed sampai tabel scope ada). `analyst` **tetap tidak** (ia
  melihat telepon/email pun tersamar).
- **Efek hari ini: NOL.** Ketiga akun di `crm_user_role` berperan `super_admin` dan sudah melihat
  NIK lewat gerbang lama. Perubahan ini **pernah dijalankan** — baru terasa saat akun peran lain
  dibuat, bukan tidak pernah dijalankan.
- **Golongan darah TETAP `view_health`** — data medis meski satu baris dengan NIK; diperlakukan
  menurut **sifatnya**, bukan tetangganya. Uji khusus: `roles.test.ts` mengunci `canSeeMedical`
  hanya super_admin/crm_manager, dan `enrichment-constants.test.ts` mengunci `gol_darah` di daftar
  MEDICAL (bukan IDENTITY).
- **Satu tempat, dipakai keduanya:** `lib/auth/roles.ts` `canSeeContactPII` / `canSeeMedical` —
  dipakai read layer profil (`enrichment`/`clinic`/`staging`/`demographic`) DAN rute segmen
  (`hasClinicalCriteria` → `canSeeMedical`). Gerbang di **server**: kolom yang tak boleh dilihat
  **tak di-SELECT**, bukan dikirim lalu disembunyikan.
- **Sisa keanggotaan-klinik — kini DIPERBAIKI (T-21, 19 Agu 2026).** Semula: memberi peran
  view_contact identitas klinik + label "· dari klinik" membocorkan bahwa orang itu pasien klinik
  (status kesehatan). Perbaikan: **label dikasarkan** untuk peran tanpa `view_health` → "· dari
  sumber ekosistem" (masih jujur, tak menyebut kliniknya), di satu tempat server
  (`clinicProvenanceLabel`, dikirim sebagai `clinicSourceLabel`; dikunci test). Sinyal KUAT (jumlah
  kunjungan, booking, patient_code) tetap `view_health` (nested `clinical`) — blok "Klinik —
  keterlibatan" tak pernah dirender untuk peran non-medis, jadi bentuk halaman tak berbeda antara
  ada/tidak-ada data klinik. Provenans Hyrox/my20fit diperiksa: bukan data kesehatan, aman.

**SATU tanggal lahir, bukan dua (mengganti default Sprint 3S):** untuk alat CS, dua tanggal lahir
berdampingan memaksa staf memutuskan sendiri di tengah panggilan. Kini ditampilkan **satu nilai**,
paling relevan, lewat rantai prioritas murni + teruji `lib/crm/demographic-pick.ts`:
**NIK → staging → klinik/Hyrox → input staf.** NIK #1 karena posisi digitnya baku (nol ambiguitas
hari-bulan); NIK tak-terurai **turun urutan**, tak dipaksakan. **Konflik tetap bisa ditemukan:**
penanda ringkas "sumber lain berbeda" + perbandingan di balik `<Why>`; tanda ambigu (abad untuk
NIK, urutan hari-bulan untuk lainnya) tetap tampil di nilai terpilih. Rantai yang sama untuk
gender. Provinsi **tidak** ikut rantai — provinsi NIK (tempat KTP) ≠ kota domisili.

**Konsistensi dengan `hasClinicalCriteria`:** filter segmen menggerbangi kriteria klinis via
`canSeeMedical` (helper yang sama dengan read layer profil); golongan darah + klinis tetap
`view_health` di profil DAN segmen — gerbang profil dan filter segmen **tidak diverge**.

**Syarat pembalikan:** bila pemilik produk memutuskan keanggotaan-klinik tak boleh terungkap ke
peran view_contact sama sekali, tarik identitas klinik kembali ke `view_health` (identitas Hyrox/
staging tetap `view_contact`) — ubah `fetchProfileClinic` agar `sensitive` butuh `canSeeMedical`.
Bila kelak NIK perlu gerbang tersendiri (`profile.view_nik`), tambah action baru; jangan gabungkan
dengan telepon/email.

## K-32 · `profile.edit_demographic` — jalur isi demografi, PERLUASAN DI LUAR PRD 17.2 (menunggu Jeff) (Sprint NIK-3)
**Status:** aksi + rute + form **dibangun dan berlaku** di kode; **penetapan RBAC-nya menunggu
persetujuan Jeff**, sama seperti matriks 17.2 aslinya menunggu persetujuannya (10 Agu 2026).

**Latar + koreksi kesalahan (jujur):** matriks RBAC proyek ini sengaja disamakan PERSIS dengan
**PRD 17.2** (15 aksi) dan dikunci oleh `roles.test.ts`. Saat menyetujui aksi tulis demografi, versi
sebelumnya tak menyebut biayanya — padahal beberapa sprint lalu usulan aksi NIK tersendiri justru
ditolak dengan alasan itu. `profile.edit_demographic` **bukan** salah satu dari 15 aksi PRD.
Menambahkannya ke daftar PRD akan merusak properti "matriks mencerminkan PRD".

**Keputusan:** aksi dicatat sebagai **perluasan eksplisit**, TIDAK diselundupkan ke PRD.
- `lib/auth/roles.ts`: `PRD_ACTIONS` (15, = PRD 17.2) DIPISAH dari `EXTENSION_ACTIONS`
  (`["profile.edit_demographic"]`). `ACTIONS = PRD_ACTIONS ∪ EXTENSION_ACTIONS`.
- `roles.test.ts`: uji paritas PRD hanya beriterasi atas `PRD_ACTIONS` terhadap salinan-mesin PRD;
  uji terpisah memastikan `EXTENSION_ACTIONS` **disjoint** dari PRD (tak ada aksi non-PRD
  diselundupkan), dan bahwa `profile.edit_demographic` **tidak** ada di salinan PRD.
- Sel matriks tiap peran diberi komentar "EXTENSION (not PRD 17.2)".

**Peran yang berhak + alasan:** `super_admin`, `crm_manager`, `crm_operator`, `data_steward` =
**allow**; `unit_manager` = own_unit (fail-closed sampai tabel scope ada); `analyst` = deny.
`crm_operator` **disertakan** karena ia staf yang sedang menelepon dan paling mungkin mendapat
tanggal lahir dari pelanggan — mengecualikannya membuat fitur jarang terpakai; dan tulisnya
**fill-empty-only + teraudit** (kewenangan-tulis terendah, tak bisa menimpa). Ketegangan "menulis >
membaca" diakui: bila Jeff memilih pola `consent.edit` yang lebih ketat (steward + manajer saja,
tanpa operator), itu perubahan **satu sel** — `crm_operator` `allow → deny`.

**Jalur tulis (fill-empty-only, dua lapis):**
1. Rute `POST /api/audience/[id]/demographic` menyelesaikan nilai field di **SEMUA sumber** (NIK /
   staging / klinik / isian staf sebelumnya) dan **menolak (409)** menulis field yang sudah terisi.
2. DB: `crm_upsert_profile_demographic` (K-14) sendiri fill-empty-only + atomik + menulis audit
   `profile.demographic_updated`-nya sendiri. Rute **tidak** menulis audit kedua. `*_source =
   'staff_entry'`. `master_customer` **tak disentuh**.

**Verifikasi:** rute unauth → **307 ke /login** (middleware, fail-closed — tak pernah mencapai
handler, tak ada tulis). Gerbang peran dikunci `roles.test.ts` (tak ada sesi non-super_admin untuk
diuji live). Jalur tulis diverifikasi lewat **transaksi RPC yang di-rollback**: RPC jalan tanpa
error lalu di-abort; sesudahnya `crm_profile_demographic` = **0 baris**, audit demografi = **0** —
nol baris uji tertinggal di produksi.

**Syarat pembalikan:** ini menunggu Jeff. Bila ditolak, hapus `EXTENSION_ACTIONS` + sel matriks +
rute + form (aksi tak dipakai di tempat lain). Bila disetujui, catat tanggal persetujuan di sini.

## K-33 · Halaman auth mengikuti preferensi tema pengguna — PRD §18.8 "login selalu gelap" DICABUT; varian logo ikut tema (Sprint auth-UI, 2026-08-21)

**Latar (PRD §18.8):** aturan asli menetapkan halaman login **selalu tema gelap dengan logo putih**.
Ketiga halaman auth (`/login`, `/forgot-password`, `/reset-password`) memaksa `data-theme="dark"` di
wrapper-nya.

**Keputusan (disetujui pemilik produk):** ganti jadi **halaman auth mengikuti preferensi pengguna**
(cookie `20fit_theme`, sama seperti seluruh app). Alasannya bukan sekadar konsistensi: alat internal
harian sebaiknya **menghormati preferensi** orang yang memakainya tiap hari, bukan memaksa satu
tampilan. Pengalih tema + bahasa ditambahkan ke **sudut atas** ketiga halaman — memakai komponen
`ThemeToggle` + `LangSwitcher` yang **sudah ada** (lewat cookie), bukan sistem baru.

**Konsekuensi WAJIB — varian logo ikut tema.** `20fit-logo-white.png` punya cincin gelap di sekitar
titik merah yang **hilang di latar terang** (PRD §18.1). Maka logo tak boleh lagi dipaku "putih":
**gelap → `20fit-logo-white.png`, terang → `20fit-logo-color.png`** (`components/brand/theme-logo.tsx`
merender **kedua** varian dan meng-toggle lewat CSS `[data-theme]` di `globals.css` — instan, tanpa
reload, karena pengalih tema membalik `<html data-theme>` tanpa muat ulang). Tiap varian
mempertahankan **rasio intrinsiknya sendiri** (putih 2405×677, warna 285×73) — jangan satu rasio
untuk keduanya (logo gepeng — bug lama, jangan diulang).

**Cakupan:** hanya UI. Alur auth (server actions, `verifyOtp`, pembedaan error kredensial-vs-koneksi)
**tak disentuh** — baru terverifikasi bekerja di produksi 2026-08-21. Semua teks pra-auth masuk
registry i18n (dua bahasa; dijaga parity TypeScript + `coverage.test.ts`); tombol lihat-password
tak menyimpan state terlihat antar sesi (risiko bahu-orang-lain).

**Syarat pembalikan:** kembalikan `data-theme="dark"` + `BrandLogo variant="white"` di ketiga halaman
dan hapus `AuthControls`/`ThemeLogo`/`PasswordInput` (dipakai hanya di halaman auth). Nol perubahan
data, nol sentuhan alur auth.

## K-34 · NIK → provinsi TIDAK diturunkan; "terjemahkan NIK" sudah terpenuhi via field eksplisit (Sprint identitas-A+, 2026-08-21)

**Latar:** instruksi pemilik "NIK tidak perlu utuh, diterjemahkan jadi data profil". Yang secara teknis
bisa "diterjemahkan" dari NIK hanya **tiga** hal: gender, tanggal lahir (keduanya terkodekan di digit
7–12), dan **wilayah** (6 digit pertama = kode provinsi/kabupaten/kecamatan saat KTP diterbitkan).

**Keputusan (disetujui pemilik):** **jangan turunkan apa pun dari NIK.**
- **Gender & tanggal lahir** sudah ada dari **field eksplisit** yang diisi sendiri pesertanya
  (`rc_ticket_invites.form_data.participants[]`: gender 819/819, DOB 752/819) — lebih akurat daripada
  turunan NIK, dan **field eksplisit selalu menang atas turunan**. Maka instruksi "terjemahkan NIK"
  **sebagian besar sudah terpenuhi tanpa menyentuh NIK sama sekali**.
- **Wilayah (provinsi KTP): SKIP.** (a) tak ada tabel referensi wilayah di DB — harus membuat & merawat
  peta kode-provinsi statis; (b) nilainya "domisili saat KTP terbit", belum tentu kota tinggal kini —
  nilai CRM tipis; (c) menurunkannya berarti **menyentuh NIK** (walau transien), menambah permukaan
  risiko demi field marginal. Tak sepadan.

**Ditegakkan (Migrasi 23):** NIK, golongan darah, kontak darurat, waiver kesehatan → **nol** di kolom,
jsonb, metadata audit, dan ekspor — di cermin, `crm_identity_candidate`, maupun `crm_profile_demographic`.
Allowlist ekstraksi dari form peserta = **name / email / phone / gender / date_of_birth saja**.

**Konsisten dengan K-31** (NIK = identitas, gerbang `view_contact`): K-31 mengatur *tingkat gerbang* bila
turunan NIK ADA; K-34 memutuskan untuk sprint ini **tak membuat** turunan wilayah sama sekali. Provenance
`crm_profile_demographic.province_source` (nilai `backfill_nik_region`) tetap ada sebagai jalur sah bila
kelak diaktifkan — tak dipakai sekarang.

**Syarat pembalikan:** bila pemilik ingin wilayah juga, aktifkan derivasi **2 digit pertama** (kode
provinsi → nama provinsi, peta statis 34 entri), provenance `backfill_nik_region`, NIK tetap **tak pernah
disimpan** (baca-hitung-buang dalam satu ekspresi, tak ke kolom/jsonb/audit). Catat tanggal persetujuan di sini.

## K-35 · `normalize_email` adalah kanon email tunggal, sejajar `crm_norm_phone` (K-06) (Sprint identitas-A+, 2026-08-21)

**Latar:** Migrasi 23 sempat membawa DUA kanon email dalam satu berkas — flag matview memakai
`lower(btrim(email))` (disalin verbatim dari definisi cermin lama), backfill §6 memakai `normalize_email()`.
Keduanya berbeda: `normalize_email` juga memvalidasi format dan menolak placeholder
(`anonymous@anonymous.com`, `-`, `none`) → NULL. Kelas divergensi yang sama dengan kanon telepon yang
disatukan di Migrasi 17 (K-06).

**Keputusan (disetujui pemilik):** **`normalize_email` = kanon email tunggal** untuk pencocokan identitas.
Semua subquery FLAG di cermin (`has_hyrox`, `has_my20fit`, `has_arena`, `has_gym`, `has_clinic`, dan 6 flag
baru) diseragamkan dari `lower(btrim())` ke `normalize_email()`. **Jangan pakai `lower(btrim())` lepas untuk
email di kode atau SQL baru** — pakai `normalize_email` (SQL) / `normalizeEmail` (TS), sejajar
`crm_norm_phone` / `normalizePhoneID` untuk telepon (K-06).

**Kenapa sekarang:** hari ini hasilnya **identik** (diukur: master 0 placeholder / 0 beda dari `lower(btrim)`;
event_transaction 4.790 baris, hanya 2 ditolak `normalize_email`, 0 placeholder). Justru karena identik,
menyatukan **gratis** & **terverifikasi** — bila ditunda, perbaikan nanti akan menggeser angka dan sulit
dibedakan dari perubahan data. Verifikasi wajib pra-apply: keenam flag baru tetap **1.314 / 248 / 175 / 114 /
77 / 118** dan sidik jari 21 kolom lama tak berubah; satu bergeser → berhenti (asumsi salah, bukan kosmetik).

**Detail teknis penting:** `normalize_email` bisa mengembalikan NULL, dan NULL di dalam `IN (…)` mengubah
flag dari `false` jadi `NULL`. Maka tiap subquery difilter `WHERE normalize_email(x) IS NOT NULL` (bukan
`WHERE x IS NOT NULL`) supaya daftar IN bebas-NULL dan flag tetap boolean.

**Pengecualian tercatat:** join staging `st` di cermin (`lower(btrim(staging."Email"))` → `staging_rfm`,
`staging_dob`, `is_fitco_member_matched`) **TIDAK** ikut diubah di sprint ini — itu jalur enrichment
fitco/rfm/dob, bukan "flag", disimpan verbatim. Menyatukannya butuh verifikasi terpisah (fitco tetap
67.653); diangkat ke pemilik, menunggu keputusan.

**Syarat pembalikan:** rollback Migrasi 23 mengembalikan definisi cermin migrasi 16 (kanon `lower(btrim)`
pra-K-35) — revert penuh yang disengaja. K-35 sebagai *aturan* (kanon tunggal untuk kode baru) tetap berlaku
terlepas dari status Migrasi 23.

## K-36 · Consent bukan gerbang — unsubscribe satu-satunya penentu boleh-dihubungi (Sprint evaluasi lingkup)
**Latar:** Pemilik produk menyatakan ulang kebutuhan sistem (`docs/KEBUTUHAN-SISTEM.md`, 24 Agu
2026): seluruh data di Supabase milik 20FIT, sah, dan penggunanya **sudah mengizinkan** untuk
dihubungi — "izin dan legalitas bukan hal yang perlu dipersoalkan sistem ini." Yang menentukan
siapa **tidak** boleh dihubungi hanyalah **unsubscribe**.

**Keputusan:** consent **berhenti menjadi gerbang**. Setiap pengguna dianggap boleh dihubungi.
Satu-satunya yang menahan kontak adalah baris **`crm_suppression` aktif** (daftar unsubscribe).
Ini menyelaraskan dengan keadaan fungsional yang **sudah** berlaku: `crm_contactable_counts()`
mengembalikan 82.253 untuk kedua purpose (seluruh pool, nol suppression). Yang berubah sprint ini
hanyalah **bingkai dan bahasa**, bukan angka atau logika.

**Yang TIDAK berubah:**
- **`crm_consent` (408.119 baris) TETAP** — catatan sah tentang dasar hukum & sumbernya, baca-
  saja. Menghapusnya tak bisa dibatalkan; manfaat penghapusan hanya kerapian konseptual (D-1).
- **Aturan "suppression menang" TETAP** dan kini **satu-satunya aturan yang tersisa**, jadi makin
  penting: `isContactableForPurpose` + `crm_contactable_counts` tetap anti-join ke suppression
  aktif (K-26). Nol jalur keluar boleh melewati pemeriksaan suppression.
- **Audit pengiriman TETAP** — tiap pengiriman meninggalkan catatan (bukan demi kepatuhan, tapi
  agar kampanye gagal bisa ditelusuri & tak dikirim dua kali).

**Yang berubah (frame + bahasa, nol perubahan angka/logika):**
- `/consent` dibingkai ulang: **daftar unsubscribe** jadi utama; register consent jadi arsip
  dasar hukum baca-saja. Label section, subtitle, dan warn di-reframe.
- Kartu "Bisa dihubungi" di dashboard: hint berubah dari "consent aktif − suppression" jadi
  **"seluruh pool − yang berhenti berlangganan"**.
- Bahasa yang menyajikan consent sebagai penghalang disapu di /consent, dashboard, dan /quality
  (caveat "punya identifier ≠ bisa dihubungi" kini menunjuk unsubscribe, bukan consent).

**Syarat pembalikan (eksplisit):** bila kelak **dasar hukum kembali menjadi pembeda** (mis.
regulasi berubah, atau kanal opt-in per-orang diaktifkan), gerbang consent **dinyalakan lagi dari
tabel yang sama** (`crm_consent` masih utuh) — kembalikan `isContactableForPurpose` untuk
memeriksa consent aktif selain suppression, dan reframe balik bahasanya. Tidak ada data yang
hilang untuk pembalikan itu; hanya frame yang berubah.

## K-37 · Fondasi separuh "menghubungi" — CRM berdiri sendiri, tiru skema tim lain, gerbang dibuka (contacting-half)
**Latar:** pemilik produk menerapkan jawaban (kanal WA, pop-up ditunda, fitpoint kontrak-saja,
"tidak kembali" ditunda, gerbang ekspor dibuka) dan meminta fondasi separuh "menghubungi".

**Keputusan-keputusan (dengan syarat pembalikan):**

1. **CRM berdiri sendiri di `crm_*`, TIDAK memakai tabel kirim/template tim lain.**
   **Alasan yang harus dicatat BUKAN kepemilikan tabel, melainkan KUNCI YANG TIDAK SAMA**
   (dipertegas pemilik produk, 24 Agu): `my20fit_message_log.user_id` menunjuk **auth my20fit**,
   sedangkan pool CRM berkunci **`master_customer.customer_id`**, dan **hanya ~47 dari 82.253
   profil punya keduanya**. Memakai log itu berarti **99,9% pengiriman CRM tak punya tempat
   dicatat** — bukan sekadar "tabel milik tim lain". (Tabel-tabel itu juga nol baris / rancangan
   belum diwiring, tapi kunci-beda itulah yang menutup opsi pakai-bersama.) **Skema
   `my20fit_message_log` tetap ditiru** untuk `crm_message_log` — berkunci `customer_id` —
   (idempotency_key, provider_message_id, status, cap waktu siklus, unsubscribed_at, language):
   meniru bentuk baik, bukan membuat yang berbeda (anti "satu-aturan-dua-implementasi"). Pemilik
   produk **menyetujui CRM berdiri sendiri** (24 Agu). **Pembalikan:** hanya bila kelak ada kunci
   pemetaan yang mencakup seluruh pool CRM di satu log bersama — keputusan lintas-tim, bukan kode.

2. **Unsubscribe pakai jalur suppression yang ADA (3H), bukan jalur kedua.** Halaman publik
   `/unsubscribe` + token HMAC bertanda tangan (customer_id + kind, PII tak masuk URL) →
   `crm_record_suppression` (reason `user_request`, source `unsubscribe_link`). Suppression menang
   di tiap jalur keluar tetap berlaku. **Pembalikan:** tak ada; jalur tunggal itu inti.

3. **Template: kosakata variabel TERTUTUP, divalidasi saat SIMPAN.** `{{var}}` di luar
   `TEMPLATE_VARIABLES` ditolak saat simpan, bukan saat kirim (gagal saat kirim ke 10.000 orang
   mahal). Riwayat versi = INSERT append (yang dipakai kemarin harus terbaca apa adanya). Storage
   = migrasi `crm_message_template` **GATED, ditunjukkan belum dijalankan** (`RENCANA-template-simpan.md`);
   inti murni (`lib/crm/template.ts`) sudah dibangun & diuji. **Pembalikan:** tambah variabel =
   edit satu daftar; drop tabel = revert bersih (tabel kosong).

4. **Gerbang ekspor dibuka untuk `crm_operator` ≤ ambang** (`approval`→`allow`); > ambang tetap
   `super_admin`/`crm_manager`; `unit_manager` tetap `approval` (fail-closed, tabel scope belum
   ada). Suppression tetap dikecualikan dari tiap ekspor (4A). **Pembalikan:** kembalikan ke
   `approval` bila alur persetujuan dibangun.

5. **WA = permukaan status (env var Railway), fitpoint = kontrak dokumen, pop-up = ditunda.** Nol
   tempat kosong yang tampak siap. **Pembalikan:** buka pop-up hanya bila aplikasi 20FIT bisa
   menerima pesan; bangun pemicu fitpoint hanya bila sumber saldo+kedaluwarsa (tanggal nyata) ada.

## K-38 · Jalur kirim manual — log, hash identitas, idempotensi deterministik, gerbang pra-luncur (contacting-half, langkah kirim)

Skema `crm_message_log` **disetujui dengan dua koreksi**; jalur kirim dibangun dan diuji; kirim
nyata ke pelanggan tetap diblokir prasyarat.

1. **`identity_hash` (HMAC berkunci), bukan alamat mentah.** Log tumbuh satu baris per kirim,
   dibaca layar Messages, tak pernah dipangkas — menyimpan email/telepon mentah menjadikannya
   salinan kedua daftar kontak + pintu belakang masking. Hash berkunci cukup untuk **mencocokkan**
   (bounce, "pernah dikirimi?") tapi tak untuk **dibaca**; "ke siapa" dijawab `customer_id` lewat
   masking `view_contact` yang sudah ada. Dikecualikan ekspor, tak pernah dirender.
   (`lib/crm/identity-hash.ts`.) **Pembalikan:** kolom aditif; tabel mulai kosong.

2. **`idempotency_key` deterministik `{campaign_id}:{customer_id}:{channel}`.** Bentuk acak per
   percobaan membuat indeks unik tak menahan apa pun. Karena turunan murni kampanye+penerima+channel,
   **jalankan-ulang menghasilkan kunci sama** → penerima yang sudah terkirim dilewati. Diuji dengan
   **pemutusan sungguhan** (jalankan sebagian → ulang penuh → nol kirim ganda), bukan sisip dua baris
   kembar (`lib/crm/send-run.test.ts`). Bentuk dicatat di `comment on column`.

3. ~~**Aksi audit `export.campaign_sent` — prefiks `export.` YANG SUDAH ADA.**~~ **DIBALIK 2026-08-24
   (K-39).** Refleks "pakai ulang prefiks" salah di sini: mengirim BUKAN mengekspor. Famili sendiri
   `campaign.sent` — lihat K-39. Satu baris audit per RUN tetap berlaku.

4. **Sebab gagal DIBEDAKAN (pelajaran reset).** `invalid_address` / `hard_bounce` /
   `provider_rejected` / `unknown` sebagai kolom kelas satu (`failure_cause`), plus batas harian =
   **deferred** (bukan gagal) dan auto-stop bounce 5%. Menyatukan jadi satu status menyembunyikan
   bug berikutnya persis seperti reset.

5. **Suppression diperiksa SAAT KIRIM** (awal run, bukan saat segmen dihitung); **tautan unsubscribe
   = prasyarat keras** (run batal sebelum kirim bila tak ada); **batas harian dari log**, bukan
   penghitung terpisah.

6. **Gerbang pra-luncur di KODE, bukan konvensi.** `CAMPAIGN_SEND_ENABLED` off → hanya alamat
   internal `@20fit.id` yang dikirimi; alamat pelanggan **ditahan** (tak dikirim, tak dilog) sampai
   token Mailtrap dirotasi + DNS diatur (`lib/crm/send-gate.ts`). **Pembalikan:** flip env setelah
   dua prasyarat beres.

**Yang TIDAK dibangun (jujur):** form susun-dan-kirim di layar Campaigns menunggu (a) segmen bisa
disimpan (`RENCANA-simpan-segmen`, belum) dan (b) dua prasyarat kirim. Layar Campaigns kini adalah
konsol yang menampilkan alur + batas + blok pra-luncur; layar Messages membaca log apa adanya
(termasuk `skipped_suppressed` dan `failed`). Kirim internal **belum diuji live** dari lingkungan
ini — token bocor tak boleh dijalankan, dan app tak berjalan di sini.

## K-39 · Aksi audit kirim = famili `campaign.%` sendiri, bukan `export.%` (koreksi K-38 #3)

Membalik K-38 #3 **selagi murah** (nol baris audit memakai `export.campaign_sent`, nol baris
`crm_message_log` — diverifikasi 2026-08-24). Refleks memakai ulang prefiks yang ada (benar 5×
sebelumnya) di sini **satu langkah terlalu jauh**: `export.%` menjawab "data apa yang keluar sebagai
BERKAS"; sebuah pengiriman kampanye adalah keputusan kontak keluar, bukan berkas. Menaruhnya di
`export.%` membuat layar audit yang menyaring "ekspor" menampilkan pengiriman. Test paritas lama
lulus — tapi yang lulus **klasifikasi retensinya, bukan maknanya**.

Perbaikan mengikuti presedent **K-09** (`profile.demographic_updated`): famili baru `campaign.%`
ditambahkan ke denylist kepatuhan **dengan benar** — fungsi `crm_purge_audit_log` (create-or-replace),
`lib/crm/retention-policy.ts` `COMPLIANCE_RULES`, dan test paritas **bergerak bersama satu commit**;
parity test kini membaca berkas migrasi baru. `campaign.%` (bukan `message.%`) karena granularitas
audit adalah **per RUN kirim (satu kampanye)**, bukan per pesan — telemetri per-pesan ada di
`crm_message_log`, bukan audit. Aksi persis: **`campaign.sent`**, dikunci `send-constants.test.ts`.

**Status:** SQL migrasi **DITUNJUKKAN, BELUM DIJALANKAN** (`…150000_crm_purge_audit_log_add_campaign_compliance.sql`)
— menunggu konfirmasi untuk apply. Aman ditunda: `campaign.%` toh tak di allowlist operasional, jadi
tak pernah dipangkas walau denylist DB belum diperbarui; kode + berkas + test sudah sinkron.
**Pembalikan:** hapus baris `campaign.%` di kedua blok + `COMPLIANCE_RULES` + kembalikan parity target.

## K-40 · Segmen TERSIMPAN — 3M diperbarui (bukan dibatalkan): simpan KRITERIA, bukan daftar orang

Sprint 3M sengaja membuat segmen **ephemeral** karena segmen tersimpan yang basi menargetkan orang
yang sudah tak memenuhi kriteria. **Alasan itu tetap berlaku.** Yang berubah: mengirim kampanye butuh
menyebut segmen mana yang dipakai, dan `crm_message_log.campaign_id` sudah mengandaikan segmen punya
identitas. Jadi 3M **diperbarui**, dengan penjaga yang mempertahankan alasannya:

- **Simpan kriteria (pohon filter tervalidasi jsonb), BUKAN daftar anggota.** Anggota **dihitung
  ulang saat dipakai** → segmen bulan lalu yang dikirimi hari ini menargetkan siapa yang memenuhi
  kriteria **hari ini** (inilah yang menjaga alasan 3M). Jumlah anggota **tak pernah** kolom tersimpan;
  ditampilkan dengan **penanda kesegaran** (LARANGAN: jangan tampilkan angka beku yang terlihat hidup).
- **Gerbang klinis tidak boleh dimutari.** Segmen dengan kriteria klinis diberi flag `requires_clinical`
  saat simpan; jalur PAKAI (hitung/kirim) tetap memeriksa `view_health` peran yang memakai — jadi tak
  bisa dibuat peran berwenang lalu dipakai peran lain untuk memutari gerbang.
- **Gerbang peran** mengikuti yang ada untuk segment builder (`segment.build`).

**Status:** SQL `crm_segment` **DITUNJUKKAN, BELUM DIJALANKAN** (`docs/RENCANA-simpan-segmen.md`).
Form susun-kampanye (TUGAS 3) menunggu tabel ini di-apply. **Pembalikan:** `drop table crm_segment` —
aditif, nol data pelanggan (hanya kriteria + metadata).
