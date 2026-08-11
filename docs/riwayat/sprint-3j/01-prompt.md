# CLAUDE CODE PROMPT — Sprint 3J: Pencarian Profil (dan jalur suppression jadi bisa dipakai)

> **Migrasi 10 sudah menutup lubangnya — diverifikasi ulang: `crm_purge_audit_log` kini `postgres | service_role` saja, tanpa PUBLIC, tanpa `anon`, tanpa `authenticated`.** Penilaianmu bahwa `crm_audit_log_no_mutate` inert juga benar: `prorettype = trigger`, dan PostgREST memang tak bisa mengeksposnya sebagai RPC.
>
> **Masalah sprint ini:** jalur tulis suppression yang dibangun 3H **praktis tak bisa dipakai.** Titik masuknya adalah detail profil — tapi tidak ada cara menemukan satu profil. Yang tersedia hanya filter unit, segment, kota, dan revenue di atas 82.253 baris berhalaman 25.
>
> Alur nyatanya begini: seseorang menelepon dan minta berhenti dihubungi. Staf tahu nomornya. Lalu apa? Hari ini: membuka halaman demi halaman, atau menyerah dan menulis lewat SQL Editor — yang melewati normalisasi, melewati RBAC, dan melewati audit.
>
> Aksi `search.*` sudah ada di allowlist retensi migrasi 8 sejak Sprint 3A dan **belum pernah ditulis satu baris pun** — persis nasib `profile.viewed` sebelum 3C.

---

## ATURAN PROSES

```bash
git fetch --all --prune
git log --oneline -3 origin/main
git log --oneline origin/main..HEAD
```

Harapan: `origin/main` di `eff733c`; branch memuat enam commit (3G ×2, 3H ×3, 3I ×1) sampai `7760e15`. Berbeda → **berhenti dan lapor**.

**Sprint ini nol perubahan skema.** Indeks yang dibutuhkan sudah ada di produksi — lihat TUGAS 1. Kalau kamu merasa butuh migrasi, berhenti dan laporkan alasannya; jangan diam-diam menambah satu.

---

# PROMPT UNTUK CLAUDE CODE — SALIN MULAI DARI SINI

---

## TUGAS 1 — Pencarian profil, dirancang mengikuti indeks yang sudah ada

Verifikasi sendiri isi `pg_indexes` untuk `master_customer`. Yang ada di sana per 11 Agustus 2026 menentukan desainnya, dan kebetulan desain tercepat **juga** desain paling aman:

| Yang dicari | Indeks yang ada | Bentuk pencarian yang dipakai |
|---|---|---|
| Nama | `idx_master_customer_name_trgm` — GIN trigram atas `full_name` | **Substring** (`ilike %…%`), terindeks |
| Telepon | `idx_master_customer_phone_unique` — btree UNIQUE atas `phone_normalized` | **Sama persis saja.** Tanpa awalan, tanpa substring |
| Email | `idx_master_customer_email_unique` — btree UNIQUE atas `email_normalized` | **Sama persis saja** |

**Kenapa telepon dan email hanya boleh sama-persis, dan ini bukan sekadar soal kecepatan:** pencarian substring atas identifier mengubah layar ini jadi alat panen. `62812%` akan mengembalikan puluhan ribu orang. Sama-persis berarti pencari **harus sudah tahu** nomor atau email lengkapnya — yang memang persis situasi nyatanya: orangnya baru saja menelepon.

**Telepon dan email wajib dinormalkan lewat `lib/crm/normalize.ts` sebelum dicocokkan.** Ini konsumen runtime **kedua** dari kanon Sprint 3B. Staf akan mengetik `0812…`, `+62812…`, atau `62812…`; ketiganya harus menemukan orang yang sama. Kalau normalisasi mengembalikan `null`, katakan bentuknya tidak dikenali — jangan diam-diam mencari string mentah, karena itu akan selalu nihil dan terbaca sebagai "orangnya tidak ada".

**Batas yang wajib ada:**

