# CLAUDE CODE PROMPT — Sprint 3L: Satu Klik, Bukan Satu Ceklis

> **`docs/CEKLIS-verifikasi-live.md` sudah ada sejak Sprint 3D dan belum pernah dijalankan sekali pun.**
>
> Enam sprint berturut-turut ditutup dengan kalimat yang sama: "menunggu satu orang membuka
> satu halaman". Orangnya ada — `tifany@20fit.id` memakai sistem ini 30+ kali. Yang tidak
> pernah terjadi adalah membuka terminal, mengisi `.env.local`, menjalankan skrip, lalu
> menyalin SQL ke SQL Editor.
>
> **Meminta untuk ketujuh kalinya tidak akan mengubah hasilnya. Ubah permintaannya.**
>
> Dan ada masalah kedua yang lebih halus: **bukti yang sudah ada dua kali terlewat.**
> `/consent` terbukti jalan di `id=32` tapi tetap tercatat "belum terbukti" selama satu
> sprint penuh. `/settings` terbukti di `id` 44–47 dan baru ketahuan saat seseorang
> memeriksa ulang. Penyebabnya sama: statusnya hidup di berkas markdown yang harus
> diperbarui manusia, sementara buktinya hidup di tabel yang bergerak sendiri.
>
> **Status verifikasi harus dihitung dari `crm_audit_log`, bukan diketik ke dokumen.**

---

## KONDISI PRODUKSI — 11 Agustus 2026 ~09:30 UTC, verifikasi ulang sendiri

| | |
|---|---|
| `crm_audit_log` | 43 baris · `max(id)` 47 · sequence 47 · gap `4, 37, 38, 39` |
| Aktivitas terakhir | 09:05:18 UTC — **tak ada pemakaian sejak Sprint 3K** |
| `profile.viewed` | **0** — V-6 masih terbuka |
| `crm_suppression` / `crm_consent` | 0 / 0 baris |

Sequence tak tersentuh sejak 3K, sesuai K-21. Gap tidak bertambah — konsisten dengan
"tidak ada yang memakai sistem", bukan dengan "masalahnya sudah hilang".

---

## ATURAN PROSES

```bash
git fetch --all --prune
git log --oneline -3 origin/main
git log --oneline origin/main..HEAD
```

Harapan: `origin/main` di `3ac62b1`; branch memuat `69e59ca` (3I), `6504645` (3J),
`46d3978` (docs), `4a89207` (3K) — **empat commit belum ter-merge**. Baseline test **227**.
Berbeda → **berhenti dan lapor**.

---

# PROMPT UNTUK CLAUDE CODE — SALIN MULAI DARI SINI

---

## TUGAS 1 — Status verifikasi dihitung, bukan diketik

Bangun lapisan baca yang menurunkan status tiap rute **dari `crm_audit_log`**, bukan dari
dokumen. Status yang mungkin hanya tiga, dan pembedaannya penting:

| Status | Artinya | Contoh |
|---|---|---|
| **Terbukti** | ada baris audit yang hanya bisa dihasilkan rute itu | `/audience`, `/consent`, `/settings` |
| **Belum terbukti** | rute menulis audit, tapi belum ada barisnya | `/audience/[id]` (`profile.viewed` = 0), `/api/search` |
| **Tidak dapat dibuktikan dari audit** | rute sengaja **tidak** menulis audit (aturan K-07) | `/`, `/quality` |

Kategori ketiga wajib dibedakan dari kedua. Menyatukan keduanya jadi "belum terbukti"
membalik arti aturan Sprint 3E: nol baris dari `/quality` adalah perilaku yang **benar**,
bukan kekurangan bukti. Untuk kategori ini, sebutkan satu-satunya bukti yang mungkin —
log Railway atau mata orang.

Sertakan waktu bukti terakhir dan siapa aktornya, supaya "terbukti" tidak berarti
"pernah berhasil sekali pada Agustus 2026" tanpa ada yang sadar itu sudah lama.

