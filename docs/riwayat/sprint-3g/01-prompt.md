# CLAUDE CODE PROMPT — Sprint 3G: Mendarat

> **Tidak ada fitur baru. Sprint ini menutup jarak antara apa yang ada di produksi dan apa yang ada di branch.**
>
> Kondisi hari ini, dan ini bukan kondisi yang boleh dibiarkan berlarut:
>
> | Di produksi | Di branch |
> |---|---|
> | Kode Sprint **3A** — audience pool, RBAC, retensi | Sprint **3B–3F**, lima commit, belum ter-merge |
> | Skema: tujuh migrasi `crm_*` **termasuk `crm_consent`** | — |
> | `crm_consent` kosong, **tidak dibaca kode mana pun yang berjalan** | `/consent` yang membacanya, belum ter-deploy |
>
> Produksi sekarang punya tabel yang tidak ada kodenya, dan branch punya lima sprint kode yang belum pernah sekali pun dieksekusi terhadap Supabase. Setiap sprint tambahan memperlebar jarak itu, bukan mempersempitnya.
>
> Dan taruhannya naik terus: `crm_audit_log` sudah **32 baris** — bertambah lagi sejak laporan 3E. Orang sungguhan memakai layar yang akan berubah.

---

## ATURAN PROSES

```bash
git fetch --all --prune
git log --oneline -3 origin/main
git log --oneline origin/main..HEAD
```

Harapan: `origin/main` di `4bac312`; branch memuat `bf736b0` (3B), `322377f` (3C), `68dd66f` (3D), `9c44c00` (3E), `e25a317` (3F). Berbeda → **berhenti dan lapor**.

Verifikasi ulang kondisi database (semua sudah dikonfirmasi 11 Agustus 2026, konfirmasi lagi sendiri): `crm_consent` ada, RLS ON, **nol** policy, 4 CHECK, FK `on delete set null`, **0 baris**; versi ledger `20260811072232`. `crm_suppression` 0 baris.

---

## PRASYARAT — INI YANG MENENTUKAN SPRINT INI BERGUNA ATAU TIDAK

Lima sprint berturut-turut melaporkan hal yang sama: query `supabase-js` belum pernah dieksekusi karena proxy sandbox memblokir host Supabase (CONNECT 403) dan tidak ada kredensial. Itu bukan kelalaian — tapi mengulanginya untuk keenam kalinya juga bukan jawaban.

**Sebelum menjalankan prompt ini, tim menyediakan salah satu dari tiga jalur.** Kalau tidak satu pun tersedia, TUGAS 1 gugur dan kamu langsung ke TUGAS 2 — **katakan itu di awal laporan**, jangan berpura-pura mencoba.

| Jalur | Yang tim siapkan | Kekuatan bukti |
|---|---|---|
| **A — Preview Railway** | Deploy branch ini ke environment preview/staging Railway yang menunjuk proyek Supabase yang sama, beri kamu URL-nya | **Terkuat.** Menguji build, runtime, sesi login, dan query sekaligus — persis seperti produksi |
| **B — Allowlist + kredensial** | Tambahkan host Supabase proyek ini ke daftar domain yang diizinkan di pengaturan sandbox, dan isi `.env.local` dengan variabel dari Railway | Kuat untuk lapisan query; sesi login tetap butuh browser |
| **C — Tim menjalankan sendiri** | Anggota tim menjalankan `scripts/verify-live.mjs` + `docs/CEKLIS-verifikasi-live.md`, lalu menempelkan keluarannya ke sesi ini | Cukup, tapi kamu tidak bisa mengiterasi kalau ada yang gagal |

**Jalur B layak dicoba lebih dulu karena paling murah** — blokirnya kemungkinan besar setelan allowlist domain sandbox, bukan batasan yang tak bisa diubah. Laporkan pesan galat persisnya kalau masih gagal setelah di-allowlist; itu bahan tim memperbaikinya.

---

# PROMPT UNTUK CLAUDE CODE — SALIN MULAI DARI SINI

---

## TUGAS 1 — Verifikasi live, akhirnya

Jalankan sesuai jalur yang tersedia.

**Cakupan minimum, apa pun jalurnya:**

