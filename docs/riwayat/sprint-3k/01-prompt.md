# CLAUDE CODE PROMPT — Sprint 3K: Kegagalan yang Tidak Meninggalkan Jejak

> **Ada tiga operasi teraudit yang gagal di produksi, dan tak satu pun terlihat di layar audit.**
>
> `crm_audit_log.id` memakai sequence. `INSERT` yang gagal atau di-rollback tetap
> **mengambil** nomornya lalu tidak meninggalkan baris. Jadi lubang di urutan id adalah
> jejak satu-satunya dari operasi teraudit yang gagal — dan selama ini tak ada yang melihatnya.
>
> Diverifikasi 11 Agustus 2026, dua kali, terakhir ~09:20 UTC:
>
> ```
> count(*) = 43   ·   max(id) = 47   ·   id hilang: 4, 37, 38, 39
> ```
>
> `id=4` dikenal — baris sintetis yang dihapus uji purge Sprint 3A. **`37`, `38`, `39`
> tidak dikenal.** Ketiganya jatuh di antara `id=36` (08:01:12) dan `id=40` (08:58:09),
> tepat saat `tifany@20fit.id` sedang memakai sistem.
>
> **Gapnya TIDAK bertambah** sejak 09:05 — tapi tidak ada pula aktivitas sejak saat itu,
> jadi ini bukan bukti masalahnya berhenti. Yang bisa dikatakan: ini episode terbatas,
> bukan kegagalan yang mengalir terus. Turunkan tingkat kegentingannya, jangan turunkan
> tingkat kepentingannya.
>
> **Petunjuk yang menguatkan:** `profile.viewed` masih **0**, padahal `/settings` sudah
> dibuka empat kali dan `/consent` dua kali di jendela yang sama. Orangnya jelas
> menjelajah, tapi tak sekali pun ada profil terbuka. "Tak ada yang mengklik nama" dan
> "mengklik nama gagal" sama-sama menghasilkan nol baris — audit log tak bisa membedakan
> keduanya, dan **itu** masalahnya.
>
> **Jangan mulai dengan memperbaiki. Mulai dengan mencari tahu.**

---

## KONDISI PRODUKSI — verifikasi ulang sendiri sebelum mulai

| | Nilai 11 Agu 09:20 UTC |
|---|---|
| `crm_audit_log` | 43 baris · `max(id)` 47 · gap `4, 37, 38, 39` |
| `profile.viewed` | **0** — detail profil belum pernah berhasil dibuka |
| `search.performed` | 0 — wajar, 3J belum ter-merge |
| `suppression.*` / `crm_suppression` | 0 / 0 baris |
| `crm_consent` | 0 baris |
| Aktivitas terakhir | 09:05:18 UTC |

---

## ATURAN PROSES

```bash
git fetch --all --prune
git log --oneline -3 origin/main
git log --oneline origin/main..HEAD
```

Harapan: `origin/main` di `3ac62b1` (PR #5, memuat 3G+3H); branch memuat `69e59ca` (3I
di-rebase), `6504645` (3J), `46d3978` (docs/riwayat) — **tiga commit belum ter-merge**.
Baseline `npm test` hijau **219**. Berbeda → **berhenti dan lapor**.

**Sudah dikerjakan sprint dokumentasi, jangan diulang:** V-7 (`/settings` terbukti jalan,
`id` 44–47) sudah tertutup dan tercatat di `docs/CEKLIS-verifikasi-live.md`,
`docs/riwayat/LINIMASA.md`, dan `docs/riwayat/FAKTA-DATA.md`.

---

# PROMPT UNTUK CLAUDE CODE — SALIN MULAI DARI SINI

---

## TUGAS 1 — Cari tahu apa yang gagal, jangan menebak

Dua kandidat, dan keduanya harus **diuji**, bukan dipilih:

**Kandidat A — detail profil gagal.** `/api/audience/[id]` menulis `profile.viewed` lalu
menyajikan. Gap justru menunjuk ke kegagalan **setelah** insert audit dimulai: kalau
kuerinya gagal lebih dulu, tak ada nomor sequence terpakai sama sekali.

