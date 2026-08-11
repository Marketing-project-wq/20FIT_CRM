# PR: Sprint 3B + 3C + 3D + 3E → main

> Deskripsi peninjau, bukan daftar commit. Baca ini lima menit sebelum menekan merge.
>
> **Branch:** `claude/lanjutkan-pekerjaan-mno804`
> **Base:** `main` @ `4bac312` (Sprint 3A — sudah live & dipakai orang)
> **Isi branch (4 commit di atas base):** `bf736b0` (3B) · `322377f` (3C) · `68dd66f` (3D) · commit landing 3E (tip)
> **Merentang produksi yang SEDANG DIPAKAI:** `crm_audit_log` menunjukkan `tifany@20fit.id`
> membuka audience pool berkali-kali (11 Agu 2026). Regresi mengenai layar nyata.

## 1. Apa yang benar-benar ter-deploy, per layar

| Layar / endpoint | Status | Catatan |
|---|---|---|
| `/` Dashboard | **BERUBAH** | Dulu shell statis; kini empat kartu KPI dari `/api/dashboard` (server, gated). Aturan `0` vs `—` (Bisa dihubungi = `0`, Workflow aktif = `—`). Kartu kesegaran diperbaiki: "dua muatan batch", bukan "pipeline telat" (3D) |
| `/quality` Data quality | **BARU** | Agregat live `master_customer` + satelit; fill rate, identifier tak valid, anomali, duplikat, orphan/excluded, cakupan satelit. Nol migrasi (semua `count head:true`) |
| `/audience` Audience pool | **BERUBAH** | Layar yang **sudah dipakai orang**. Perubahan perilaku: **nama kini bisa diklik** → detail profil; klik menulis `profile.viewed`. Banner tak lagi hardcode angka (3B); fix kelas Tailwind mati |
| `/audience/[id]` Detail profil | **BARU** | Satu profil; masking server untuk peran tanpa `profile.view_contact`; `profile.viewed` per buka; id tak dikenal → 404 (bukan enumerasi); health flags "tidak ada sumber data" |
| `/settings` | **BARU (ganti ComingSoon)** | Hub koheren: audit log + panel peran. Audit log default berpihak **kepatuhan**, tampilkan rasio kepatuhan:operasional, filter aksi/aktor/tanggal, paginasi, append-only (nol tombol hapus) |
| `/settings/roles` | **BERUBAH** | Di-refactor pakai panel bersama; gerbang `audit.view` |
| `/api/dashboard` | **BARU** | Agregat, gated `profile.view_list`, tanpa audit (agregat tanpa parameter) |
| `/api/quality` | **BARU → lalu BERUBAH** | 3B: dibuat dengan audit wajib. 3C: **audit dihapus** (aturan: agregat tanpa parameter tidak diaudit) |
| `/api/audience` | **BERUBAH** | Sudah live (3A). 3C: kembalikan `customer_id` untuk link detail. 3D: nilai filter bebas-teks di metadata dibatasi panjang |
| `/api/audience/[id]` | **BARU** | Detail profil (lihat di atas) |
| `/api/audit` | **BARU** | Baca `crm_audit_log`, gerbang `audit.view`, paginasi, filter kategori (kepatuhan/operasional/semua) + rasio, self-audited |

Kode pendukung: matriks RBAC & normalizer telepon (3B: kanon `62…`), lapisan baca
`lib/crm/*`, komponen `components/{audience,quality,settings}`, dan alat verifikasi
`scripts/verify-live.mjs` + `docs/CEKLIS-verifikasi-live.md` (3D).

## 2. Apa yang TIDAK berubah

- **Nol migrasi. Nol perubahan skema.** Tak ada `supabase db push`, tak ada view/RPC baru.
- **Nol tulis ke data pelanggan.** `master_customer` dan `crm_*` read-only; nol
  `INSERT/UPDATE/DELETE`. `crm_user_role` tak disentuh.
- **Migrasi 3 `crm_consent` tetap ditahan** (menunggu legal). RLS tabel lama tak disentuh (Fase 0).
- **Satu-satunya tulis** aplikasi: baris audit ke `crm_audit_log` (`list.viewed`,
  `profile.viewed`) — **append-only, memang tujuannya**, bukan data pelanggan.
- `railway.json` (`NODE_ENV=production`) utuh.

## 2b. Yang ditambahkan Sprint 3E (utang + kejujuran waktu)

| Perubahan 3E | Sifat |
|---|---|
| Sumber retensi tunggal `lib/crm/retention-policy.ts` — `classifyAction` + filter `.or()` `/api/audit` diturunkan darinya, nol daftar diketik ulang | **Pagar** (perilaku sama, satu sumber) |
| Test paritas migrasi 8 ⇄ TypeScript (gagal keras bila daftar menyimpang) | **Pagar** (test) |
| `first_seen_at` di **detail profil** kini berlabel sadar-sumber (nyata hanya untuk `live_txn_ingest`; selain itu "cap muat, bukan pertama terlihat") | **MENGUBAH TAMPILAN** |
| `/quality` — tiga temuan waktu baru (`first_seen_at` cap muat 98,7%; 14 baris `first_seen_at > created_at`; batch bukan feed) | **MENGUBAH TAMPILAN** |
| `docs/KOLOM-WAKTU.md` — apa yang tiap kolom waktu ukur, boleh/dilarang; segmentasi recency tak bisa jujur hari ini | Dokumen |
| Utang test 3D dibayar: `capFilterValue` + predikat retensi + rasio jadi fungsi murni ber-test (146 → 170) | **Pagar** (test) |