1. `scripts/verify-live.mjs` — seluruh tabel PASS/GAGAL, termasuk buktinya tidak menulis baris audit
2. Lima langkah `docs/CEKLIS-verifikasi-live.md`, ditambah dua yang belum ada karena `/consent` baru lahir di 3F:
   - `/consent` terbuka, dua tabel kosong tampil bermakna, dan **satu** baris `list.viewed` dengan `target_table='crm_consent'` mendarat
   - Kartu "Bisa dihubungi" di dashboard menunjukkan `0` yang **dihitung** — bukan `—`, bukan galat
3. Konfirmasi `/quality` dan `/api/dashboard` menulis **nol** baris audit (aturan Sprint 3E)
4. Konfirmasi detail profil menulis `profile.viewed` dengan `target_id` terisi — ini akan jadi baris `profile.viewed` **pertama** yang pernah ada di sistem

**Kalau ada yang gagal, itu justru hasil paling berharga dari lima sprint terakhir.** Laporkan apa adanya, perbaiki, jalankan ulang. Jangan menghaluskan kegagalan jadi "sebagian besar lolos".

**Batas keras selama verifikasi:** nol `INSERT` ke `crm_consent`, nol perubahan `crm_user_role`, nol tulis ke data pelanggan. Baris audit yang muncul karena kamu membuka halaman adalah efek yang benar dan diharapkan — itu memang cara kerjanya.

---

## TUGAS 2 — Tinjau sendiri seluruh diff lima sprint

Peninjau manusia akan melihat satu PR berisi lima sprint. Tidak ada yang bisa meninjau itu dari daftar commit.

Jalankan `git diff origin/main...HEAD` dan tinjau **seluruhnya** — sebagai orang yang belum pernah melihatnya, bukan sebagai penulisnya. Yang dicari:

- **Perubahan pada layar yang sudah dipakai orang.** `/audience` berubah di 3B (banner) dan 3C (nama bisa diklik). Itu satu-satunya layar dengan pemakaian nyata yang tercatat. Setiap perubahan di sana butuh perhatian ekstra.
- **Kode mati** — apa pun yang ditambahkan di 3B–3E lalu tidak terpakai setelah sprint berikutnya menggantinya
- **Komentar yang bertentangan dengan kodenya** — lima sprint saling menimpa; komentar Sprint 3B yang masih menjelaskan perilaku yang sudah diubah 3E lebih berbahaya daripada tidak ada komentar
- **Aturan yang tertulis dua kali** — pola yang sudah dua kali menggigit proyek ini (kanon telepon di 3B, daftar retensi di 3E). Cari yang ketiga.
- **Jejak sisa** — `console.log`, kode debug, `TODO` yang tak bertuan

Tulis hasilnya di `docs/TINJAUAN-pra-merge.md`: apa yang kamu perbaiki, dan apa yang kamu putuskan biarkan **beserta alasannya**. Temuan nol adalah hasil yang mencurigakan untuk diff sebesar ini — kalau memang nol, katakan apa yang sudah kamu periksa sehingga yakin.

---

## TUGAS 3 — Apa yang terjadi pada request pertama setelah deploy

Merge memicu deploy Railway ke sistem yang sedang dipakai. Petakan **request pertama** untuk setiap rute, dan yang dicari bukan jalur bahagianya.

Untuk tiap rute baru/berubah — `/`, `/audience`, `/audience/[id]`, `/quality`, `/settings`, `/consent`, dan seluruh `/api/*` pasangannya — jawab:

- Apa yang terjadi kalau `crm_consent` **tidak** ada? (Ia ada sekarang — tapi rencana revert di berkas PR memuat `drop table`. Kalau tabelnya di-drop sementara kode tetap live, apakah layarnya gagal anggun atau meledak?)
- Apa yang terjadi kalau service-role key hilang atau salah?
- Apa yang terjadi pada pengguna yang **sudah punya sesi aktif** saat deploy berjalan?
- Apa yang terjadi kalau penulisan audit gagal — mana yang menolak menyajikan (503) dan mana yang lanjut, dan apakah itu sesuai aturan Sprint 3E?

**Catat urutan deploy secara eksplisit di berkas PR.** Sprint 3A punya peringatan urutan yang keras karena RBAC fail-closed: kode tidak boleh mendahului migrasi. Sprint ini kebalikannya — **migrasinya sudah jalan lebih dulu**, jadi urutannya sudah benar dan tidak ada yang perlu diurutkan. Tulis itu, supaya orang yang membaca peringatan 3A di README tidak mengira peringatan yang sama berlaku di sini.

---

## TUGAS 4 — Rencana pasca-merge dan latihan revert

Berkas PR sudah memuat rencana revert. Ia belum pernah diuji.

