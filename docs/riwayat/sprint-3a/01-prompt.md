# CLAUDE CODE PROMPT — Sprint 3A: Peluncuran Internal untuk Evaluasi Tim

> **Tujuan sprint ini: tim bisa memakai sistemnya dan menilai sendiri apa yang perlu ditambah, diubah, atau dibuang.**
>
> Yang diluncurkan bukan CRM lengkap — melainkan aplikasi yang **bisa dievaluasi**: login berfungsi, peran berjalan, dan audience pool bisa dibuka dengan data asli 82.253 profil (baca saja).
>
> **Yang TIDAK diluncurkan, dan alasannya bukan kehati-hatian berlebihan:**
>
> | Ditahan | Alasan |
> |---|---|
> | Pengisian tabel `crm_*` dengan data pelanggan | Sumbernya (`staging_20fit_data` 88.536 baris PII, `clinic_*`) masih RLS OFF. Ini item PRD 17.3 yang dimiliki tim, bukan aturan buatan sprint ini |
> | Migrasi 3 `crm_consent` | Menunggu sign-off legal |
> | Pengiriman WhatsApp/email | Tanpa consent register, tidak ada dasar hukum untuk kontak marketing. Ini penghalang launch di PRD 16.3 |
>
> Ketiganya **tidak menghalangi** peluncuran ini. Audience pool membaca `master_customer` yang sudah ada — bukan menyalin data ke tabel baru.

---

## PRASYARAT MANUAL (sebelum prompt dijalankan)

Buat dua user di **Supabase Dashboard → Authentication → Users → Add user**, centang **Auto Confirm User**:

1. `tifany@20fit.id`
2. `marketing@20fit.id`

Tanpa ini, seed peran akan gagal — `crm_user_role.user_id` ber-FK ke `auth.users`.

---

# PROMPT UNTUK CLAUDE CODE — SALIN MULAI DARI SINI

Sprint 2B selesai: 6 tabel `crm_*` terpasang, terverifikasi, nol data. Sekarang **membuat sistemnya bisa dipakai dan dievaluasi tim**.

Aturan gate dari sprint sebelumnya berlaku penuh. Ini menyentuh `main` dan produksi, jadi lebih ketat, bukan lebih longgar.

---

## TUGAS 1 — Selaraskan matriks izin ke PRD Bagian 17.2

Matriks di `lib/auth/roles.ts` sekarang adalah **inferensi** ditambah empat koreksi saya. Jeff memutuskan: ikuti PRD. Ganti dengan matriks resmi di bawah.

Perhatikan matriks PRD memecah aksi **per ambang** (`≤ threshold` / `> threshold`), bukan sekadar per resource. Strukturnya harus mengakomodasi itu.

| Aksi | super_admin | crm_manager | crm_operator | unit_manager | analyst | data_steward |
|---|---|---|---|---|---|---|
| View profile list | ✓ | ✓ | ✓ | own unit | **masked** | ✓ |
| View contact details | ✓ | ✓ | ✓ | own unit | — | ✓ |
| View health flags | ✓ | ✓ | — | — | — | — |
| Build segment | ✓ | ✓ | ✓ | own unit | ✓ | — |
| Export ≤ threshold | ✓ | ✓ | approval | approval | — | — |
| Export > threshold | ✓ | ✓ | — | — | — | — |
| Create workflow | ✓ | ✓ | draft | draft | — | — |
| Activate workflow | ✓ | ✓ | — | — | — | — |
| Send ≤ threshold | ✓ | ✓ | ✓ | own unit | — | — |
| Send > threshold | ✓ | ✓ | — | — | — | — |
| Edit consent | ✓ | ✓ | — | — | — | ✓ |
| Merge / unmerge | ✓ | — | — | — | — | ✓ |
| Delete profile | ✓ | — | — | — | — | request |
| View audit log | ✓ | ✓ | — | — | — | — |
| Kill switch | ✓ | ✓ | — | — | — | — |

Empat nilai bukan boolean — perlakukan sebagai status tersendiri, jangan dipaksa jadi ya/tidak:

