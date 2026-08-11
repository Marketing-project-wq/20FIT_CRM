# Tinjauan independen — Sprint 3G

> Diisi oleh sesi yang mengerjakan sprint ini (dokumentasi lintas-sprint, 11 Agu 2026).
> Ini pengetahuan langsung, bukan rekonstruksi.

## Apa yang diverifikasi saat itu
- **Latihan revert benar-benar dijalankan**, bukan direncanakan. Di branch buang dari
  commit merge PR #4, `git revert -m 1` menghasilkan pohon yang **identik dengan `4bac312`**
  (Sprint 3A): `git diff --stat 4bac312 HEAD` kosong. Build produksi hijau, 126 test
  (baseline 3A), `tsc` bersih. Hasil ditulis di `docs/PASCA-MERGE-monitoring-revert.md`.
- **Kode mati dikonfirmasi mati sebelum dihapus:** `lib/auth/guard.ts` nol importer,
  `hasAnyRole` nol referensi. Bukti kuat bahwa keduanya mati: jumlah test **tidak berubah**
  setelah penghapusan (179 → 179). → T-07.

## Yang gagal / ditemukan
- **Gotcha `.next` basi:** revert lokal memunculkan error `tsc` hantu dari
  `.next/types/app/api/...` yang merujuk rute yang sudah hilang. Bukan masalah produksi
  (Railway build fresh), tapi siapa pun yang melatih revert lokal **harus `rm -rf .next`
  dulu**. Dicatat di berkas monitoring.

## Yang diputuskan biarkan
- PR #4 ternyata **sudah ter-merge** saat sprint dimulai (di luar dugaan prompt). Sesuai
  aturan "berbeda → berhenti dan lapor", sprint berhenti, melapor, dan meminta arah lewat
  pertanyaan — lalu mengerjakan kerja pasca-merge (tinjauan, latihan revert, ringkasan)
  alih-alih membuka PR. → S-05 menjelaskan kenapa `git fetch` dulu jadi wajib.

## Diperiksa ulang 11 Agu (sprint dokumentasi)
- 3G (`9a7b296`, `ef0ea89`) **kini di `main`** lewat PR #5 — saat sprint ini ditulis ia
  masih di branch. Perilaku revert yang dilatih tetap berlaku sebagai referensi operasional.
