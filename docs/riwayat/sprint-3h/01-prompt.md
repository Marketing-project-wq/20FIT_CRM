# CLAUDE CODE PROMPT — Sprint 3H: Jalur Tulis Pertama (Suppression)

> **Sprint 3F sudah terbukti jalan di produksi.** Baris audit `id=32` (11 Agustus 2026, 07:30:25 UTC) mencatat `action='list.viewed'`, `target_table='crm_consent'`, `metadata.view='consent_register'`, aktor `tifany@20fit.id`.
>
> Artinya: route handler `/api/consent` berjalan, cek RBAC lolos, kueri `supabase-js` ke `crm_consent` dan `crm_suppression` berhasil, dan penulisan audit mendarat — **semuanya di produksi, terhadap Supabase sungguhan.** Celah verifikasi yang lima sprint berturut-turut dilaporkan sebagai "tidak bisa saya verifikasi" tertutup untuk jalur ini, dan tertutup dari luar, oleh pemakaian nyata.
>
> **Yang masih BELUM terbukti** (lihat TUGAS 1): detail profil dan layar audit `/settings` belum pernah dibuka satu kali pun.
>
> Sekarang sistem ini punya semua yang dibutuhkan untuk menulis, dan sprint ini membangun jalur tulis pertamanya. **Bukan consent — suppression.**

---

## KENAPA SUPPRESSION LEBIH DULU, BUKAN CONSENT

Sprint 3F menunda jalur tulis consent dengan dua alasan. Alasan pertama (K-3 butuh fungsi Postgres) berlaku untuk keduanya dan dijawab sprint ini. Alasan kedua **hanya berlaku untuk consent**:

| | Consent (opt-in) | Suppression (opt-out) |
|---|---|---|
| Peristiwanya nyata hari ini? | **Tidak.** Tak ada formulir, tak ada kanal yang menghasilkan opt-in | **Ya.** Orang benar-benar meminta berhenti dihubungi, lewat WhatsApp, telepon, atau staf |
| Arah kesalahan | Mencatat opt-in yang tak pernah terjadi = **mengarang dasar hukum** | Mencatat permintaan berhenti = **melindungi**, arahnya aman |
| Kalau ditunda | Tak ada yang dirugikan hari ini | Permintaan berhenti hari ini **tak terekam di mana pun** — dan kampanye pertama nanti akan menghubungi orang yang sudah minta berhenti |

Suppression harus ada **sebelum** pengiriman dinyalakan, bukan sesudah. Dan ia menang atas consent (`isContactableForMarketing` sudah menegakkannya) — jadi membangunnya lebih dulu tidak pernah salah urutan.

---

## ATURAN PROSES

```bash
git fetch --all --prune
git log --oneline -3 origin/main
git log --oneline origin/main..HEAD
```

