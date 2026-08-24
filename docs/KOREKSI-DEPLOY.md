# Koreksi model deploy — urutan yang TIDAK boleh dibalik

> # ⛔ SELURUH DOKUMEN INI DITARIK (24 Agu 2026)
> **Premisnya salah.** Produksi **tidak** men-deploy dari branch — ia dari **`main`**,
> auto-deploy saat push (dashboard Railway, Settings → Source, dikonfirmasi 24 Agu 2026).
> Karena itu **tak ada** "selisih 6 commit", **tak ada** risiko "repoint ke `main` memundurkan
> produksi", dan urutan "merge dulu, repoint kemudian" **tak relevan** — Railway sudah menunjuk
> `main`. Yang benar sederhana: **merge ke `main` = deploy ke produksi.** Larangan merge tanpa
> izin tetap, dan kini lebih penting.
>
> Bukti bahwa dokumen ini keliru: `git log -S` yang jadi dasarnya dijalankan atas ref
> `origin/main` **basi** — commit aksi audit sudah masuk `main` lewat PR #10 (04:41 UTC), 7 menit
> sebelum reset produksi (04:48 UTC). Lihat **T-22 (dikoreksi)**, **T-27**, **K-25 (dikoreksi)**,
> **K-27 (dibatalkan)** di `docs/riwayat/`.
>
> _Isi di bawah disimpan sebagai jejak keputusan yang keliru. Jangan dijadikan panduan tindakan._

---

> **Temuan (T-18, K-25, 12 Agu 2026) — KELIRU, lihat penarikan di atas:** produksi menjalankan kode **branch**
> `claude/lanjutkan-pekerjaan-mno804`, **bukan `main`**. Terbukti: aksi audit
> `login.password_reset_requested` ada **hanya** di commit branch (nol di `origin/main`),
> tetapi produksi menulisnya. Selama ~10 sprint dokumentasi menulis "push ke `main` memicu
> deploy" — itu tidak sesuai dengan yang berjalan.
>
> Kamu (agen) tidak bisa mengubah setelan Railway. Dokumen ini membuat urutan pembetulan
> **jelas dan aman**, supaya pemegang akses tidak salah langkah.

## Kondisi saat ini (yang membuat urutan ini penting)

- **Branch** berisi 6 commit di depan `main`: alur email reset baru (generateLink → Mailtrap
  → verifyOtp), perbaikan jalur baca contactability untuk 408 ribu baris, Migrasi 11 (backfill
  consent) + 12 (indeks), dan koreksi dokumen.
- **`main` tertinggal 6 commit.** Versi `/forgot-password` di `main` masih komponen klien
  `resetPasswordForEmail` (pengirim "UOB Heartbeat Run", tautan bukan kode), dan jalur baca
  contactability-nya **menarik baris consent tanpa batas** — versi sebelum perbaikan.
- **`crm_consent` kini berisi 408.119 baris** (Migrasi 11 sudah jalan di DB, permanen sampai
  di-revert manual).

## Urutan yang TIDAK boleh dibalik

### 1. Merge PR #11 (branch → `main`) LEBIH DAHULU
Sesudah merge, `main` dan branch **identik**. Baru setelah itu, mengarahkan Railway ke `main`
tidak mengubah apa pun yang berjalan. Ini langkah kunci: ia menghapus selisih 6 commit
**sebelum** sumber deploy disentuh.

### 2. Konfirmasi sumber deploy di dashboard Railway
Railway → service **produksi** → **Settings → Source → Branch**. Catat branch yang tertera.
Ini menjawab pertanyaan yang tak bisa dijawab dari repo (setelan ada di Railway, bukan di
`railway.json`).

### 3. Arahkan ulang ke `main` — HANYA setelah langkah 1 selesai
Bila memang ingin produksi dari `main` (model yang selama ini didokumentasikan), ubah Branch
ke `main` **sesudah** merge. Karena langkah 1 membuat keduanya identik, deploy ini nol-selisih.

### 4. Verifikasi lewat `/settings/diagnostik`
Satu halaman (Sprint 3L) yang menjalankan **seluruh lapisan baca sekaligus** — dashboard,
segment, consent, contactability — dan melaporkan status verifikasinya dari `crm_audit_log`.
Konfirmasi angka contactable = **82.253** (marketing & layanan) muncul, tak ada lapisan pecah.

## Kalau urutannya DIBALIK — apa yang terjadi

**Mengarahkan Railway ke `main` SEBELUM merge** memundurkan produksi **6 commit**: ke jalur
baca contactability lama yang **menarik baris `crm_consent` tanpa batas**. Dengan tabel kini
**408 ribu baris**, PostgREST **memotong diam-diam** di batas 1000 baris → **angka
contactability salah, tanpa satu pun error**. Itu jenis kegagalan yang **paling lama tak
ketahuan**: layar tampak sehat, angkanya bohong. (Alur email reset juga mundur ke pengirim UOB
+ tautan.)

Karena itu **langkah 1 wajib sebelum langkah 3**, tanpa pengecualian.

## Revert (bila perlu, tiga tingkat — dari paling murah)
1. **Kode:** revert PR #11.
2. **Indeks (Migrasi 12):** `drop index if exists public.crm_consent_purpose_status_customer_idx;` — nol kehilangan data.
3. **Data (Migrasi 11):** `delete from public.crm_consent where source = '20fit_data_import';` — bersih (`crm_consent` **nol trigger**), berbeda dari `crm_suppression`/`crm_audit_log` yang append-only.

---
Rujukan: `docs/riwayat/TEMUAN.md` T-18, `docs/riwayat/KEPUTUSAN.md` K-25,
`docs/MENUNGGU-TINDAKAN-MANUSIA.md`.
