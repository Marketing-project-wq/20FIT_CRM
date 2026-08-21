# CLAUDE CODE PROMPT — Sprint 4B: Dua Bahasa dan Rapikan Tampilan

> **Sprint 4A terverifikasi independen.** `crm_staging_segment_ids` live, `STABLE`, ACL
> hanya `postgres | service_role`, dan pemanggilan nyata mengembalikan `New User` **74.021**
> serta `Fitco User` **67.653** — cocok persis dengan laporanmu. Ketujuh fungsi `crm_*`
> kini terkunci; satu-satunya yang masih terbuka adalah `crm_audit_log_no_mutate`, dan
> penilaianmu bahwa ia inert tetap benar (fungsi trigger, `SECURITY INVOKER`).
>
> Memilih semi-join `EXISTS` setelah **mengukur** (330 ms versus 370 ms) alih-alih menerima
> saran `distinct` apa adanya adalah cara kerja yang benar.
>
> **Sprint ini menyentuh hampir setiap berkas UI dan nol logika.** Kalau sebuah perubahan
> mengubah angka, gerbang peran, atau isi peringatan, itu di luar lingkup — batalkan dan
> laporkan.

---

## ATURAN PROSES

```bash
git fetch --all --prune
git log --oneline -3 origin/main
git log --oneline origin/main..HEAD
```

Baseline test **396**. Berbeda → berhenti dan lapor.
**Nol perubahan skema. Nol perubahan lapisan baca. Nol perubahan gerbang.**

---

# PROMPT UNTUK CLAUDE CODE — SALIN MULAI DARI SINI

---

## TUGAS 1 — Dua bahasa: Indonesia dan Inggris

Indonesia tetap bawaan. Inggris ditambahkan.

**Fondasi yang wajib:**

- Satu berkas terjemahan per bahasa dengan kunci yang sama, dan **test yang gagal bila ada
  kunci hilang di salah satu bahasa** — di kedua arah. Tanpa itu, teks Indonesia akan bocor
  ke tampilan Inggris secara acak dan tak seorang pun menyadarinya sampai ada yang melihat.
- Pilihan bahasa disimpan per pengguna dan bertahan antar sesi.
- Angka dan tanggal mengikuti bahasanya: `id-ID` versus `en-US`.

**Format angka adalah bahaya terbesar di sini.** `82.253` berarti delapan puluh dua ribu
dalam Indonesia dan delapan puluh dua koma dua lima tiga dalam Inggris. Di layar `/quality`
yang penuh persentase dan hitungan, salah format bukan sekadar tidak rapi — ia mengubah
arti angkanya. Tulis test untuk keduanya, termasuk kasus `7,03%` versus `7.03%`.

**Terjemahan peringatan kualitas data adalah bagian tersulit**, dan nuansanya mudah hilang:

| Indonesia | Benar | Salah, dan kenapa |
|---|---|---|
| tidak terekam | not recorded | "no data" — mengaburkan sebabnya |
| belum terisi | not filled in | "empty" — terbaca seperti nol |
| cap waktu muat | load timestamp | "date added" — justru mengklaim hal yang dibantah |
| 0 (terukur) versus — | 0 (measured) versus — | menyatukan keduanya menghapus K-08 |
| tidak ada sumber data | no data source exists | "unavailable" — terdengar sementara |

Kalau sebuah frasa Inggris tidak bisa membawa nuansanya, **panjangkan kalimatnya** — jangan
potong artinya. Peringatan yang jadi lebih halus dalam bahasa Inggris adalah kemunduran.

**Jangan terjemahkan nilai yang tersimpan.** `Campion user`, `Fitco User`, `Padel rabel`,
`New User` tetap apa adanya di kedua bahasa — itu data, bukan label. Nama kolom teknis
(`phone_normalized`, `last_activity_at`, `email_normalized`) juga tetap. Kalau perlu
dijelaskan, beri keterangan **di sebelahnya**, jangan ganti nilainya.

**Yang juga harus ikut dua bahasa, dan mudah terlupa:** pesan galat route, teks penolakan
akses, isi email reset kata sandi, judul kolom CSV ekspor, dan blok keterangan di dalam
berkas ekspor. Sebutkan mana saja yang kamu tangani dan mana yang sengaja dibiarkan
satu bahasa beserta alasannya.

**Asisten AI:** deskripsi segmen bisa ditulis dalam bahasa apa pun. Prompt ke model harus
memuat kosakata kriteria yang sama, dan alasan "tidak bisa diungkapkan" dikembalikan dalam
bahasa yang sedang dipakai pengguna. Jangan buat dua jalur berbeda untuk dua bahasa.

---

## TUGAS 2 — Rapikan tampilan, kurangi tebal

Terlalu banyak teks ditebalkan sehingga penekanannya hilang. Kalau semuanya menonjol, tidak
ada yang menonjol.