Nol migrasi/skema/DDL di 3E juga (usulan perluasan komentar `crm_profile_behavior` hanya
dicatat di `docs/KOLOM-WAKTU.md`, tidak dijalankan).

## 3. Risiko — dipimpin yang terbesar

1. **[TERBESAR] Endpoint belum pernah dieksekusi terhadap Supabase dari sini.** Proxy
   sandbox mem-block host Supabase (CONNECT 403), jadi `/api/quality`, `/api/dashboard`,
   `/api/audit`, `/api/audience/[id]` **konstruksi query PostgREST-nya** diverifikasi
   hanya lewat (a) inspeksi query-string yang dibangun offline, (b) kecocokan nilai via
   SQL setara, (c) unit test masking/klasifikasi. **Mitigasi wajib:** jalankan
   `scripts/verify-live.mjs` + `docs/CEKLIS-verifikasi-live.md` dengan kredensial
   sebelum merge (lihat §5).
   - **Diperbesar oleh 3E:** sprint ini kembali **mengubah `/quality` dan detail profil**
     — dua layar yang **masih** belum pernah dieksekusi terhadap Supabase. Perubahannya
     hanya label/temuan (bukan query baru yang berisiko), tetapi keduanya tetap masuk
     cakupan verify-live yang wajib dijalankan sebelum merge.
2. **`/audience` berubah perilaku di layar yang dipakai orang.** Nama jadi tautan; tiap
   buka profil menulis `profile.viewed`. Fungsional kecil, tapi live.
3. **Volume audit naik.** `profile.viewed` + `list.viewed` (termasuk pembukaan
   `/settings`) menambah baris. Purge **belum dijadwalkan** (sengaja; lihat
   `docs/KEPUTUSAN-penjadwalan-purge.md`). Tidak berbahaya, tapi tabel tumbuh.
4. **Filter kategori `/api/audit` pakai PostgREST `.or()` dengan wildcard `*`** —
   diverifikasi lewat build query-string offline, bukan eksekusi live. Termasuk dalam
   cakupan verify-live.
5. **Fail-closed di mana-mana.** Bila service-role key / env prod salah konfigurasi,
   layar **menolak** (bukan bocor) — arah gagal yang aman, tapi bisa mengunci semua
   orang bila env hilang. Cek `/health` setelah deploy.

## 4. Rencana revert

- Branch = **4 commit** di atas `4bac312` (3B, 3C, 3D, 3E). Karena **nol migrasi / nol
  perubahan skema / nol tulis data pelanggan**, revert adalah **kode saja — tanpa rollback DB.**
- **Revert penuh:** kembalikan `main` ke `4bac312` (revert merge commit-nya). Produksi
  kembali ke Sprint 3A: audience pool (list, tanpa nama-bisa-diklik), `/settings/roles`
  stub lama, tanpa `/quality`, tanpa dashboard-terisi, tanpa detail profil, tanpa layar
  audit. Aman dan lengkap.
- **Baris audit yang sudah tertulis** (`list.viewed`, `profile.viewed`) tetap ada —
  append-only, tak berbahaya, dan justru bukti sah bahwa fitur sempat berjalan.
- **Revert sebagian tidak disarankan:** ketiga commit saling menumpuk (3D butuh layar
  audit 3C; 3C butuh lapisan baca 3B). All-or-nothing ke `4bac312` paling bersih.

## 5. Prasyarat merge (jangan merge sebelum ini)

1. Seseorang **dengan kredensial Railway** menjalankan
   `node --experimental-strip-types scripts/verify-live.mjs` (Node ≥ 22.6, `.env.local`
   terisi). **Semua PASS**, termasuk `audit rows before=… after=…  -> [PASS] no write`.
2. Ceklis manual `docs/CEKLIS-verifikasi-live.md` dijalankan di sesi login: baris audit
   mendarat sesuai spesifikasi (satu `list.viewed` per baca daftar, satu `profile.viewed`
   per buka profil, satu `list.viewed`+`crm_audit_log` per buka `/settings`), dan **nol**
   baris dari `/` dan `/quality`.
3. Langkah masking `analyst` (butuh akun uji buatan **tim**, bukan Claude) dijalankan.
4. **Hasil ketiganya dilampirkan ke PR.** Baru merge.

> **JANGAN merge / buka PR ke `main` tanpa izin eksplisit.** Push ke `main` memicu deploy
> Railway ke sistem yang sedang dipakai.
