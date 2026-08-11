# CLAUDE CODE PROMPT — Sprint 3C: Akuntabilitas yang Bisa Dilihat

> **Tujuan sprint ini: jejak audit yang selama ini ditulis akhirnya bisa dibaca dari dalam aplikasi, dan satu aturan audit yang sekarang punya dua jawaban diselesaikan jadi satu.**
>
> Tiga sprint terakhir membangun akuntabilitas: setiap pembacaan daftar menulis `list.viewed`, setiap pemberian peran menulis `role.granted`, retensi menulis `retention.purge_executed`. Tapi **tidak ada satu pun orang di dalam aplikasi yang bisa melihat tabel itu.** Satu-satunya jalan adalah SQL Editor — yang justru artinya kontrol akuntabilitasnya hanya bisa diperiksa oleh orang yang paling tidak perlu diperiksa.
>
> Sprint ini menutup lingkaran itu, plus membuat aksi `profile.viewed` benar-benar ada (aksinya sudah didefinisikan di matriks RBAC dan sudah masuk allowlist retensi migrasi 8 — tapi **belum ada satu baris pun** yang pernah menulisnya).
>
> **Yang TETAP ditahan, alasannya tidak berubah:**
>
> | Ditahan | Alasan |
> |---|---|
> | Pengisian tabel `crm_*` dengan data pelanggan | Sumbernya masih RLS OFF — Fase 0 / PRD 17.3 milik tim |
> | Migrasi 3 `crm_consent` | Menunggu sign-off legal |
> | Pengiriman WhatsApp/email | Tanpa consent register, tidak ada dasar hukum kontak marketing |
> | Ekspor, segment builder, alur approval, merge/unmerge | Sprint terpisah |

---

## ATURAN PROSES — BACA DULU