- **Latih revert-nya secara lokal.** Buat branch dari `HEAD`, jalankan revert sesuai rencana, pastikan hasilnya build dan seluruh test hijau, lalu buang branch itu. Laporkan apakah rencananya benar-benar bekerja atau perlu diperbaiki. Sebuah rencana revert yang belum pernah dijalankan adalah harapan, bukan rencana.
- **Tulis apa yang harus diawasi 30 menit pertama** setelah deploy: log Railway apa, baris audit apa yang harus muncul (dan yang **tidak** boleh muncul), dan apa gejala pertama yang berarti harus revert.
- **Perjelas batas revert.** Mengembalikan kode tidak menghapus `crm_consent`. Selama nol baris, `drop table` masih aman; begitu ada satu baris consent, ia jadi catatan hukum dan tidak boleh di-drop. Tulis siapa yang boleh memutuskan itu — bukan orang yang sedang panik jam dua pagi.

---

## TUGAS 5 — Satu halaman untuk pengambil keputusan

Berkas PR ditulis untuk peninjau kode. Yang memutuskan merge bukan peninjau kode.

Tulis `docs/RINGKASAN-keputusan-merge.md`, **maksimum satu halaman**, bahasa yang bisa dibaca orang non-teknis:

1. Apa yang berubah bagi pemakai — dalam kalimat tentang layar, bukan tentang file
2. Apa yang sudah diverifikasi, dan **dengan cara apa** (jujur soal kekuatan tiap bukti)
3. Apa yang masih belum diverifikasi
4. Risiko terbesar, satu kalimat
5. Kalau ada yang rusak: berapa lama kembali normal, dan apa yang tidak bisa dikembalikan
6. Rekomendasimu — merge sekarang, atau tunggu apa dulu

Nomor 6 harus berupa rekomendasi yang jelas. Kamu yang paling tahu isi diff ini; menyerahkan keputusan tanpa pendapat bukan kehati-hatian, itu memindahkan beban ke orang dengan informasi lebih sedikit.

---

## LARANGAN

| Jangan | Alasan |
|---|---|
| Jangan merge atau push ke `main` tanpa izin eksplisit | Deploy produksi ke sistem yang sedang dipakai orang |
| Jangan bangun fitur atau layar baru | Sprint ini mendaratkan, bukan menambah |
| Jangan `INSERT` ke `crm_consent` | Ketiadaan baris masih jawaban yang benar |
| Jangan jalankan migrasi, view, atau RPC baru; jangan `db push` | Satu perubahan skema sudah cukup untuk siklus ini |
| Jangan `drop table crm_consent` | Itu bagian rencana revert, bukan tindakan sprint ini |
| Jangan sentuh tabel di luar `crm_*` | Proyek Supabase dipakai bersama tim lain |
| Jangan buat/ubah/hapus `crm_user_role` | Mengendalikan akses akun manusia |
| Jangan buat aksi audit baru | Allowlist migrasi 8 memangkas per nama eksak |
| Jangan cetak PII di skrip, log, atau laporan | Alat verifikasi tidak boleh jadi kebocoran baru |
| Jangan menyalakan RLS di tabel lama | Fase 0, milik tim |
| Jangan hapus prefix `NODE_ENV=production` di `railway.json` | Baca README dulu — sudah salah dua kali |

---

## LAPORAN PENUTUP

1. **Status remote + kondisi database** — apa adanya
2. **Verifikasi live** — jalur yang tersedia, hasil per langkah, **setiap kegagalan disebut sebagai kegagalan**. Kalau tidak ada jalur yang tersedia, katakan di sini dan di nomor 7
3. **Tinjauan pra-merge** — apa yang kamu temukan, perbaiki, dan biarkan beserta alasannya
4. **Request pertama** — tabel per rute, dan urutan deploy yang kamu catat
5. **Latihan revert** — apakah rencananya benar-benar bekerja, dan apa yang diperbaiki
6. **Ringkasan keputusan** — rekomendasimu, satu kalimat, di laporan ini juga
7. **Yang TIDAK bisa kamu verifikasi**

Gate akhir: `tsc --noEmit` bersih, `next lint` bersih, seluruh test hijau, `NODE_ENV=production npm run build` lulus. Sebutkan jumlah test sebelum dan sesudah.

Jangan klaim apa pun yang belum kamu jalankan dan lihat hasilnya.

# SELESAI — AKHIR PROMPT