---

## TUGAS 2 — Halaman diagnostik satu klik

Rute baru `/settings/diagnostik`, digerbangi `audit.view` (sama dengan layar audit),
fail-closed seperti biasa.

**Isinya:**

1. **Tabel status dari TUGAS 1** — tiga kategori, apa adanya.
2. **Pemeriksaan lapisan baca, dijalankan saat halaman dibuka.** Panggil fungsi lapisan
   baca yang sebenarnya — `fetchAudience`, `fetchQualitySnapshot`, `fetchDashboardStats`,
   `fetchConsentRegister`, `fetchAuditLog`, `fetchProfileById`, dan lapisan pencarian —
   lalu laporkan LULUS/GAGAL per lapisan beserta waktunya. Inilah yang membuktikan query
   `supabase-js` benar-benar jalan, dan itu persis yang `verify-live.mjs` lakukan tapi
   butuh terminal.
3. **Kesehatan gap** — ringkasan dari helper 3K, dengan `id=4` dikenal sah.
4. **Langkah yang tetap butuh manusia, sebagai tautan langsung.** Untuk V-6, pilih satu
   `customer_id` di server dan render tautan ke halaman detailnya. Satu klik, bukan
   instruksi. Setelah diklik, muat ulang halaman diagnostik akan menunjukkan V-6 berubah
   jadi terbukti — **atau** menunjukkan gap bertambah, dan itu justru jawaban yang dicari
   sejak Sprint 3K.

**Batas keras:**

- Halaman ini **membaca saja**. Nol `INSERT` ke `crm_suppression`, `crm_consent`, atau
  data pelanggan. Ia tidak boleh menulis baris uji apa pun.
- Ia memanggil **lapisan baca**, bukan route handler, jadi ia **tidak** menulis baris
  audit untuk rute yang diperiksanya. Membanjiri audit dengan pemeriksaan sendiri akan
  merusak justru bukti yang sedang ia laporkan. Buktikan itu: bandingkan jumlah baris
  audit sebelum dan sesudah dalam testmu.
- Membuka halaman ini sendiri **diaudit** — ia mengembalikan baris individual (waktu bukti
  terakhir, aktor). Pakai `list.viewed` dengan `target_table='crm_audit_log'`; **jangan**
  buat aksi baru.
- Nol PII: tabel status menyebut rute dan waktu, bukan pelanggan. Tautan V-6 memuat satu
  `customer_id` di URL — itu tak terhindarkan dan dapat diterima (jalur `/audience/[id]`
  memang begitu), tapi **jangan** menampilkan nama, telepon, atau email di halaman ini.

---

## TUGAS 3 — Pensiunkan ceklis yang tak pernah dijalankan

`docs/CEKLIS-verifikasi-live.md` dan `scripts/verify-live.mjs` **jangan dihapus** —
keduanya tetap satu-satunya cara memeriksa dari luar aplikasi, dan itu berharga kalau
aplikasinya sendiri yang rusak.

Yang berubah: jadikan keduanya jalur cadangan, bukan jalur utama. Tulis di paling atas
kedua berkas bahwa cara termudah kini `/settings/diagnostik`, dan sisakan skrip untuk
kasus "aplikasi tak bisa dibuka". Perbarui `docs/riwayat/` — tambahkan keputusan baru:
status verifikasi diturunkan dari data, dan dokumen tidak lagi memegang status.

Sebutkan juga di `docs/riwayat/TEMUAN.md` bahwa bukti terlewat dua kali karena statusnya
disimpan manual. Itu pola, bukan kelalaian satu orang, dan sprint ini memperbaiki polanya.

---

## TUGAS 4 — Siapkan merge, dan tulis alasannya dengan jujur

Empat commit menunggu, dan salah satunya adalah **instrumen diagnostik untuk gejala yang
hanya muncul di produksi.** Jejak kegagalan 3K tidak bisa mencatat apa pun selama ia ada
di branch. Setiap hari ia tidak mendarat adalah hari ketika kejadian berikutnya kembali
hilang tanpa bekas.