Sprint 3B melaporkan `origin/main` ada di `d92a92e` dan menyimpulkan Sprint 3A belum di produksi. **Itu salah** — `origin/main` sebenarnya di `4bac312` (PR #3, memuat 3A). Penyebabnya remote-tracking ref yang basi karena tidak pernah di-`fetch`. Kesimpulan yang keliru itu sempat mengubah penilaian risiko merge.

Karena itu, sebelum menyentuh apa pun:

```bash
git fetch --all --prune
git log --oneline -3 origin/main
git log --oneline origin/main..HEAD
```

**Laporkan ketiga keluaran itu di awal laporanmu.** Jangan pernah menyatakan status remote dari ingatan atau dari ref lokal tanpa `fetch` lebih dulu. Kalau state-nya berbeda dari yang tertulis di prompt ini, **berhenti dan lapor** — jangan menyesuaikan diam-diam.

---

## PRASYARAT

1. Sprint 3B (`bf736b0`) sudah di-merge ke `main`, **atau** kamu bekerja di atasnya. Konfirmasi mana yang berlaku sebelum mulai.
2. `npm install` jalan, `npm test` hijau (141 test) sebagai baseline. Baseline merah → berhenti dan lapor.
3. Kalau `.env.local` berisi kredensial Supabase nyata, sebutkan itu di awal — TUGAS 4 jadi mungkin dijalankan. Kalau tidak ada, sebutkan juga; jangan diam-diam melewatinya.

---

# PROMPT UNTUK CLAUDE CODE — SALIN MULAI DARI SINI

Gate seperti biasa: **tulis → tunjukkan → jalankan → verifikasi.** Jangan klaim apa pun yang belum kamu jalankan dan lihat hasilnya.

---

## TUGAS 1 — Satu aturan audit untuk pembacaan agregat

Hari ini repo punya dua jawaban berbeda untuk pertanyaan yang sama:

| Endpoint | Sifat | Audit |
|---|---|---|
| `/api/quality` | agregat `master_customer` | **wajib**, gagal audit → 503 |
| `/api/dashboard` | agregat `master_customer` | **tidak sama sekali** |

Keduanya membaca tabel yang sama, keduanya hanya mengembalikan angka. Membiarkan dua jawaban berarti aturan "setiap pembacaan tercatat" punya pengecualian yang tidak tertulis di mana pun — dan pengecualian tak tertulis akan dipakai orang berikutnya sebagai preseden.

**Aturan yang kamu tegakkan:**

> **Audit wajib bila responsnya memuat baris individual, atau bila agregatnya dibentuk oleh parameter dari pengguna. Agregat tetap tanpa parameter pengguna tidak diaudit.**

Alasannya, tulis di komentar: audit menjawab *"siapa melihat data siapa"*. Hitungan tetap tidak punya sisi "siapa" pada objeknya, jadi barisnya tidak menjawab apa pun — ia hanya menambah volume yang nanti harus dipangkas oleh migrasi 8. Tapi begitu pengguna bisa menyetir agregatnya, hitungan bisa dipersempit sampai menunjuk satu orang, dan saat itu ia berhenti jadi agregat.

**Konsekuensi konkret:**

- `/api/quality` — **hapus** penulisan audit dan penolakan 503-nya. Agregatnya tetap, tanpa parameter apa pun dari klien.
- `/api/dashboard` — tetap tanpa audit. Perbarui komentarnya untuk merujuk aturan ini, bukan alasan ad-hoc "halaman pendaratan".
- `/api/audience` — **tidak berubah**, tetap wajib audit. Ia mengembalikan baris individual DAN menerima filter dari pengguna.
- Tulis aturan ini di README, dan **tambahkan peringatan di `/api/quality`**: kalau suatu hari layar itu diberi filter, audit wajib kembali. Peringatan itu harus ada di file yang akan dibaca orang yang menambahkan filternya.

Kalau tim tidak setuju dengan aturan ini, ini satu keputusan yang bisa dibalik — tapi **balik keduanya**, jangan tinggalkan dua jawaban lagi.

---

## TUGAS 2 — Layar audit log di `/settings`

Ini inti sprintnya. `crm_audit_log` sudah punya isi dan tidak bisa dilihat siapa pun dari aplikasi.

**Gerbang:** `audit.view` — hanya `super_admin` dan `crm_manager` per matriks PRD 17.2. `canSeeNav("/settings")` sudah resolve ke aksi ini, jadi jangan ubah gerbangnya. Fail-closed seperti layar lain: layar penolakan, bukan tabel kosong.

Skema tabelnya (verifikasi sendiri sebelum menulis kode):

```
id bigint · occurred_at timestamptz · actor_id uuid · actor_email text
action text · target_table text · target_id text · summary text · metadata jsonb
```

**Aturan keras:**

| Aturan | Alasan |
|---|---|
| Baca lewat route handler server-side + service role | `crm_audit_log` RLS ON tanpa policy — anon key tidak bisa dan tidak boleh |
| Paginasi wajib, batas maksimum per request | Tabel ini hanya akan tumbuh |
| Nol tombol hapus/edit | Append-only; trigger menolaknya, UI tidak boleh menawarkan yang mustahil |
| Membuka layar ini **diaudit** | Ia mengembalikan baris individual dan menerima filter — aturan TUGAS 1 berlaku penuh pada dirinya sendiri |
| Aksi audit yang ditulis: `list.viewed`, `target_table = 'crm_audit_log'` | **JANGAN** buat `audit.viewed` baru. Allowlist migrasi 8 memangkas berdasarkan nama eksak; aksi baru tidak masuk allowlist maupun kategori kepatuhan, jadi menumpuk selamanya |

Filter yang cukup: `action` (atau prefiks seperti `role.`), `actor_email`, dan rentang tanggal. Urutan default `occurred_at` menurun.

**Dua hal yang harus jujur terlihat di layar, dan ini yang membedakannya dari sekadar tabel:**

1. **Log ini bukan riwayat lengkap.** Migrasi 8 memangkas kategori operasional (`profile.viewed`, `list.viewed`, `search.*`, `login.*`) setelah 90 hari; kategori kepatuhan (`consent.*`, `suppression.*`, `role.*`, `profile.deleted`, `export.*`, `retention.*`) dikecualikan permanen. Tampilkan pembedaan itu — pembaca harus tahu ketiadaan baris lama bukan berarti tidak ada yang terjadi. Fungsi purge **belum dijadwalkan**, jadi sampai hari ini belum ada yang terpangkas; katakan itu juga.
2. **Dua baris artefak.** `id=1` (`test.trigger_check`, Sprint 2B) dan `id=5` (`retention.purge_executed` dari verifikasi Sprint 3A) adalah artefak verifikasi, bukan aktivitas nyata. Jangan disembunyikan dan jangan disamarkan jadi aktivitas biasa — beri penanda.

`metadata` dirancang bebas PII. **Verifikasi asumsi itu, jangan percayai.** Periksa isi nyata semua baris yang ada sebelum menampilkannya mentah-mentah; kalau ada satu saja yang memuat identitas pelanggan, laporkan dan jangan tampilkan kolom itu apa adanya.

Hapus `ComingSoon` di `/settings`, tapi **pertahankan `/settings/roles` yang sudah ada** — jadikan keduanya satu halaman pengaturan yang koheren, bukan dua layar yang tidak saling tahu.

---

## TUGAS 3 — Detail profil dan aksi `profile.viewed`

Aksi `profile.viewed` ada di matriks RBAC dan sudah masuk allowlist retensi, tapi **belum ada satu baris pun** yang pernah menulisnya. Artinya migrasi 8 saat ini memangkas kategori yang belum pernah ada isinya. Sprint ini membuatnya nyata.

**Ini membalik satu keputusan yang tertulis eksplisit**, jadi lakukan dengan sadar dan dokumentasikan: `lib/crm/audience.ts` menyatakan `customer_id` *"is only an ORDER key — never selected, never returned"*. Untuk membuka satu profil, klien butuh identifier itu. Aturan lama berbicara tentang **kolom tampilan**; memakainya sebagai parameter rute adalah penggunaan berbeda, dan UUID itu opaque bagi pengguna yang memang sudah berhak melihat barisnya. Ubah komentarnya agar mencerminkan keputusan baru — jangan tinggalkan komentar yang bertentangan dengan kode di bawahnya.

**Aturan keras:**

| Aturan | Alasan |
|---|---|
| `/api/audience/[id]` — cek peran server-side per request | Jangan percaya klien |
| Masking telepon/email di server untuk peran non-`profile.view_contact` | Data asli tidak boleh sampai ke browser — sama seperti daftar |
| Satu baris `profile.viewed` per pembukaan, `target_id` = `customer_id` | PRD 17.1; gagal audit → tolak sajikan (baris individual, aturan TUGAS 1) |
| Nol tombol edit / hapus / merge | Sprint ini masih evaluasi |
| ID tidak dikenal → 404, bukan pesan yang membocorkan ada/tidaknya baris | Jangan jadikan endpoint ini alat enumerasi |

**Apa yang sebenarnya ada untuk ditampilkan** — sudah diverifikasi ke database 11 Agustus 2026, verifikasi ulang sendiri:

| Kolom | Kondisi |
|---|---|
| `source` | 100% terisi, hanya **2 nilai berbeda** — sebutkan keduanya di laporan |
| `first_seen_at`, `updated_at` | 100% terisi |
| `duplicate_reason` | 15 baris, tepat yang bertanda `is_potential_duplicate` |
| `notes`, `tags` | **0% terisi** — tampilkan "belum terisi", jangan hilangkan barisnya |
| `last_activity_at` | **JANGAN ditampilkan**, aturan sejak 3A tidak berubah |

**Health flags — jangan mengarang.** Matriks PRD punya baris `profile.view_health`, tapi `master_customer` **tidak punya satu pun kolom kesehatan**; satu-satunya sumber (`clinic_*`) berada di luar lingkup dan masih RLS OFF. Jadi: pertahankan gerbang `profile.view_health` secara struktural, dan tampilkan **"tidak ada sumber data"** — bukan `—` yang ambigu, bukan bidang kosong yang terbaca seperti "sehat". Aturan 3B berlaku: `0` berarti terukur nol, `—` berarti belum ada sumbernya, dan ini bukan salah satunya.

Titik masuknya dari baris di `/audience`. Jangan bangun pencarian bebas — itu aksi `search.*` yang punya konsekuensi audit sendiri dan bukan sprint ini.

---

## TUGAS 4 — Tutup celah verifikasi live yang sudah dua sprint menganga

Dua sprint berturut-turut melaporkan hal yang sama: tidak satu pun query `supabase-js` di `/api/quality` dan `/api/dashboard` pernah benar-benar dieksekusi. Buktinya kuat tapi tidak langsung — kecocokan nilai lewat SQL setara dan inspeksi query-string. Sprint ini menambah dua endpoint lagi di atas fondasi yang belum pernah dijalankan.

**Kalau kredensial Supabase tersedia di environment-mu:**

1. `npm run dev`, lalu panggil `/api/quality`, `/api/dashboard`, `/api/audience`, `/api/audience/[id]`, dan endpoint audit yang baru.
2. Bandingkan keluarannya dengan SQL setara — laporkan sebagai tabel, sebutkan tiap selisih.
3. Konfirmasi baris audit **benar-benar mendarat** di `crm_audit_log`: satu `list.viewed` untuk daftar audience, satu `list.viewed` dengan `target_table='crm_audit_log'` untuk layar audit, satu `profile.viewed` dengan `target_id` terisi untuk detail profil, dan **nol baris baru** dari `/api/quality` maupun `/api/dashboard`.
4. Konfirmasi tidak ada baris audit yang memuat PII pelanggan.

**Kalau kredensial tidak tersedia:** katakan begitu di awal dan di laporan penutup, sebutkan persis apa yang diblokir (host, kode error), dan **jangan mengarang pengganti**. Ini kendala environment yang sah, bukan kelalaian — yang tidak sah adalah menyebutnya terverifikasi.

**Jangan** membuat, mengubah, atau menghapus baris `crm_user_role` untuk "menguji peran analyst". Itu memberi atau mencabut akses akun manusia di produksi. Masking dibuktikan lewat unit test dan replikasi SQL; verifikasi peran nyata butuh akun uji yang dibuat tim, bukan kamu.

---

## LARANGAN

| Jangan | Alasan |
|---|---|
| Jangan jalankan migrasi 3 `crm_consent` | Menunggu legal |
| Jangan `INSERT`/`UPDATE`/`DELETE` di `master_customer`, `crm_*`, atau `crm_user_role` | Read-only per desain; `crm_user_role` mengendalikan akses manusia |
| Jangan buat migrasi, view, atau RPC baru | Ledger diverge — tiap DDL lewat jalur satu-per-satu yang ditinjau |
| Jangan jalankan `supabase db push` | Akan menjalankan ulang tujuh migrasi dan menerapkan migrasi 3 yang ditahan |
| Jangan buat aksi audit baru di luar yang sudah ada | Allowlist migrasi 8 memangkas per nama eksak; aksi baru menumpuk selamanya |
| Jangan hapus baris audit `id=1` / `id=5` | Append-only, artefak sah — tandai, jangan hapus |
| Jangan bangun ekspor, kirim pesan, segment builder, merge/unmerge, atau pencarian bebas | Sprint terpisah |
| Jangan jadwalkan purge otomatis | Fungsinya sudah ada; penjadwalan keputusan terpisah |
| Jangan longgarkan fail-closed `unit_manager` | Tetap NIHIL sampai tabel scope ada |
| Jangan menyalakan RLS di tabel lama | Fase 0, milik tim |
| Jangan hapus prefix `NODE_ENV=production` di `railway.json` | Baca alasannya di README dulu — sudah salah dua kali |
| Jangan merge ke `main` tanpa izin eksplisit | Push ke `main` memicu deploy produksi Railway |

---

## LAPORAN PENUTUP

1. **Status remote** — keluaran `git fetch` + tiga perintah `git log` di awal, apa adanya
2. **Aturan audit** — aturan finalnya, apa yang berubah di tiap endpoint, dan di mana peringatan "kalau nanti diberi filter" itu ditaruh
3. **Layar audit** — gerbang, filter, paginasi, bagaimana pemangkasan 90 hari dan dua baris artefak ditampilkan, dan hasil pemeriksaanmu atas isi `metadata` (PII ada atau tidak)
4. **Detail profil** — kolom yang tampil, dua nilai `source`, penanganan health flags, dan kalimat baru di `audience.ts` yang menggantikan aturan `customer_id`
5. **Verifikasi live** — tabel perbandingan kalau bisa dijalankan; kalau tidak, host dan kode error yang memblokirnya
6. **Yang ditemukan tapi tidak disentuh**
7. **Yang TIDAK bisa kamu verifikasi** — sebut apa adanya

Gate akhir: `tsc --noEmit` bersih, `next lint` bersih, seluruh test hijau, dan `NODE_ENV=production npm run build` lulus. Sebutkan jumlah test sebelum dan sesudah.

Jangan klaim apa pun yang belum kamu jalankan dan lihat hasilnya.

# SELESAI — AKHIR PROMPT
