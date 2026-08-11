# Tinjauan independen — Sprint 3J

> Diisi oleh sesi yang mengerjakan sprint ini (11 Agu 2026). Pengetahuan langsung.

## Apa yang diverifikasi
- **Desain mengikuti indeks nyata**, bukan sebaliknya. `pg_indexes` dibaca lebih dulu:
  `idx_master_customer_name_trgm` (GIN trigram), `idx_master_customer_phone_unique` &
  `idx_master_customer_email_unique` (btree UNIQUE) — persis tiga bentuk pencarian yang
  dipakai. Nol indeks baru, nol perubahan skema.
- **Batas anti-panen sebagai fungsi murni ber-test** (`lib/crm/search.ts`): kasus batas
  DAN penyalahgunaan (nama < 3, wildcard `% _`, hanya-angka pada nama, telepon/email tak
  ternormalisasi, `cap+1` → `too_many`). Bukan hanya jalur bahagia.
- **Klasifikasi audit dikonfirmasi, bukan diasumsikan:** test menegaskan
  `classifyAction("search.performed") === "operational"` dengan nama aksi persis produksi.

## Keputusan yang ditulis eksplisit
- **POST, bukan GET** untuk `/api/search` — query (telepon/email/nama) adalah PII; GET
  menaruhnya di URL dan access-log. Dan query **tidak** masuk metadata audit (K-16).
- **Sama-persis pada identifier** bukan sekadar kecepatan: substring = alat panen.
  Alasan menolak pencarian awalan ditulis **sebelum** ada yang memintanya, di
  `docs/PENCARIAN-exact-match.md`.

## Yang tidak bisa diverifikasi (jujur)
- Perilaku end-to-end di balik sesi login: gerbang `profile.view_list`, masking yang
  benar-benar tampil, baris `search.performed` yang mendarat, dan auto-navigasi hasil
  telepon/email tunggal. Sandbox mem-block Supabase; hanya bisa dibuktikan pasca-deploy.
- Per 11 Agu 09:05 UTC, `search.performed` = **0** di produksi — wajar, 3J masih di branch.

## Catatan
Test 202 → 219 (+16 pencarian, +1 paritas). `tsc`/`lint`/build bersih. Tidak ada tulis
data, tidak ada perubahan skema — sesuai batas sprint.
