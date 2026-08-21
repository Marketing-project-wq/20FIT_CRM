# CLAUDE CODE PROMPT — Pendaratan: Merge PR #11 dan Luruskan Deploy Railway

> **Izin diberikan: merge PR #11 ke `main`.**
>
> **Tapi pahami dulu apa yang sebenarnya terjadi saat kamu merge, karena ini berlawanan
> dengan intuisi.** Produksi **sudah** menjalankan kode branch (T-18). Semua yang dibangun
> — RPC contactability, rantai klinis, filter segmen, perbaikan email — **sudah live sejak
> di-push.** Merge PR #11 **tidak men-deploy apa pun yang baru.** Ia menyelaraskan `main`
> dengan apa yang sudah berjalan.
>
> Karena itu risikonya bukan di merge. Risikonya ada di langkah sesudahnya: **mengarahkan
> Railway ke `main`.** Kalau itu dilakukan sebelum merge, produksi mundur belasan commit ke
> kode yang membaca 408 ribu baris consent tanpa batas dan menampilkan angka salah tanpa
> satu pun error.
>
> **Urutannya tidak boleh dibalik. Merge dulu, arahkan ulang kemudian.**

---

## KONDISI DASAR — 12 Agustus 2026, verifikasi ulang sebelum mulai

| | |
|---|---|
| `crm_audit_log` | 128 baris · `max(id)` 132 · gap tetap `4, 37, 38, 39` |
| `crm_consent` | 408.119 baris |
| `crm_suppression` | 0 baris |
| `crm_contactable_counts()` | `{"marketing":82253,"transactional":82253}` |
| Entri ledger `crm_*` | 13 |
| Test | 360 |

Angka-angka ini adalah **acuan pasca-deploy**. Kalau setelah pendaratan ada yang berbeda,
itu sinyal, bukan variasi.

---

# PROMPT UNTUK CLAUDE CODE — SALIN MULAI DARI SINI

---

## BAGIAN A — Periksa sebelum merge

1. `git fetch --all --prune`, lalu laporkan `origin/main`, HEAD branch, dan jumlah commit
   selisihnya.
2. Jalankan gate penuh di HEAD branch: `tsc --noEmit`, `next lint`, seluruh test,
   `NODE_ENV=production npm run build`. **Semua harus hijau sebelum merge**, bukan sesudah.
3. Periksa status CI PR #11. Kalau merah, **berhenti dan lapor** — jangan merge di atas CI
   yang gagal.
4. Konfirmasi ulang angka di tabel Kondisi Dasar. Selisih apa pun dilaporkan.

---

## BAGIAN B — Merge PR #11

Merge `claude/lanjutkan-pekerjaan-mno804` → `main` lewat PR #11.

**Pakai merge commit, jangan squash.** Riwayat sprint-per-sprint adalah bagian dari arsip
proyek ini — `docs/riwayat/` merujuk SHA per sprint, dan squash akan memutus rujukan itu.

Setelah merge, konfirmasi: `git diff origin/main HEAD` **kosong**. Kalau tidak kosong,
ada yang tidak ikut — berhenti dan lapor.

**Jangan sentuh Railway.** Setelah merge, `main` dan branch identik, jadi apa pun sumber
deploy-nya, isi produksi sama. Itu justru yang membuat langkah berikutnya aman.

---

## BAGIAN C — Instruksi Railway untuk manusia

Kamu tidak punya akses dashboard Railway. Tulis `docs/DEPLOY-RAILWAY.md` sebagai instruksi
yang bisa diikuti tanpa menebak:

1. **Buka** Railway → project 20FIT CRM → service `20FIT_CRM` → **Settings → Source**.
2. **Catat branch yang tertera sekarang.** Ini menjawab T-18 secara definitif; hasilnya
   dicatat di `docs/riwayat/TEMUAN.md`.
3. **Kalau tertera branch kerja:** ubah ke `main`. Aman dilakukan **hanya karena** BAGIAN B
   sudah selesai — isinya identik.
4. **Kalau ternyata sudah `main`:** berarti ada mekanisme lain (preview deploy PR, atau
   webhook lain) yang membuat kode branch tayang di URL produksi. **Jangan ubah apa pun** —
   laporkan dan selidiki, karena berarti pemahaman kita masih kurang satu bagian.
5. **Tunggu deploy selesai**, lalu lanjut ke BAGIAN D.

Tulis juga **konsekuensi perubahan alur kerja**: setelah diarahkan ke `main`, push ke branch
**tidak lagi** tayang di produksi. Selama belasan sprint tim terbiasa melihat perubahan
langsung; kebiasaan itu berubah, dan orang akan mengira deploy-nya rusak kalau tidak
diberitahu.

---

## BAGIAN D — Verifikasi pasca-deploy

Sebagian butuh sesi login manusia. Tulis sebagai ceklis di `docs/DEPLOY-RAILWAY.md`, dengan
SQL persis untuk tiap pemeriksaan.

**D1 — Satu halaman memeriksa semuanya.** Buka `/settings/diagnostik`. Ia menjalankan
seluruh lapisan baca sekaligus dan melaporkan LULUS/GAGAL per lapisan. Ini pemeriksaan
tercepat dan paling luas; lakukan pertama.

**D2 — Angka harus cocok dengan acuan:**

| Layar | Harapan |
|---|---|
| Dashboard "bisa dihubungi" | **82.253** marketing, **82.253** layanan |
| `/quality` blok cakupan | sesuai angka per sumber, dengan kolom kunci |
| Segment builder tanpa filter | ukuran audiens 82.253, berpasangan dengan bisa-dihubungi |