- **`masked`** — boleh melihat daftar, tapi telepon dan email disamarkan. PRD 17.1: `62812****8953` dan `j***@domain.com`. **Penyamaran di server**, bukan di UI — data asli tidak boleh sampai ke browser.
- **`own unit`** — dibatasi unit yang dikelola. **Tabel unit-scope belum ada**, jadi tetap fail-closed: `unit_manager` tanpa scope terdefinisi = akses NIHIL. Jangan diubah jadi permisif.
- **`approval`** — boleh mengajukan, butuh persetujuan. Alur approval belum dibangun; untuk sekarang tolak dengan pesan "butuh persetujuan, fitur belum tersedia".
- **`draft`** / **`request`** — sama: boleh membuat draft/permintaan, tidak boleh mengeksekusi.

Hapus tanda `NEEDS PRD 17 CONFIRMATION` — matriks ini sekarang resmi. Ganti dengan komentar bahwa sumbernya PRD 17.2 dan disetujui Jeff 10 Agustus 2026.

---

## TUGAS 2 — Seed dua super_admin

`tifany@20fit.id` dan `marketing@20fit.id` (dibuat manual di Supabase Auth lebih dulu).

Tulis sebagai **file SQL terpisah** di `supabase/seeds/`, bukan migrasi — ini data, bukan skema. Cari `user_id` dari `auth.users` berdasarkan email, jangan hardcode uuid.

Wajib: tulis juga baris `crm_audit_log` untuk setiap pemberian peran, dalam transaksi yang sama. `action = 'role.granted'`, `actor_email` = 'system:seed', `summary` menjelaskan ini seed awal Sprint 3A.

**Gate sebelum menjalankan.** Setelah jalan, verifikasi: dua baris di `crm_user_role`, dua baris `role.granted` di `crm_audit_log`.

**Catatan yang harus kamu sampaikan di laporan** (bukan untuk kamu perbaiki): `marketing@20fit.id` kemungkinan mailbox bersama. Semua tindakannya akan tercatat sebagai satu identitas di audit log, sehingga tidak bisa dibedakan siapa pelakunya. Ini melemahkan akuntabilitas untuk peran dengan izin tertinggi. Sudah diangkat ke Jeff; catat sebagai risiko yang diterima.

---

## TUGAS 3 — Kebijakan retensi audit log

Keputusan Jeff, disetujui 10 Agustus 2026: **90 hari untuk audit operasional; entri kepatuhan dikecualikan permanen.**

Kategori yang **DIKECUALIKAN** dari pemangkasan (permanen):

```
consent.*        semua perubahan konsen
suppression.*    semua penambahan/pencabutan suppression
role.*           semua perubahan peran
profile.deleted  penghapusan profil
export.*         semua ekspor data
retention.*      catatan pemangkasan itu sendiri
```

Kategori yang **BOLEH dipangkas** setelah 90 hari:

```
profile.viewed   pembacaan profil individual
list.viewed      pembacaan daftar
search.*         pencarian
login.*          aktivitas login
```

Alasan pengecualian, tulis di komentar: `crm_consent` menyimpan *current state* dan riwayatnya ada di audit log — audit log itulah bukti hukumnya. Memangkasnya menghapus bukti dasar pemrosesan. PRD 16.4 juga mensyaratkan record konsen dipertahankan sebagai bukti pemrosesan yang sah.

**Implementasi:**

- Fungsi SQL `crm_purge_audit_log(dry_run boolean default true)`
- Trigger append-only menolak `DELETE`, jadi fungsi ini **harus menonaktifkan trigger secara sengaja**, memangkas, lalu menyalakan kembali. Itu perilaku yang diinginkan — pemangkasan harus jadi tindakan sadar
- Sebelum memangkas, tulis satu baris `retention.purge_executed` berisi jumlah baris dan rentang tanggalnya
- **`dry_run = true` sebagai default.** Panggilan tanpa argumen hanya melaporkan apa yang akan dihapus
- **JANGAN dijadwalkan otomatis.** Tulis fungsinya, jangan pasang cron. Penjadwalan adalah keputusan terpisah setelah tim melihat perilakunya

Ini migrasi baru (nomor 8). Gate seperti biasa: tulis → tunjukkan → jalankan → verifikasi dengan `dry_run`.

---

## TUGAS 4 — Audience pool (baca saja)

