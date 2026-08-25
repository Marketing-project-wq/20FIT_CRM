# Rencana: menyimpan segmen (keputusan, belum dikerjakan)

> **DIPERBARUI 2026-08-24 (K-40): SEKARANG DIBANGUN — SQL DITUNJUKKAN, BELUM DIJALANKAN.**
> Jalur kirim kampanye (K-38) butuh menyebut segmen mana yang dipakai; `crm_message_log.campaign_id`
> sudah mengandaikan segmen punya identitas. Jadi 3M **diperbarui, bukan dibatalkan**. Yang tetap
> berlaku dari 3M (bagian bawah dokumen ini) dipertahankan penuh: **simpan KRITERIA, bukan daftar
> orang**; hitung anggota ulang saat dipakai; nol kriteria waktu (K-19). SQL final di bawah.
>
> **Status asli (arsip): MEMO KEPUTUSAN.** Sprint 3M membangun segment builder yang **menghitung lalu
> membuang** — nol tabel, nol simpan.

## SQL final `crm_segment` (K-40) — DITUNJUKKAN, BELUM DIJALANKAN

Menyimpan **definisi (kriteria tervalidasi)**, bukan hasil. Pola `crm_*`: RLS on / 0 policy /
grants `service_role`. Berhenti untuk tinjauan sebelum apply.

```sql
create table if not exists public.crm_segment (
  id                uuid primary key default gen_random_uuid(),
  name              text not null,                 -- diberi manusia
  criteria          jsonb not null,                -- pohon filter TERVALIDASI (bukan SQL); divalidasi ulang saat baca
  requires_clinical boolean not null default false,-- true bila kriteria menyentuh srcClinicPatient/srcClinicTxn (view_health)
  created_by        text,                          -- aktor (email/id) — provenans di-baris
  created_at        timestamptz not null default now(),
  is_active         boolean not null default true, -- arsip lunak; tak ada DELETE definisi yang pernah dipakai
  updated_at        timestamptz
  -- TIDAK ADA member_count (dihitung saat dilihat, dgn penanda kesegaran)
  -- TIDAK ADA daftar customer_id (membekukan pool = luput suppression)
  -- TIDAK ADA kriteria waktu (K-19)
);
create index if not exists crm_segment_active_idx on public.crm_segment (is_active, created_at desc);

alter table public.crm_segment enable row level security;
revoke all on public.crm_segment from public, anon, authenticated;
grant select, insert, update on public.crm_segment to service_role; -- update utk rename/arsip; isi kriteria = versi baru
```

**Penjaga yang mempertahankan alasan 3M (LARANGAN):**
- **Anggota dihitung ulang saat dipakai**, ditampilkan dengan **penanda kesegaran** — tak pernah
  kolom `member_count` tersimpan yang membeku.
- **Gerbang klinis tak bisa dimutari.** `requires_clinical` di-set saat simpan (kriteria menyentuh
  `srcClinicPatient`/`srcClinicTxn`); jalur PAKAI (hitung/kirim) tetap memeriksa `view_health` peran
  **yang memakai** — bukan peran yang membuat. Jadi tak bisa dibuat peran berwenang lalu dipakai
  peran lain untuk memutari gerbang.
- **Gerbang peran** = `segment.build` (sama seperti builder 3M).
- Kriteria divalidasi pohon-filter **saat simpan** dan **divalidasi ulang saat baca** (belt-and-suspenders).

**Audit `segment.%`:** provenans dasar ada di-baris (`created_by`/`created_at`). Bila tim ingin aksi
audit formal untuk pembuatan segmen, klasifikasinya **operasional** (rekomendasi bagian bawah, tetap
berlaku) — bukti hukum penargetan ada di jejak KIRIM (`campaign.%`, kepatuhan, K-39), bukan di definisi
segmen. Itu keputusan terpisah; **jangan** diselundupkan — tambahkan `segment.%` ke allowlist operasional
migrasi + `retention-policy.ts` + parity test dalam satu commit bila diputuskan.

**Revert:** `drop table if exists public.crm_segment;` — aditif, nol data pelanggan (hanya kriteria + metadata).

## Kenapa penyimpanan ditunda (dua halangan, bukan satu)

1. **Butuh tabel → butuh migrasi.** Itu perubahan skema, keputusan tersendiri.
2. **Butuh aksi audit `segment.*`, dan aksi itu jatuh di antara dua daftar.** Ini **kali
   ketiga** pola yang sama muncul (setelah `quality.viewed` di 3B dan `suppression.*` di
   3H). Allowlist migrasi 8 memangkas: `profile.viewed`, `list.viewed`, `search.%`,
   `login.%`. Denylist kepatuhan melindungi permanen: `consent.%`, `suppression.%`,
   `role.%`, `profile.deleted`, `export.%`, `retention.%`. Sebuah `segment.created`
   **tidak di keduanya** → tak pernah dipangkas, tak pernah dilindungi, **menumpuk
   selamanya tanpa ada yang sadar**. Menambahkannya berarti: mengganti `crm_purge_audit_log`
   lewat migrasi baru **dan** memperbarui `lib/crm/retention-policy.ts` + test paritasnya
   **dalam satu commit** (K-09). Itu tak boleh diselundupkan ke sprint yang membangun layar.