**Baca `/mnt/skills/public/frontend-design/SKILL.md` sebelum mulai** — ia memuat batasan dan
token untuk lingkungan ini.

**Arahannya:**

- Bangun hierarki lewat ukuran, spasi, dan warna teks — bukan ketebalan. Token yang sudah
  ada: `text-ink`, `text-ink-soft`, `text-ink-faint`.
- Tebal disisakan untuk **satu hal per blok**: angka utamanya, atau judul bagiannya. Bukan
  keduanya, dan bukan kata-kata di tengah kalimat.
- Peringatan kualitas data tetap harus menonjol — lewat tint dan tata letak, bukan lewat
  menebalkan setengah kalimat. Di sinilah penebalan paling banyak menumpuk sekarang.
- Rapikan jarak antar-blok supaya halaman padat tetap bisa dipindai. `/quality` dan detail
  profil adalah dua yang paling padat.
- **Nol kelas warna bernomor** (K-11) — hanya token datar dan utilitas `.tint-*`. Pagar
  Tailwind dari Sprint 3B akan menangkapnya kalau terlewat.

**Batas yang tidak boleh dilewati:**

Isi peringatan, pembedaan `0` versus `—`, penandaan asal data, angka, dan gerbang peran
**tidak berubah**. Ini pekerjaan tampilan, bukan pekerjaan makna.

Kalau sebuah peringatan jadi kurang terlihat setelah dirapikan, itu **kemunduran, bukan
kerapian**. Uji dengan pertanyaan ini per layar: apakah orang yang baru pertama membuka
halaman ini masih akan menyadari bahwa gender 0% terisi, bahwa 98,65% lifetime value bernilai
nol, dan bahwa RFM menaruh 92% orang di satu keranjang? Kalau jawabannya jadi lebih ragu,
perbaikannya salah arah.

---

## TUGAS 3 — Bukti keduanya tidak merusak apa pun

Sprint ini menyentuh banyak berkas sekaligus, jadi buktinya harus lebih kuat dari biasanya.

- Seluruh 396 test lama tetap hijau, **tanpa dimodifikasi**. Test yang perlu diubah untuk
  lolos adalah tanda ada perilaku yang berubah — laporkan, jangan sesuaikan diam-diam.
- Tambahkan test kunci-hilang dua arah dan test format angka per bahasa.
- Jalankan sapuan pagar Tailwind dan pagar EXECUTE; keduanya harus tetap hijau.
- Sebutkan berapa berkas yang tersentuh. Diff yang besar itu wajar untuk sprint ini, tapi
  jumlahnya perlu tercatat supaya peninjau tahu apa yang ia hadapi.

---

## LARANGAN

| Jangan | Alasan |
|---|---|
| Jangan terjemahkan nilai data tersimpan | `Campion user`, `Fitco User` adalah data |
| Jangan pakai satu format angka untuk dua bahasa | `82.253` berarti berbeda di keduanya |
| Jangan perhalus peringatan saat menerjemahkan | "no data" bukan "tidak terekam" |
| Jangan kurangi keterlihatan peringatan demi kerapian | Itu kemunduran |
| Jangan ubah angka, gerbang peran, `0` versus `—`, atau penandaan asal | Sprint tampilan |
| Jangan ubah test lama supaya lolos | Itu tanda perilaku berubah |
| Jangan ubah lapisan baca, RPC, atau skema | Nol perubahan skema |
| Jangan pakai kelas warna bernomor | K-11 |
| Jangan buat jalur AI terpisah per bahasa | Satu jalur, kosakata sama |
| Jangan hapus prefix `NODE_ENV=production` di `railway.json` | Baca README dulu |

---

## LAPORAN PENUTUP

1. Status remote + kondisi database
2. **Dua bahasa** — cara kunci hilang dijaga, cara format angka dibedakan, dan permukaan
   mana yang ikut (galat, penolakan, email, header CSV) versus yang sengaja tidak
3. **Terjemahan peringatan** — frasa yang sulit dan bagaimana kamu memutuskan
4. **Tampilan** — di mana tebal dikurangi, dan apa yang menggantikannya
5. **Bukti makna tidak berubah** — 396 test lama hijau tanpa dimodifikasi, kedua pagar hijau,
   dan jumlah berkas tersentuh
6. Yang masih menggantung — sembilan item `MENUNGGU-TINDAKAN-MANUSIA.md`
7. Yang ditemukan tapi tidak disentuh
8. Yang TIDAK bisa kamu verifikasi

Gate akhir: `tsc --noEmit` bersih, `next lint` bersih, seluruh test hijau,
`NODE_ENV=production npm run build` lulus. Sebutkan jumlah test sebelum (396) dan sesudah.

Jangan klaim apa pun yang belum kamu jalankan dan lihat hasilnya.

# SELESAI — AKHIR PROMPT