Perbarui berkas PR jadi mencakup 3L. Kalimat teratas: **siklus ini memasang instrumennya
sekaligus membuat pemakaiannya satu klik.** Sertakan:

- Apa yang berubah bagi pemakai, per layar
- Bahwa `/settings/diagnostik` adalah cara tercepat memvalidasi deploy-nya sendiri —
  buka satu halaman setelah deploy, dan seluruh lapisan baca terperiksa
- Risiko teratas yang tidak berubah: penyebab gap 37–39 masih belum terbukti, dan hanya
  log Railway yang bisa menjawabnya

**JANGAN merge sendiri.** Siapkan, lalu minta izin.

---

## TUGAS 5 — Yang masih menggantung

- **V-6** — kini satu klik dari halaman diagnostik, setelah deploy
- **Baris suppression pertama** — panduan siap di `docs/PERTAMA-suppression.md`; masih
  menunggu permintaan nyata, dan **jangan** dibuatkan baris uji
- **Penyebab gap 37–39** — butuh log Railway jendela 08:01–08:58 UTC 11 Agustus. Kalau
  akses `get_logs` masih gagal seperti di 3K, sebutkan lagi apa persisnya yang harus dicari

---

## LARANGAN

| Jangan | Alasan |
|---|---|
| Jangan menulis baris audit dari halaman diagnostik untuk rute yang diperiksanya | Merusak bukti yang sedang ia laporkan |
| Jangan `INSERT` uji ke `crm_suppression`, `crm_consent`, atau data pelanggan | Baris suppression tak bisa dihapus |
| Jangan setval atau reset `crm_audit_log_id_seq` | K-21: gap adalah bukti |
| Jangan hapus `CEKLIS-verifikasi-live.md` atau `verify-live.mjs` | Jalur cadangan saat aplikasi tak bisa dibuka |
| Jangan satukan "belum terbukti" dengan "tidak dapat dibuktikan dari audit" | Membalik arti aturan K-07 |
| Jangan buat aksi audit baru | Allowlist migrasi 8 memangkas per nama eksak |
| Jangan buat migrasi, view, atau RPC baru | Nol perubahan skema sprint ini |
| Jangan tampilkan nama, telepon, atau email di halaman diagnostik | Halaman ini soal rute, bukan soal orang |
| Jangan bangun jalur tulis consent | Masih menunggu kanal opt-in yang nyata |
| Jangan sentuh objek di luar `crm_*` dan `master_customer` (baca saja) | 101 fungsi milik tim lain |
| Jangan merge atau push ke `main` tanpa izin eksplisit | Produksi sedang dipakai orang |
| Jangan hapus prefix `NODE_ENV=production` di `railway.json` | Baca README dulu |

---

## LAPORAN PENUTUP

1. **Status remote + kondisi database** — termasuk gap sekarang dan nilai sequence
2. **Status terhitung** — bagaimana tiap kategori diturunkan dari `crm_audit_log`, dan
   bagaimana kategori ketiga dibedakan dari kedua
3. **Halaman diagnostik** — apa yang diperiksa, dan **bukti** bahwa ia tidak menambah
   baris audit untuk rute yang diperiksanya
4. **Ceklis & skrip** — apa yang berubah, dan apa yang sengaja dipertahankan
5. **Berkas PR** — kalimat teratas, dan risiko yang tidak berubah
6. **Yang masih menggantung**
7. **Yang ditemukan tapi tidak disentuh**
8. **Yang TIDAK bisa kamu verifikasi**

Gate akhir: `tsc --noEmit` bersih, `next lint` bersih, seluruh test hijau,
`NODE_ENV=production npm run build` lulus. Sebutkan jumlah test sebelum (227) dan sesudah.

Jangan klaim apa pun yang belum kamu jalankan dan lihat hasilnya.

# SELESAI — AKHIR PROMPT
