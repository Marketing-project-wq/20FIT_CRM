# Laporan penutup — Sprint 3J: Pencarian Profil

> Laporan asli sesi yang mengerjakan Sprint 3J (11 Agu 2026), ditempel apa adanya sesuai
> konvensi (README langkah 3). Bukan rekonstruksi dari `git log`.

## 1. Status remote + kondisi database
Divergensi dilaporkan di awal (aturan "berhenti dan lapor"): `origin/main` sudah maju ke
`3ac62b1` — PR #5 men-merge 3G + 3H (bukan `eff733c` seperti diharapkan prompt). 3I
tinggal satu commit belum ter-merge. Keputusan (dengan persetujuan): rebase 3I ke main
baru lalu bangun 3J di atasnya. Branch didorong `--force-with-lease` ke `6504645` =
`3ac62b1` + `69e59ca` (3I, di-rebase) + `6504645` (3J). Nol perubahan skema; ketiga indeks
pencarian sudah ada (diverifikasi `pg_indexes`).

## 2. Desain pencarian
`name` → substring `ilike` (GIN trigram), min 3 huruf. `phone`/`email` → **sama persis**,
ternormalisasi lewat `normalize.ts` (konsumen runtime **kedua** kanon 3B); `null` → tolak,
tak pernah cari mentah (D-2/K-06). Batas: min nama 3 (trigram butuh 3-gram + anti-panen),
hasil maks **10** (≪ 25 halaman daftar), lebih → `too_many` eksplisit tanpa paginasi
mendalam. Masking server-side untuk peran tanpa `profile.view_contact`. Gerbang
`profile.view_list`, fail-closed.

## 3. Audit
Aksi `search.performed`. Metadata: `kind` + `result_count` + `target_id` (hanya bila hasil
tepat satu). **Query TIDAK disimpan** — ia identitas orang; alasan di komentar route.
Konfirmasi via test paritas 3E dengan nama aksi persis: `classifyAction("search.performed")
=== "operational"`. Endpoint **POST** (bukan GET) agar query PII tak masuk URL/log.

## 4. Alur cari → profil → suppression
Pencarian di `/audience` di atas filter; beda tegas "Cari satu orang" (`search.performed`)
vs "Saring daftar" (`list.viewed`). Telepon/email hasil-tunggal → langsung ke profil.
Nama → daftar kecil, tiap baris ke profil lewat jalur `profile.viewed` yang sudah ada.

## 5. Batas anti-panen
Fungsi murni `lib/crm/search.ts`; kasus penyalahgunaan diuji (nama <3, wildcard, hanya
angka pada nama, telepon/email tak ternormalisasi, `cap+1` → `too_many`).

## 6. Yang masih menggantung
`profile.viewed` = 0 & `/settings` belum dibuka (saat itu); baris suppression pertama
belum ada; dua commit belum ter-merge (3I + 3J). PR doc di-rename `PR-sprint-3i-3j.md`.

## 7. Yang ditemukan tapi tidak disentuh
PR #5 sudah men-merge 3G+3H (divergensi — dihentikan, dilaporkan, rebase). 101 fungsi
non-`crm_*` tetap tak disentuh. `master_customer` dibaca saja.

## 8. Yang TIDAK bisa diverifikasi
Perilaku pencarian end-to-end di balik sesi login (gerbang, masking di UI, baris audit
mendarat, auto-navigasi hasil tunggal) — hanya pasca-deploy. Deploy PR #5 live di Railway.

**Gate akhir:** `tsc` bersih · `next lint` bersih · **219 test** (dari 202, +17) ·
build produksi lulus. Tidak ada merge ke `main` — menunggu izin.