## Bentuk tabel — dan apa yang TIDAK boleh disimpan

Sebuah `crm_segment` (bila kelak dibuat) menyimpan **definisi (kriteria)**, bukan hasil:

```
crm_segment
  id            uuid pk
  name          text            -- diberi manusia (builder 3M tak punya nama; ini yang baru)
  criteria      jsonb           -- {unit, segment, city, revenue, has_phone, has_email}
  created_by    uuid            -- aktor
  created_at    timestamptz
  -- TIDAK ADA kolom kriteria waktu (K-19), TIDAK ADA daftar customer_id
```

**JANGAN simpan daftar `customer_id` hasilnya.** Menyimpan hasil = membekukan salinan pool
pada satu waktu. Salinan itu:
- **langsung basi** — profil baru yang cocok tak masuk, profil yang berubah tak keluar;
- **luput dari suppression** — seseorang yang minta berhenti **setelah** segmen disimpan
  tetap ada di daftar beku, dan itu persis kegagalan yang seluruh Fase 2 dibangun untuk
  mencegah. Kriteria dihitung **ulang** saat dipakai; daftar beku tidak.

Menyimpan kriteria berarti "siapa yang cocok" selalu dihitung segar terhadap
suppression + consent terkini — satu-satunya bentuk yang aman.

## Klasifikasi retensi `segment.*` — usulan: **OPERASIONAL**

| Pilihan | Argumen | Konsekuensi |
|---|---|---|
| **Operasional (usulan)** | Definisi segmen adalah artefak kerja operasional, bukan bukti hukum. Ia bukan dasar pemrosesan (itu consent), bukan catatan akuntabilitas siapa-lihat-apa (itu `list.viewed`). Membuat/menghapusnya tak perlu disimpan permanen | Dipangkas > 90 hari. Definisi lama hilang otomatis — dapat diterima; ia bisa dibuat ulang. **Tapi** bila kelak segmen dipakai untuk **mengirim** pesan, "segmen mana yang dikirimi" jadi bagian jejak pengiriman — dan **jejak pengiriman** (`send.%`/`export.%`) yang harus kepatuhan, bukan `segment.*` itu sendiri |
| Kepatuhan | "Kami menargetkan grup X" bisa jadi relevan hukum | Menumpuk selamanya; membebani tabel audit untuk artefak yang bisa dibuat ulang. Berlebihan sampai ada pengiriman nyata |

**Rekomendasi:** `segment.%` = **operasional**. Bukti hukum penargetan ada di jejak
**pengiriman** (kepatuhan), bukan di definisi segmennya. Bila tim tak setuju, itu keputusan
sadar — yang penting **bukan** membiarkannya jatuh di antara dua daftar seperti sekarang.

## Kenapa segmen tersimpan BELUM berguna hari ini

Bahkan dengan tabelnya, segmen tersimpan tak melakukan apa-apa yang belum bisa dilakukan
builder sesi-tunggal 3M, karena tiga jalur keluarnya semua tertutup:

- **Ekspor terblokir** — belum ada jalur ekspor (dan RBAC menahannya di balik ambang + approval).
- **Pengiriman terblokir** — belum ada jalur kirim.
- **`crm_consent` kosong** — setiap segmen berjumlah **0 yang boleh dihubungi**. Menyimpan
  definisi yang hasil-boleh-dihubungi-nya nol tak menambah nilai apa pun hari ini.

## Urutan yang benar

1. **Consent punya isi** (kanal opt-in nyata → baris `crm_consent` — `docs/RENCANA-jalur-tulis-consent.md`).
2. **Segmen layak disimpan** (kini "boleh dihubungi" bisa > 0; menyimpan definisi berguna).
3. **Baru ekspor / kirim** (dengan ambang, approval, dan jejak pengiriman kepatuhan).

Membalik urutan ini — menyimpan segmen sebelum ada consent — membangun lemari untuk barang
yang belum ada.

---

> **Konteks lintas-sprint:** keputusan `docs/riwayat/KEPUTUSAN.md` **K-03** (ketiadaan baris
> = penolakan), **K-07** (audit read), **K-09** (satu sumber retensi), **K-19** (nol kriteria
> waktu). Batas builder 3M: nol simpan/ekspor/kirim, nol daftar orang.
