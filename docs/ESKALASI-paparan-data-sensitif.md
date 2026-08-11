# ESKALASI: paparan data pribadi sensitif

> **Untuk pengambil keputusan proyek, bukan catatan engineering.** Diverifikasi langsung ke
> database **11 Agustus 2026**. Semua angka di bawah **hitungan** — tidak ada satu pun nilai
> NIK, kesehatan, atau kontak darurat yang diambil, ditampilkan, atau disimpan di berkas mana
> pun (mengukur paparan tanpa ikut membocorkannya).

> ## ⚠️ KOREKSI PENTING — 11 Agustus 2026 (Sprint 3Q): dasar dokumen ini berubah
>
> **Versi sebelumnya dokumen ini menyatakan `master_customer` dan `customer_engagement`
> AMAN** ("kontrol tim CRM berfungsi; yang bocor ada di jalur sekeliling"). **Itu salah.**
>
> - **Apa yang semula dinyatakan:** `master_customer`/`customer_engagement` RLS ON → terlindungi.
> - **Apa yang ternyata benar:** keduanya punya policy `authenticated_full_access`
>   (`PERMISSIVE · roles {authenticated} · cmd ALL · USING true`). Artinya **setiap dari 887
>   akun** yang bisa login punya akses **BACA dan TULIS** (`ALL` mencakup `UPDATE`/`DELETE`)
>   ke seluruh **82.253 profil**, **tanpa masking, tanpa audit**. RLS menyala tapi policy-nya
>   mengizinkan semua — RLS ON **tidak** berarti terlindungi.
> - **Kenapa terlewat:** inventaris Sprint 3O mengukur `relrowsecurity` (RLS on/off) **saja**,
>   bukan policy + grant. Sebuah tabel bisa RLS ON dan tetap terbuka lebar lewat policy
>   permisif. Kehati-hatian ini **sudah ditulis** di poin 8 laporan 3O ("RLS ON secara
>   teoretis bisa punya policy permisif") tetapi tidak ditindaklanjuti — lihat S-08.
>
> Bagian di bawah sudah diperbaiki. Siapa pun yang membaca versi sebelumnya: **dasar
> keputusan berubah** — `master_customer` bukan di "jalur aman", ia terbuka untuk tulis.

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

## 3. Klasifikasi akses sebenarnya — RLS + policy + grant (bukan RLS saja)

Diukur ulang 11 Agu 2026 (Sprint 3Q) dengan menggabungkan `relrowsecurity` **dan** policy
(peran/`cmd`/`permissive`/`USING`) **dan** grant tabel. Dari **383** tabel `public`:

| Tingkat | Jumlah | Arti |
|---|---:|---|
| **Terbuka untuk `anon`** | **199** (172 juga bisa ditulis `authenticated`) | tanpa login sama sekali |
| **Terbuka untuk siapa pun yang login** | **43** (39 bisa ditulis) | 887 akun `auth.users`, lintas sistem |
| **Terkunci** (hanya `service_role`) | **141** | pola benar — RLS ON + 0 policy |

**Yang benar-benar terlindungi (terkunci):** seluruh `crm_*` (audit, consent, suppression,
`crm_user_role`) — RLS ON, 0 policy → tolak-default. Pola ini **berhasil**.

**Yang TIDAK terlindungi, dan sebelumnya salah disebut aman:**
- **`master_customer`** — RLS ON, tapi policy `authenticated_full_access` (`ALL`/`USING true`)
  → **887 akun bisa BACA + TULIS 82.253 profil**, tanpa masking, tanpa audit. `cmd=ALL`
  mencakup `UPDATE`/`DELETE`. Aturan read-only kita ada di aplikasi; **database tidak
  menegakkannya**.
- **`customer_engagement`** — policy identik → 887 akun baca+tulis 90.419 baris.

**Konsekuensinya untuk kontrol yang dibangun tim CRM:** RBAC, masking server-side (K-02),
read-only `master_customer`, dan jejak `list.viewed` **tetap benar dan tetap perlu** — ia
melindungi **jalur yang lewat aplikasi**. Yang keliru adalah keyakinan bahwa itu
**satu-satunya** jalur. Anon key + sesi login memberi jalan langsung ke PostgREST yang
melewati semuanya. Kebocoran ada di **dua tempat**: tabel sumber anon (bagian 1) **dan**
tabel utama produk sendiri (bagian ini).

## 4. Kenapa ini bukan pekerjaan tim CRM

Tabel-tabel di atas milik sistem **arena, clinic, cf, rb, events** — **Fase 0** milik tim
pemilik data (PRD 17.3). Menyalakan RLS di sana **tanpa menulis policy** akan **memutus
aplikasi tim lain** yang membaca tabel itu lewat anon key hari ini: begitu RLS menyala dan
tak ada policy, tolak-default berlaku untuk **semua** pembaca, termasuk aplikasi sah mereka.
Itulah alasan sebenarnya kenapa ini belum dikerjakan — bukan karena tak terlihat, tapi
karena perbaikan naifnya merusak. Karena itu tim CRM **mengukur dan mengangkat**, tidak
menyentuh (LARANGAN sprint: jangan nyalakan RLS, jangan tulis policy, jangan sentuh tabelnya).

## 5. Urutan remediasi — dua jenis "berat", karena alasan berbeda

Dua paparan terberat berat karena alasan **berbeda**, bukan satu skala:
- **`master_customer` (82.253 orang) terbuka untuk TULIS** ke 887 akun. Bahayanya
  **integritas + kerahasiaan**: siapa pun yang login bisa mengubah/menghapus profil,
  membaca semua kontak tanpa masking/audit. Butuh **login** (bukan anon) — lingkupnya 887,
  bukan publik.
- **`cf_hyrox_participants` (1.030 NIK) terbuka untuk ANON.** Bahayanya **kerahasiaan data
  paling sensitif tanpa syarat apa pun** — tanpa login. Lingkupnya publik.

| # | Langkah | Konsekuensi | Yang memutuskan |
|---|---|---|---|
| 1 | **`cf_user` — kredensial:** pastikan `password` bukan polos; bila iya rotasi+hash segera | Kredensial polos = paling cepat dieksploitasi, anon-readable | **Owner `cf`** |
| 2 | **`master_customer` + `customer_engagement`:** ganti policy `authenticated_full_access` (`ALL`/`USING true`) dengan policy yang sesuai kebutuhan nyata (mis. baca-saja untuk peran tertentu, tulis hanya `service_role`) | **Akan memutus aplikasi tim lain** yang kini baca/tulis lewat sesi authenticated — mereka harus pindah ke akses server-side dulu. Karena itu **bukan** perbaikan sepihak | **Pemilik data + owner Supabase + tim CRM** |
| 3 | **NIK + data medis anon (`cf_hyrox_participants`, `clinic_*`):** nyalakan RLS **berbarengan** dengan policy (service_role / setara aplikasi sah), satu tabel per kali | Aplikasi tim itu pindah dari anon key ke jalur ber-otorisasi. Data kesehatan perlu dasar hukum (UU 27/2022) | **Legal + pemilik data + owner Supabase** |
| 4 | **T-03 (102 fungsi `SECURITY DEFINER` anon-executable):** cabut `EXECUTE` (pola migrasi 10 CRM) | Naik tiap tim deploy (101→102) — sistemik | **Owner Supabase** |
| 5 | **T-02 (`staging_20fit_data`, 88.536 baris anon):** setelah yang di atas | Nama/telepon/email | **Pemilik data** |

**Risiko perbaikan, jujur:** policy `authenticated_full_access` hampir pasti **sengaja**
dibuat supaya aplikasi tim lain jalan. Mencabut/menyempitkannya **akan memutus aplikasi itu**
kecuali mereka pindah ke akses server-side lebih dulu. Ditulis di sini bukan agar terdengar
hati-hati, tapi supaya keputusan diambil dengan gambaran yang benar — sama seperti tabel anon
di bagian 1.

Prinsipnya: **RLS + policy dalam satu langkah, per tabel, dimulai dari yang paling
sensitif** — jangan menyalakan RLS massal tanpa policy.

## 6. Kalau tidak diapa-apakan

Paparannya **tetap terbuka dan cenderung membesar**: T-03 sudah naik 101 → 102 dalam satu
sesi. Dua jalur tetap terbuka setiap hari: (a) NIK/tgl lahir/gol darah/kontak darurat/diagnosa
±1.100 orang dapat ditarik massal **tanpa login** (anon); (b) **82.253 profil dapat dibaca,
diubah, dan dihapus** oleh **887 akun** yang bisa login, tanpa masking dan tanpa jejak audit.
Keduanya tanpa alarm — ia hanya **terus bisa** sampai seseorang memutuskan menutupnya, dan
`master_customer` yang terbuka-tulis berarti kerusakan bisa **diam-diam** (tak ada audit yang
mencatatnya). Dokumen ini ada supaya keputusan itu diambil sadar — dengan dasar yang **benar**
setelah koreksi 3Q, bukan dasar `relrowsecurity`-saja yang keliru.

---

> **Silang-rujuk:** `docs/riwayat/TEMUAN.md` **T-17** (policy permisif `master_customer`/
> `customer_engagement`, temuan 3Q), T-15 (paparan sensitif anon), T-02 (`staging_20fit_data`),
> T-03 (fungsi anon-executable), `docs/riwayat/KEPUTUSAN.md` **K-23** (klaim keamanan = RLS +
> policy + grant), `docs/RISIKO-masking-bypass.md`, `docs/SIGNOFF-legal-consent.md`.
> **Metode ukur (dikoreksi 3Q):** akses ditentukan dari `relrowsecurity` **× policy**
> (peran/`cmd`/`permissive`/`USING`) **× grant** — bukan `relrowsecurity` saja. Kueri
> reproduksi di `docs/PASCA-MERGE-monitoring-revert.md`. Hitungan saja — nol nilai diambil.
