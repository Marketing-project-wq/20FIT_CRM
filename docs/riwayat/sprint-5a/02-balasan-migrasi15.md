# BALASAN — Jalankan Migrasi 15, `TODO(review)` sudah terjawab

> **Rancanganmu disetujui.** Alasan memilih matview tepat dan lebih kuat dari yang saya
> tulis: definisinya **adalah** aturan sinkronisasinya, sehingga tak ada tempat kedua untuk
> menyimpang — itu persis pelajaran `last_activity_at`. Tabel `crm_mirror_meta` untuk
> `refreshed_at` juga benar.
>
> `TODO(review)` untuk lima penanda sumber saya isi di bawah dari skema nyata, jadi tidak
> perlu putaran lagi.

---

## Nama tabel dan kolom — terverifikasi 13 Agustus 2026

Seluruh tabel sumber memakai kolom `email` dan `phone` polos, kecuali dua:

| Penanda | Tabel | Kunci |
|---|---|---|
| `has_arena` | `arena_class_bookings`, `arena_bookings`, `arena_package_orders`, `arena_members` | `email` |
| `has_gym` | `gym_class_bookings`, `gym_memberships`, `gym_membership_orders` | `email` |
| `has_clinic` | `clinic_patients` | **`phone` dulu**, `email` sebagai cadangan |
| `has_hyrox` | `cf_hyrox_participants` | `email` (**tidak punya kolom `phone`**) |
| `has_my20fit` | `my20fit_profile` | `email` |

`my20fit_user_activity` hanya punya `email` — tidak ada `id`, jadi ia tidak bisa jadi
penanda tersendiri lewat kunci primer. Kalau kamu tetap ingin penanda "punya aktivitas
nyata", cocokkan lewat `email` saja dan sebutkan cakupannya rendah (44 profil).

**Angka acuan untuk verifikasi TUGAS 3, saya ukur langsung:**

| Penanda | Profil |
|---|---|
| `has_arena` (gabungan empat tabel) | **653** |
| `has_gym` (gabungan tiga tabel) | **6** |
| `has_clinic` (telepon atau email) | **112** |
| `has_hyrox` | **152** |
| `has_my20fit` | **170** |

Perhatikan `has_clinic` = 112, bukan 106. Selisihnya karena ini menggabungkan telepon
**dan** email; angka 106 sebelumnya hanya telepon. Pakai 112 sebagai acuan bila cerminmu
memakai kedua kunci, dan sebutkan mana yang kamu pilih.

Normalisasi telepon di atas saya tulis langsung di SQL sebagai perkiraan. **Cermin harus
memakai bentuk yang sama dengan `normalizePhoneID`** (K-06) — kalau hasilnya berbeda dari
112, laporkan selisihnya; itu justru sinyal ada bentuk telepon yang belum tertangani.

---

## Tiga hal yang harus dijaga saat menerapkan

**1. Grant adalah satu-satunya perlindungan.** Sudah kamu tangani, tapi ini yang paling
mahal kalau terlewat: `revoke all … from public, anon, authenticated` **dan**
`grant select … to service_role` di berkas yang sama. Setelah diterapkan, **verifikasi ACL
matview-nya langsung** — jangan sandarkan pada pagar EXECUTE yang saat ini hanya memeriksa
fungsi. Perluas pagarnya untuk ikut memeriksa `grant select` pada matview, seperti yang
sudah kamu tandai di header.

**2. Refresh manual, dan `crm_mirror_meta` diperbarui dalam transaksi yang sama.**
`refreshed_at` yang menyimpang dari isi cermin lebih buruk daripada tidak ada
`refreshed_at` sama sekali — ia membuat data basi terlihat segar. Kalau
`REFRESH … CONCURRENTLY` tidak bisa satu transaksi dengan pembaruan meta, katakan dan
usulkan urutannya (perbarui meta **setelah** refresh selesai, bukan sebelum).

**3. Nol consent, nol suppression, nol NIK, nol data klinis di cermin.** Tidak berubah.

---

## Setelah diterapkan

Verifikasi seperti biasa: versi ledger tercap, ACL matview dan fungsi refresh, lalu tabel
perbandingan **sebelas angka** — enam acuan dari prompt 5A ditambah lima penanda sumber di
atas. Cermin yang lebih cepat tapi berbeda angkanya adalah kemunduran; kalau ada selisih,
cari sebabnya, jangan sesuaikan acuannya.

Lalu ukur waktu muat dashboard dan segment builder sebelum dan sesudah, dan sambungkan
ketiga layar.

---

## Dua hal lain dari laporanmu

**Sapuan K-28 belum lengkap, dan kamu sudah menyebutnya.** Referensi `K-`, `T-`, dan
PostgREST masih ada di catatan `/consent` (`backfilledBodyB`) dan pesan AI
(`ai.timeUnexpressible`). Selesaikan sapuannya lintas layar di sesi ini — aturannya global,
dan setengah sapuan berarti dua gaya hidup berdampingan.

**Volume audit muat-bertahap: pertahankan satu baris per pemuatan.** Kamu benar mengangkatnya
alih-alih memutuskan sendiri. Keputusannya: biarkan apa adanya. Lima klik memang lima
pembacaan daftar, dan menggabungkannya per sesi akan mengaburkan berapa banyak data yang
benar-benar dibaca seseorang — itu justru pertanyaan yang audit ada untuk menjawabnya.
Kategorinya operasional dan akan dipangkas 90 hari, jadi tidak menumpuk permanen. Catat
sebagai keputusan singkat supaya tidak dibahas ulang.

**Penyederhanaan detail profil tetap tertunda** sampai cermin terpasang — delapan blok kosong
itu justru yang paling terbantu oleh penanda sumber di cermin, karena satu baris ringkasan
bisa dibaca dari satu tempat alih-alih delapan kueri terpisah.

---

## Yang tidak berubah

Seluruh larangan Sprint 5A tetap berlaku: nol jadwal refresh otomatis, nol perubahan gerbang
peran, nol penyesuaian angka acuan, dan tidak menampilkan nama migrasi, kode `K-`, atau nama
berkas docs di antarmuka.
