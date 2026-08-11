# PR: Sprint 3R — pelengkapan profil dari sumber ekosistem (3P TUGAS 2 yang tertunda)

> **Satu-satunya bagian permintaan produk 3P yang belum dikerjakan.** Peta consent, filter
> AND/OR, kerapian nama, dan penandaan typo email sudah ter-merge (`40a6841`, PR #8). Sprint
> ini menyambungkan sumber ekosistem yang belum masuk ke profil — **nol tulis, nol skema.**
>
> **Base:** `main` @ `3910ae0` (PR #8 — 3N+3O+3P+3Q sudah ter-merge). Branch di-restart bersih
> dari main (riwayat lama sudah di main). **Test 306 → 313.**
> **JANGAN merge / push ke `main` tanpa izin eksplisit.**

## Yang berubah

| Perubahan | Sifat |
|---|---|
| `lib/crm/enrichment.ts` (server-only) — cocok `cf_hyrox`/`my20fit_profile`/`my20fit_user_activity` ke profil lewat **email ternormalisasi** (K-06). **Nol tulis** ke master/crm_*. `rc_team_members` **tidak** dicocokkan (nama-saja) | **BARU — BACA SAJA** |
| `lib/crm/enrichment-constants.ts` (murni + test) — daftar kolom aman/terlarang/sensitif per sumber; `maskSensitive`. Guard test: sensitif/health tak pernah masuk daftar aman | Kode + **Pagar** |
| Detail profil: bagian **"Sumber ekosistem"** — status cocok/tak-cocok per sumber (tak-cocok berbunyi "tidak ada data … untuk profil ini", bukan blank) | **MENGUBAH TAMPILAN** |
| **Field sensitif Hyrox** (NIK/tgl lahir/gol darah/kontak darurat): gerbang `profile.view_health`, **tersamar default**, dibuka lewat `POST /api/audience/[id]/identity` — **tiap pembukaan 1 audit** (`profile.viewed`, `metadata.fields`=jenis field, **nilai TIDAK di metadata**). Data medis `clinic_*` + health/cycle `my20fit` **tidak dibawa** | **BARU — MENAMPILKAN NIK (gated)** |
| Segment builder: kriteria **Peserta Hyrox / Pengguna my20fit / Punya aktivitas nyata** (presensi, AND, di-resolve ke id-set + intersect). Jumlah berpasangan tetap. **Nol kriteria waktu** — `last_active_at` nyata tapi 44/82.253 (K-19) | **MENGUBAH TAMPILAN + BACA** |
| `/quality`: blok **cakupan sumber ekosistem** (live) — Hyrox 152/1.038, my20fit 169/886, aktivitas 44/175. Kecocokan rendah = temuan kualitas data | **MENGUBAH TAMPILAN** |
| `SUMBER-AKTIVITAS.md` (dibangun + syarat tinjau-ulang kriteria waktu), `FAKTA-DATA.md` (angka bertanggal), `TEMUAN.md` (gap 37–39 diturunkan ke episode historis, **tidak** ditutup) | Dokumen |
| Test: 306 → **313** (+6 guard kolom enrichment, +1 flag sumber segmen) | **Pagar** |

## Batas yang dipilih (bukan kelalaian)

- **`rc_team_members` tidak dicocokkan** — nama tidak unik; salah cocok menempelkan riwayat
  orang lain, tak terlihat sampai seseorang salah dihubungi.
- **Data medis tidak dibawa** — `clinic_*` (diagnosa/obat/operasi) dan health/cycle `my20fit`
  butuh dasar pemrosesan; `crm_consent` masih kosong.
- **NIK bukan kunci pencocokan** — `master_customer` tak punya kolom NIK; ia hanya menempel
  setelah profil tercocok lewat email.
- **131 aktivitas tak-cocok** = orangnya memang belum di master (diverifikasi), bukan gagal
  normalisasi. Menaikkan cakupan butuh mereka masuk master dulu (Fase 0).

## Keamanan (konteks 3Q)

`master_customer` kini terbukti bisa ditulis 887 akun (T-17), jadi satu-satunya yang menahan
CRM dari menulis ke sana adalah **disiplin kode ini sendiri** — enrichment 3R memegangnya:
nol INSERT/UPDATE, gabung saat tampil. Sumber sensitif yang dibaca (`cf_hyrox`) sudah
anon-terbuka hari ini (T-15); menariknya ke belakang gerbang+masking+audit CRM **tidak
menambah** paparan, ia memberi jalur teraudit untuk data yang kini bisa diambil tanpa login.

---

> **Silang-rujuk:** K-06 (normalisasi satu tempat), K-02 (masking server), K-07 (audit read),
> K-19 (kolom waktu bukan sinyal), T-15/T-17 (paparan), `docs/SUMBER-AKTIVITAS.md`.
