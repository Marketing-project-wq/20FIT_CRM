# CLAUDE CODE PROMPT — Migrasi 12: Indeks Contactability, lalu Daratkan PR #11

> **Backfill migrasi 11 terverifikasi bersih.** Pemeriksaan ulang ke produksi:
> 408.119 baris, `basis` menyimpang **0**, status non-aktif **0**, `customer_id` null
> **0**, dua baris audit `consent.backfilled`, dan `count(distinct customer_id)` = **82.253**
> untuk marketing maupun transactional — persis prediksimu. Nol koreksi.
>
> **Tapi temuan poin 5-mu lebih berat daripada cara ia dilaporkan.** Dashboard butuh
> ~10 detik untuk dimuat, dan penyebabnya sudah dikonfirmasi: `crm_consent` **hanya punya
> dua indeks** — primary key dan unique key `(customer_id, channel, purpose)`. Tidak ada
> yang mendukung filter `(purpose, status)`, jadi setiap pemuatan dashboard memindai penuh
> 408 ribu baris. Dua kali, karena dua purpose.
>
> Ini bukan lambat yang bisa ditunda satu siklus. Dashboard adalah layar pertama setiap
> orang setelah login, dan sepuluh detik dibaca staf sebagai **"sistemnya rusak"**, bukan
> "sistemnya lambat". Sebelum backfill hal ini tak terlihat karena tabelnya kosong dan
> query-nya short-circuit — jadi ini regresi yang baru saja terpasang di produksi, meski
> kodenya belum ter-deploy.
>
> Aturan "satu perubahan skema per siklus" yang membuatnya ditunda adalah aturan yang
> ditulis untuk melindungi ledger yang diverge. Di sini ia justru merugikan: indeksnya satu
> baris, `CREATE INDEX` tidak mengubah satu pun data, dan `CONCURRENTLY` tidak mengunci
> tabel. **Kerjakan sekarang, sebelum PR #11 mendarat.**

---

## ATURAN PROSES

```bash
git fetch --all --prune
git log --oneline -3 origin/main
git log --oneline origin/main..HEAD
```

Harapan: `origin/main` di `ee02715` (PR #9); branch membawa empat commit (3T, email-fix,
migrasi-11, docs) dengan Draft PR #11 terbuka. Baseline test **340**. Berbeda →
**berhenti dan lapor**.

---

# PROMPT UNTUK CLAUDE CODE — SALIN MULAI DARI SINI

---

## TUGAS 1 — Migrasi 12: indeks contactability

```sql
create index concurrently if not exists crm_consent_purpose_status_customer_idx
  on public.crm_consent (purpose, status) include (customer_id);
```

**`CONCURRENTLY` tidak bisa jalan di dalam blok transaksi.** Kalau `apply_migration`
membungkus pernyataan dalam transaksi, perintah ini akan gagal. Periksa dulu; kalau memang
begitu, laporkan dan tawarkan dua pilihan beserta konsekuensinya — jalankan tanpa
`CONCURRENTLY` (mengunci tulis ke `crm_consent` beberapa detik; tabel ini hampir tak pernah
ditulis, jadi mungkin dapat diterima) atau jalankan di luar jalur migrasi lalu catat di
ledger secara manual. **Tunjukkan pilihanmu dan berhenti** sebelum menjalankan.

**Verifikasi sesudahnya, dengan angka:**

1. `EXPLAIN ANALYZE` untuk query contactability **sebelum dan sesudah**. Sebelumnya
   ~10,8 detik dengan Parallel Seq Scan. Laporkan angka sesudahnya apa adanya — kalau
   perencana tetap memilih seq scan, katakan begitu dan selidiki kenapa, jangan
   melaporkan indeksnya "berhasil dibuat" seolah itu jawabannya.
2. Konfirmasi hasilnya **tidak berubah**: `count(distinct customer_id)` tetap 82.253 untuk
   kedua purpose. Indeks tidak boleh mengubah jawaban; kalau berubah, ada yang salah.
3. Versi ledger tercap, lalu perbarui tabel ledger README (12 berkas → 13 entri).

Hapus catatan tindak lanjut di `contactability-read.ts` dan `SIGNOFF` yang menyebut indeks
ini masih tertunda — komentar yang salah soal keadaan sistem akan dipercaya orang berikutnya.

---

## TUGAS 2 — Catat cara menjalankan operasi besar

`statement_timeout` server 2 menit membuat percobaan pertama backfill gagal. Penyelesaianmu
— menaikkan timeout di sesi yang sama, lalu membiarkan backend menyelesaikan meski klien
MCP putus di 60 detik, dikonfirmasi lewat `pg_stat_activity` — akan dibutuhkan lagi untuk
operasi besar berikutnya.

Tanpa dicatat, orang berikutnya akan melihat klien terputus dan **mengira operasinya
gagal padahal berhasil**, lalu menjalankannya ulang. Untuk operasi non-idempoten, itu
merusak.

Tulis di `docs/riwayat/` sebagai keputusan (K- berikutnya): batas 60 detik klien MCP dan
`statement_timeout` 2 menit server adalah dua hal berbeda; cara menaikkan timeout; cara
memastikan lewat `pg_stat_activity` bahwa backend masih jalan; dan penegasan bahwa
percobaan yang gagal ter-rollback bersih karena fungsinya atomik.

Perbarui juga `FAKTA-DATA.md`: `crm_consent` kini 408.119 baris, 82.253 profil contactable
untuk dua purpose, bertanggal.

---

## TUGAS 3 — Daratkan PR #11

