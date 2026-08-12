# PR: Sprint 3B + 3C + 3D + 3E + 3F → main

> **STATUS (per Sprint 3G): SUDAH TER-MERGE.** PR #4 menggabungkan 3B–3F ke `main`
> (`eff733c`) di luar sesi ini. Dokumen di bawah ditulis sebagai catatan peninjau
> **pra-merge** dan dipertahankan apa adanya sebagai rekam jejak; §6 (peta request
> pertama) ditambahkan pasca-merge. Untuk ringkasan keputusan pasca-merge, lihat
> `docs/RINGKASAN-keputusan-merge.md`; untuk tinjauan diff, `docs/TINJAUAN-pra-merge.md`.
>
> Deskripsi peninjau, bukan daftar commit.
>
> **Branch:** `claude/lanjutkan-pekerjaan-mno804`
> **Base:** `main` @ `4bac312` (Sprint 3A — sudah live & dipakai orang)
> **Isi branch (5 commit di atas base):** `bf736b0` (3B) · `322377f` (3C) · `68dd66f` (3D) · `9c44c00` (3E) · commit landing 3F (tip)
> **Merentang produksi yang SEDANG DIPAKAI:** `crm_audit_log` menunjukkan `tifany@20fit.id`
> membuka audience pool berkali-kali (11 Agu 2026). Regresi mengenai layar nyata.
>
> **⚠️ 3F MENGUBAH SKEMA PRODUKSI.** Migrasi 3 `crm_consent` dijalankan (Fase 2 dibuka).
> Ini yang PERTAMA membuat revert **tidak lagi cukup dengan mengembalikan kode** — lihat §4.

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

## 2c. Yang ditambahkan Sprint 3F (Consent Register — Fase 2 dibuka)

| Perubahan 3F | Sifat |
|---|---|
| **Migrasi 3 `crm_consent` DIJALANKAN** (RLS ON, 0 policy, 4 CHECK, UNIQUE, FK `on delete set null`, 0 baris) | **MENGUBAH SKEMA PRODUKSI** |
| `/consent` — layar baca-saja: register consent + suppression (0/0 baris), makna-nol, hierarki "suppression menang", kosakata `basis` sementara | **BARU (ganti ComingSoon)** |
| `/api/consent` — service role, gate `consent.edit`, paginasi, audit `list.viewed` `target_table=crm_consent` | **BARU** |
| "Bisa dihubungi" di dashboard kini **diturunkan** dari `isContactableForMarketing` (consent aktif − suppression), 0 **terukur** bukan hardcode | **MENGUBAH TAMPILAN** |
| `lib/crm/contactability.ts` — aturan murni + test (suppression menang, fail-closed) | **Pagar** (test) |
| `docs/SIGNOFF-legal-consent.md`, `docs/RENCANA-jalur-tulis-consent.md` | Dokumen |

**Nol backfill** (nol `INSERT` ke `crm_consent`), **nol jalur tulis** (K-3 butuh fungsi
Postgres — keputusan tersendiri), nol sentuh tabel di luar `crm_*`.

## 3. Risiko — dipimpin yang terbesar

1. **[TERBESAR, DAN KINI LEBIH BESAR] Lima sprint kode belum pernah dieksekusi terhadap
   Supabase — dan sekarang ada tabel baru yang HANYA disentuh oleh kode yang belum pernah
   jalan.** Proxy sandbox mem-block host Supabase (CONNECT 403), jadi `/api/quality`,
   `/api/dashboard`, `/api/audit`, `/api/audience/[id]`, dan kini **`/api/consent`**
   (query ke tabel `crm_consent` yang baru) diverifikasi hanya lewat (a) inspeksi
   query-string offline, (b) kecocokan nilai via SQL setara, (c) unit test. Kartu "Bisa
   dihubungi" kini menjalankan lapisan baca consent+suppression yang belum pernah
   dieksekusi lewat `supabase-js`. **Mitigasi wajib:** jalankan `scripts/verify-live.mjs`
   + `docs/CEKLIS-verifikasi-live.md` dengan kredensial sebelum merge (lihat §5).
   - **Diperbesar oleh 3E:** juga **mengubah `/quality` dan detail profil**.
   - **Diperbesar oleh 3F:** `/consent` dan dashboard "Bisa dihubungi" baru.
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

## 4. Rencana revert — TIDAK LAGI CUKUP DENGAN MENGEMBALIKAN KODE

- Branch = **5 commit** di atas `4bac312` (3B, 3C, 3D, 3E, 3F). Sampai 3E, revert = kode
  saja. **3F mengubahnya:** tabel `crm_consent` sudah dibuat di database dan **tetap ada
  setelah kode di-revert**. Merevert `main` ke `4bac312` mengembalikan seluruh aplikasi
  ke Sprint 3A, tetapi **tabel `crm_consent` tetap tinggal di produksi.**