Ini yang membuat sistemnya bisa dievaluasi. Tanpa ini tim hanya melihat cangkang kosong.

**Sumber: `master_customer` yang sudah ada — 82.253 baris. JANGAN menyalin ke `crm_*`.** Ingestion tetap terblokir.

Aturan keras:

| Aturan | Alasan |
|---|---|
| Baca **hanya di server** lewat route handler, pakai service role | Anon key tidak boleh menyentuh data CRM (PRD 17.1) |
| Cek peran di server pada setiap request | Jangan percaya klien |
| `analyst` → telepon dan email **disamarkan di server** | Data asli tidak boleh sampai ke browser |
| Setiap pembacaan daftar → baris `list.viewed` di audit log | PRD 17.1 |
| Paginasi wajib, batas maksimum per request | Jangan pernah kirim 82.253 baris sekaligus |
| **Nol tombol ekspor** | Alur approval belum ada |
| Baca saja — nol tombol edit/hapus | Sprint ini evaluasi, bukan operasi |

Kolom yang ditampilkan: `full_name`, `phone_normalized`, `email_normalized`, `city`, `first_unit`, `segment`, `lifetime_value`, `created_at`.

**Yang harus terlihat jujur di UI** — ini justru yang perlu tim lihat:

- `gender`, `date_of_birth`, `address` **0% terisi** → tampilkan sebagai "belum terisi" eksplisit, jangan disembunyikan
- `city` hanya 7,03% terisi
- `lifetime_value`: 98,65% bernilai nol; hanya 1.112 dari 82.253 (1,35%) pernah membayar
- `segment` **terbalik** — kohort NULL justru LTV tertinggi. Tampilkan apa adanya, jangan dirapikan
- **JANGAN tampilkan `last_activity_at`** sebagai "terakhir aktif". Artefak impor, 99,62% sama dengan `first_seen_at`

Tampilkan banner di halaman: data ini apa adanya dari sistem lama, tiga masalah kualitas di atas belum diremediasi.

Filter yang cukup untuk evaluasi: unit, segment, kota, punya/tanpa revenue. Jangan bangun segment builder — itu sprint terpisah.

---

## TUGAS 5 — Sambungkan nav dan merge ke `main`

Sekarang RBAC punya data, jadi wiring nav (W-1 yang ditunda) sudah aman. Sambungkan `canSeeNav`.

**Urutan merge WAJIB — jangan dibalik:**

1. Migrasi 8 (retensi) sudah jalan
2. Seed dua super_admin sudah jalan dan terverifikasi
3. **Baru** merge `claude/20fit-crm-sprint-2` → `main`
4. Verifikasi deploy Railway

RBAC fail-closed: merge sebelum langkah 2 mengunci semua orang.

Gate sebelum merge. Setelah deploy, laporkan dan **jangan klaim berhasil** — akan diverifikasi dari luar.

---

## LARANGAN

| Jangan | Alasan |
|---|---|
| Jangan jalankan migrasi 3 `crm_consent` | Menunggu legal |
| Jangan `INSERT` data pelanggan ke `crm_*` | Sumber masih RLS OFF |
| Jangan bangun ekspor, kirim pesan, atau segment builder | Sprint terpisah, sebagian terblokir |
| Jangan jadwalkan purge otomatis | Fungsinya saja |
| Jangan longgarkan fail-closed `unit_manager` | Tetap NIHIL sampai tabel scope ada |
| Jangan menyalakan RLS di tabel lama | Itu Fase 0, milik tim |

---

## LAPORAN PENUTUP

1. Matriks izin — konfirmasi selaras dengan PRD 17.2, termasuk penanganan empat status non-boolean
2. Seed — dua baris peran, dua baris audit, terverifikasi
3. Retensi — hasil `dry_run`, dan konfirmasi trigger menyala kembali setelah fungsi selesai
4. Audience pool — screenshot, jumlah baris, konfirmasi masking `analyst` bekerja di server
5. Merge & deploy — SHA, dan apa yang belum bisa kamu verifikasi
6. Yang ditemukan tapi tidak disentuh

Jangan klaim apa pun yang belum kamu jalankan dan lihat hasilnya.

# SELESAI — AKHIR PROMPT
