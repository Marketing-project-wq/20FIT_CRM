# Ringkasan keputusan — Sprint 3B–3F (satu halaman)

> Untuk yang memutuskan, bukan yang meninjau kode. **Status: sudah ter-merge (PR #4)
> dan sedang/akan ter-deploy.** Jadi keputusannya bukan lagi "merge atau tidak",
> melainkan "**biarkan jalan, atau tarik kembali**".

## 1. Apa yang berubah bagi pemakai
Empat hal, semuanya **baca saja** — tidak ada tombol yang mengubah data pelanggan:
- **Dashboard** kini menampilkan angka nyata (ukuran audiens 82.253) dan kartu "Bisa
  dihubungi" yang jujur bernilai **0** (belum ada izin kontak yang tercatat).
- **Audience** — layar yang sudah dipakai — kini **nama bisa diklik** untuk membuka
  detail satu profil.
- **Quality** (baru): kondisi apa adanya data (banyak kolom kosong/salah — ditampilkan jujur).
- **Settings** (baru): jejak audit "siapa membuka apa", dan daftar peran.
- **Consent** (baru): register izin kontak — hari ini kosong, artinya belum ada yang
  boleh dikirimi marketing (itu memang benar secara hukum).

## 2. Apa yang sudah diverifikasi — dan sekuat apa buktinya
- **Kuat:** semua pemeriksaan otomatis lolos (tipe, lint, **179 test**, build produksi).
  Angka-angka layar dicocokkan dengan database lewat SQL setara. Migrasi tabel `crm_consent`
  dijalankan dan diperiksa enam titik (kosong, terkunci benar). Rencana pembatalan (revert)
  **sudah dilatih** dan terbukti bekerja.
- **Sedang:** logika query dicek dengan menginspeksi perintah yang dihasilkan, bukan
  menjalankannya lewat aplikasi.

## 3. Apa yang BELUM diverifikasi
Aplikasi **belum pernah** benar-benar dijalankan terhadap database lewat sesi login nyata —
lima sprint berturut-turut, karena lingkungan kerja memblokir koneksi ke Supabase. Jadi:
build & logika terbukti; **perilaku runtime di balik login belum**. Alat untuk menutup ini
sudah siap (`scripts/verify-live.mjs` + satu ceklis), tinggal dijalankan oleh orang yang
punya kredensial — **15 menit.**

## 4. Risiko terbesar (satu kalimat)
Kode ini belum pernah dieksekusi terhadap Supabase lewat aplikasi, jadi bug runtime yang
hanya muncul di balik sesi login bisa lolos sampai orang pertama membuka layar.

## 5. Kalau ada yang rusak
- **Kembali normal:** cepat. Membatalkan kode = satu perintah revert yang sudah dilatih;
  aplikasi kembali ke versi Sprint 3A yang sudah berjalan tenang selama ini. Hitungan menit.
- **Yang TIDAK bisa dikembalikan otomatis:** tabel `crm_consent` tetap ada setelah revert
  kode. Selama kosong, aman dibiarkan **atau** dihapus. Begitu ada satu baris izin, tabel
  itu jadi catatan hukum dan **tidak boleh dihapus sembarangan** — keputusan pemilik data +
  legal, bukan on-call. Hari ini tabel masih kosong.

## 6. Rekomendasi
**Biarkan deploy jalan, TETAPI jalankan verifikasi live (script + ceklis) segera hari ini,
dan pantau 30 menit pertama sesuai `docs/PASCA-MERGE-monitoring-revert.md`.** Alasannya:
semua yang bisa diperiksa tanpa kredensial sudah hijau, arah gagal selalu aman (menolak,
bukan bocor), fitur baru semuanya baca-saja, dan revert-nya terbukti bekerja — jadi biaya
"salah" rendah dan bisa dibalik. Yang belum tertutup (runtime di balik login) justru paling
murah ditutup sekarang oleh satu orang bertkredensial. Menariknya kembali tanpa menjalankan
verifikasi itu dulu berarti membuang lima sprint kerja untuk risiko yang bisa dihapus dalam
15 menit.
