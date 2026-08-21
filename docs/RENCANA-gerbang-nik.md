# RENCANA — Pindahkan gerbang NIK dari `view_health` ke `view_contact`

**Status: DISETUJUI + DITERAPKAN (19 Agu 2026).** Pemilik produk menyetujui; gerbang dipindah di
Sprint NIK-2. Keputusan final + syarat pembalikan: **K-31** di `docs/riwayat/KEPUTUSAN.md`. Dokumen
ini disimpan sebagai rekam usulan aslinya (tabel siapa-lihat-apa di bawah tetap akurat), dengan satu
koreksi yang dicatat di K-31: identitas klinik ikut `view_contact`, tetapi keterlibatan klinis
(jumlah/booking/patient_code) tetap `view_health`.

---

## Ringkas

NIK + turunannya (gender, tanggal lahir dari NIK, provinsi KTP), alamat, dan kontak darurat
**sekarang** digerbangi `profile.view_health` (hanya `super_admin`, `crm_manager`). Usulannya:
pindahkan field-field itu ke `profile.view_contact` — gerbang yang sama yang membuka
telepon/email tanpa masker. **Golongan darah tetap `view_health`** (itu data medis, bukan
identitas). Data klinis (diagnosis, skrining, riwayat obat) **tetap `view_health`** —
keputusan ini khusus NIK, bukan pencabutan gerbang klinis.

**Alasan pergeseran:** gerbang `view_health` untuk NIK lahir dari aturan "gerbangi data dari
sumber sensitif" (RENCANA-tulis-demografi, TUGAS 2). Tapi NIK bukan **data kesehatan** — ia
**identitas**. Setiap orang di pool sudah menyerahkan NIK-nya ke 20FIT untuk acara/layanan, dan
staf butuh NIK untuk **verifikasi identitas** — pekerjaan tingkat-kontak, bukan tingkat-klinis.
Menaruh NIK di balik gerbang kesehatan menyamakan "melihat KTP pelanggan" dengan "melihat status
kesehatan pelanggan"; keduanya beda kelas. Tingkat yang benar adalah tingkat yang sama dengan
telepon/email: `view_contact`.

---

## Siapa jadi bisa melihat apa

Dibaca dari matriks `lib/auth/roles.ts` (PRD 17.2). `view_contact` untuk `unit_manager`
berupa `own_unit` → **saat ini `needs_scope` = ditolak** karena tabel unit-scope belum ada;
ia baru "allow" bila scope unit sudah didefinisikan.

| Peran | `view_contact` (telepon/email) | `view_health` (medis) | NIK **sekarang** (gerbang health) | NIK **usulan** (gerbang contact) |
|---|---|---|---|---|
| `super_admin` | ✓ | ✓ | ✓ | ✓ (tak berubah) |
| `crm_manager` | ✓ | ✓ | ✓ | ✓ (tak berubah) |
| `crm_operator` | ✓ | — | — | **✓ (BARU bisa lihat NIK)** |
| `data_steward` | ✓ | — | — | **✓ (BARU bisa lihat NIK)** |
| `unit_manager` | own_unit → *needs_scope* | — | — | **✓ saat sudah di-scope** |
| `analyst` | — | — | — | — (tetap tak bisa) |

**Intinya:** yang **bertambah** aksesnya hanya `crm_operator` dan `data_steward` (dan
`unit_manager` yang sudah punya scope) — persis peran yang **sudah** melihat telepon/email dalam
bentuk terang. `analyst` tetap **tidak** bisa (ia bahkan tak lihat kontak). `super_admin` /
`crm_manager` tak berubah.

### Apa yang IKUT pindah vs TETAP di `view_health`

| Field | Sekarang | Usulan |
|---|---|---|
| NIK (penuh) | view_health | **view_contact** |
| Gender dari NIK | view_health | **view_contact** |
| Tanggal lahir dari NIK | view_health | **view_contact** |
| Provinsi KTP dari NIK | view_health | **view_contact** |
| Alamat (klinik) | view_health | **view_contact** |
| Kontak darurat | view_health | **view_contact** |
| **Golongan darah** | view_health | **view_health (TETAP)** |
| Diagnosis / skrining / riwayat obat | view_health | **view_health (TETAP)** |
| Tanggal lahir dari staging (impor) | terbuka (tak digerbangi) | terbuka (tak berubah) |

