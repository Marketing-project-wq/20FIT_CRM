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

## ⭐ MULAI DARI SINI — dua verifikasi yang sudah menunggu dua sprint

Per `crm_audit_log` (11 Agu 2026): `/audience` dan `/consent` **sudah terbukti jalan di
produksi**. Dua layar berikut **belum pernah dibuka satu kali pun** — masing-masing hanya
butuh **satu orang membuka satu halaman**. Prioritas tertinggi; detail penuh di V-6/V-7
bawah, ringkasnya:

1. **Detail profil menulis `profile.viewed` PERTAMA.** Buka `/audience`, klik satu nama.
   ```sql
   select id, actor_email, action, target_id, occurred_at
   from crm_audit_log where action='profile.viewed' order by id desc limit 1;
   -- Harus muncul 1 baris, target_id = UUID profil. Hari ini jumlahnya 0.
   ```
2. **Layar audit `/settings` menulis `list.viewed`/`crm_audit_log`.** Buka `/settings`
   (peran `audit.view`).
   ```sql
   select id, actor_email, action, target_table, occurred_at
   from crm_audit_log where action='list.viewed' and target_table='crm_audit_log'
   order by id desc limit 1;
   -- Harus muncul 1 baris, aktor = email Anda, tepat setelah membuka /settings.
   ```

> **Jangan salah hitung `/` dan `/quality`.** Keduanya **sengaja tidak menulis audit**
> (aturan 3E). **Nol baris dari keduanya BUKAN bukti mereka jalan** — buktinya hanya log
> Railway atau mata yang melihat layarnya. (Diulang di §akhir.)

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

---

## Sisa verifikasi produksi (Sprint 3H) — dua halaman yang belum pernah dibuka

Per `crm_audit_log` 11 Agu 2026: `/audience` (30 buka) dan `/consent` (1 buka, `id=32`)
**sudah terbukti jalan di produksi**. Dua layar berikut **belum pernah dibuka satu kali
pun** — masing-masing butuh satu orang membuka satu halaman:

### V-6. Detail profil menulis `profile.viewed` PERTAMA
Buka `/audience`, klik satu nama. Lalu:
```sql
select id, actor_email, action, target_id, occurred_at
from crm_audit_log where action = 'profile.viewed'
order by id desc limit 1;
```
Harus muncul **satu** baris `profile.viewed` dengan `target_id` = UUID profil (cocokkan
dengan URL `/audience/<uuid>`). Hari ini jumlahnya **0** — ini akan jadi yang pertama.

### V-7. Layar audit `/settings` menulis `list.viewed`/`crm_audit_log`
Buka `/settings` (peran `audit.view`: super_admin / crm_manager). Lalu:
```sql
select id, actor_email, action, target_table, occurred_at
from crm_audit_log where action='list.viewed' and target_table='crm_audit_log'
order by id desc limit 1;
```
Harus muncul **satu** baris, aktor = email Anda, tepat setelah membuka `/settings`.

### Yang TIDAK bisa dibuktikan dari audit log — jangan salah hitung
`/` (dashboard) dan `/quality` **sengaja tidak menulis audit** (aturan Sprint 3E:
agregat tanpa parameter tidak diaudit). Karena itu **nol baris audit dari keduanya
BUKAN bukti mereka berjalan** — justru itu perilaku yang benar. Menghitung "nol baris"
sebagai keberhasilan membalik artinya. Satu-satunya bukti kedua layar itu jalan adalah
**log Railway** (request 200 ke `/api/dashboard` dan `/api/quality`) atau **seseorang
yang benar-benar melihat layarnya**. Pisahkan dua hal ini saat melapor.
