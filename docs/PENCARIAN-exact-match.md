# Kenapa pencarian telepon & email SAMA PERSIS (dan apa yang berubah kalau diminta awalan)

> Ditulis Sprint 3J, sebelum ada yang memintanya. Permintaan "bisa nggak cari `62812…`
> saja?" pasti datang di tengah rapat; alasan menolaknya harus sudah tertulis, bukan
> diimprovisasi saat itu.

## Aturannya

Pencarian profil di `/audience` (`/api/search`) mencocokkan:

| `kind` | Bentuk | Indeks |
|---|---|---|
| `name` | **substring** (`ilike %…%`), minimum 3 huruf | `idx_master_customer_name_trgm` (GIN trigram) |
| `phone` | **sama persis** atas `phone_normalized` | `idx_master_customer_phone_unique` (btree UNIQUE) |
| `email` | **sama persis** atas `email_normalized` | `idx_master_customer_email_unique` (btree UNIQUE) |

Telepon & email **wajib** dinormalkan lewat `lib/crm/normalize.ts` sebelum dicocokkan
(kanon `62…` tanpa `+`; email huruf kecil). Staf mengetik `0812…`, `+62…`, atau `62…` —
ketiganya menemukan orang yang sama. Bila normalisasi mengembalikan `null`, pencarian
ditolak dengan pesan jelas; tidak pernah mencari string mentah (yang akan selalu nihil dan
terbaca keliru sebagai "orangnya tidak ada").

## Kenapa sama-persis, dan kenapa ini BUKAN sekadar soal kecepatan

Alasan pertama memang kecepatan: btree UNIQUE menjawab kesetaraan dalam O(log n) dan
mengembalikan 0 atau 1 baris. Tapi alasan yang **menentukan** adalah keamanan:

**Pencarian awalan/substring atas identifier mengubah layar ini menjadi alat panen.**
`62812%` akan mencocokkan puluhan ribu orang; `@gmail.com` akan mencocokkan hampir semua.
Satu kotak pencarian lalu menjadi ekspor massal PII tanpa melewati satu pun gerbang yang
dibangun untuk itu.

Sama-persis berarti pencari **harus sudah tahu** nomor atau email lengkap orangnya — yang
justru **persis situasi nyatanya**: orang itu baru saja menelepon dan memberi nomornya.
Pencarian dirancang untuk kasus itu, bukan untuk menelusuri "semua yang berawalan…".

Nama tetap substring karena nama memang dicari sepotong ("Budi", "Sari") dan bukan
identifier unik — tapi ia dibatasi: minimum 3 huruf (trigram butuh 3-gram; di bawah itu
indeks tak terpakai **dan** terlalu luas), dan hasilnya dibatasi (lihat bawah).

## Batas yang menyertainya (di `lib/crm/search.ts`, ber-test)

- **Minimum panjang nama = 3.** Satu-dua huruf menarik separuh pool.
- **Maksimum hasil = 10** (jauh di bawah ukuran halaman daftar, 25). Lebih dari itu →
  hasil eksplisit `too_many` ("terlalu banyak, persempit"). **Tidak ada paginasi mendalam
  ke hasil pencarian** — daftar berhalaman sudah ada di `/audience` dan sudah diaudit
  sebagai daftar (`list.viewed`). Pencarian yang berujung "banyak" bukan undangan menelusuri.
- **Penolakan pola sapuan:** wildcard (`%`, `_`) pada nama, string terlalu pendek, dan
  query hanya-angka pada `kind=name` (itu telepon di kotak yang salah).

## Kalau suatu saat seseorang meminta pencarian AWALAN pada telepon/email

Jawabannya default **tidak**, dan menyalakannya bukan perubahan satu baris — ia perubahan
**postur keamanan**, jadi harus lewat keputusan sadar, bukan diselipkan. Yang berubah:

1. **Indeksnya beda.** btree UNIQUE mendukung kesetaraan dan awalan `LIKE '62812%'` (btree
   bisa awalan), tapi **bukan** substring `%812%` (butuh GIN trigram atas `phone_normalized`
   — indeks yang **belum ada** dan harus dibuat; itu perubahan skema tersendiri).
2. **Batas panen jadi wajib dan lebih ketat**, bukan opsional: awalan `628%` cocok dengan
   hampir seluruh pool. Perlu minimum panjang awalan yang berarti (mis. ≥ 8 digit), cap
   hasil yang tetap kecil, dan kemungkinan gerbang peran yang **lebih tinggi** dari
   `profile.view_list` — karena kemampuan "tarik semua nomor berawalan X" lebih dekat ke
   ekspor daripada ke pencarian.
3. **Auditnya berubah makna.** Hari ini `search.performed` mencatat `target_id` saat hasil
   tepat satu — "siapa mencari, menemukan siapa". Awalan yang mengembalikan banyak orang
   menghapus jaminan itu; auditnya jadi "siapa menyapu rentang apa", yang harus
   dipertimbangkan ulang (dan tetap **tanpa** menyimpan query-nya, karena awalan pun PII).

Singkatnya: awalan pada identifier adalah fitur ekspor yang menyamar sebagai fitur
pencarian. Kalau benar-benar dibutuhkan, ia dibangun sebagai **ekspor** — dengan gerbang,
ambang, dan audit ekspor — bukan dengan melonggarkan kotak pencarian ini.
