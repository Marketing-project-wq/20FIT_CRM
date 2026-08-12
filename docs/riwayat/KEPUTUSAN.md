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
**Migrasi 11/12.** README menyatakan "auto-deploy on `main`" dan "push ke `main` memicu
deploy" — tapi bukti menunjukkan **kode branch melayani produksi** (aksi audit yang hanya ada
di branch tertulis oleh produksi; `main` bahkan tak menulis audit reset). → T-18.

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
