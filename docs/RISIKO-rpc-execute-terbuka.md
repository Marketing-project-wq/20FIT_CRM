# Risiko: `EXECUTE` RPC terbuka ke `anon` di project Supabase bersama

> **Status: SATU sudah diperbaiki (milik CRM), SISANYA memo keputusan.** Migrasi 10
> menutup `crm_purge_audit_log`. Dokumen ini menjelaskan polanya, menunjukkan contoh yang
> sudah diperbaiki, dan menaruh sisanya — fungsi milik sistem tim lain — di atas meja
> sebagai keputusan pemilik project. Ia **tidak** menyentuh fungsi tim lain.
>
> Diverifikasi ke database produksi `cpvzwqptzcxnwzfzgrmt`, 11 Agustus 2026.

## Ringkasan satu paragraf

Supabase memberi `EXECUTE` **default** ke role `anon` dan `authenticated` (dan PUBLIC)
pada **setiap** fungsi baru di skema `public`. Untuk fungsi `SECURITY DEFINER` — yang
berjalan sebagai pemiliknya (biasanya `postgres`, melewati RLS) — itu berarti siapa pun
pemegang anon key bisa memanggilnya lewat `POST /rest/v1/rpc/<fungsi>` **tanpa login,
tanpa peran**, mengeksekusi kode tingkat-pemilik dan melewati seluruh RBAC. Kontrolnya
tidak **ditembus**; ia **dilewati** — persis seperti `staging_20fit_data` di
`docs/RISIKO-masking-bypass.md`, hanya lewat endpoint RPC alih-alih tabel telanjang.

## Mekanismenya (kenapa ini terjadi tanpa ada yang salah ketik)

1. `create function public.foo(...)` — selesai. Tidak ada `grant` yang ditulis siapa pun.
2. Supabase (lewat default privileges pada schema `public`) **otomatis** memberi
   `EXECUTE` ke `anon`, `authenticated`, dan `service_role`.
3. PostgREST mengekspos fungsi yang boleh dieksekusi `anon`/`authenticated` sebagai
   endpoint `/rest/v1/rpc/foo`. Anon key sudah tertanam publik di bundel klien.
4. Bila `foo` adalah `SECURITY DEFINER`, ia jalan sebagai pemilik → RLS dilewati, dan
   apa pun yang ia lakukan dilakukan dengan hak pemilik.

**Jebakan halus:** `revoke execute on function foo(...) from public;` **tidak cukup**.
`anon` dan `authenticated` adalah grant peran **eksplisit**, bukan warisan dari PUBLIC —
mereka bertahan setelah revoke-from-public. Harus disebut namanya:
`revoke all on function foo(...) from public, anon, authenticated;`. Inilah yang membuat
migrasi 9 diterapkan **dua kali** (Sprint 3H) dan yang migrasi 10 perbaiki untuk migrasi 8.

## Contoh nyata yang SUDAH diperbaiki: `crm_purge_audit_log`

Sebelum migrasi 10, `proacl`-nya:
```
{=X/postgres, postgres=X/postgres, anon=X/postgres, authenticated=X/postgres, service_role=X/postgres}
```
`=X/postgres` (PUBLIC), `anon`, dan `authenticated` semua bisa EXECUTE. Fungsi ini
`SECURITY DEFINER` dan ia **menonaktifkan trigger append-only, menghapus baris audit,
lalu menyalakannya kembali**. Jadi siapa pun dengan anon key bisa:
```
POST /rest/v1/rpc/crm_purge_audit_log
apikey: <ANON_KEY>
{ "dry_run": false }
```
— tanpa sesi, tanpa peran — dan menjalankan pemangkasan audit yang seharusnya hanya boleh
dilakukan lewat service role.

**Dampak hari ini nol baris, dan itu alasan memperbaikinya sekarang:** baris audit tertua
2026-08-10, jadi belum ada > 90 hari dan panggilan hari ini menghapus **nol**. Kategori
kepatuhan (`role.*`, `consent.*`, `suppression.*`, `export.*`, `retention.*`) dikecualikan
permanen oleh allowlist **dan** jaring pengaman denylist migrasi 8. Yang masih bisa
dilakukan hari ini: menulis baris `retention.purge_executed` tanpa batas ke tabel
append-only yang tak bisa dibersihkan siapa pun. Sekitar **8 November 2026** baris
operasional pertama (`list.viewed`/`profile.viewed`) lewat 90 hari — sejak itu anon bisa
menghapus catatan **siapa melihat data pelanggan siapa**. Ditutup selagi gratis.