- **Menghapus tabelnya (opsional, dari blok ROLLBACK migrasi 3):**
  ```sql
  drop table if exists public.crm_consent;
  ```
  - **AMAN selama nol baris.** Hari ini tabel kosong (nol backfill, nol jalur tulis),
    jadi drop ini tidak menghapus catatan apa pun.
  - **TIDAK aman begitu ada ≥ 1 baris consent.** Sebuah baris consent adalah **catatan
    hukum** (dasar pemrosesan). Meng-`drop` tabel yang berisi baris consent = menghapus
    bukti dasar hukum — jangan lakukan tanpa proses retensi/legal. Kalau register sudah
    terisi, revert kode saja (biarkan tabel), atau tangani datanya lewat jalur legal.
  - Ledger `apply_migration` juga mencatat versinya; men-drop tabel tidak otomatis
    menghapus baris ledger — bereskan bila memang membatalkan sepenuhnya.
- **Revert penuh (kode):** kembalikan `main` ke `4bac312`. Produksi kembali ke Sprint 3A
  (audience list tanpa nama-bisa-diklik, `/settings/roles` stub lama, tanpa /quality,
  detail profil, layar audit, /consent). Tabel `crm_consent` tertinggal — lihat di atas.
- **Baris audit yang sudah tertulis** tetap ada (append-only, tak berbahaya).
- **Revert sebagian tidak disarankan:** kelima commit menumpuk. All-or-nothing ke
  `4bac312` (plus keputusan drop-tabel di atas) paling bersih.

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
>
> **KOREKSI (12 Agu 2026, T-18/K-25):** model "push ke `main` memicu deploy" **tidak sesuai
> bukti** — produksi terbukti menjalankan kode *branch*, bukan `main`. Yang menahan produksi
> bukan hanya merge; **setiap push ke branch bisa langsung live**. Lihat `docs/KOREKSI-DEPLOY.md`.

---

## 6. Request pertama setelah deploy — peta kegagalan (Sprint 3G)

> Ditambahkan pasca-merge (3G). PR #4 sudah menggabungkan 3B–3F ke `main` (`eff733c`);
> bagian ini memetakan apa yang terjadi pada request PERTAMA tiap rute setelah deploy.

### Urutan deploy — TIDAK ADA yang perlu diurutkan (kebalikan dari 3A)

Peringatan urutan keras di README milik **Sprint 3A**: RBAC fail-closed, jadi kode tak
boleh mendahului migrasi + seed peran (kalau tidak, semua orang terkunci). **Di sini
kebalikannya, dan aman:** migrasi 3 (`crm_consent`) **sudah dijalankan lebih dulu**
(3F, 2026-08-11, ledger `20260811072232`), `crm_user_role` sudah ter-seed sejak 3A.
Jadi saat kode ini deploy, **tabel yang dibacanya sudah ada dan RBAC sudah hidup**.
**Tidak ada langkah pengurutan untuk sprint ini.** Jangan salah menerapkan peringatan
3A di README ke deploy ini.

### Tabel per rute (jalur TIDAK bahagia)

| Rute | `crm_consent` hilang (skenario revert-drop) | service-role key hilang/salah | Sesi aktif saat deploy | Audit gagal ditulis |
|---|---|---|---|---|
| `/` + `/api/dashboard` | **Seluruh kartu → “—”** (bukan crash). `fetchContactableCount` melempar → `Promise.all` di `fetchDashboardStats` gagal → route 500 → klien tampilkan “—”. **Kopling:** ukuran audiens ikut “—”, bukan hanya “Bisa dihubungi”. Hanya relevan bila tabel di-drop saat kode live. | `getCurrentUserRole` → null → **403 fail-closed** (kartu “—”). Tak sampai query. | Lanjut jalan; navigasi berikutnya dapat kartu baru. Bundel klien lama sesaat abaikan field `contactable` — tak berbahaya. | Tak ada audit di rute ini (agregat tanpa parameter) — tak ada yang gagal. |
| `/audience` + `/api/audience` | Tak menyentuh `crm_consent` — tak terpengaruh. | 403 fail-closed. | Lanjut; nama jadi tautan pada muat ulang. | **503** — menolak menyajikan baca tak-teraudit (aturan 3E). |
| `/audience/[id]` + `/api/audience/[id]` | Tak terpengaruh. | 403 fail-closed. | Lanjut. | **503** (baris individual). |
| `/quality` + `/api/quality` | Tak terpengaruh. | 403 fail-closed. | Lanjut. | Tak ada audit (agregat) — tak ada yang gagal. |
| `/settings` + `/api/audit` | Tak terpengaruh. | 403 fail-closed. | Lanjut. | **503** (baris individual + filter). |
| `/consent` + `/api/consent` | **500 `query_failed`** → klien “Gagal memuat”. Gagal anggun, bukan meledak; tak menyentuh app lain. | 403 fail-closed. | Lanjut; muncul di nav untuk peran `consent.edit`. | **503** (baris individual + filter). |

Prinsip yang berlaku di seluruh tabel: **arah gagal selalu aman** — menolak (403/500/503)
atau menampilkan “—”, tidak pernah membocorkan data atau menyajikan baca tak-teraudit.
Missing service key selalu berujung 403 fail-closed karena `getCurrentUserRole` menelan
errornya dan mengembalikan `null` sebelum query mana pun berjalan.