---

## Konsistensi dengan `hasClinicalCriteria` (filter segmen)

`lib/crm/segment.ts` `hasClinicalCriteria` menggerbangi **hanya kriteria klinis** (pasien klinik,
transaksi klinik, program klinik) pada `profile.view_health`, dengan alasan "menyaring pasien =
menyimpulkan status kesehatan". Usulan ini **tidak menyentuh** aturan itu — NIK **bukan** kriteria
segmen dan **tidak pernah** jadi kunci pencocokan (lihat larangan), jadi tak ada jalan bagi NIK
untuk menyelinap ke filter segmen. Golongan darah dan data klinis tetap di `view_health` di kedua
tempat (profil **dan** segmen), sehingga **gerbang profil dan gerbang filter segmen tidak diverge**
untuk data klinis — konsistensi yang K-09/K-lama jaga tetap utuh.

Ini **memperhalus** aturan "gerbang ikut sumber" dari RENCANA-tulis-demografi, bukan
membatalkannya: sumber sensitif tetap digerbangi, tapi **tingkat** gerbangnya dipilih menurut
*jenis* kepekaan — identitas → tingkat kontak, kesehatan → tingkat kesehatan. Argumen
"pintasan-lewat-derivasi" tetap berlaku: turunan NIK **tetap mewarisi** gerbang NIK; yang berubah
hanya tingkat gerbang itu (contact, bukan health).

---

## Yang TIDAK berubah apa pun jawabannya (sudah berlaku sprint ini)

- **NIK tampil penuh**, tanpa langkah buka/reveal (keputusan pemilik produk).
- **Nilai NIK tidak pernah** masuk `metadata` audit atau log — audit append-only + dipangkas
  terjadwal; menaruh NIK di sana menyalin identitas ke tempat yang tak bisa dibersihkan. Audit
  tetap satu `profile.viewed` per buka profil dengan **jenis** field (`sensitive_fields`), bukan
  nilai.
- **NIK tidak pernah** ikut ekspor CSV (`EXPORT_FORBIDDEN_COLUMNS`).
- **NIK tidak pernah** jadi kunci pencocokan profil (pencocokan tetap email/telepon).
- **Data klinis tidak dibuka** — pembukaan masker khusus NIK.

---

## Perubahan kode BILA disetujui (belum dikerjakan)

1. `app/api/audience/[id]/route.ts` — pisahkan flag: `canSeeContact = isPermitted(role,
   "profile.view_contact")` untuk field identitas; `canViewHealth` tetap untuk golongan darah +
   klinis. Read layer (`fetchProfileEnrichment` / `fetchProfileClinic` / `fetchProfileImport`)
   diberi kedua flag; kolom identitas dibawa saat `canSeeContact`, golongan darah/klinis hanya
   saat `canViewHealth`.
2. `components/audience/profile-detail.tsx` — `IdentitySection` bergerbang `canSeeContact`; baris
   golongan darah di `HyroxLines` **tetap** `canViewHealth`. Hitungan `identityFieldCount`
   memakai flag kontak.
3. `sensitiveFields` audit — jenis field identitas dicatat saat dilihat lewat contact; tak ada
   nilai (aturan lama).
4. `lib/auth/roles.test.ts` — tak ada perubahan matriks; NIK tidak menambah *action* baru, ia
   pindah memakai `view_contact` yang sudah ada.
5. Catat keputusan final sebagai **K-31** di `docs/riwayat/KEPUTUSAN.md` (draf sudah ditulis,
   ditandai USULAN sampai dijawab).

---

## Pertanyaan untuk pemilik produk (jawab salah satu)

- **A. Setuju** — pindahkan NIK/turunan/alamat/kontak-darurat ke `view_contact`; golongan
  darah + klinis tetap `view_health`. (Kerjakan perubahan kode di atas, finalkan K-31.)
- **B. Tolak** — NIK tetap `view_health`. (Tak ada perubahan gerbang; K-31 dicoret, tab-move
  + tampil-penuh tetap berlaku.)
- **C. Lain** — mis. buka untuk `crm_operator` tapi tidak `data_steward`, atau butuh *action*
  gerbang baru tersendiri (`profile.view_nik`). Sebutkan, akan disusun ulang.