**Kandidat B — penulisan suppression gagal.** `crm_record_suppression` membungkus insert
suppression **dan** insert audit dalam satu transaksi. Rollback mengambil nomor sequence
dan tidak meninggalkan apa pun di kedua tabel. Jalur ini live sejak PR #5, dan
`crm_suppression` masih 0 baris. Tiga percobaan gagal akan terlihat persis seperti ini.

**Kerjakan:**

1. **Baca log Railway** untuk jendela 08:01–08:58 UTC 11 Agustus. Di sanalah jawabannya,
   kalau ada. Kalau kamu tak punya akses, katakan begitu dan sebutkan persis apa yang
   harus dicari orang yang punya.
2. **Telusuri kode kedua jalur** sebagai orang yang mencari kegagalan, bukan penulisnya.
   `/api/audience/[id]`: apa yang terjadi bila `customer_id` bukan UUID valid, bila
   barisnya tak ada, bila `fetchProfileById` melempar **setelah** audit ditulis. RPC
   suppression: apa yang bisa menggagalkan transaksi setelah `nextval` — constraint,
   jaring pengaman normalisasi, atau argumen salah bentuk.
3. **Reproduksi lokal** bila bisa; bila tidak, susun langkah yang bisa dijalankan orang lain.
4. **Ukur ulang gapnya.** Bertambah sejak angka di atas = masalahnya masih berjalan.

**Laporkan penyebabnya, atau laporkan bahwa kamu belum menemukannya.** "Kemungkinan besar
A" tanpa bukti adalah tebakan, dan tebakan yang salah berarti memperbaiki jalur sehat
sambil membiarkan yang rusak.

---

## TUGAS 2 — Jadikan gap sebagai pemantauan tetap

Terlepas dari penyebabnya, sifat ini permanen dan berguna.

- Tambahkan SQL deteksi gap ke `docs/PASCA-MERGE-monitoring-revert.md`, di sebelah SQL
  deteksi kegagalan atomik dari Sprint 3H. Sertakan `id=4` sebagai gap yang **dikenal dan
  sah**, supaya tidak memicu alarm palsu selamanya.
- Tampilkan di layar audit `/settings`: selisih jumlah baris versus rentang id pada
  jendela yang sedang dilihat, dengan penjelasan singkat artinya. Pembaca layar audit
  harus tahu daftar yang ia lihat **tidak lengkap**, dan berapa banyak yang hilang.
- Catat sebagai keputusan baru di `docs/riwayat/KEPUTUSAN.md`: gap id adalah **sinyal**,
  bukan cacat kosmetik. **Jangan pernah mengisi ulang atau mengatur ulang sequence** —
  itu menghapus satu-satunya bukti yang tersisa. Tambahkan juga temuan ini ke
  `docs/riwayat/TEMUAN.md` dengan nomor T- berikutnya.

---

## TUGAS 3 — Kegagalan harus meninggalkan jejak di suatu tempat

Hari ini sebuah 503 atau 500 hilang tanpa bekas begitu responsnya terkirim.

**Jangan menulis kegagalan ke `crm_audit_log`** — itu tabel yang justru sedang gagal
ditulis, dan ia append-only sehingga banjir galat tak bisa dibersihkan.

Yang benar: log terstruktur ke Railway. Untuk **setiap** jalur yang bisa menolak sajikan
atau melempar — `/api/audience`, `/api/audience/[id]`, `/api/audit`, `/api/consent`,
`/api/suppression`, `/api/suppression/lift`, `/api/search` — pastikan kegagalannya
tercatat dengan rute, jenis kegagalan, dan cukup konteks untuk ditelusuri.

**Bebas PII, tanpa kompromi.** Tidak ada `identity_key`, kueri pencarian, `customer_id`,
atau isi `reason_detail`. Kalau sebuah galat hanya bisa dipahami dengan menyertakan
identitas, ia tidak boleh di-log — catat bentuk galatnya saja. Pola `console.error` di
`login/actions.ts` sudah ada dan sudah bebas PII; ikuti bentuknya, jangan buat yang kedua.

---

## TUGAS 4 — Perbaiki yang rusak, bila memang ada yang rusak

Kalau TUGAS 1 menemukan cacat nyata, perbaiki, dan testnya wajib menyertakan kasus yang
gagal itu supaya tak bisa kembali diam-diam.

