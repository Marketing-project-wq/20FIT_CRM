# ESKALASI: paparan data pribadi sensitif (RLS OFF di tabel sumber)

> **Untuk pengambil keputusan proyek, bukan catatan engineering.** Diverifikasi langsung ke
> database **11 Agustus 2026**. Semua angka di bawah **hitungan** — tidak ada satu pun nilai
> NIK, kesehatan, atau kontak darurat yang diambil, ditampilkan, atau disimpan di berkas mana
> pun (mengukur paparan tanpa ikut membocorkannya).

## 1. Apa yang terpapar — diurutkan dari yang terberat

Beberapa tabel **sumber milik tim lain** punya **RLS OFF** (`relrowsecurity = false`) sambil
memuat data pribadi paling sensitif. RLS OFF berarti tabel dapat dibaca **siapa pun yang
memegang anon key**, tanpa login.

| Tabel | RLS | Baris | Data sensitif (jumlah terisi) | Kelas |
|---|---|---:|---|---|
| `cf_hyrox_participants` | **OFF** | 1.038 | **NIK 1.030** (812 NIK berbeda), tgl lahir 1.037, golongan darah 1.038, kontak darurat 1.035 + nomornya 1.036 | **Identitas + kesehatan** |
| `clinic_assessments` | **OFF** | 149 | **diagnosa medis 107** (`diagnosis` jsonb) | **Kesehatan** |
| `clinic_screenings` | **OFF** | 131 | riwayat operasi 26, obat 20, golongan darah 41, + kondisi jantung/metabolik/muskuloskeletal/pernapasan/alergi (jsonb) | **Kesehatan** |
| `cf_user` | **OFF** | 4 | `password` (4) — **kolomnya bernama `password`, bukan `password_hash`** → patut dicurigai kata sandi polos | **Kredensial** |
| `rb_registrations` | **OFF** | 9 | `password_hash` (9) — ter-hash | Kredensial (ter-hash) |
| `events` | **OFF** | 17 | `timeline_share_token` (2) | Token bagikan (rendah) |
| `staff_password_resets` | **OFF** | 0 | kosong — dicatat demi kelengkapan | — |

**Dalam jumlah orang, bukan baris:** paparan terberat adalah **±1.030 orang** yang NIK,
tanggal lahir, golongan darah, dan kontak daruratnya bisa ditarik sekaligus dari
`cf_hyrox_participants` — plus **±110 orang** dengan diagnosa/riwayat medis di dua tabel
klinik. NIK adalah nomor identitas kependudukan; di bawah **UU 27/2022** (undang-undang yang
jadi rujukan desain consent proyek ini) NIK dan data kesehatan masuk kategori penanganan
paling ketat. Ini **kelas berbeda** dari `staging_20fit_data` (T-02: nama/telepon/email).

## 2. Bagaimana terpaparnya

Supabase mengekspos setiap tabel lewat **PostgREST** di `/rest/v1/<tabel>`. Bila tabel RLS
OFF, permintaan dengan **anon key** mengembalikan barisnya — **tanpa login, tanpa peran,
melewati seluruh RBAC**. Dan **anon key ada di dalam setiap bundel JavaScript** yang dikirim
ke browser pengunjung: ia memang dirancang publik. Jadi "hanya tim internal yang punya key"
**bukan** asumsi yang bisa dipegang — siapa pun yang membuka aplikasi mana pun yang memakai
Supabase ini sudah memilikinya.

## 3. Apa yang TIDAK terpapar (kontrol tim CRM berfungsi)

- `master_customer` — **RLS ON**. `date_of_birth` yang ada di sana **tidak** dibaca aplikasi
  CRM (bukan bagian kolom yang di-`select`).
- Seluruh `crm_*` (audit, consent, suppression, satelit) — **RLS ON**, 0 policy → tolak-default.
- `customer_engagement` (dipakai Sprint 3N) — **RLS ON**; lapisan bacanya hanya mengambil 6
  kolom aman dan **tidak pernah** `raw_value`/`source_row_id`/`period` (dijaga test 3O).

Kebocoran **bukan** di jalur yang dibangun tim CRM; ia di **tabel sumber di sekelilingnya**.
Ini penting supaya keputusan diarahkan ke tempat yang benar.

