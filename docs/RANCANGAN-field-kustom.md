# Rancangan: field kustom untuk profil audiens

> ## ⏱ DIUKUR: 8 September 2026, 08:15 UTC
>
> **Status: RANCANGAN. Nol tabel, nol migrasi, nol kode.** Dokumen ini merancang; ia tidak
> membangun. Angka biaya kueri diukur dari produksi (`cpvzwqptzcxnwzfzgrmt`) — ukur ulang sebelum
> dipakai untuk keputusan berikutnya.
>
> ## Angka yang wajib diukur ulang
> - Baris `master_customer` (82.832), baris bertag (579), sel tag (581)
> - Biaya `EXPLAIN ANALYZE` ketiga pendekatan atas jumlah baris terkini
> - Kardinalitas nilai tag per namespace (untuk memutuskan enum vs teks)

Permintaan pemilik: kolom profil tidak boleh statis, dan tiap impor harus bisa menambah kolom. Ini
merancang **caranya**, dengan satu risiko yang diselesaikan lebih dulu.

---

## R1 — INI YANG PERTAMA: field bebas membatalkan Fase 0

Satu putaran penuh dihabiskan membuang NIK, tanggal lahir, golongan darah, kontak darurat, dan
deklarasi kesehatan dari berkas Hyrox pemilik. **Kolom bebas mengembalikan semuanya lewat pintu
depan:** operator menamai kolomnya `nomor_id` atau `catatan_medis`, memetakan CSV ke sana, dan
setiap pagar Fase 0 terlewati — bukan bocor, melainkan **dibuka dari dalam** oleh orang yang
berwenang mengimpor.

**Prinsip yang menutupnya: field harus DIDEFINISIKAN sebelum bisa DIISI.**

Impor hanya boleh memetakan kolom CSV ke field yang **sudah terdaftar**. Field baru didaftarkan
lewat tindakan sadar yang terpisah — dan **di titik pendaftaran itulah pemeriksaan data sensitif
hidup**, sekali, bukan di setiap unggahan berkas. Menambah field jadi keputusan, bukan efek samping.

**Saya setuju dengan prinsip ini** (pemilik memintanya, dan saya tidak punya cara lain yang menutup
R1 tanpa memindahkan gerbang ke titik pendaftaran). Kalau seseorang membantah, ia harus menjelaskan
bagaimana R1 ditutup tanpa pendaftaran — dan saya tak menemukannya: setiap alternatif (deny-list di
titik impor, tinjauan tiap berkas) menaruh gerbang di tempat yang dijalankan ribuan kali alih-alih
sekali, dan gerbang yang dijalankan ribuan kali adalah gerbang yang akhirnya dilewati.

**Bagaimana pemeriksaan sensitif bekerja di titik pendaftaran** (usul, keputusan pemilik di daftar):
1. **Deny-list pola** — nama/kunci field yang cocok pola sensitif (`nik`, `ktp`, `tanggal.?lahir`,
   `dob`, `gol.?darah`, `blood`, `kontak.?darurat`, `emergency`, `medis`, `medical`, `alamat`,
   `penyakit`, `alergi`, `kesehatan`) **ditolak otomatis** saat pendaftaran, dengan pesan yang
   menyebut alasannya. Deny-list ini kosakata — **wajib parity-test**, seperti kosakata tag.
2. **Tinjauan manusia** — field yang lolos deny-list tapi dinilai berisiko oleh pendaftar bisa
   ditandai `sensitif` dan digerbang di balik izin (`profile.view_health`-style). Field sensitif
   tak pernah masuk cermin segmentasi.
3. **Keduanya**, bukan salah satu: deny-list menangkap yang jelas otomatis; tinjauan menangkap yang
   ambigu. Deny-list saja akan dilewati dengan sinonim (`no_identitas`); tinjauan saja terlalu lambat
   untuk field biasa.

---

## R2 — kosakata bebas menyimpang

`kota`, `Kota`, `kota_asal`, `domisili` akan hidup berdampingan dalam sebulan — persis alasan parity
test tag dibangun. **Tutupnya:** setiap field terdaftar punya **kunci kanonik tunggal** (huruf kecil,
namespace bila perlu) dan **tipe**. Field yang akan disegmentasi **wajib bertipe enum/pilihan
tertutup**, bukan teks bebas — sebuah nilai di luar daftar ditolak saat isi, sama seperti
`segment`/`first_unit` di RPC edit. Teks bebas diizinkan hanya untuk field yang **tidak** disegmentasi
(catatan, deskripsi), dengan cap panjang.

---

## R3 — `master_customer` milik bersama (T-17)

1.358 akun bisa menulis `master_customer` (policy `authenticated_full_access`, dieskalasi ke Jeff).
**Menambah kolom CRM di sana memperburuk paparan yang sudah buruk.** Presedennya sudah ada dan sudah
terbukti: `crm_profile_demographic` adalah **tabel milik CRM, terpisah**, dengan kolom `*_source`
untuk provenansi. Field kustom mengikuti pola itu: **tabel milik CRM sendiri, bukan kolom di
`master_customer`.**

---

## R4 — segmentasi membaca cermin

Field yang tak sampai ke `crm_customer_mirror` tersimpan tapi tak berguna — persis nasib tag sebelum
TUGAS D (**diukur hari ini: cermin nol kolom tag, `SegmentCriteria` nol kriteria tag**). Jadi
rancangan penyimpanan **wajib** punya jalur generik ke cermin yang **tidak** butuh migrasi tiap field
baru.