- Nama: minimum panjang kueri (tentukan sendiri, argumentasikan) supaya satu huruf tidak menarik separuh pool
- Hasil maksimum per pencarian, jauh lebih kecil dari batas daftar biasa. Kalau lebih dari itu, katakan "terlalu banyak, persempit" — **jangan** tawarkan paginasi mendalam ke hasil pencarian. Daftar berhalaman sudah ada di `/audience` dan itu jalur yang sudah diaudit sebagai daftar
- Masking telepon/email di server untuk peran tanpa `profile.view_contact` — pola yang sudah ada, jangan tulis ulang

Gerbang: `profile.view_list`, sama dengan `/audience`. Fail-closed.

---

## TUGAS 2 — Apa yang dicatat audit, dan apa yang TIDAK

Aksi: `search.performed`. Prefiks `search.%` sudah ada di allowlist operasional migrasi 8, jadi ia terklasifikasi dan dipangkas setelah 90 hari. **Konfirmasi lewat test paritas Sprint 3E dengan nama aksi yang persis dipakai produksi** — jangan diasumsikan, itu kesalahan yang sudah dihindari dua kali.

**Kueri pencariannya sendiri JANGAN masuk `metadata`.** Ini keputusan yang berbeda dari nilai filter kota di Sprint 3D, dan bedanya penting: filter kota adalah atribut, sedangkan kueri pencarian **adalah identitas orang** — nomor telepon, alamat email, atau nama lengkap seseorang. Menyimpannya berarti setiap pencarian menaruh PII di tabel append-only yang tak bisa dihapus siapa pun.

Yang **benar-benar** ingin dijawab audit adalah *"siapa mencari siapa"*, dan itu terjawab lebih baik oleh hasilnya, bukan oleh kuerinya. Catat:

- `kind` — `name` / `phone` / `email`
- `result_count`
- `target_id` bila hasilnya **tepat satu** — itu justru catatan terkuat: siapa mencari, dan menemukan siapa

Bila hasilnya nol atau banyak, `target_id` kosong dan `result_count` sudah bercerita. Tulis alasan keputusan ini di komentar route-nya, karena orang berikutnya akan tergoda menambahkan kuerinya "supaya lebih informatif".

Audit **wajib** (baris individual + parameter pengguna, aturan Sprint 3E) — gagal audit berarti tolak sajikan.

---

## TUGAS 3 — Sambungkan ke jalur suppression

Ini yang membuat 3H berguna. Alur lengkapnya harus bisa diselesaikan tanpa meninggalkan aplikasi:

**cari → buka profil → catat permintaan berhenti dihubungi → lihat akibatnya**

- Dari hasil pencarian, satu klik ke detail profil (jalur `profile.viewed` yang sudah ada — jangan buat jalur kedua)
- Kalau pencarian telepon/email menghasilkan **tepat satu** orang, tawarkan langsung ke profil itu tanpa langkah antara
- Pastikan tombol catat-suppression di detail profil terlihat oleh peran yang berhak (`consent.edit`) dan tidak terlihat oleh yang tidak

Letakkan pencariannya di `/audience`, di atas filter yang sudah ada — bukan layar baru. Bedakan dengan jelas antara **menyaring daftar** dan **mencari satu orang**: keduanya menghasilkan baris audit yang berbeda (`list.viewed` vs `search.performed`), dan pengguna harus tahu ia sedang melakukan yang mana.

---

## TUGAS 4 — Batas anti-panen, ditulis dan diuji

Pencarian adalah permukaan ekstraksi. Tulis batasnya sebagai fungsi murni yang bisa diuji, bukan sebagai penjagaan yang tersebar di route:

- Validasi bentuk kueri per `kind` (panjang minimum nama; telepon/email wajib ternormalisasi sebelum diterima)
- Batas hasil maksimum, dan keputusan "terlalu banyak" sebagai hasil eksplisit — bukan diam-diam memotong daftar
- Penolakan kueri yang jelas dipakai menyapu (wildcard, string sangat pendek, hanya angka pada `kind=name`)

Test wajib mencakup kasus batas dan kasus penyalahgunaan, bukan hanya jalur bahagia. Aturan Sprint 3E berlaku: aturan yang bisa jadi fungsi murni harus punya test.

