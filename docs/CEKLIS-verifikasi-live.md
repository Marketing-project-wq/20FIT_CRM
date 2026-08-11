# Ceklis verifikasi live — dijalankan manusia dengan sesi login

RBAC dan audit hanya **nyata di balik sesi login**. Skrip `scripts/verify-live.mjs`
memverifikasi lapisan baca (konstruksi query PostgREST), tetapi tidak bisa membuktikan
bahwa gerbang peran, masking di UI, dan penulisan audit benar-benar terjadi saat orang
memakai aplikasi. Ceklis ini menutup sisa itu. Perlu ± 15 menit, satu akun yang sudah
punya peran (mis. `super_admin`), dan akses SQL Editor Supabase.

> **Sebelum mulai:** jalankan skrip lapisan data lebih dulu —
> `node --experimental-strip-types scripts/verify-live.mjs` (Node ≥ 22.6, dengan
> `.env.local` berisi kredensial Railway). Semua harus `PASS`, termasuk baris
> `audit rows before=… after=…  -> [PASS] no write`. Kalau ada `FAIL`, berhenti dan
> laporkan sebelum menyentuh UI.

Untuk setiap langkah: **patokan awal** ambil dulu, lakukan aksinya, lalu jalankan **SQL
pemastian**. Semua SQL memakai `count`/`select` biasa — tidak menulis apa pun.

Ambil patokan awal sekali di awal:

```sql
select count(*) as audit_before from crm_audit_log;
```

---

## 1. Dashboard `/` — aturan `0` vs `—`

Buka `/`. Harus tampak empat kartu:

| Kartu | Nilai yang benar |
|---|---|
| Ukuran audiens | **82.253** (angka nyata) |
| Bisa dihubungi | **0** (fakta hukum: belum ada consent register) |
| Workflow aktif | **—** (belum ada tabel — bukan `0`) |
| Profil terakhir bertambah | **31 Juli 2026** (muatan batch terakhir) |

Cocokkan "Ukuran audiens" dengan keluaran skrip (`quality.total` / `dashboard.audienceSize`).
Dashboard **tidak** menulis audit — pastikan:

```sql
-- Harus SAMA dengan audit_before (dashboard = agregat tanpa parameter → tidak diaudit)
select count(*) from crm_audit_log;
```

## 2. Quality `/quality` — angka cocok, nol audit baru

Buka `/quality`. Angkanya harus cocok dengan tabel skrip (city 5.786, segment 81.011,
ltv>0 1.112, telepon-tidak-62 31, duplikat 15, orphan 32, excluded 6.361, satelit 0/0/0).
`/quality` juga **tidak** menulis audit:

```sql
-- Masih SAMA dengan audit_before
select count(*) from crm_audit_log;
```

## 3. Audience `/audience` — satu `list.viewed` per pembacaan daftar

Buka `/audience`, lalu ganti **satu** filter (mis. unit = `arena`). Tiap pembacaan daftar
menambah **tepat satu** baris:

```sql
select id, actor_email, action, target_table, metadata->'filters' as filters, occurred_at
from crm_audit_log
where action = 'list.viewed' and target_table = 'master_customer'
order by id desc limit 3;
-- Baris teratas: aktor = email Anda, filters mencerminkan filter yang barusan dipakai.
```

## 4. Detail profil — satu `profile.viewed`, `target_id` terisi

Di `/audience`, klik **satu nama**. Detail profil terbuka. Harus menambah **tepat satu**
baris `profile.viewed`, dan `target_id` = `customer_id` profil itu:

```sql
select id, actor_email, action, target_id, occurred_at
from crm_audit_log
where action = 'profile.viewed'
order by id desc limit 1;
-- target_id harus berupa UUID (bukan null). Sebelum sprint ini, profile.viewed = 0 baris.
```

Cocokkan `target_id` dengan UUID di URL (`/audience/<uuid>`).

## 5. Settings `/settings` — layar audit, dan pembukaannya sendiri tercatat

Buka `/settings`. Layar audit tampil (default berpihak kepatuhan; lihat §Audit). Membuka
layar ini **menulis** satu `list.viewed` dengan `target_table = 'crm_audit_log'`:

```sql
select id, actor_email, action, target_table, occurred_at
from crm_audit_log
where action = 'list.viewed' and target_table = 'crm_audit_log'
order by id desc limit 1;
-- Baris teratas: aktor = email Anda, muncul tepat setelah Anda membuka /settings.
```

## Pemastian akhir — hitung selisih audit

```sql
select count(*) as audit_after from crm_audit_log;
```

`audit_after − audit_before` harus **persis** = (jumlah pembacaan daftar audience di §3)
+ (jumlah profil dibuka di §4) + (jumlah kali `/settings` dibuka di §5). **Nol** dari §1
(dashboard) dan §2 (quality). Kalau ada tambahan yang tak terjelaskan, ada penulisan
audit yang tak diharapkan — laporkan.

---

## Langkah yang TIDAK bisa diverifikasi tanpa akun uji

**Masking `analyst` benar-benar tampil di UI.** Skrip membuktikan masking di lapisan
(`fetchProfileById(…, masked=true)` menghasilkan `62812****…`), dan unit test menutup
algoritmanya — tetapi bahwa peran `analyst` *sungguhan* melihat kontak tersamar di
browser hanya bisa dibuktikan dengan sesi `analyst` nyata.

Yang perlu **tim** siapkan (bukan Claude — ini memberi akses akun manusia di produksi):

1. Satu akun di **Supabase Auth** (mis. `analyst-test@20fit.id`, Auto Confirm).
2. Satu baris `crm_user_role` untuk akun itu dengan `role = 'analyst'`.
3. Login sebagai akun itu, buka `/audience` dan satu detail profil.

Yang harus terlihat:
- Kolom Telepon & Email di daftar **tersamar** (`62812****8953`, `j***@domain.com`) dan
  ada badge "Kontak disamarkan".
- Di detail profil, kontak juga tersamar.
- `analyst` **tidak** melihat menu `/settings` (gerbang `audit.view` = hanya super_admin
  & crm_manager) dan `/api/audit` mengembalikan 403 bila diakses langsung.

> **Claude tidak membuat akun atau baris `crm_user_role` ini.** Membuat/mengubah baris
> peran memberi atau mencabut akses akun manusia di produksi — itu keputusan tim.
> Setelah selesai menguji, tim boleh menonaktifkan akun uji itu.
