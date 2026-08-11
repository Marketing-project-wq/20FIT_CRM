# CLAUDE CODE PROMPT — Sprint 3B: Membuat Angkanya Bisa Dipercaya

> **Tujuan sprint ini: menutup satu bug diam-diam yang akan meledak nanti, dan menghentikan aplikasi ini menampilkan angka yang tidak bisa dipertanggungjawabkan.**
>
> Sprint 3A sudah live di `main` (SHA `f9d9136`, PR #3). Tim sekarang bisa login, peran berjalan, dan audience pool bisa dibuka. Sprint ini **tidak menambah kemampuan baru** — ia memperbaiki apa yang sudah ada supaya evaluasi tim berpijak pada angka yang benar.
>
> **Yang TETAP ditahan, alasannya tidak berubah dari 3A:**
>
> | Ditahan | Alasan |
> |---|---|
> | Pengisian tabel `crm_*` dengan data pelanggan | Sumbernya masih RLS OFF — item PRD 17.3 milik tim |
> | Migrasi 3 `crm_consent` | Menunggu sign-off legal |
> | Pengiriman WhatsApp/email | Tanpa consent register, tidak ada dasar hukum kontak marketing |
> | Ekspor, segment builder, alur approval | Sprint terpisah |

---

## PRASYARAT

1. Kerja dari `main` terbaru (`f9d9136` atau setelahnya).
2. File patch `0001-feat-quality-dashboard.patch` tersedia di root repo (layar `/quality`, ditulis di luar Claude Code, **belum pernah lolos `next build`**). Kalau file tidak ada, TUGAS 2 berubah jadi "bangun dari spesifikasi di bawah" — bukan dilewati.
3. `npm install` jalan, `npm test` hijau (138 test) sebelum kamu menyentuh apa pun. Kalau baseline sudah merah, **berhenti dan lapor** — jangan bangun di atas fondasi merah.

---

# PROMPT UNTUK CLAUDE CODE — SALIN MULAI DARI SINI

Aturan gate dari sprint sebelumnya berlaku penuh: **tulis → tunjukkan → jalankan → verifikasi.** Jangan klaim apa pun yang belum kamu jalankan dan lihat hasilnya. Ini menyentuh `main` dan produksi.

---

## TUGAS 1 — Rekonsiliasi bentuk kanonik telepon (PRIORITAS TERTINGGI)

Ada kontradiksi di repo hari ini, dan kalau dibiarkan sampai suppression dipakai, gejalanya adalah **orang yang sudah minta berhenti dihubungi tetap dikirimi pesan** — tanpa satu pun error di log.

Fakta, sudah diverifikasi ke database 11 Agustus 2026:

| Sumber | Bentuk |
|---|---|
| `normalizePhoneID()` di `lib/crm/normalize.ts` | `+62…` |
| `master_customer.phone_normalized` (81.584 baris terisi) | `62…` — **0 baris berawalan `+`** |

Komentar di migrasi `crm_suppression` **sudah menentukan pemenangnya**, jadi ini bukan keputusan desain baru — ini menegakkan keputusan yang sudah tertulis:

> `identity_key` WAJIB diproduksi oleh SATU fungsi kanonik (`lib/crm/normalize.ts`), **sama persis dengan ingestion & `master_customer`**; JANGAN menormalkan di SQL.

Dan komentar `crm_profile_demographic` menyatakan **`master_customer` JANGAN diubah**. Dua aturan itu bersama-sama hanya menyisakan satu jalan: **`normalize.ts` yang mengalah, bukan datanya.**

**Yang harus kamu kerjakan:**

- Ubah `normalizePhoneID()` agar bentuk kanoniknya `62…` (tanpa `+`), cocok persis dengan `master_customer.phone_normalized`.
- Semua varian masukan tetap harus konvergen: `08…`, `+62…`, `62…`, `0062…`, dengan spasi/tanda hubung/titik/kurung.
- Perbarui `lib/crm/normalize.test.ts` ke kanon baru, lalu **tambahkan satu test yang mengunci alasannya** — bukan sekadar mengunci nilainya. Test itu harus gagal kalau seseorang mengembalikan `+`, dengan nama yang menjelaskan konsekuensinya (mis. "bentuk kanonik harus cocok dengan master_customer, kalau tidak suppression gagal cocok diam-diam").
- Perbarui komentar header `normalize.ts`: ganti kalimat "masih harus direkonsiliasi ... verifikasi Sprint-3" dengan hasil verifikasinya dan tanggalnya.
- Hapus entri `phone_canonical_gap` dari `VERIFIED_ARTIFACTS` di `lib/crm/quality-types.ts` **hanya setelah** perubahan ini masuk — temuan yang sudah diperbaiki tidak boleh terus tampil di layar sebagai temuan aktif.

**Kenapa sekarang dan bukan nanti:** `normalizePhoneID` saat ini **nol konsumen runtime** (`crm_suppression` kosong, ingestion terblokir). Mengubahnya hari ini tidak mengubah perilaku apa pun. Setelah ingestion jalan, perubahan yang sama berarti migrasi data. Ini jendela termurah yang akan pernah ada.

**JANGAN** menyentuh `master_customer` — nol `UPDATE`. **JANGAN** menormalkan di SQL. **JANGAN** membuat fungsi normalisasi kedua di mana pun.

**Gate:** tunjukkan diff `normalize.ts` + test sebelum menjalankan `npm test`.

---

## TUGAS 2 — Terapkan dan verifikasi layar `/quality`

Patch `0001-feat-quality-dashboard.patch` menambahkan dasbor kualitas data (Fase 1 di inventaris layar PRD): fill rate, identifier tidak valid, anomali nilai, duplikat, antrean orphan/excluded, cakupan satelit `crm_*`.

**Perlakukan patch ini sebagai kode yang belum ditinjau, bukan pekerjaan selesai.** Ia ditulis di environment tanpa kredensial Supabase dan tanpa akses `fonts.googleapis.com`, jadi:

- `tsc --noEmit`, `next lint`, dan 138 test **sudah** hijau di sana
- `next build` **belum pernah** dijalankan atas kode ini
- Tidak ada satu pun query PostgREST-nya yang pernah benar-benar dieksekusi lewat `supabase-js` — logikanya dicocokkan lewat SQL setara, bukan lewat klien

**Yang harus kamu kerjakan:**

1. Terapkan patch di branch kerjamu.
2. **Tinjau, jangan sekadar terima.** Titik paling rawan, periksa satu per satu:
   - Sintaks filter PostgREST: `.not(col,"is",null)`, `.not(col,"like","62%")`, `.lt("lifetime_value",0)`, `.is("is_potential_duplicate",true)`, `.select("*",{count:"exact",head:true})`. Pastikan tiap satu benar-benar mengembalikan angka yang diharapkan, bukan diam-diam mengabaikan filter.
   - Rantai dua `.not()` pada kolom yang sama — pastikan ter-AND, bukan saling menimpa.
3. Jalankan `NODE_ENV=production npm run build`. Ini gate yang belum pernah dilewati kode ini.
4. **Verifikasi tiap angka ke database.** Bandingkan keluaran `/api/quality` dengan SQL setara. Angka acuan per 11 Agustus 2026 (kalau berbeda, laporkan selisihnya — jangan sesuaikan diam-diam):

   | Metrik | Nilai |
   |---|---|
   | total | 82.253 |
   | `full_name` / `phone_normalized` / `email_normalized` terisi | 82.238 / 81.615 / 81.637 |
   | `gender` / `date_of_birth` / `address` terisi | 0 / 0 / 0 |
   | `city` terisi | 5.786 |
   | `segment` terisi | 81.011 |
   | `lifetime_value > 0` | 1.112 |
   | `lifetime_value < 0` | 1 |
   | telepon tidak berawalan `62` | 31 |
   | `is_potential_duplicate` | 15 |
   | `customer_orphan` / `customer_excluded` | 32 / 6.361 |
   | `crm_profile_*` (ketiganya) | 0 |

5. Konfirmasi audit: membuka `/quality` menulis satu baris `list.viewed` dengan `metadata.view = "quality"`. **Jangan** ganti jadi `quality.viewed` — allowlist migrasi 8 memangkas berdasarkan nama aksi eksak, dan aksi baru tidak akan masuk allowlist maupun kategori kepatuhan, jadi menumpuk selamanya tanpa ada yang sadar.
6. Konfirmasi fail-closed: peran tanpa `profile.view_list` (termasuk `unit_manager` tanpa scope) mendapat 403 dari API **dan** layar penolakan di halaman, bukan dasbor kosong.

**JANGAN** membuat view SQL, RPC, atau migrasi apa pun untuk mempercepat layar ini. Ledger migrasi proyek ini diverge (lihat README) — layar evaluasi tidak boleh jadi alasan menyentuhnya.

---

## TUGAS 3 — Sapu kelas Tailwind yang mati, lalu pasang pagarnya

`tailwind.config.ts` memetakan `amber` ke `var(--amber)` polos. Itu **menghapus skala numerik** dan **memblokir modifier opacity**. Akibatnya `text-amber-500`, `bg-amber-500/[0.06]`, dan `border-amber-500/40` tidak menghasilkan CSS sama sekali — bukan warna yang salah, melainkan **tidak ada aturan yang tergenerate**. Banner kualitas di Audience tampil tanpa tint dan ikonnya tanpa warna sejak dibuat, dan tidak ada yang menyadarinya karena tidak ada yang error.

Ini kelas kegagalan yang persis dilarang README: *"Hard-coded hex outside `globals.css` is a review-blocking defect."* Aturan itu menangkap hex, tapi tidak menangkap kelas yang menguap.

**Yang harus kamu kerjakan:**

- Sapu seluruh `app/`, `components/`, `lib/` untuk pola `<warna>-<angka>` pada token proyek (`red`, `blue`, `amber`, `green`, `ink`, `glass`). Per 11 Agustus 2026 tersisa dua di `components/audience/audience-pool.tsx` (ikon `Lock` di header kolom Telepon dan Email) — **verifikasi sendiri**, jangan percaya angka ini.
- Ganti dengan kelas token datar (`text-amber`) atau utilitas `.tint-*` dari `globals.css`. Untuk permukaan bertint, `.tint-*` adalah satu-satunya jalan yang benar — opacity modifier tidak akan pernah bekerja pada token ini.
- **Pasang pagarnya.** Tambahkan satu test yang memindai sumber dan gagal kalau pola itu muncul lagi, dengan pesan yang menjelaskan *kenapa* kelasnya menguap. Sapuan tanpa pagar akan terulang dalam dua sprint.
- Catat aturannya di README di bagian Design system, satu paragraf.

**Gate:** tunjukkan daftar temuan sapuan sebelum mengubah apa pun.

---

## TUGAS 4 — Dashboard: angka nyata, atau em-dash yang jujur

Empat kartu di dashboard masih `—` dengan hint "belum terhubung". Sekarang lapisan baca sudah ada, jadi sebagian bisa diisi. Tapi mengisi keempatnya adalah jebakan.

**Aturan yang harus kamu tegakkan, dan ini inti tugasnya:**

> **`0` berarti "sudah diukur, hasilnya nol". `—` berarti "belum ada sumbernya".** Keduanya tidak boleh tertukar. Menampilkan `0` untuk sesuatu yang tidak punya sumber adalah kebohongan yang terlihat seperti data.

Terapkan ke empat kartu:

| Kartu | Isi | Alasan |
|---|---|---|
| Ukuran audiens | angka nyata dari `master_customer` | Sumbernya ada |
| Bisa dihubungi | **`0`**, dengan hint bahwa consent register belum ada | Nol yang benar secara hukum: tanpa consent, tidak ada satu pun yang boleh dikontak. PRD §18.8 melarang total tampil tanpa pendamping ini |
| Workflow aktif | **`—`** | Tidak ada tabel workflow sama sekali. `0` di sini akan terbaca "sudah dicek, belum ada yang aktif" — padahal belum pernah dicek |
| Profil baru | **jangan pakai jendela 7 hari** | Lihat di bawah |

**Soal "profil baru".** Terverifikasi 11 Agustus 2026: `created_at` di `master_customer` berkisar 20 April – **31 Juli 2026**. Tidak ada baris baru sejak 11 hari lalu, karena tabel ini **impor satu kali, bukan feed hidup**. Kartu "7 hari" akan membaca `0` selamanya dan terlihat seperti bug.

Ganti kartu itu dengan **kesegaran data**: kapan profil terakhir bertambah. Itu fakta yang berguna dan jujur — ia memberi tahu tim bahwa ingestion belum jalan, yang memang benar. Jangan tampilkan tren pertumbuhan dari data statis.

Gerbangi angkanya pada `profile.view_list` seperti layar lain, dan turunkan lewat route handler server-side — **jangan** kueri dari komponen klien. Kalau peran tidak berizin, kartunya `—`, bukan angka.

Hapus panel "Sprint 1 — Fondasi terpasang" di `dashboard-content.tsx`; isinya sudah tidak benar.

---

## TUGAS 5 — Memo risiko: masking Sprint 3A bisa dilewati (TULIS SAJA, JANGAN PERBAIKI)

RLS OFF di tabel lama sudah diketahui tim dan tercatat sebagai Fase 0 (PRD 17.3). **Itu bukan temuan dan bukan tugasmu.** Larangan "jangan menyalakan RLS di tabel lama" tetap berlaku penuh.

Yang **belum** tercatat di mana pun adalah konsekuensinya terhadap kontrol yang baru saja dibangun:

`staging_20fit_data` (87.966 baris, RLS OFF, sumber impor yang sama dengan `master_customer`) bisa dibaca langsung oleh siapa pun yang memegang anon key. Artinya seorang `analyst` **tidak perlu melewati `/api/audience` sama sekali** untuk mendapat telepon dan email tanpa disamarkan — dan pembacaan itu tidak menghasilkan satu pun baris `list.viewed`. Masking server-side dan audit wajib yang jadi inti Tugas 4 Sprint 3A keduanya bisa dilewati, bukan ditembus.

**Yang harus kamu kerjakan — hanya ini:**

- Tulis `docs/RISIKO-masking-bypass.md`: apa yang bisa dilewati, lewat jalur mana, siapa yang punya anon key hari ini, dan apa saja opsi mitigasinya beserta konsekuensi tiap opsi.
- Verifikasi dulu jumlah barisnya sendiri sebelum menulis angka. Prompt Sprint 3A menyebut 88.536; pembacaan 11 Agustus 2026 menunjukkan 87.966. Laporkan mana yang benar dan kenapa berbeda kalau kamu bisa tahu.
- Sebutkan ini **menaikkan urgensi** Fase 0, bukan menggantikannya.

**JANGAN** menyalakan RLS. **JANGAN** menulis policy. **JANGAN** menyentuh `staging_20fit_data`. Ini keputusan tim, dan memo ini bahan keputusannya.

---

## LARANGAN

| Jangan | Alasan |
|---|---|
| Jangan jalankan migrasi 3 `crm_consent` | Menunggu legal |
| Jangan `INSERT`/`UPDATE` data pelanggan di `master_customer` atau `crm_*` | Sumber masih RLS OFF; `master_customer` read-only per desain |
| Jangan buat migrasi, view, atau RPC baru | Ledger diverge — tiap DDL harus lewat jalur satu-per-satu yang ditinjau, bukan disisipkan sprint ini |
| Jangan jalankan `supabase db push` | Akan mencoba menjalankan ulang tujuh migrasi dan menerapkan migrasi 3 yang ditahan |
| Jangan bangun ekspor, kirim pesan, atau segment builder | Sprint terpisah, sebagian terblokir |
| Jangan jadwalkan purge otomatis | Fungsinya sudah ada; penjadwalan keputusan terpisah |
| Jangan longgarkan fail-closed `unit_manager` | Tetap NIHIL sampai tabel scope ada |
| Jangan menyalakan RLS di tabel lama | Fase 0, milik tim |
| Jangan hapus baris audit artefak (`id=1`, `id=5`) | Append-only, sengaja dibiarkan sebagai catatan sah |
| Jangan hapus prefix `NODE_ENV=production` di `railway.json` | Baca alasannya di README dulu — kesalahan ini sudah dibuat dua kali |
| Jangan merge ke `main` tanpa izin eksplisit | Push ke `main` memicu deploy produksi Railway |

---

## LAPORAN PENUTUP

1. **Kanon telepon** — bentuk baru, daftar varian yang konvergen, nama test yang menguncinya, dan konfirmasi nol `UPDATE` ke `master_customer`
2. **`/quality`** — hasil `next build`, tabel perbandingan tiap angka API vs SQL (dan selisih apa pun), bukti baris audit yang tertulis, hasil uji fail-closed
3. **Sapuan Tailwind** — daftar temuan, apa yang diganti, dan bagaimana pagarnya gagal kalau pola itu kembali
4. **Dashboard** — tiap kartu: nilainya, dari mana, dan kenapa `0` atau `—` yang dipilih
5. **Memo risiko** — jumlah baris `staging_20fit_data` yang kamu ukur sendiri dan penjelasan selisih dengan angka prompt 3A
6. **Yang ditemukan tapi tidak disentuh**
7. **Yang TIDAK bisa kamu verifikasi** — sebut apa adanya. Screenshot sesi login nyata butuh kredensial; kalau environment-mu tidak punya, katakan begitu alih-alih mengklaim tampilan live

Jangan klaim apa pun yang belum kamu jalankan dan lihat hasilnya.

# SELESAI — AKHIR PROMPT
