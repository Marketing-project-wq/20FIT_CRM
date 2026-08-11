# Tinjauan diff lima sprint (3B–3F) — dibaca sebagai peninjau, bukan penulis

> Rentang: `git diff 4bac312..e25a317` (46 file, +4.699 / −219). Ditinjau Sprint 3G.
>
> **Catatan waktu:** saat tinjauan ini ditulis, diff-nya **sudah ter-merge** (PR #4,
> `main` di `eff733c`). Jadi ini tinjauan **pasca-merge** — temuan yang diperbaiki
> di-commit sebagai perbaikan lanjutan di atas `main` baru, bukan sebagai gating
> sebelum merge (merge-nya sudah terjadi di luar sesi ini).

## Yang DIPERBAIKI di sprint ini

| # | Temuan | Jenis | Tindakan |
|---|---|---|---|
| 1 | **`lib/auth/guard.ts` tidak dipakai siapa pun** (0 import). Ditulis Sprint 3A sebagai "ready infrastructure" (guard berbasis `throw`), tapi semua route handler memilih pola **inline return-response** (`getCurrentUserRole` + `isPermitted` → `NextResponse` 403). Dua idiom auth, satu tak terpakai = footgun (peninjau mengira route pakai guard, padahal tidak). | Kode mati | **Dihapus** seluruh file. Bila kelak ada Server Action (yang memang `throw`), guard dibuat ulang sesuai kebutuhan nyata. |
| 2 | **`hasAnyRole` di `roles.ts` tidak dipakai** (0 referensi, termasuk test). Sisa dari rewrite RBAC 3A. | Kode mati | **Dihapus** fungsinya. |
| 3 | **Komentar bertentangan** di `components/audience/audience-pool.tsx`: "We never receive customer_id — not a display column" — padahal interface `Row` tepat di bawahnya **punya** `customer_id` (ditambah 3C untuk tautan detail). Komentar 3A yang tak ikut diperbarui saat 3C mengubah perilakunya. | Komentar ⟂ kode | **Diperbaiki** jadi: customer_id diterima (3C), dipakai hanya sebagai target tautan, bukan kolom tampilan. |

Ketiganya diverifikasi aman: `tsc` bersih, 179 test hijau, `next lint` bersih setelah perubahan.

## Yang DIPERIKSA dan sengaja DIBIARKAN (beserta alasan)

- **Aturan retensi (kanon telepon 3B, daftar retensi 3E) — sudah dijahit ke satu
  sumber.** Diperiksa: nol literal `action.like.consent…`/`action.eq.profile.viewed…`
  di luar `lib/crm/retention-policy.ts` (semua diturunkan via `toPostgrestOr`); parity
  test mengunci ke migrasi 8. **Tidak menemukan kejadian ketiga** dari pola "aturan
  ditulis dua kali" — itu justru yang paling saya cari, dan sumber-tunggal 3E menutupnya.
- **Blok UI "Akses ditolak" berulang di ~6 `page.tsx`** (audience, audience/[id],
  quality, settings, settings/roles, consent). Dibiarkan: presentasional, pesan tiap
  halaman sedikit berbeda, dan mengekstraknya menambah abstraksi di sprint yang tujuannya
  mendaratkan, bukan menambah. Bukan hazard kebenaran (server tetap menegakkan gerbang).
- **Pola tulis-audit berulang di route** (`insert list.viewed` + 503 bila gagal) di
  `/api/audience`, `/api/audit`, `/api/consent`. Dibiarkan: tiap route punya
  `target_table`/`metadata` sendiri; menyeragamkannya jadi helper akan menyembunyikan
  perbedaan yang justru harus terlihat per-route. Aturannya sendiri (kapan wajib audit)
  hidup satu tempat: README + komentar peringatan di `/api/quality`.
- **`console.error` di `app/login/actions.ts`** — bukan jejak sisa: sengaja (commit
  Sprint 1 "log PII-free"), di luar rentang diff ini, dan bebas PII. Dibiarkan.
- **`console.log` di `scripts/verify-live.mjs`** — itu memang keluaran alat verifikasi
  (tabel PASS/GAGAL). Dibiarkan.
- **Layar `ComingSoon` tersisa** (segments, campaigns, templates, messages, exports,
  workflows) — memang belum dibangun (terkunci consent). Bukan kode mati; placeholder jujur.
- **`/audience` — satu-satunya layar dengan pemakaian nyata tercatat.** Perhatian ekstra:
  perubahannya (banner tak lagi hardcode angka di 3B; nama jadi tautan + `profile.viewed`
  di 3C) diperiksa. Masking telepon/email **tetap** diterapkan di server (`lib/crm/audience.ts`
  baris ~148 & ~252), nama menaut ke `/audience/[customer_id]`, key baris = `customer_id`.
  Tidak ada regresi masking; perubahan aditif.

## Kenapa temuannya tidak nol, dan tidak banyak

Diff sebesar ini "nol temuan" akan mencurigakan. Tiga temuan nyata (dua kode mati, satu
komentar bertentangan) konsisten dengan lima sprint yang saling menimpa. Yang **tidak**
ditemukan — daftar-aturan-ganda ketiga, jejak debug di kode terkirim, angka hardcode yang
tertinggal — memang absen karena sprint-sprint sebelumnya sudah menutupnya secara sadar
(3B mencabut angka hardcode + pagar Tailwind; 3E menyatukan retensi + membayar utang test;
3D/3E memindahkan logika murni ke modul ber-test). Itu bukan keberuntungan; itu pola kerja
yang memang menargetkan kelas-kelas kesalahan ini.
