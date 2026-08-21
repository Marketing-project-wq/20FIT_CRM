# Pasca-merge: pemantauan 30 menit & revert yang sudah dilatih

> Ditulis Sprint 3G, setelah PR #4 menggabungkan 3B–3F ke `main` (`eff733c`). Rencana
> revert di berkas PR **sudah dilatih** di sini — bukan sekadar harapan.

## Latihan revert — HASIL: BEKERJA

Dijalankan lokal di branch buang `_revert-rehearsal` dari commit merge `eff733c`:

```bash
git checkout -b _revert-rehearsal eff733c
git revert -m 1 --no-edit eff733c     # revert PR #4, pertahankan parent-1 (= 4bac312)
```

Hasil terverifikasi:

- **Pohon hasil identik dengan `4bac312`** (Sprint 3A) — `git diff --stat 4bac312 HEAD` kosong.
- `NODE_ENV=production npm run build` → **Compiled successfully.**
- `npx vitest run` → **126 test hijau** (baseline 3A).
- `tsc --noEmit` → **bersih (0)** setelah `.next` lama dibersihkan.

**Satu gotcha yang ditemukan (dan bukan masalah produksi):** kalau `.next` dari build
3B–3F sebelumnya masih ada, `tsc` memunculkan error hantu (`.next/types/app/api/dashboard…`
merujuk rute yang sudah hilang). Railway build fresh, jadi ini tak relevan di produksi —
tapi siapa pun yang melatih revert lokal **harus `rm -rf .next` dulu**. Sudah dicatat.

**Kesimpulan:** perintah revert-nya `git revert -m 1 <sha-merge-PR#4>`, dan ia benar-benar
mengembalikan kode ke Sprint 3A dengan bersih. Rencananya bukan harapan; ia jalan.

> **KOREKSI model deploy (12 Agu 2026, T-18/K-25):** dokumen ini mengasumsikan "merge ke `main`
> → deploy". Bukti kemudian menunjukkan produksi menjalankan kode *branch*, bukan `main`. Rencana
> monitoring di bawah tetap berlaku untuk deploy apa pun; hanya pemicunya yang perlu diluruskan —
> lihat `docs/KOREKSI-DEPLOY.md`.

## Yang diawasi 30 menit pertama setelah deploy

### Log Railway
- **Deploy sukses** (build hijau, container start). Prefix `NODE_ENV=production` di
  `railway.json` utuh — jangan sampai runtime dev/prod campur (kesalahan yang sudah dua kali).
- **`Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY`** di log = env salah
  konfigurasi → efeknya semua orang **403 fail-closed** (bukan bocor), tapi berarti aplikasi
  tak berguna sampai env dibetulkan. Cek `/health` (`env: configured`, `supabase: reachable`).
- Lonjakan **HTTP 500** pada `/api/*` (`query_failed`) → indikasi DB tak terjangkau atau
  service-role bermasalah.

### Baris audit yang HARUS muncul (bukti fitur jalan)
Jalankan berkala:
```sql
select action, target_table, target_id is not null as has_target, count(*)
from crm_audit_log where occurred_at > now() - interval '30 minutes'
group by 1,2,3 order by 4 desc;
```
- `list.viewed` / `master_customer` — saat orang membuka `/audience`.
- **`profile.viewed` / `master_customer` dengan `target_id` terisi** — saat orang mengklik
  nama. Ini akan jadi baris `profile.viewed` **PERTAMA** yang pernah ada (hari ini 0).
- `list.viewed` / `crm_consent` — saat peran `consent.edit` membuka `/consent`.
- `list.viewed` / `crm_audit_log` — saat mereka membuka `/settings`.

### Deteksi GAP id — jejak satu-satunya operasi teraudit yang GAGAL (Sprint 3K)
`crm_audit_log.id` memakai sequence. Sebuah `INSERT` yang gagal atau di-rollback tetap
**mengambil** nomornya lalu tak meninggalkan baris — jadi lubang di urutan id adalah
satu-satunya jejak operasi teraudit yang gagal. Jalankan berkala; **jangan pernah**
mengisi ulang / mengatur ulang sequence (menghapus bukti — lihat KEPUTUSAN K-21).
```sql
-- Berapa banyak id hilang, dan yang mana. id=4 SAH (baris sintetis dihapus uji purge 3A).
with b as (select min(id) mn, max(id) mx, count(*) c from crm_audit_log)
select mx as max_id, c as row_count, (mx - mn + 1) - c as missing_total,
       (select array_agg(g order by g)
          from generate_series((select mn from b),(select mx from b)) g
          where g not in (select id from crm_audit_log)
            and g <> 4) as unexplained_missing_ids   -- id=4 dikecualikan (known-legit)
from b;
```
- `unexplained_missing_ids` **kosong** = tak ada operasi teraudit yang gagal tak terjelaskan.
- Ada isinya = tiap id adalah **satu** operasi teraudit yang gagal; barisnya tak pernah
  mendarat. Sejak 3K, `[api …] audit_write_failed` / `…_write_failed` di **log Railway**
  membawa kode galat DB-nya (bebas PII) — telusuri di sana. Per 11 Agu 2026, gap yang
  diketahui: `4` (sah), `37,38,39` (tak dikenal, tidak bertambah).
- Layar audit `/settings` kini menampilkan hitungan ini di atas daftar (banner
  "Daftar ini tidak lengkap").

### Baris audit yang TIDAK BOLEH muncul (pelanggaran aturan 3E)
- **Nol** baris baru dari membuka `/` (dashboard) atau `/quality` — keduanya agregat tanpa
  parameter, tidak diaudit. Kalau muncul baris audit dari dua layar itu, aturan 3E bocor.