---

## Penyimpanan: tiga pilihan, biaya kueri diukur

Diukur atas 82.832 baris `master_customer` (`master_customer.tags` sebagai proksi array/JSONB nyata
— ia sudah ber-GIN):

| Pendekatan | Biaya segmentasi (terukur) | Migrasi per field? | Multi-field |
|---|---|---|---|
| **Kolom per field** | tercepat per field: kolom terindeks `segment='new'` = **61 ms** untuk 74k cocok (lebih cepat untuk match selektif) | **Ya** — mahal, dan **di tabel bersama (R3)** | murah |
| **Array/JSONB + GIN** | `tags @> array['x']` = **23,5 ms** (bitmap index, 46 buffer, skala dengan jumlah cocok bukan ukuran tabel) | **Tidak** — satu kolom JSONB menampung semua field | satu kueri, beberapa syarat containment |
| **EAV (baris per nilai)** | lookup `(field_key,value)→customer_id` terindeks ≈ biaya bitmap array, **+ join** ke master; kueri N field = **N join** | **Tidak** | mahal untuk banyak field sekaligus |

**Rekomendasi: JSONB pada tabel milik CRM + tabel registry.** Alasannya adalah irisan keempat
risiko, bukan sekadar kecepatan:
- **R3**: tabel milik CRM (`crm_profile_attributes`: `customer_id` + `values jsonb` + GIN), bukan
  kolom di `master_customer`. Pola `crm_profile_demographic`.
- **R4**: cermin dapat satu kolom **JSONB generik** (`custom jsonb`), diisi dari
  `crm_profile_attributes` saat refresh cermin — **satu jalur, nol migrasi per field baru**. Inilah
  yang membedakannya dari "kolom per field": JSONB reaches the mirror tanpa DDL tiap kali.
- **Biaya**: 23,5 ms terukur untuk containment terindeks — cukup untuk segmentasi.
- **EAV ditolak** bukan karena lambat (lookup-nya setara) melainkan karena kueri multi-field jadi
  N join — dan segmentasi biasanya menggabungkan beberapa syarat sekaligus.
- **Kolom per field ditolak** karena R3 (menulis ke tabel bersama) + migrasi tiap field (R4).

**Registry** (`crm_custom_field`): satu baris per field terdaftar — kunci kanonik, label bilingual,
tipe (`text`/`number`/`date`/`enum`), opsi enum (bila enum), penanda `sensitif`, kelas retensi,
`created_by`/`created_at`. **Inilah tempat gerbang R1 hidup.** Field harus ada di sini sebelum impor
bisa memetakan kolom ke sana.

---

## Enam pertanyaan lain, masing-masing dengan usulnya

| Pertanyaan | Usul (keputusan pemilik di daftar terpisah) |
|---|---|
| **Siapa boleh mendaftarkan field?** | Aksi RBAC baru `custom_field.define` — **super_admin + data_steward** saja (mendefinisikan field adalah tindakan berbentuk-skema; lebih sempit dari impor). Bukan diputuskan — diusulkan. |
| **Klasifikasi sensitif** | Keduanya (R1 di atas): deny-list pola parity-test **+** penanda `sensitif` manual dengan gerbang izin. |
| **Tipe field** | Setiap field mendeklarasikan tipe; **enum wajib untuk field yang disegmentasi** (tutup R2); teks bebas hanya untuk field non-segmentasi, dengan cap panjang. |
| **Field → cermin** | Satu kolom **JSONB generik** di cermin, diisi dari `crm_profile_attributes` saat refresh — nol migrasi per field. |
| **Retensi & purge** | Registry membawa **kelas retensi** per field; field `sensitif` mengikuti purge yang lebih ketat. Field kustom **tidak** otomatis kebal — ia ikut aturan retensi profil, dan yang sensitif ikut yang lebih ketat. |
| **Rollback (hapus field terisi 3.000 orang)** | Registry **soft-delete** default (field ditandai nonaktif, data ditahan tapi disembunyikan dari UI & cermin) **+** opsi purge eksplisit yang menghapus nilainya dari JSONB, teraudit. Menghapus definisi ≠ menghapus data; keduanya tindakan berbeda dan terpisah. |

---

## Bentuk yang diusulkan (ringkas, untuk disetujui — BUKAN dibangun)

```
crm_custom_field   (registry — gerbang R1 hidup di sini)
  key text primary key            -- kanonik, lolos deny-list saat daftar
  label_id / label_en text
  type text  check in ('text','number','date','enum')
  enum_options text[]             -- bila enum
  is_sensitive boolean            -- true → digerbang izin, tak masuk cermin
  retention_class text
  created_by uuid / created_at

crm_profile_attributes  (nilai — tabel MILIK CRM, pola crm_profile_demographic)
  customer_id uuid
  values jsonb                    -- { "<key>": <value>, ... } hanya key terdaftar
  updated_at
  GIN (values)                    -- containment 23,5 ms terukur

crm_customer_mirror.custom jsonb  -- kolom generik, diisi saat refresh; nol migrasi per field
```

Alur: **daftar field** (gerbang R1/R2) → **impor petakan kolom ke field terdaftar** → nilai ditulis
ke `crm_profile_attributes` (bukan `master_customer`, R3) → refresh cermin menyalin ke
`custom jsonb` (R4) → segment builder menyaring atas cermin.

**Nol dari ini dibangun di putaran ini.** Persetujuan bentuk + jawaban daftar keputusan lebih dulu.
