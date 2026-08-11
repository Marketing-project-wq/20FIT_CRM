# PR: Sprint 3G + 3H + 3I → main

> ## 🔒 SIKLUS INI MEMPERBAIKI LUBANG KEAMANAN YANG SUDAH LIVE
>
> **Argumen terkuat untuk mendaratkan siklus ini, bukan menundanya lagi:** migrasi 10
> menutup `crm_purge_audit_log` — fungsi `SECURITY DEFINER` yang menonaktifkan trigger
> append-only lalu menghapus baris audit — yang `EXECUTE`-nya **terbuka ke `anon`** sejak
> ia dibuat (Sprint 3A). Siapa pun pemegang anon key bisa memanggilnya tanpa login, tanpa
> peran. **Migrasi 10 sudah diterapkan ke database dan berlaku TERLEPAS dari apakah kode
> ini di-merge** — perbaikan keamanannya tidak menunggu deploy. Yang menunggu merge adalah
> jalur tulis suppression (3H) yang tidak melindungi siapa pun selama masih di branch.
>
> ## ⛔ INI SIKLUS PERTAMA YANG MENULIS DATA
>
> Semua sprint sebelumnya **baca-saja**: satu-satunya tulis adalah baris audit
> append-only. Untuk semuanya, `git revert` cukup — kembalikan kode, selesai.
>
> **Tidak lagi.** Sprint 3H membuka jalur tulis `crm_suppression`. Sebuah baris
> suppression adalah **catatan permintaan orang sungguhan** — seseorang yang meminta
> berhenti dihubungi. **Menghapus baris itu = menghubungi kembali orang yang sudah
> minta berhenti.** Revert kode mengembalikan aplikasi; ia **tidak** dan **tidak boleh**
> menghapus baris-baris itu. Lihat §4 (revert tiga tingkat) sebelum menyentuh apa pun.
>
> **Branch:** `claude/lanjutkan-pekerjaan-mno804`
> **Base:** `main` @ `eff733c` (PR #4 — 3B–3F, sudah live & dipakai)
> **Isi branch di atas base:** `9a7b296` + `ef0ea89` (3G) · `c63280a` + `15cb3f7` + `a0035d9` (3H) · commit-commit 3I (migrasi 10 + pagar + dokumen)
> **⚠️ MENGUBAH SKEMA PRODUKSI:** migrasi 9 (dua fungsi tulis) **dan** migrasi 10 (cabut EXECUTE terbuka). **MENULIS data pelanggan:** baris suppression (3H). Aturan revert berbeda per hal — §4.
> **JANGAN merge / buka PR ke `main` tanpa izin eksplisit.**

## 1. Yang berubah, per bagian

### Sprint 3G (pembersihan + persiapan pasca-merge — nol perubahan perilaku)
| Perubahan | Sifat |
|---|---|
| Hapus kode mati: `lib/auth/guard.ts` (tak dipakai), `hasAnyRole` (tak dipakai); perbaiki komentar yang kontradiktif | Pembersihan (nol perilaku) |
| `docs/PASCA-MERGE-monitoring-revert.md` — revert **dilatih** dari `eff733c` (terbukti kembali bersih ke 3A: pohon identik `4bac312`, build hijau, 126 test) + rencana pantau 30 menit | Dokumen |
| `docs/RINGKASAN-keputusan-merge.md` — ringkasan satu halaman non-teknis | Dokumen |
| `docs/TINJAUAN-pra-merge.md` (bila ada) + peta request-pertama di PR 3B–3F §6 | Dokumen |

### Sprint 3H (jalur tulis pertama — suppression)
| Perubahan | Sifat |
|---|---|
| **Migrasi 9** — `crm_record_suppression` + `crm_lift_suppression` (dua fungsi `SECURITY DEFINER`, `service_role` only). INSERT/reaktivasi + audit dalam **satu transaksi** (K-3). **Bukan tabel baru** | **MENGUBAH SKEMA PRODUKSI** |
| `POST /api/suppression` — catat permintaan berhenti; gate `consent.edit`; identitas dari `customer_id` (server baca `master_customer`) atau nilai ketikan; `dry_run` menampilkan bentuk ternormalisasi sebelum menulis | **BARU — MENULIS DATA** |
| `POST /api/suppression/lift` — cabut (status=`lifted`, **nol DELETE**); `lifted_reason` wajib; identitas di-resolve dari id baris server-side | **BARU — MENULIS DATA** |
| Detail profil: tombol "Catat permintaan berhenti" (peran `consent.edit`); **pilihan telepon/email eksplisit**; langkah tinjau; sukses menyatakan akibat | **MENGUBAH TAMPILAN** |
| `/consent`: entri langsung + **cabut per-baris** dengan alasan wajib + konfirmasi bahwa pencabutan mengaktifkan kembali kontak | **MENGUBAH TAMPILAN** |
| `lib/crm/suppression-input.ts` (murni, konsumen runtime **pertama** `normalize.ts`) + `lib/crm/suppression-write.ts` (server, bungkus RPC, **tak menulis audit sendiri**) | Kode |
| Test: 179 → **194** (+13 input, +1 seam D-2 kontabilitas, +1 aksi suppression = kepatuhan) | **Pagar** (test) |

### Sprint 3I (tutup pintu RPC yang terbuka, lalu daratkan)
| Perubahan | Sifat |
|---|---|
| **Migrasi 10** — `revoke all on crm_purge_audit_log(boolean) from public, anon, authenticated` + grant `service_role`. Menutup lubang `anon`-callable yang LIVE sejak 3A. `proacl` sesudahnya: `{postgres, service_role}`. `dry_run` masih bekerja lewat service role | **MENGUBAH SKEMA PRODUKSI (keamanan)** |
| `lib/crm/migration-execute-guard.test.ts` — pagar: setiap fungsi `crm_*` di migrasi wajib mencabut EXECUTE dari public/anon/authenticated di **berkas yang sama** (kecuali fungsi trigger & allowlist lintas-berkas). Dibuktikan menggigit | **Pagar** (test) |
| `docs/RISIKO-rpc-execute-terbuka.md` — pola auto-grant, contoh yang sudah diperbaiki, **101** fungsi non-`crm_*` yang masih terbuka (cara mengukurnya sendiri), sisanya keputusan pemilik project | Dokumen |
| README ledger diluruskan: 10 berkas repo → **11** entri ledger (migrasi 9 apply ganda), migrasi 10 ditambahkan, peringatan `db push` dibetulkan | Dokumen |
| Sapuan `crm_*`: 4 objek, semua fungsi `SECURITY DEFINER` kini terkunci; fungsi trigger `crm_audit_log_no_mutate` dinilai aman (tak bisa dipanggil via RPC) | Verifikasi |
| Test: 194 → **202** (+8 pagar EXECUTE) | **Pagar** (test) |

## 2. Yang TIDAK berubah (batas keras sprint ini)
- **Nol jalur tulis consent.** `crm_consent` masih baca-saja — belum ada kanal opt-in nyata untuk ditunjuk. Nol `INSERT` ke `crm_consent`.
- **Nol DELETE dari `crm_suppression`.** Pencabutan = `status='lifted'`. Sticky by design (D-4).
- **Nol backfill.** `legacy_import` ada di kosakata DB tetapi **tidak** ditawarkan aplikasi — mengisi massal butuh keputusan tim, bukan sprint ini.
- **Normalisasi tidak di SQL** (D-2). Fungsi hanya **menolak** yang belum ternormalisasi; normalisasi selalu di `lib/crm/normalize.ts`.
- **Hanya migrasi 9 (3H) + migrasi 10 (3I)**, nol migrasi lain. **Nol `supabase db push`.** Nol sentuh objek di luar `crm_*` (101 fungsi tim lain yang terbuka **tidak** disentuh — keputusan pemilik project, `docs/RISIKO-rpc-execute-terbuka.md`). `crm_user_role` tak disentuh. RLS tabel lama tak dinyalakan. `railway.json` (`NODE_ENV=production`) utuh.

## 3. Bukti atomik (K-3) — dijalankan, bukan diklaim
Migrasi 9 diverifikasi lewat probe **dalam transaksi yang di-ROLLBACK** (nol residu di produksi — `crm_suppression` tetap 0 baris, audit tetap 35):
- **Happy path:** satu panggilan → satu baris suppression **dan** satu baris audit tertaut (`target_id`).
- **Idempoten:** panggilan kedua identik → `noop`, audit **tidak** bertambah (1 baris untuk 2 panggilan).
- **Gagal di tengah:** trigger dipaksa menggagalkan INSERT audit → INSERT suppression **ikut rollback**; `leftover_suppression_rows = 0`. **Tidak ada baris separuh jadi.**
- **Jaring pengaman:** telepon `+…`/berawalan 0, email huruf besar/tanpa `@`, `reason_code` asing, `lifted_reason` kosong — semua ditolak.
- **Kunci EXECUTE:** `anon`/`authenticated` dicabut (Supabase memberi default; `revoke from public` tak cukup) — kini `service_role` saja.

## 4. Rencana revert — TIGA TINGKAT, jangan campur

Sprint ini memisahkan tiga hal yang dulu satu. Perlakukan berbeda:

### Tingkat 0 — MIGRASI 10 (JANGAN direvert)
Migrasi 10 mencabut `EXECUTE` terbuka dari `crm_purge_audit_log`. **Ia bukan bagian dari
revert siklus ini.** Mengembalikan grant terbuka = **membuka kembali lubang keamanan** yang
sudah live sejak 3A. Migrasi 10 berlaku di database terlepas dari merge kode; kalau kode
di-revert, migrasi 10 **tetap tinggal** — itu benar. Jangan `grant execute ... to anon`
atau `to public` untuk fungsi itu, dengan alasan apa pun.

### Tingkat 1 — KODE (bisa dikembalikan, aman)
`git revert` commit 3H (atau revert merge PR-nya). Aplikasi kembali baca-saja: tombol
"catat permintaan berhenti", entri `/consent`, dan pencabutan hilang. `/consent` kembali
seperti 3F (register baca-saja). **Ini aman dan cukup untuk mematikan jalur tulis.**

### Tingkat 2 — FUNGSI (bisa di-`drop`, aman)
Migrasi 9 hanya menambah dua fungsi (bukan tabel, bukan data). Bila ingin melumpuhkan
jalur tulis di level database (mis. kode masih nyangkut):
```sql
drop function if exists public.crm_record_suppression(text,text,text,text,uuid,text,uuid,text);
drop function if exists public.crm_lift_suppression(text,text,text,uuid,text);
```
Men-drop fungsi **tidak menghapus data apa pun** — hanya mencabut kemampuan menulis.
Aman kapan pun. (Ledger `apply_migration` tetap mencatat versinya; bereskan bila
membatalkan sepenuhnya.)

### Tingkat 3 — BARIS SUPPRESSION (TIDAK BOLEH DIHAPUS, titik)
```sql
-- JANGAN. Ini menghapus catatan permintaan orang sungguhan.
-- delete from crm_suppression where ...   ❌ SELAMANYA SALAH
```
- Sebuah baris `crm_suppression` `status='active'` adalah **permintaan seseorang untuk
  berhenti dihubungi**. Menghapusnya = menghilangkan permintaan itu = orang tersebut
  akan dihubungi lagi di kampanye pertama. Itu **bahaya nyata bagi orang**, bukan
  sekadar kotor secara teknis.
- Revert kode (Tingkat 1) **membiarkan** baris-baris ini — itu **benar**. Setelah revert
  mereka tak dibaca aplikasi apa pun, tapi tetap catatan sah; biarkan.
- Satu-satunya "pembatalan" sah untuk sebuah suppression adalah **pencabutan** (`lifted`)
  lewat jalur beralasan + teraudit — bukan `DELETE`. Keputusan menghapus permanen (bila
  pernah perlu) adalah keputusan pemilik data + legal, **bukan** on-call jam 2 pagi.

## 5. Yang dipantau 30 menit pertama setelah deploy

### 5a. Jalur tulis hidup — baris yang HARUS muncul saat orang memakai
```sql
-- Aksi audit baru dalam 30 menit. Boleh bertambah: suppression.added / suppression.lifted
-- (selain list.viewed / profile.viewed yang sudah ada). TIDAK boleh ada nama aksi lain.
select action, count(*) from crm_audit_log
where occurred_at > now() - interval '30 minutes'
group by action order by 2 desc;
```

### 5b. K-3 DITEGAKKAN — deteksi kegagalan atomik (ini inti sprint)
Satu-satunya cara melihat atomik benar-benar bekerja di produksi adalah mencari
**pasangan yang pincang**. Kedua kueri ini harus mengembalikan **nol baris**:
```sql
-- (1) Baris suppression TANPA baris audit pasangannya → K-3 bocor (tulis tanpa jejak).
select s.id, s.identity_kind, s.status, s.created_at
from crm_suppression s
left join crm_audit_log a
  on a.action = 'suppression.added'
 and a.target_table = 'crm_suppression'
 and a.target_id = s.id::text
where s.created_at > now() - interval '30 minutes'
  and a.id is null;

-- (2) Baris audit suppression.added TANPA baris suppression-nya → K-3 bocor (jejak hantu).
select a.id, a.target_id, a.occurred_at
from crm_audit_log a
left join crm_suppression s on s.id::text = a.target_id
where a.action = 'suppression.added'
  and a.occurred_at > now() - interval '30 minutes'
  and s.id is null;
```
Bila salah satu mengembalikan baris: **hentikan jalur tulis** (Tingkat 2 drop fungsi) dan
selidiki — transaksi tidak atomik seperti yang diklaim. (Probe ROLLBACK §3 membuktikan
ia atomik; kueri ini menjaga klaim itu tetap benar di produksi.)

### 5c. Suppression menang & consent tak tersentuh — verifikasi baris pertama
Setelah **satu** permintaan pertama dicatat lewat aplikasi:
```sql
select
  (select count(*) from crm_suppression) as suppression_rows,          -- naik 1
  (select count(*) from crm_audit_log where action='suppression.added'
     and occurred_at > now() - interval '30 minutes') as added_audit,  -- = 1
  (select count(*) from crm_consent) as consent_rows;                  -- TETAP 0 (nol tulis consent)
```
Kartu "Bisa dihubungi" di dashboard tetap **0** — kini nol karena **dua** alasan yang
keduanya benar: (a) nol consent marketing aktif (short-circuit), dan (b) bahkan bila ada,
suppression menang. Cabang "suppression menang" — kosong sejak tabel dibuat — akhirnya
dijalankan dengan data oleh baris pertama ini.

### 5d. Sisa (tak berubah dari 3G)
Log Railway: deploy hijau, `/health` (`env: configured`, `supabase: reachable`), prefix
`NODE_ENV=production` utuh, nol lonjakan 500 sistemik di `/api/*`.

## 6. Prasyarat & catatan merge
- **JANGAN merge / buka PR ke `main` tanpa izin eksplisit.** Push ke `main` memicu deploy
  Railway ke sistem yang dipakai orang — dan kini deploy itu mengaktifkan jalur **tulis**.
- Verifikasi produksi jalur tulis end-to-end (§5c) hanya bisa dilakukan **setelah deploy**
  oleh orang dengan sesi login — sama seperti celah verifikasi sprint-sprint sebelumnya.
  Yang bisa dibuktikan tanpa deploy sudah dibuktikan: atomik (§3, probe ROLLBACK), tipe,
  lint, 194 test, build produksi.
- Urutan deploy: **tak ada langkah pengurutan.** Migrasi 9 (fungsi) sudah dijalankan;
  `crm_suppression` + `crm_user_role` sudah ada sejak Fase 2/3A. Kode ini deploy setelah
  fungsinya ada.
