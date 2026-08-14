# CLAUDE CODE PROMPT — Sprint 4D: Terjemahkan Layar Dalam, Urutan Dibalik

> **Berhenti dengan alasan yang dijelaskan, bukan diam-diam kehabisan.** Itu keputusan yang
> benar, dan penanda cakupan membuat keadaan setengah-jalan jujur alih-alih terlihat rusak.
> Registry yang menghapus penandanya sendiri saat layar selesai juga rancangan yang bagus —
> tidak ada pembersihan manual yang bisa tertinggal.
>
> **Tapi dua hal mengubah urutan yang kamu usulkan.**

---

## KENAPA URUTANNYA DIBALIK

**1. Kedua pengaman belum pernah membuktikan diri.** Kamu sendiri menyebutnya *vacuous* —
hijau, tapi belum ada satu pun kunci `.warn.` untuk diperiksa. Proyek ini punya pola tegas:
pagar Tailwind (3B), paritas retensi (3E), dan pagar EXECUTE (3I) semuanya **dibuktikan
menggigit** dengan menyuntik pelanggaran, menunjukkan pesan gagalnya, lalu mengembalikannya.
Pengaman yang belum pernah menyala adalah harapan, bukan pengaman — dan membangun lima layar
di atasnya berarti lima layar tanpa jaring.

**2. `/quality` bukan hanya terpadat, ia juga butuh arsitektur baru.** Teksnya dihitung di
server (`quality.ts`, `quality-types.ts`), sehingga menerjemahkannya butuh pemetaan
kunci→kamus dengan fallback — persis yang kamu catat di poin 8. Mengerjakan arsitektur baru
**untuk pertama kali** di layar tersulit adalah urutan yang terbalik. Kalau pemetaannya
ternyata salah bentuk, kamu menemukannya setelah menerjemahkan 90 string, bukan sebelum.

**Kabar baiknya, dan ini mungkin terlewat:** `quality-types.ts` **sudah** punya `key` di
`FillRate`, `IssueCount`, `SatelliteCoverage`, dan `VERIFIED_ARTIFACTS`. Jadi klien bisa
memetakan `key` → kamus dengan fallback ke `note`/`definition` dari server **tanpa mengubah
`quality.ts` sama sekali**. Lapisan bacanya tidak perlu disentuh. Verifikasi sendiri sebelum
merencanakan — kalau benar, `/quality` jauh lebih ringan daripada perkiraanmu.

---

## ATURAN PROSES

```bash
git fetch --all --prune
git log --oneline -3 origin/main
git log --oneline origin/main..HEAD
```

Baseline test **405**. Berbeda → berhenti dan lapor.
**Nol perubahan skema, lapisan baca, gerbang, atau angka.**

---

# PROMPT UNTUK CLAUDE CODE — SALIN MULAI DARI SINI

---

## TUGAS 1 — Buktikan kedua pengaman menggigit

Sebelum menerjemahkan layar apa pun.

- **Pengaman istilah terlarang:** tambahkan sementara satu kunci `.warn.` dengan terjemahan
  Inggris yang memuat `no data`. Tunjukkan test gagal beserta pesannya. Kembalikan,
  tunjukkan hijau lagi.
- **Pengaman panjang:** tambahkan sementara satu kunci `.warn.` dengan versi Inggris yang
  dipangkas di bawah ambang 50%. Tunjukkan gagal, kembalikan, tunjukkan hijau.

Lampirkan kedua pesan gagalnya di laporan. Kalau salah satu **tidak** gagal seperti yang
diharapkan, itu temuan yang lebih penting daripada seluruh sisa sprint — laporkan dan
perbaiki pengamannya dulu.

Ambang 50% yang kamu pilih beserta argumennya masuk akal. Sesudah beberapa layar nyata
diterjemahkan, tinjau ulang: kalau tidak ada peringatan sah yang mendekati ambang, ia terlalu
longgar; kalau banyak yang butuh pengecualian, terlalu ketat.

---

## TUGAS 2 — Terjemahkan dari yang paling ringan

Urutan baru, dan alasannya: validasi jalur pipa dulu di layar yang risikonya kecil, baru
hadapi yang padat dengan pipa yang sudah terbukti.

| Urutan | Layar | Kenapa di posisi ini |
|---|---|---|
| 1 | **Pencarian** | Paling sedikit teks; membuktikan pola end-to-end: terjemahkan → tambah ke `BILINGUAL_SCREENS` → penanda hilang → pengaman memvalidasi |
| 2 | **`/consent`** | Sebagian besar teks klien; peringatannya penting tapi jumlahnya sedikit |
| 3 | **Segment builder** | Teks klien; catatan RFM, ambang segmen kecil, batas OR |
| 4 | **Layar audit** | Campuran; kelas retensi, penanda artefak, penjelasan gap id |
| 5 | **Detail profil** | Campuran; penandaan asal data dan bagian klinis |
| 6 | **`/quality`** | Terpadat, dan satu-satunya yang butuh pemetaan `key`→kamus |

