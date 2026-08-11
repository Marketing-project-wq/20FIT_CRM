# PR: Sprint 3I + 3J + 3K → main

> ## 🕳️ 3K MEMBUAT KEGAGALAN TERLIHAT — SELAMA INI HILANG TANPA JEJAK
>
> **Argumen mendaratkan siklus ini:** di produksi, sebuah `503`/`500` hilang tanpa bekas
> begitu responsnya terkirim. Bukti bahwa itu masalah nyata sudah ada: `crm_audit_log`
> punya **gap id `37,38,39`** — tiga operasi teraudit yang gagal (audit-write mengambil
> nomor sequence lalu di-rollback, tak meninggalkan baris). Sebelum 3K tak ada yang
> melihatnya, dan `profile.viewed` tetap **0** meski orang jelas menjelajah. 3K menjadikan
> **gap sebagai pemantauan tetap** (SQL + banner di `/settings`) dan memberi **setiap**
> route jejak kegagalan PII-free di log Railway, supaya gap berikutnya bisa **ditelusuri**,
> bukan hanya dihitung. **Root cause gap belum terbukti** (DB menerima tiap audit-write;
> lihat §7) — jadi tidak ada perbaikan yang dikarang; yang dibangun adalah **jejaknya**.
> Gap tidak bertambah (stabil di `37,38,39`), jadi tak ada yang sedang aktif rusak.
>
> ## 🔎 PENCARIAN INILAH YANG MEMBUAT JALUR SUPPRESSION BISA DIPAKAI
>
> Jalur tulis suppression (3H) **sudah ter-merge (PR #5) dan di main** — tapi titik
> masuknya adalah detail profil, dan **tak ada cara menemukan satu profil**. Tanpa
> pencarian, staf yang ditelepon seseorang yang minta berhenti harus membuka halaman demi
> halaman atau menyerah ke SQL Editor (melewati normalisasi, RBAC, dan audit). **Sprint 3J
> menambahkan pencarian profil** — itulah yang mengubah suppression dari "ada tapi tak
> terpakai" menjadi bisa diselesaikan tanpa meninggalkan aplikasi. Mendaratkan pencarian
> bersama pengunci keamanan (3I) lebih masuk akal daripada membiarkan jalur tulis menganggur.
>
> ## 🔒 3I MEMPERBAIKI LUBANG KEAMANAN YANG SUDAH LIVE (DB sudah ditutup)
>
> Migrasi 10 menutup `crm_purge_audit_log` — fungsi `SECURITY DEFINER` yang menonaktifkan
> trigger append-only lalu menghapus baris audit — yang `EXECUTE`-nya **terbuka ke `anon`**
> sejak Sprint 3A. **Migrasi 10 sudah diterapkan ke database** (verified: `proacl =
> {postgres, service_role}`); perbaikan keamanannya **tidak menunggu merge**. Yang di PR ini
> adalah berkas migrasinya + pagar test + dokumen — supaya repo cocok dengan produksi.
>
> **Branch:** `claude/lanjutkan-pekerjaan-mno804`
> **Base:** `main` @ `3ac62b1` (PR #5 — 3G + 3H sudah ter-merge; jalur tulis suppression live)
> **Isi branch di atas base:** `69e59ca` (3I — migrasi 10 + pagar EXECUTE) · `6504645` (3J — pencarian) · `46d3978` (dokumentasi `docs/riwayat/`) · commit 3K (gap monitoring + jejak kegagalan). **Nol perubahan skema/DB di 3J & 3K.**
> **Perubahan skema:** **nol di 3J.** Migrasi 10 (3I) sudah diterapkan; indeks yang dipakai pencarian sudah ada. **Nol tulis data** di sprint ini (pencarian baca-saja).
> **JANGAN merge / buka PR ke `main` tanpa izin eksplisit.**
>
> > Catatan konteks: 3G + 3H (jalur tulis suppression) **sudah di main lewat PR #5**. Bagian
> > §3–§5 di bawah adalah **referensi operasional** untuk jalur yang kini live itu (bukti
> > K-3, revert tiga tingkat, pemantauan) — tetap berlaku, tapi bukan lagi yang di-review PR ini.

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

### Sprint 3J (pencarian profil — membuat suppression bisa dipakai)
| Perubahan | Sifat |
|---|---|
| `POST /api/search` — cari satu orang; gate `profile.view_list`; nama substring (trigram), telepon/email **sama persis** ternormalisasi; masking server-side | **BARU — BACA SAJA** |
| Audit `search.performed` (operasional, dipangkas > 90 hari): `kind` + `result_count` + `target_id` bila hasil **tepat satu**. **Query TIDAK disimpan** (ia identitas orang) | **BARU** |
| Pencarian di `/audience` di atas filter; telepon/email hasil-tunggal langsung ke profil; beda jelas "cari satu orang" (`search.performed`) vs "saring daftar" (`list.viewed`) | **MENGUBAH TAMPILAN** |
| `lib/crm/search.ts` (murni: validasi bentuk per kind, min 3 huruf nama, cap 10 + `too_many`, tolak pola sapuan) + `lib/crm/search-read.ts` (server) | Kode |
| `docs/PENCARIAN-exact-match.md` — kenapa telepon/email sama-persis & apa yang berubah bila diminta awalan | Dokumen |
| Konsumen runtime **kedua** kanon 3B (`normalize.ts`) — setelah jalur tulis suppression | — |
| Test: 202 → **219** (+16 pencarian: batas & penyalahgunaan; +1 aksi `search.performed` operasional) | **Pagar** (test) |

> **Nol perubahan skema di 3J.** Indeks yang dipakai (`idx_master_customer_name_trgm`,
> `idx_master_customer_phone_unique`, `idx_master_customer_email_unique`) sudah ada —
> diverifikasi di `pg_indexes` 2026-08-11. Pencarian dirancang **mengikuti** indeks yang
> ada, dan desain tercepat kebetulan juga yang paling aman (sama-persis, bukan awalan).

### Sprint 3K (kegagalan yang tidak meninggalkan jejak)
| Perubahan | Sifat |
|---|---|
| **Investigasi gap `37,38,39`** (tanpa menebak): DB menerima tiap audit-write (repro tabel temp), suppression RPC dikesampingkan (`crm_suppression`=0, raise sebelum audit). **Cacat deterministik tak terbukti**; gap stabil, tak bertambah. Tak ada perbaikan dikarang | Investigasi |
| `lib/crm/audit-gap.ts` (murni + test) — ringkas gap id; `id=4` known-legit; hitung "tak dikenal" | **Pagar** (test) |
| Banner **"Daftar ini tidak lengkap"** di `/settings` — jumlah id hilang & artinya; `fetchAuditLog` kini mengembalikan `gap` (min/max/count seluruh log) | **MENGUBAH TAMPILAN** |
| `lib/crm/failure-log.ts` — jejak kegagalan **PII-free** (hanya `code`/`status`) di **7 route** (500/503), mengikuti pola `login/actions.ts`. Kegagalan tak lagi hilang tanpa bekas | **BARU** |
| SQL deteksi gap di `docs/PASCA-MERGE-monitoring-revert.md`; keputusan **K-21** (gap = sinyal, JANGAN reset sequence) di `docs/riwayat/KEPUTUSAN.md` | Dokumen |
| V-7 tertutup di `docs/CEKLIS-verifikasi-live.md` (layar audit terbukti jalan; `id` 44–47) | Dokumen |
| Test: 219 → **227** (+8 gap-summary; batas & bentuk produksi nyata) | **Pagar** (test) |

> **Nol perubahan skema/DB/migrasi di 3K.** Tidak menulis `crm_audit_log` (hanya membaca
> min/max/count). Sequence tak disentuh — verified masih `47`, gap `4,37,38,39` utuh.

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

## 6. Yang masih menggantung (status jujur)
- **`profile.viewed` masih 0 dan `/settings` belum pernah dibuka** — dua verifikasi yang
  menunggu **satu orang membuka satu halaman**, sudah beberapa sprint. Diangkat ke paling
  atas `docs/CEKLIS-verifikasi-live.md` (V-6/V-7).
- **Baris suppression pertama belum ada.** Jalur tulisnya kini **live** (3H, PR #5), tapi
  praktis tak terjangkau tanpa pencarian — **itulah yang 3J tambahkan**. Setelah 3J deploy,
  permintaan berhenti pertama bisa dicatat lewat cari → profil → suppression. Panduannya
  siap di `docs/PERTAMA-suppression.md`; verifikasi baris pertama di §5c.
- **Dua commit belum ter-merge** (3I + 3J). 3I mencocokkan repo dengan perbaikan keamanan
  yang **sudah live** di DB; 3J membuat suppression yang **sudah live** bisa dipakai.
  Membiarkannya di branch berarti: repo tak mencerminkan DB (3I), dan jalur tulis yang ada
  tetap menganggur (3J).

## 7. Prasyarat & catatan merge
- **JANGAN merge / buka PR ke `main` tanpa izin eksplisit.** Push ke `main` memicu deploy
  Railway ke sistem yang dipakai orang.
- **3J baca-saja, nol skema:** pencarian tak menulis data dan tak mengubah skema; revert =
  `git revert` kode saja. **Migrasi 10 (3I) JANGAN direvert** (§4 Tingkat 0) — DB-nya sudah
  ditutup. Jalur tulis suppression (3H) sudah di main; referensi operasionalnya di §3–§5.
- Verifikasi end-to-end pencarian (gerbang, masking di UI, baris `search.performed`) hanya
  bisa setelah deploy oleh sesi login — sama seperti celah verifikasi sebelumnya. Yang bisa
  tanpa deploy sudah: tipe, lint, seluruh test, build produksi, dan kecocokan desain dengan
  indeks nyata (`pg_indexes`).
- **Perbarui `docs/riwayat/` sebagai bagian dari siklus ini** (dan tiap siklus berikutnya):
  `LINIMASA.md` (baris sprint + status merge), `KEPUTUSAN.md`/`TEMUAN.md` bila ada yang baru,
  `FAKTA-DATA.md` bila angka DB bergerak (bertanggal), `sprint-3j/02-laporan.md` +
  `03-tinjauan.md`, dan simpan transkrip ke `transkrip/` sebelum sesi ditutup. Folder yang
  tak diperbarui menyimpang diam-diam dari kode — persis pola aturan-ganda yang dijaga proyek ini.