Catat juga di `docs/` satu paragraf: kenapa telepon/email sama-persis, dan apa yang akan berubah kalau suatu saat seseorang meminta pencarian awalan. Itu permintaan yang pasti datang, dan alasan menolaknya harus sudah tertulis sebelum ada yang memintanya di tengah rapat.

---

## TUGAS 5 — Yang masih menggantung

Tiga hal ini sudah menunggu dan tidak akan selesai sendiri. Angkat lagi, jangan biarkan tenggelam:

- **`profile.viewed` masih 0** dan `/settings` belum pernah dibuka — dua sprint menunggu satu orang membuka satu halaman
- **Baris suppression pertama** belum ada; panduannya sudah siap di `docs/PERTAMA-suppression.md`
- **Enam commit belum ter-merge**, dan jalur tulis suppression tidak melindungi siapa pun selama ia ada di branch

Perbarui berkas PR untuk mencakup 3J. Tambahkan satu kalimat: pencarian ini adalah yang membuat jalur suppression bisa dipakai, jadi mendaratkan keduanya bersama lebih masuk akal daripada mendaratkan suppression sendirian.

**JANGAN merge sendiri.** Siapkan, lalu minta izin.

---

## LARANGAN

| Jangan | Alasan |
|---|---|
| Jangan buat migrasi, indeks, view, atau RPC baru | Indeks yang dibutuhkan sudah ada; nol perubahan skema sprint ini |
| Jangan izinkan pencarian awalan/substring pada telepon atau email | Mengubah layar ini jadi alat panen |
| Jangan simpan kueri pencarian di `metadata` audit | Kueri pencarian **adalah** identitas orang, dan audit append-only |
| Jangan cocokkan telepon/email tanpa `normalize.ts` | D-2: implementasi kedua = kegagalan diam-diam |
| Jangan tawarkan paginasi mendalam atas hasil pencarian | Daftar berhalaman sudah ada dan sudah diaudit sebagai daftar |
| Jangan bangun jalur tulis consent | Masih menunggu kanal opt-in yang nyata |
| Jangan `INSERT` ke `crm_suppression` atau `crm_consent` | Baris suppression tak bisa dihapus; baris uji jadi permanen |
| Jangan sentuh objek di luar `crm_*` dan `master_customer` (baca saja) | 101 fungsi bermasalah milik sistem tim lain — keputusan pemilik proyek |
| Jangan pakai `last_activity_at` atau `first_seen_at` sebagai sinyal | Keduanya cap waktu muat — `docs/KOLOM-WAKTU.md` |
| Jangan merge atau push ke `main` tanpa izin eksplisit | Deploy produksi ke sistem yang dipakai orang |
| Jangan buat/ubah/hapus `crm_user_role` | Mengendalikan akses akun manusia |
| Jangan cetak PII di skrip, log, laporan, atau `metadata` audit | — |
| Jangan hapus prefix `NODE_ENV=production` di `railway.json` | Baca README dulu |

---

## LAPORAN PENUTUP

1. **Status remote + kondisi database** — apa adanya
2. **Desain pencarian** — indeks yang kamu verifikasi, bentuk pencarian per `kind`, dan batas yang kamu tetapkan beserta alasannya
3. **Audit** — bentuk `metadata` yang kamu tulis, konfirmasi lewat test paritas bahwa `search.performed` terklasifikasi operasional, dan penegasan kuerinya tidak tersimpan
4. **Alur cari → profil → suppression** — bagaimana tersambung, dan bagaimana pengguna tahu ia sedang mencari atau menyaring
5. **Batas anti-panen** — fungsi murninya, dan kasus penyalahgunaan yang diuji
6. **Yang masih menggantung** — status ketiganya
7. **Yang ditemukan tapi tidak disentuh**
8. **Yang TIDAK bisa kamu verifikasi**

Gate akhir: `tsc --noEmit` bersih, `next lint` bersih, seluruh test hijau, `NODE_ENV=production npm run build` lulus. Sebutkan jumlah test sebelum dan sesudah.

Jangan klaim apa pun yang belum kamu jalankan dan lihat hasilnya.

# SELESAI — AKHIR PROMPT