- **Nol** nama aksi baru. Hanya `list.viewed` dan `profile.viewed` yang boleh bertambah.
  Aksi baru = melanggar allowlist migrasi 8 (menumpuk selamanya). Cek:
  ```sql
  select distinct action from crm_audit_log where occurred_at > now() - interval '30 minutes';
  ```

### Gejala pertama yang berarti REVERT
- `/api/*` mengembalikan 500 **berulang & sistemik** (bukan satu transient) → kemungkinan
  env/service-role/skema. Revert kode.
- `/health` `supabase: unreachable` menetap → infrastruktur; belum tentu perlu revert kode,
  tapi eskalasi.
- Tanda kontak **tak tersamar** sampai ke peran yang seharusnya tersamar (butuh akun uji
  `analyst`) → revert segera; ini kegagalan privasi, bukan sekadar bug tampilan.
- Catatan: baris audit yang bertambah saat orang membuka halaman **BUKAN** gejala — itu
  memang cara kerjanya.

## Batas revert — siapa yang boleh memutuskan `drop table`

- **Revert kode** (`git revert -m 1`) **TIDAK** menghapus `crm_consent`. Tabel tetap ada.
- **`drop table if exists public.crm_consent;`**:
  - **AMAN selama nol baris** (kondisi hari ini: 0 baris consent, 0 suppression).
  - **TIDAK BOLEH begitu ada ≥ 1 baris consent** — satu baris consent adalah **catatan
    hukum** (dasar pemrosesan). Men-drop tabel berisi consent = menghapus bukti dasar hukum.
- **Siapa yang memutuskan drop — BUKAN orang yang panik jam 2 pagi.** Keputusan drop
  memerlukan pemilik data/legal (mis. `data_steward` + sign-off legal, lihat
  `docs/SIGNOFF-legal-consent.md`), karena konsekuensinya hukum, bukan teknis. On-call yang
  merevert saat insiden: **revert kode saja, biarkan tabelnya.** Tabel kosong yang tertinggal
  tidak berbahaya; menghapusnya buru-buru bisa.

## Urutan (tidak ada yang perlu diurutkan)

Migrasi `crm_consent` sudah jalan lebih dulu (3F). Deploy kode ini datang **setelah** tabel
ada dan RBAC hidup — kebalikan dari peringatan urutan keras Sprint 3A di README. Tidak ada
langkah pengurutan untuk deploy ini.

## Monitoring keamanan: klasifikasi akses tabel (RLS × policy × grant) — Sprint 3Q

Jalankan ulang kapan saja. Policy bisa berubah tanpa memberi tahu tim ini (proyek dipakai
bersama; 102 fungsi anon-exec naik dari 101 dalam hitungan hari). Ukuran `relrowsecurity`
SAJA tidak cukup (K-23, S-08) — kueri ini menggabungkan RLS, policy, dan grant.

```sql
WITH tabs AS (
  SELECT c.relname, c.relrowsecurity AS rls FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname='public' AND c.relkind='r'
),
gr AS (
  SELECT table_name,
    bool_or(grantee='anon' AND privilege_type='SELECT') AS anon_sel,
    bool_or(grantee='authenticated' AND privilege_type='SELECT') AS auth_sel,
    bool_or(grantee='authenticated' AND privilege_type IN ('INSERT','UPDATE','DELETE')) AS auth_write
  FROM information_schema.role_table_grants WHERE table_schema='public' GROUP BY table_name
),
pol AS (
  SELECT tablename,
    bool_or(permissive='PERMISSIVE' AND cmd IN ('SELECT','ALL') AND (roles::text[] && ARRAY['anon','public'])) AS anon_read_pol,
    bool_or(permissive='PERMISSIVE' AND cmd IN ('SELECT','ALL') AND (roles::text[] && ARRAY['authenticated','public'])) AS auth_read_pol,
    bool_or(permissive='PERMISSIVE' AND cmd IN ('INSERT','UPDATE','DELETE','ALL') AND (roles::text[] && ARRAY['authenticated','public'])) AS auth_write_pol
  FROM pg_policies WHERE schemaname='public' GROUP BY tablename
),
cls AS (
  SELECT t.relname AS tbl,
    (coalesce(g.anon_sel,false) AND (NOT t.rls OR coalesce(p.anon_read_pol,false))) AS anon_read,
    (coalesce(g.auth_sel,false) AND (NOT t.rls OR coalesce(p.auth_read_pol,false))) AS auth_read,
    (coalesce(g.auth_write,false) AND (NOT t.rls OR coalesce(p.auth_write_pol,false))) AS auth_write
  FROM tabs t LEFT JOIN gr g ON g.table_name=t.relname LEFT JOIN pol p ON p.tablename=t.relname
)
SELECT CASE WHEN anon_read THEN 'anon-open' WHEN auth_read THEN 'authenticated-open' ELSE 'locked' END AS tier,
  count(*) AS tables, count(*) FILTER (WHERE auth_write) AS auth_writable
FROM cls GROUP BY 1 ORDER BY 1;
```

**Baseline 11 Agu 2026:** `anon-open` **199** (172 writable) · `authenticated-open` **43**
(39 writable) · `locked` **141**. `master_customer` & `customer_engagement` = authenticated-open
+ writable (T-17). Seluruh `crm_*` = locked. **Kenaikan angka anon-open/login-open, atau
`crm_*` yang keluar dari `locked`, adalah alarm.** Ganti `GROUP BY 1` dengan `WHERE tbl IN (…)`
untuk memeriksa tabel tertentu.