Kalau dashboard menampilkan angka lain — terutama **163.252** — itu berarti jalur
`count(distinct)` gagal dan yang terhitung baris, bukan profil. Laporkan segera.

**D3 — Audit mendarat, dan gap tidak bertambah.** Sesudah menjelajah beberapa layar,
periksa `crm_audit_log`: baris baru muncul untuk `/audience`, detail profil, `/settings`,
`/consent`, dan pencarian; **nol** baris dari `/` dan `/quality` (K-07, itu perilaku benar);
dan **gap tetap `4, 37, 38, 39`**. Gap yang bertambah berarti ada operasi teraudit yang
gagal — itu sinyal paling awal bahwa sesuatu rusak.

**D4 — Gerbang klinis.** Butuh akun uji berperan tanpa `profile.view_health`. Kriteria
klinis di segment builder harus **tidak muncul**, dan pemanggilan langsung harus 403.
Sebutkan di dokumen bahwa akun uji ini harus dibuat tim — **kamu tidak boleh membuat atau
mengubah `crm_user_role`**, karena itu memberi akses akun manusia di produksi.

**D5 — Reset kata sandi end-to-end.** Baru bermakna setelah token Mailtrap dirotasi dan
domain terverifikasi. Periksa: email datang dari `20FIT CRM <crm@20fit.id>`, berisi **kode
enam digit** (bukan tautan), dan **masuk Inbox, bukan Spam**. Kalau masih Spam, penyebabnya
SPF/DKIM/DMARC, bukan kode.

---

## BAGIAN E — Kesiapan revert, tiga tingkat

Perbarui `docs/PASCA-MERGE-monitoring-revert.md` supaya bisa dipakai orang yang panik jam
dua pagi — perintahnya siap salin, bukan uraian.

| Tingkat | Tindakan | Kehilangan |
|---|---|---|
| 1 — Kode | revert merge commit, deploy ulang | Nol; migrasi tetap berlaku |
| 2 — RPC & indeks | `drop function crm_contactable_counts()`, `drop index …purpose_status_customer_idx` | Nol data; dashboard kembali lambat |
| 3 — Data consent | `delete from crm_consent where source = '20fit_data_import'` | 408.119 baris; **bisa dijalankan ulang** lewat `crm_backfill_consent()` |

**Yang TIDAK bisa direvert**, dan harus tertulis mencolok: baris `crm_suppression` dan
`crm_audit_log` bersifat append-only. Nol baris suppression hari ini, jadi belum ada yang
terancam — tapi begitu baris pertama masuk, tingkat 3 tidak lagi berlaku untuknya.

**Apa yang diawasi 30 menit pertama:** log Railway untuk galat dari tujuh route API, gap
audit yang bertambah, dan angka contactable yang meleset dari 82.253. Sebutkan ketiganya
sebagai gejala yang memicu revert.

---

## BAGIAN F — Perbarui arsip

- `docs/riwayat/LINIMASA.md` — sprint 3T sampai 3X, SHA merge commit, dan status "di `main`"
  yang akhirnya benar untuk semuanya
- `docs/riwayat/TEMUAN.md` — T-18 ditutup atau diperbarui sesuai temuan BAGIAN C
- `docs/MENUNGGU-TINDAKAN-MANUSIA.md` — item "merge PR #11" dan "konfirmasi Railway"
  diselesaikan; sisanya tetap
- `docs/riwayat/FAKTA-DATA.md` — angka bertanggal hari ini

---

## LARANGAN

| Jangan | Alasan |
|---|---|
| Jangan arahkan Railway ke `main` sebelum BAGIAN B selesai | Produksi mundur belasan commit; angka salah tanpa error |
| Jangan squash saat merge | `docs/riwayat/` merujuk SHA per sprint |
| Jangan merge di atas CI merah | — |
| Jangan buat atau ubah `crm_user_role` untuk uji peran | Memberi akses akun manusia di produksi |
| Jangan `INSERT` baris suppression atau consent uji | Suppression tak bisa dihapus |
| Jangan buat migrasi, view, atau RPC baru | Pendaratan, bukan pembangunan |
| Jangan ubah setelan SMTP, template, atau Auth Supabase | Setelan proyek bersama |
| Jangan setval atau reset `crm_audit_log_id_seq` | K-21: gap adalah bukti |
| Jangan klaim deploy berhasil sebelum BAGIAN D dijalankan orang | Kamu tidak bisa membuka halaman produksi |
| Jangan hapus prefix `NODE_ENV=production` di `railway.json` | Baca README dulu |

---

## LAPORAN PENUTUP

1. **Sebelum merge** — status remote, hasil gate, status CI, konfirmasi angka acuan
2. **Merge** — SHA merge commit, dan konfirmasi `git diff origin/main HEAD` kosong
3. **Instruksi Railway** — isi `DEPLOY-RAILWAY.md`, termasuk penanganan kasus "ternyata
   sudah `main`"
4. **Ceklis verifikasi** — D1–D5 dengan SQL persisnya
5. **Revert** — tiga tingkat, dan apa yang tidak bisa direvert
6. **Arsip** — berkas yang diperbarui
7. **Yang masih menggantung** — item `MENUNGGU-TINDAKAN-MANUSIA.md` yang tersisa
8. **Yang TIDAK bisa kamu verifikasi** — seluruh BAGIAN C dan D butuh manusia; katakan
   apa adanya dan jangan mengklaim deploy berhasil

Jangan klaim apa pun yang belum kamu jalankan dan lihat hasilnya.

# SELESAI — AKHIR PROMPT