## 4. Kenapa ini bukan pekerjaan tim CRM

Tabel-tabel di atas milik sistem **arena, clinic, cf, rb, events** — **Fase 0** milik tim
pemilik data (PRD 17.3). Menyalakan RLS di sana **tanpa menulis policy** akan **memutus
aplikasi tim lain** yang membaca tabel itu lewat anon key hari ini: begitu RLS menyala dan
tak ada policy, tolak-default berlaku untuk **semua** pembaca, termasuk aplikasi sah mereka.
Itulah alasan sebenarnya kenapa ini belum dikerjakan — bukan karena tak terlihat, tapi
karena perbaikan naifnya merusak. Karena itu tim CRM **mengukur dan mengangkat**, tidak
menyentuh (LARANGAN sprint: jangan nyalakan RLS, jangan tulis policy, jangan sentuh tabelnya).

## 5. Urutan remediasi yang diusulkan — dan siapa yang memutuskan

| # | Langkah | Konsekuensi | Yang memutuskan |
|---|---|---|---|
| 1 | **Bekukan paparan terberat lebih dulu:** untuk tiap tabel RLS-OFF sensitif, tim pemilik menyalakan RLS **berbarengan** dengan policy `service_role`-only (atau policy setara aplikasi sahnya) — satu tabel per kali, `cf_hyrox_participants` duluan | Aplikasi tim itu harus pindah dari anon key ke jalur ber-otorisasi untuk tabel tsb. Butuh kerja mereka, bukan sepele | **Pemilik data + owner Supabase**, per tim |
| 2 | **`cf_user`:** pastikan `password` bukan kata sandi polos; bila iya, rotasi + hash segera | Kredensial polos = paparan paling cepat dieksploitasi | **Owner sistem `cf`** |
| 3 | **Data medis (`clinic_*`):** tentukan dasar hukum penyimpanan + siapa boleh baca sebelum RLS-nya dirapikan | Data kesehatan perlu dasar pemrosesan tersendiri (UU 27/2022) | **Legal + pemilik data klinik** |
| 4 | **T-03 (102 fungsi `SECURITY DEFINER` anon-executable):** cabut `EXECUTE` seperti pola migrasi 10 CRM | Naik tiap tim deploy (101 → **102** sesi ini) — sistemik | **Owner Supabase** |
| 5 | **T-02 (`staging_20fit_data`, 88.536 baris RLS OFF):** setelah yang sensitif beres | Nama/telepon/email — berat, tapi di bawah NIK/kesehatan | **Pemilik data** |

Prinsipnya: **RLS + policy dalam satu langkah, per tabel, dimulai dari yang paling
sensitif** — jangan menyalakan RLS massal tanpa policy.

## 6. Kalau tidak diapa-apakan

Paparannya **tetap terbuka dan cenderung membesar**: T-03 sudah naik 101 → 102 dalam satu
sesi, dan tiap tabel sensitif baru yang di-deploy tim lain tanpa RLS menambah permukaannya.
NIK, tanggal lahir, golongan darah, kontak darurat, dan diagnosa medis ±1.100 orang dapat
ditarik massal oleh siapa pun yang membuka aplikasi Supabase ini dan membaca anon key dari
bundel JS-nya — hari ini, tanpa jejak audit apa pun (tabel-tabel itu tak diaudit). Tidak ada
yang meledak; ia hanya **terus bisa** sampai seseorang memutuskan menutupnya. Dokumen ini ada
supaya keputusan itu diambil sadar, bukan tertunda karena temuannya terkubur.

---

> **Silang-rujuk:** `docs/riwayat/TEMUAN.md` T-15 (temuan ini), T-02 (`staging_20fit_data`),
> T-03 (fungsi anon-executable), `docs/RISIKO-masking-bypass.md`, `docs/RISIKO-rpc-execute-terbuka.md`,
> `docs/SIGNOFF-legal-consent.md` (pola sign-off legal). **Metode ukur:** pola nama kolom
> (`nik|ktp|passport`, kesehatan, `tgl_lahir|dob`, `darurat|emergency`, kredensial) × status
> `relrowsecurity`; hitungan `count(*)`/`count(distinct)` — nol nilai diambil.