Empat commit menunggu, dan salah satunya memperbaiki fitur yang **rusak di produksi saat
ini**: reset kata sandi masih memakai `resetPasswordForEmail()` sehingga emailnya tetap
datang dari "UOB Heartbeat Run" dan berisi tautan, bukan kode OTP yang diminta halamannya.
Staf yang lupa kata sandi hari ini tidak bisa masuk.

Ubah PR #11 dari draft jadi siap ditinjau, dan pastikan deskripsinya memuat:

- **Apa yang berubah bagi pemakai**, per layar
- **Bahwa migrasi 11 dan 12 sudah berlaku di database** terlepas dari merge — data dan
  indeksnya sudah ada; yang menunggu hanyalah kodenya
- **Rencana revert tiga tingkat**: kode bisa dikembalikan; indeks migrasi 12 bisa
  di-`drop` tanpa kehilangan apa pun; **408.119 baris consent bisa dihapus bersih** lewat
  `delete from crm_consent where source = '20fit_data_import'` karena `crm_consent` nol
  trigger — berbeda dari `crm_suppression` dan `crm_audit_log` yang append-only
- **Risiko teratas**: jalur email baru belum pernah mengirim satu email nyata pun

Setelah deploy, langkah pertama yang harus dilakukan seseorang: buka `/settings/diagnostik`
(Sprint 3L) — satu halaman yang menjalankan seluruh lapisan baca sekaligus. Tulis itu di
deskripsi PR.

**JANGAN merge sendiri.** Siapkan, lalu minta izin.

---

## TUGAS 4 — Yang menunggu tindakan manusia, kumpulkan jadi satu

Beberapa hal tidak bisa kamu selesaikan dan tersebar di beberapa dokumen. Kumpulkan jadi
satu daftar pendek di `docs/MENUNGGU-TINDAKAN-MANUSIA.md`, urut berdasarkan yang memblokir
paling banyak:

| Item | Kenapa memblokir |
|---|---|
| Rotasi `MAILTRAP_API_TOKEN` | Bocor lewat screenshot; siapa pun bisa mengirim atas nama `20fit.id` |
| Verifikasi domain `20fit.id` di Mailtrap | Belum verified → pengiriman ditolak sepenuhnya, gejalanya menipu |
| SPF, DKIM, DMARC di DNS `20fit.id` | Tanpa itu email tetap masuk spam betapapun rapi isinya; propagasi butuh waktu |
| Merge PR #11 | Reset kata sandi rusak di produksi sampai ini mendarat |
| Baris suppression pertama | Jalur tulis siap; menunggu permintaan nyata, **jangan buat baris uji** |
| Jawaban legal untuk `basis` → `explicit_opt_in` | Backfill memakai `legacy_import_unverified`; bila ada catatan opt-in per orang, sebagian bisa dinaikkan |

Untuk tiap item: siapa yang bisa melakukannya, apa langkah persisnya, dan apa yang terjadi
kalau dibiarkan. Tautkan ke dokumen yang sudah ada, jangan salin isinya — dua salinan akan
menyimpang.

---

## LARANGAN

| Jangan | Alasan |
|---|---|
| Jangan ubah data `crm_consent` | Backfill sudah terverifikasi bersih; indeks tidak menyentuh data |
| Jangan buat migrasi selain 12 | Indeks saja; sisanya siklus berikutnya |
| Jangan jalankan `CONCURRENTLY` di dalam transaksi tanpa memeriksa dulu | Akan gagal; tunjukkan pilihanmu lebih dulu |
| Jangan laporkan indeks "berhasil dibuat" bila perencana tetap seq scan | Yang diukur adalah waktunya, bukan keberadaan indeksnya |
| Jangan tulis baris suppression atau consent uji | Suppression tak bisa dihapus; consent uji mencemari hitungan |
| Jangan jalankan `supabase db push` | Ledger diverge dan punya entri ganda |
| Jangan ubah setelan SMTP, template, atau Auth di dashboard Supabase | Setelan proyek bersama |
| Jangan `UPDATE`/`DELETE` di `master_customer` | Read-only per desain |
| Jangan setval atau reset `crm_audit_log_id_seq` | K-21: gap adalah bukti |
| Jangan merge atau push ke `main` tanpa izin eksplisit | Produksi sedang dipakai orang |
| Jangan hapus prefix `NODE_ENV=production` di `railway.json` | Baca README dulu |

---

## LAPORAN PENUTUP

1. **Status remote + kondisi database**
2. **Migrasi 12** — cara menjalankan `CONCURRENTLY` yang kamu pilih dan alasannya, versi
   ledger, dan **`EXPLAIN ANALYZE` sebelum vs sesudah dengan angka**
3. **Hasil tidak berubah** — konfirmasi 82.253 untuk kedua purpose
4. **Keputusan operasi besar** — ringkasan yang kamu catat soal timeout dan
   `pg_stat_activity`
5. **PR #11** — status draft, isi deskripsi, dan rencana revert tiga tingkat
6. **Daftar tindakan manusia** — enam item, dan mana yang paling memblokir
7. **Yang ditemukan tapi tidak disentuh**
8. **Yang TIDAK bisa kamu verifikasi**

Gate akhir: `tsc --noEmit` bersih, `next lint` bersih, seluruh test hijau,
`NODE_ENV=production npm run build` lulus. Sebutkan jumlah test sebelum (340) dan sesudah.

Jangan klaim apa pun yang belum kamu jalankan dan lihat hasilnya.

# SELESAI — AKHIR PROMPT