**Setelah layar pertama selesai, berhenti sejenak dan laporkan** apakah polanya bekerja
seperti yang diharapkan — penanda benar-benar hilang, pengaman benar-benar memvalidasi
kunci baru. Kalau ada yang meleset, perbaiki sebelum melanjutkan. Sesudah itu lanjutkan
sebanyak yang muat **dikerjakan dengan benar**, dan berhenti jujur seperti sesi lalu.

Untuk `/quality`, sebelum menerjemahkan: verifikasi dugaan `key` di atas dan **sampaikan
bentuk pemetaannya** sebelum menulis 90 string. Kalau ternyata `key`-nya tidak cukup,
katakan dan usulkan bentuk lain — jangan mengubah `quality.ts` tanpa membahasnya.

---

## TUGAS 3 — Nuansa yang harus bertahan

Keputusan 4B dan lima istilah terlarang sudah terkodekan; pakai. Yang belum punya string
Inggris, dan jebakannya:

| Indonesia | Nuansa yang wajib bertahan |
|---|---|
| cap muat, bukan aktivitas | tanggalnya nyata; **artinya** yang bukan aktivitas |
| ambigu — tidak bisa dipastikan | nilainya sah, urutannya yang tak pasti (bukan "invalid") |
| dilemahkan, belum ditutup | temuan yang berhenti muncul bukan temuan yang terjawab |
| artefak verifikasi | baris audit sah yang bukan aktivitas nyata |
| butuh persetujuan, fitur belum tersedia | ditolak karena alurnya belum ada, bukan karena tidak berhak |
| suppression menang atas consent | hierarki, bukan sekadar urutan pemeriksaan |
| 92% dalam satu keranjang | bahwa RFM tak layak jadi dasar kampanye |
| nol baris consent = nol orang boleh dihubungi | bukan "belum ada data", melainkan tidak ada dasar |

Setiap peringatan yang diterjemahkan diberi komentar berisi tiga hal: kalimat Indonesianya,
kalimat Inggrisnya, dan nuansa yang berisiko hilang. Itu yang mencegah orang berikutnya
"menyederhanakan" kalimat yang panjangnya disengaja.

---

## TUGAS 4 — Tinjau tiap layar yang selesai sebagai pembaca baru

Untuk **setiap** layar yang kamu selesaikan, buka dalam bahasa Inggris dan jawab: apakah
pembaca yang baru pertama melihatnya masih menyadari peringatan yang relevan di layar itu?

Untuk `/quality` khususnya: gender 0% terisi, 98,65% lifetime value nol, kolom waktu adalah
cap muat, dan RFM 92% satu keranjang.

Kalau ada yang jadi lebih ragu dalam bahasa Inggris, perbaiki kalimatnya — jangan turunkan
standarnya. Laporkan yang sempat meleset dan bagaimana diperbaiki.

---

## LARANGAN

| Jangan | Alasan |
|---|---|
| Jangan terjemahkan layar sebelum kedua pengaman terbukti menggigit | Lima layar tanpa jaring |
| Jangan mulai dari `/quality` | Arsitektur baru di layar tersulit adalah urutan terbalik |
| Jangan ubah `quality.ts` tanpa membahas bentuk pemetaannya dulu | Itu lapisan baca |
| Jangan persingkat peringatan agar rapi dalam bahasa Inggris | Panjangnya disengaja |
| Jangan terjemahkan nilai data tersimpan atau nama aksi audit | Data dan identifier, bukan label |
| Jangan ubah angka, gerbang peran, `0` versus `—`, penandaan asal | Sprint bahasa |
| Jangan ubah test lama supaya lolos | Tanda perilaku berubah |
| Jangan tambahkan layar ke `BILINGUAL_SCREENS` sebelum benar-benar tuntas | Penanda hilang padahal teksnya masih campur |
| Jangan pakai kelas warna bernomor | K-11 |
| Jangan hapus prefix `NODE_ENV=production` di `railway.json` | Baca README dulu |

---

## LAPORAN PENUTUP

1. Status remote + kondisi database
2. **Bukti pengaman menggigit** — kedua pesan gagalnya, lalu hijau setelah dikembalikan
3. **Layar pertama** — apakah polanya bekerja, dan apa yang perlu diperbaiki
4. **Layar yang selesai** — mana tuntas, mana tersisa, dan berhenti di mana beserta alasannya
5. **`/quality`** — hasil verifikasi dugaan `key`, dan bentuk pemetaan yang kamu usulkan
6. **Nuansa** — keputusan untuk delapan frasa di tabel, dan frasa baru yang kamu temui
7. **Tinjauan pembaca baru** — per layar yang selesai
8. Yang masih menggantung — sembilan item `MENUNGGU-TINDAKAN-MANUSIA.md`
9. Yang TIDAK bisa kamu verifikasi

Gate akhir: `tsc --noEmit` bersih, `next lint` bersih, seluruh test hijau, kedua pagar lama
(Tailwind dan EXECUTE) hijau, `NODE_ENV=production npm run build` lulus. Sebutkan jumlah test
sebelum (405) dan sesudah, dan konfirmasi test lama tidak dimodifikasi.

Jangan klaim apa pun yang belum kamu jalankan dan lihat hasilnya.

# SELESAI — AKHIR PROMPT
