# Rencana: agregat tally event dashboard — SQL siap, MENUNGGU konfirmasi (belum diterapkan)

> **Status: USULAN + SQL, GATED.** Sprint muat-bertahap mengukur perjalanan bolak-balik dan
> memecah dashboard jadi blok. Satu perbaikan menyentuh SKEMA (fungsi baru), jadi SQL-nya
> ditaruh di sini dan **berhenti** — tidak diterapkan tanpa konfirmasi (larangan sprint).

## Yang diukur

**Tally event = jalur bolak-balik terbesar.** `fetchEventRegistrations` (lib/crm/dashboard-viz.ts)
memerlukan **20 fetch berurutan** untuk memindai **19.333** baris `customer_engagement (unit='event')`
demi menghasilkan **15** angka (registrasi per produk). Diukur langsung ke DB (2026-08-24):

| | sebelum | sesudah (bila RPC diterapkan) |
|---|---|---|
| Perjalanan bolak-balik | **20** (berurutan, ~size/1000) | **1** |
| Baris ditransfer | 19.333 | 0 (hanya 15 baris hasil agregat) |
| Waktu kueri (EXPLAIN ANALYZE) | — (app-path menjumlah ~20 round-trip) | **~34 ms** (index-only scan `idx_engagement_unit_product` + HashAggregate) |

PostgREST tak bisa `GROUP BY`, jadi satu-satunya cara menjadikan ini **satu** kueri adalah RPC
(SECURITY DEFINER) — sebuah perubahan skema. Karena itu **gated**.

**Probe selisih sumber-hidup — SUDAH paralel.** `fetchLiveSourceGaps` (lib/crm/dashboard-sources.ts)
sudah menjalankan kelima sumber (my20fit / hyrox / arena / gym / clinic) berbarengan lewat
`Promise.allSettled`. Tak ada perubahan diperlukan; paging di DALAM tiap sumber tetap berurutan
tetapi tiap sumber kecil (ratusan s/d ~1.000 identitas → 1–2 halaman). Tidak jadi target.

## SQL usulan (JANGAN terapkan tanpa konfirmasi)

```sql
-- Registrasi per produk event dalam SATU kueri agregat (menggantikan 20 fetch berurutan).
-- SECURITY DEFINER + search_path terkunci; EXECUTE dikunci ke service_role di file yang SAMA
-- (pola pagar migration-execute-guard). Read-only, tanpa PII (hanya nama produk + hitungan).
create or replace function public.crm_event_registrations()
returns table(product text, registrations bigint)
language sql
stable
security definer
set search_path to 'public'
as $$
  select coalesce(product, '(tanpa produk)') as product, count(*) as registrations
  from public.customer_engagement
  where unit = 'event'
  group by 1
  order by 2 desc, 1;
$$;

revoke all on function public.crm_event_registrations() from public, anon, authenticated;
grant execute on function public.crm_event_registrations() to service_role;
```

**Setelah diterapkan** (bila disetujui): ganti isi `fetchEventRegistrations` dengan satu
`admin.rpc("crm_event_registrations")` yang memetakan baris → `{ product, registrations }`, dan
tambahkan entri ledger migrasi di README. Blok `events` di dashboard sudah terpisah, jadi tak ada
perubahan UI — hanya jalurnya yang jadi satu round-trip.

## Yang TIDAK berubah demi kecepatan (larangan)

- **Contactability tetap live** (RPC `crm_contactable_counts`), tak pernah di-precompute — angka
  basi di sana akan bilang seseorang bisa dihubungi padahal baru minta berhenti.
- **Penanda kesegaran per blok tetap** — live / snapshot cermin / bertanggal tetap dibedakan; muat
  bertahap tidak menghapus pembedaan itu.
