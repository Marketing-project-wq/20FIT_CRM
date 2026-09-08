# Daftar keputusan: field kustom

> ## ⏱ DIUKUR: 8 September 2026, 08:15 UTC
>
> Menyertai `docs/RANCANGAN-field-kustom.md`. **Nol baris kode sampai daftar ini dijawab.** R1 di
> urutan pertama karena ia satu-satunya yang, kalau salah, membatalkan seluruh kerja Fase 0.

---

## KEPUTUSAN 1 — R1: bagaimana data sensitif dicegah masuk lewat field bebas

Ini yang pertama dan paling mahal untuk salah. Kolom bebas mengembalikan NIK/tgl lahir/kesehatan yang
sudah susah payah dibuang — bukan bocor, **dibuka dari dalam** oleh operator berwenang.

**(a) Daftar-dulu + deny-list otomatis + tinjauan manusia ← rekomendasi saya**
Field harus didaftarkan sebelum bisa diisi. Saat pendaftaran: pola sensitif (nik/ktp/dob/gol darah/
medis/alamat/kontak darurat…) ditolak otomatis (deny-list parity-test); yang ambigu ditandai
`sensitif` manual + digerbang izin. Impor hanya memetakan ke field terdaftar.
- *Konsekuensi:* gerbang dijalankan **sekali** per field, bukan tiap unggahan. R1 tertutup di titik
  yang dijalankan paling jarang.

**(b) Daftar-dulu, deny-list saja (tanpa tinjauan manusia)**
Lebih ringan, tapi sinonim (`no_identitas`, `data_pribadi`) lolos. Deny-list tak pernah lengkap.

**(c) Tanpa pendaftaran, periksa tiap impor**
Menaruh gerbang di titik yang dijalankan ribuan kali. **Saya menilai ini yang membuat R1 akhirnya
terjadi** — gerbang yang sering dijalankan adalah gerbang yang akhirnya dilewati. Tidak saya
rekomendasikan.

**Rekomendasi: (a).** Kalau Anda menolak prinsip "daftar dulu, isi kemudian", saya perlu tahu
bagaimana R1 ditutup dengan cara lain — saya belum menemukannya.

---

## KEPUTUSAN 2 — penyimpanan

Terukur atas 82.832 baris: array/JSONB+GIN containment **23,5 ms**; kolom terindeks **61 ms** (74k
cocok); EAV = lookup setara + N join untuk N field.

**(a) JSONB pada tabel milik CRM + registry ← rekomendasi saya**
Tabel `crm_profile_attributes` (bukan kolom di `master_customer`, R3), cermin dapat kolom JSONB
generik (R4, nol migrasi per field). 23,5 ms terukur.

**(b) EAV**
Tak butuh migrasi per field juga, tapi kueri multi-field = N join — segmentasi biasanya menggabung
beberapa syarat.

**(c) Kolom per field di `master_customer`**
Tercepat per field, tapi **menulis ke tabel bersama (R3, T-17)** dan **migrasi tiap field baru (R4)**.
Ditolak.

**Rekomendasi: (a).**

---

## KEPUTUSAN 3 — siapa boleh mendaftarkan field

Aksi RBAC baru `custom_field.define`. Usul: **super_admin + data_steward** (mendefinisikan field
adalah tindakan berbentuk-skema — lebih sempit dari `audience.import`). Mengisi field lewat impor
tetap di `audience.import`. **Usul, bukan putusan.**

---

## KEPUTUSAN 4 — tipe field & kosakata (R2)

Usul: setiap field bertipe (`text`/`number`/`date`/`enum`); **enum wajib untuk field yang akan
disegmentasi** (nilai di luar daftar ditolak saat isi, seperti `segment`/`first_unit`); teks bebas
hanya untuk field non-segmentasi + cap panjang. Kunci field kanonik tunggal (huruf kecil).

---

## KEPUTUSAN 5 — retensi & rollback

- **Retensi:** registry membawa kelas retensi per field; field `sensitif` ikut purge lebih ketat.
  Field kustom **tidak** kebal retensi.
- **Rollback:** hapus **definisi** (soft-delete: nonaktif, data ditahan & disembunyikan) berbeda dari
  hapus **data** (purge eksplisit nilai dari JSONB, teraudit). Default soft-delete; purge tindakan
  sadar terpisah. **Apa yang terjadi ke data 3.000 orang saat field dihapus adalah pilihan Anda:**
  ditahan-tersembunyi (default usul) atau di-purge.

---

## Yang perlu dijawab lebih dulu
1. **Keputusan 1 (R1)** — tanpa ini tak ada bentuk yang aman dibangun.
2. **Keputusan 2** — menentukan tabel & jalur cermin.
3. Keputusan 3–5 menyusul; tidak mengubah bentuk, hanya perilaku & kebijakan.

**Nol tabel, nol migrasi, nol kode sampai Keputusan 1 & 2 dijawab.**