Kalau tidak menemukan apa pun — mungkin saja gapnya berasal dari percobaan wajar yang
sudah tidak berulang — **katakan itu** dan jangan mengarang perbaikan untuk masalah yang
tidak terbukti ada.

Bila yang rusak adalah detail profil, konsekuensinya melampaui satu layar: alur **cari →
buka profil → catat permintaan berhenti** yang dibangun 3H dan 3J memakai detail profil
sebagai jembatannya. Detail profil rusak berarti seluruh alur suppression rusak — dan itu
alur yang ada untuk melindungi orang yang minta berhenti dihubungi.

---

## TUGAS 5 — Yang masih menggantung

- **V-6 belum tertutup**, dan kini jadi bagian TUGAS 1 — bukan lagi sekadar menunggu orang
  membuka satu halaman.
- **Baris suppression pertama** belum ada; panduan siap di `docs/PERTAMA-suppression.md`.
- **Tiga commit belum ter-merge** (3I, 3J, docs). Perbarui berkas PR untuk mencakup 3K dan
  naikkan ke paling atas: **siklus ini menyelidiki kegagalan nyata di produksi** — itu
  argumen mendaratkannya, bukan menundanya.
- Jangan lupa langkah "perbarui `docs/riwayat/`" yang sudah ditambahkan ke berkas PR.

**JANGAN merge sendiri.** Siapkan, lalu minta izin.

---

## LARANGAN

| Jangan | Alasan |
|---|---|
| Jangan mengisi ulang atau mengatur ulang `crm_audit_log_id_seq` | Gap adalah satu-satunya bukti yang tersisa |
| Jangan menulis baris galat ke `crm_audit_log` | Tabel itu yang sedang gagal, dan ia append-only |
| Jangan menebak penyebab lalu memperbaiki berdasarkan tebakan | Memperbaiki jalur sehat sambil membiarkan yang rusak |
| Jangan cetak PII di log, laporan, atau `metadata` | Termasuk `identity_key`, kueri pencarian, `customer_id` |
| Jangan `INSERT` uji ke `crm_suppression` atau `crm_consent` | Baris suppression tak bisa dihapus; jadi permanen |
| Jangan buat migrasi, view, atau RPC baru | Kecuali TUGAS 1 membuktikan cacatnya di fungsi Postgres — dan itu pun ditunjukkan dulu |
| Jangan bangun jalur tulis consent | Masih menunggu kanal opt-in yang nyata |
| Jangan rekonstruksi `02-laporan.md` di `docs/riwayat/` | Rekonstruksi yang menyamar arsip lebih buruk daripada berkas kosong |
| Jangan sentuh objek di luar `crm_*` dan `master_customer` (baca saja) | 101 fungsi bermasalah milik tim lain |
| Jangan merge atau push ke `main` tanpa izin eksplisit | Produksi sedang dipakai orang |
| Jangan hapus prefix `NODE_ENV=production` di `railway.json` | Baca README dulu |

---

## LAPORAN PENUTUP

1. **Status remote + kondisi database** — termasuk `max(id) - count(*)` sekarang, dan
   apakah gapnya bertambah sejak prompt ini ditulis
2. **Penyebab gap 37–39** — bukti yang kamu punya, bukan hipotesis yang kamu sukai. Belum
   ketemu? Katakan, dan sebutkan apa yang harus diperiksa orang dengan akses log Railway
3. **Pemantauan gap** — SQL-nya, tampilannya di layar audit, dan catatan di `docs/riwayat/`
4. **Jejak kegagalan** — rute mana mencatat apa, dan bagaimana kamu memastikan bebas PII
5. **Perbaikan** — apa yang diperbaiki dan testnya; atau pernyataan jelas bahwa tak ada
   cacat yang terbukti
6. **Yang masih menggantung** — V-6, baris suppression pertama, commit yang belum mendarat
7. **Yang ditemukan tapi tidak disentuh**
8. **Yang TIDAK bisa kamu verifikasi**

Gate akhir: `tsc --noEmit` bersih, `next lint` bersih, seluruh test hijau,
`NODE_ENV=production npm run build` lulus. Sebutkan jumlah test sebelum (219) dan sesudah.

Jangan klaim apa pun yang belum kamu jalankan dan lihat hasilnya.

# SELESAI — AKHIR PROMPT