Harapan: `origin/main` di `eff733c` atau setelahnya (PR #4 sudah men-merge 3B–3F). Kerja 3G (`9a7b296`, `ef0ea89`) ada di branch sebagai follow-up — **pastikan itu ter-merge dulu atau kamu bekerja di atasnya**; jangan tinggalkan pembersihan kode mati itu menggantung. Berbeda dari harapan → **berhenti dan lapor**.

Sprint ini menyentuh skema produksi lagi (migrasi 9). Gate: **tulis → tunjukkan → tunggu → jalankan → verifikasi.**

---

# PROMPT UNTUK CLAUDE CODE — SALIN MULAI DARI SINI

---

## TUGAS 1 — Tutup sisa verifikasi lewat produksi itu sendiri

Berhenti menunggu jalur sandbox. Aplikasinya sudah live dan dipakai; buktinya bisa dibaca dari `crm_audit_log`.

**Yang sudah terbukti** (verifikasi ulang sendiri): `/audience` dan `/consent` berjalan di produksi.

**Yang belum, dan cara membuktikannya:**

| Layar | Bukti yang dicari | Status 11 Agu |
|---|---|---|
| Detail profil (3C) | satu baris `action='profile.viewed'` dengan `target_id` terisi | **nol** — belum pernah dibuka |
| Layar audit `/settings` (3C) | `list.viewed` dengan `target_table='crm_audit_log'` | **belum ada** |

Keduanya butuh satu orang membuka satu halaman. Tulis permintaannya sebagai dua langkah pendek di `docs/CEKLIS-verifikasi-live.md`, dengan SQL persis untuk memastikan barisnya mendarat.

**Dan yang TIDAK bisa dibuktikan lewat audit log, sebutkan dengan jelas:** `/` dan `/quality` sengaja **tidak menulis audit** (aturan Sprint 3E). Ketiadaan baris dari keduanya adalah perilaku yang benar, **bukan bukti mereka berjalan**. Satu-satunya bukti untuk keduanya adalah log Railway atau seseorang yang melihat layarnya. Jangan sampai tercampur — menghitung "nol baris audit" sebagai keberhasilan justru membalik artinya.

---

## TUGAS 2 — Migrasi 9: fungsi tulis suppression yang atomik

Syarat K-3 tidak bisa dipenuhi PostgREST: dua `INSERT` ke tabel berbeda tak bisa dibungkus satu transaksi. Jadi jalur tulis **wajib** fungsi Postgres. Ini satu-satunya perubahan skema sprint ini.

**Tulis `crm_record_suppression(...)`** yang dalam **satu transaksi**:

1. `INSERT` atau reaktivasi baris `crm_suppression`
2. `INSERT` baris `crm_audit_log`
3. Mengembalikan hasilnya

**Aturan yang tidak boleh dilanggar:**

| Aturan | Alasan |
|---|---|
| **Fungsi TIDAK MENORMALKAN apa pun.** `identity_key` diterima sudah ternormalisasi dari `lib/crm/normalize.ts` | D-2 di header migrasi: normalisasi di SQL = implementasi kedua. Beda satu kasus = suppression gagal cocok **diam-diam** |
| Tolak masukan yang jelas belum ternormalisasi | Jaring pengaman, bukan pengganti normalisasi. Telepon wajib `62…` tanpa `+` (kanon Sprint 3B); email wajib huruf kecil dan mengandung `@` |
| Idempoten | Menekan tombol dua kali tidak boleh menggandakan baris audit. `UNIQUE (identity_kind, identity_key)` sudah ada — pakai `ON CONFLICT` |
| Nol `DELETE` | Sticky. Pencabutan = `status='lifted'` + `lifted_at` + `lifted_reason` + baris audit |
| Aktor ikut masuk | `actor_id` dan `actor_email` diteruskan dari pemanggil, bukan `current_user` database — semua akses lewat service role, jadi database tak tahu siapa manusianya |

**Kosakata sudah terkunci di CHECK constraint, jangan diubah:** `identity_kind` ∈ {`phone`,`email`}; `reason_code` ∈ {`user_request`,`complaint`,`bounce`,`legal`,`legacy_import`}; `status` ∈ {`active`,`lifted`}.

**Aksi audit: `suppression.added` dan `suppression.lifted`.** Ini **tidak** melanggar larangan "jangan buat aksi audit baru" — larangan itu ada karena aksi baru bisa jatuh di luar kedua daftar migrasi 8. `suppression.%` sudah ada di **denylist kepatuhan**, jadi keduanya otomatis dikecualikan permanen dari pemangkasan. Itu klasifikasi yang benar: permintaan berhenti dihubungi adalah bukti hukum. **Konfirmasi lewat test paritas Sprint 3E** bahwa keduanya memang terklasifikasi kepatuhan, jangan diasumsikan.

Gate: tampilkan SQL-nya dan **berhenti**. Jalankan lewat `apply_migration`, bukan `db push`. Setelah jalan, perbarui tabel ledger di README (versi tercap akan beda dari timestamp nama file — pola yang sama untuk kedelapan kalinya).

---

## TUGAS 3 — Jalur tulis di aplikasi

Gerbang: `consent.edit` — `super_admin`, `crm_manager`, `data_steward`. Fail-closed seperti biasa.

**Titik masuk:** dari detail profil, dan dari `/consent`. Alurnya mencatat **permintaan yang sudah terjadi**, bukan menawarkan tindakan — bahasa tombol dan formulirnya harus mencerminkan itu.

**Yang wajib:**

- Kunci identitas **selalu** lewat `normalizePhoneID` / `normalizeEmail`. Ini konsumen runtime **pertama** dari fungsi itu — perbaikan kanon Sprint 3B akhirnya dipakai sungguhan. Kalau normalisasi mengembalikan `null`, tolak dengan pesan jelas; jangan pernah menyimpan mentah.
- `reason_code` wajib dipilih, `reason_detail` opsional. **`reason_detail` adalah teks bebas dari pengguna** — berlaku pelajaran Sprint 3D: batasi panjangnya, dan sadari isinya bisa apa saja.
- Satu profil bisa punya telepon **dan** email. Menekan "catat permintaan berhenti" harus **eksplisit** menanyakan identitas mana yang disuppress — jangan diam-diam menulis keduanya, dan jangan diam-diam menulis satu saja. Tampilkan apa yang akan ditulis sebelum menulisnya.
- Setelah berhasil, tampilkan akibatnya: orang ini sekarang **tidak bisa dihubungi** apa pun status consent-nya.

**Pencabutan (`lifted`)** dibangun di sprint ini juga, karena suppression yang tak bisa dicabut akan dicabut orang lewat SQL Editor — dan itu jauh lebih buruk. Wajib `lifted_reason`, wajib baris audit, dan wajib konfirmasi yang menyatakan bahwa ini mengembalikan kemungkinan menghubungi orang tersebut.

**Nol `DELETE`, nol jalur tulis consent.** Consent masih menunggu kanal opt-in yang nyata.

---

## TUGAS 4 — Buktikan aturan "suppression menang" dengan data sungguhan

`isContactableForMarketing` (Sprint 3F) memeriksa suppression lebih dulu dan short-circuit. Cabang itu **belum pernah dijalankan dengan satu baris pun** — `crm_suppression` kosong sejak dibuat.

Baris suppression pertama akan jadi yang pertama menjalankannya. Pastikan itu terlihat:

- Layar `/consent` menampilkan baris suppression yang baru, dengan `identity_key` **disamarkan** untuk peran tanpa `profile.view_contact` (pola masking server-side yang sudah ada)
- Kartu "Bisa dihubungi" di dashboard tetap `0` — tapi sekarang nol karena **dua** alasan yang berbeda, dan keduanya harus benar
- Tambahkan test fungsi murni untuk kasus yang sebelumnya tak bisa diuji dengan data nyata: punya consent aktif **tetapi** ada di suppression → tidak bisa dihubungi

**Verifikasi di produksi setelah deploy:** satu baris `suppression.added` di `crm_audit_log`, satu baris di `crm_suppression`, dan tak satu pun baris `crm_consent` bertambah.

---

## TUGAS 5 — Berkas PR dan pemantauan

Perbarui berkas PR untuk siklus ini. Yang **berbeda** dari semua sprint sebelumnya, dan harus ditulis paling atas:

> **Ini sprint pertama yang menulis data.** Semua sprint sebelumnya baca-saja; revert kode selalu cukup. Tidak lagi: baris suppression yang sudah ditulis adalah **catatan permintaan orang sungguhan**, dan menghapusnya berarti menghubungi kembali orang yang sudah minta berhenti.

Sertakan:

- Rencana revert yang membedakan **kode** (bisa dikembalikan), **fungsi** (bisa di-`drop`), dan **baris suppression** (tidak boleh dihapus, titik)
- Apa yang dipantau 30 menit pertama: baris `suppression.added` yang muncul, dan tanda-tanda kegagalan atomik — baris suppression tanpa baris audit pasangannya, atau sebaliknya. **Tulis SQL-nya**, karena itu satu-satunya cara melihat K-3 benar-benar ditegakkan.

**JANGAN merge ke `main` tanpa izin eksplisit.**

---

## LARANGAN

| Jangan | Alasan |
|---|---|
| Jangan bangun jalur tulis consent | Belum ada peristiwa opt-in nyata untuk ditunjuk |
| Jangan normalkan identitas di SQL | D-2: implementasi kedua = kegagalan pencocokan yang diam-diam |
| Jangan `DELETE` dari `crm_suppression` | Sticky by design; pencabutan lewat `status='lifted'` |
| Jangan `INSERT` ke `crm_consent` | Ketiadaan baris masih jawaban yang benar |
| Jangan backfill suppression dari data lama | `legacy_import` ada di kosakata, tapi mengisinya massal butuh keputusan tim — bukan sprint ini |
| Jangan buat migrasi lain selain migrasi 9 | Satu perubahan skema per siklus |
| Jangan jalankan `supabase db push` | Akan menjalankan ulang seluruh migrasi repo |
| Jangan sentuh tabel di luar `crm_*` | Proyek Supabase dipakai bersama tim lain |
| Jangan buat/ubah/hapus `crm_user_role` | Mengendalikan akses akun manusia |
| Jangan merge atau push ke `main` | Deploy produksi ke sistem yang dipakai orang |
| Jangan cetak PII di skrip, log, laporan, atau `metadata` audit | `identity_key` **adalah** PII — pastikan ia tidak bocor ke `metadata` |
| Jangan menyalakan RLS di tabel lama | Fase 0, milik tim |
| Jangan hapus prefix `NODE_ENV=production` di `railway.json` | Baca README dulu |

---

## LAPORAN PENUTUP

1. **Status remote + kondisi database** — apa adanya, termasuk apakah kerja 3G sudah ter-merge
2. **Sisa verifikasi** — apa yang kini terbukti dari `crm_audit_log`, apa yang masih menunggu satu orang membuka satu halaman, dan penegasan bahwa nol baris dari `/` dan `/quality` **bukan** bukti
3. **Migrasi 9** — SQL yang dijalankan, versi ledger tercap, dan bukti atomiknya: tunjukkan satu percobaan yang gagal di tengah tidak meninggalkan baris separuh jadi
4. **Jalur tulis** — bagaimana identitas dinormalkan, bagaimana pilihan telepon/email dibuat eksplisit, dan bagaimana pencabutan dijaga
5. **Suppression menang** — test baru, dan hasil verifikasi produksi setelah baris pertama ditulis
6. **Berkas PR** — kalimat tentang data yang tak bisa direvert
7. **Yang ditemukan tapi tidak disentuh**
8. **Yang TIDAK bisa kamu verifikasi**

Gate akhir: `tsc --noEmit` bersih, `next lint` bersih, seluruh test hijau, `NODE_ENV=production npm run build` lulus. Sebutkan jumlah test sebelum dan sesudah.

Jangan klaim apa pun yang belum kamu jalankan dan lihat hasilnya.

# SELESAI — AKHIR PROMPT