Sesudah migrasi 10:
```
{postgres=X/postgres, service_role=X/postgres}
```
Dan `crm_purge_audit_log()` (default `dry_run=true`) lewat service role tetap bekerja
(melapor, nol tulis) — hak dicabut tanpa mematahkan jalur sah.

## Seberapa luas ini di seluruh project (ukur sendiri)

Ini project Supabase **bersama** banyak sistem (arena, clinic, shop, rb, my20fit, rc, uob,
talent). Untuk menghitung fungsi `SECURITY DEFINER` di `public` yang bisa dieksekusi `anon`:

```sql
select
  count(*) filter (where p.prosecdef) as secdef_anon_executable,
  count(*) filter (where p.prosecdef and p.proname like 'crm\_%') as crm,
  count(*) filter (where p.prosecdef and p.proname not like 'crm\_%') as non_crm
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and has_function_privilege('anon', p.oid, 'EXECUTE');
```

Hasil 11 Agustus 2026: **`crm = 0`** (semua fungsi CRM sudah dikunci migrasi 9 + 10),
**`non_crm = 101`**. Prompt sprint menyebut **99**; selisihnya bukan salah hitung — **set
ini bertambah setiap tim lain men-deploy fungsi baru** (default-nya terbuka). Angka yang
naik dari 99 ke 101 dalam hitungan hari **adalah buktinya**: tanpa pagar, tiap migrasi
berikutnya menambah satu pintu terbuka.

Untuk melihat daftar persisnya (nama + acl), buang `count`-nya:
```sql
select p.proname, pg_get_function_identity_arguments(p.oid) as args, p.proacl::text
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname='public' and p.prosecdef
  and has_function_privilege('anon', p.oid, 'EXECUTE')
  and p.proname not like 'crm\_%'
order by p.proname;
```

## Kenapa CRM hanya mengunci punyanya sendiri

101 fungsi non-`crm_*` itu milik sistem tim lain. Mengunci `EXECUTE`-nya bisa **memutus**
aplikasi yang sah memanggilnya (banyak RPC memang dirancang dipanggil dari klien dengan
anon/authenticated key — itu pola Supabase yang normal untuk fungsi yang aman). Menilai
mana yang aman terbuka dan mana yang berbahaya butuh pengetahuan tiap sistem — itu
**keputusan pemilik masing-masing**, bukan lingkup sprint CRM. Yang bisa kami lakukan:

- **Kunci milik kami** (selesai: migrasi 9 + 10; `crm = 0`).
- **Pasang pagar** supaya migrasi CRM berikutnya tak bisa menambah pintu terbuka tanpa
  menggagalkan test (`lib/crm/migration-execute-guard.test.ts`).
- **Menaruh fakta ini di atas meja** (dokumen ini) supaya pemilik project bisa memutuskan
  soal 101 sisanya dengan sadar.

## Opsi untuk pemilik project (bukan sekarang, bukan oleh CRM)

| Opsi | Tindakan | Konsekuensi |
|---|---|---|
| **A. Audit per fungsi** | Untuk tiap dari 101, putuskan: aman terbuka atau kunci ke role tertentu | Paling benar, paling makan waktu. Butuh pemilik tiap sistem menilai fungsinya |
| **B. Default privilege schema** | `alter default privileges in schema public revoke execute on functions from anon, authenticated` lalu grant selektif | Menghentikan pintu-baru-otomatis untuk SEMUA fungsi mendatang. Bisa memutus RPC klien sah yang ada — harus dipetakan dulu |
| **C. Pagar per-tim** | Tiap tim adopsi pola guard-test seperti CRM | Terdistribusi; hanya sekuat kepatuhan tiap tim |
| **D. Status quo** | — | Set pintu terbuka terus bertambah tiap deploy. Diterima sadar atau tidak — sebaiknya sadar |

## Yang TIDAK dilakukan dokumen ini
- Tidak menyentuh satu pun fungsi di luar `crm_*`. Tidak `revoke`, tidak `grant`, tidak drop.
- Tidak mengubah default privileges schema.

Semua di atas keputusan pemilik project. Dokumen ini hanya menaruh pola, angka, cara
mengukurnya, dan contoh yang sudah diperbaiki di atas meja.

---

> **Konteks lintas-sprint:** temuan `docs/riwayat/TEMUAN.md` **T-01** (crm_purge, ditutup) & **T-03** (101 fungsi tim lain); keputusan **K-15** (pagar EXECUTE).
