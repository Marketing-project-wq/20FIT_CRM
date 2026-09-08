# Daftar keputusan: pipeline harian ekosistem

> ## ⏱ DIUKUR: 7 September 2026, 14:00–18:00 UTC
>
> Menyertai `docs/RANCANGAN-pipeline-harian.md`. **Nol baris kode dibangun sampai daftar ini
> dijawab.** Setiap keputusan menyebutkan konsekuensinya dengan angka, bukan dengan kehati-hatian.

---

## KEPUTUSAN 1 — Consent. **Ini yang pertama, dan yang paling mahal untuk salah.**

**Pertanyaannya:** 1.867 orang dari ekosistem 20FIT tidak pernah menyetujui apa pun dari 20FIT
**sebagai satu perusahaan**. Mereka mendaftar di aplikasi my20fit, memesan kelas arena, atau
melamar sebagai talent. Apa dasar kita mengirimi mereka pemasaran dari CRM?

**Kenapa ini bukan pertanyaan teoretis.** Suppression adalah satu-satunya gerbang kirim (K-36) —
consent adalah bukti, bukan gerbang. `crm_suppression` berisi **1 baris**. Buktinya sudah ada di
produksi hari ini: **704 orang punya email, tidak punya baris consent sama sekali, dan tetap
`sendable`.** Artinya: **begitu ke-1.867 orang ini ada di `master_customer` dengan email, mereka
bisa dikirimi.** Tidak ada langkah kedua yang menahannya. Kalau keputusan ini ditunda sampai
"nanti waktu mengirim", keputusannya sudah terjadi.

Catatan yang relevan: seluruh 81.637 baris `crm_consent` yang ada memakai basis
`legacy_import_unverified` — sebuah basis yang secara jujur berarti *"kami tidak benar-benar tahu"*.
Apa pun yang dipilih di bawah, itu adalah standar yang sudah berlaku, bukan standar baru.

### Opsi

**(1) Tarik dan promosikan, tanpa baris consent.**
Persis seperti 704 orang yang sudah begitu hari ini.
- *Konsekuensi:* 1.867 orang menjadi dapat dikirimi malam pertama pipeline jalan. Tidak ada yang
  mencatat bahwa mereka masuk lewat jalur berbeda. Konsisten dengan produksi hari ini — dan itulah
  masalahnya: ia menormalkan keadaan yang seharusnya dianggap utang.

**(2) Tarik dan promosikan, dengan basis consent baru yang jujur** — mis.
`ecosystem_pull_unverified`.
- *Konsekuensi:* orangnya sama-sama dapat dikirimi (basis bukan gerbang), tetapi **terlihat**.
  Segmen bisa mengecualikan mereka, audit bisa menghitungnya, dan pertanyaan "siapa yang tak pernah
  setuju apa pun?" punya jawaban. Kosakata consent punya pagar paritas TS↔SQL
  (`consent-vocabulary.parity.test.ts`) — nilai baru harus lewat sana, bukan diselipkan.
- *Keberatan:* menulis baris consent untuk orang yang tidak memberi consent tetaplah menulis bukti
  yang tidak ada. Nama basisnya harus menyatakan itu, atau opsi ini lebih buruk daripada (1) karena
  ia terlihat seperti izin.

**(3) Tarik ke singgahan; promosikan hanya lewat gerbang. ← rekomendasi saya**
Tarikan harian menulis ke tabel singgahan yang **tidak pernah** disentuh jalur kirim. Promosi ke
`master_customer` adalah langkah terpisah dengan keputusan consent yang eksplisit per gelombang.
- *Konsekuensi:* nol orang menjadi dapat dikirimi tanpa ada yang memutuskannya. Kolamnya berhenti
  membeku (data masuk setiap hari), tetapi jangkauan kirim tidak melebar diam-diam. Biayanya: satu
  tabel lagi, satu layar lagi, dan seseorang harus benar-benar menekan gerbang itu — kalau tidak
  ada yang menekannya, kita punya data segar yang tak terpakai. **Itu risiko nyata dari opsi ini,
  dan saya lebih suka menyebutnya daripada menyembunyikannya.**

**Rekomendasi: (3).** Alasannya bukan kehati-hatian umum — melainkan bahwa (1) dan (2)
memindahkan keputusan consent ke titik di mana ia sudah tidak bisa dibuat lagi. Tapi ketiganya
dapat dipertahankan, dan (2) adalah pilihan yang wajar kalau pemilik menilai gerbang manual tidak
akan pernah benar-benar ditekan.

---

## KEPUTUSAN 2 — Sumber mana di fase satu?

Diurutkan menurut orang **eksklusif** (yang tidak dipunyai sumber lain mana pun), karena itulah
satu-satunya kolom yang membenarkan memasang sebuah sumber.

**(a) Tiga sumber ← rekomendasi saya**
`my20fit_profile` + `arena_class_bookings` + `talent_accounts`.
Menutup **1.807 dari 1.867** orang baru. Sepuluh sumber sisanya bersama menambah **60**.

**(b) Dua sumber sekarang, `talent_accounts` menyusul dua minggu lagi**
`talent_accounts` berumur **15 hari** dan 592 dari 682 orangnya datang dalam satu minggu (31 Agu).
Itu bisa berupa laju nyata, bisa juga satu ledakan atau satu migrasi. Menunggu dua minggu
mengubahnya dari tebakan menjadi ukuran. Menutup 1.310 sekarang, sisanya menyusul.

**(c) Seluruh 13 sumber hidup**
Menambah 60 orang di atas opsi (a), dengan biaya: `clinic_patients` membawa NIK, tanggal lahir,
alamat, dan kontak darurat melewati gerbang `profile.view_health` (temuan 12 Agu) — untuk **28**
orang; dan `clinic_bookings` 96% tanpa email (473 dari 492 kosong).

**Yang TIDAK boleh masuk dalam keadaan apa pun, dan alasan terukurnya:**
- **`profiles`** — kembaran persis `my20fit_profile` (irisan 1.355, nol unik di kedua sisi).
- **`uob_users` sebagai sumber ORANG** — 1.161 dari 1.174 emailnya sudah ada di `my20fit_profile`;
  hanya **11** yang baru dan eksklusif. *Nilainya nyata tapi ada di kolomnya* (`department`,
  `employee_id`, `team`, `nik`) — itu **pelengkapan profil**, putaran yang berbeda, bukan tarikan
  orang.
- **`event_transaction` dan `cf_hyrox_participants`** — **beku**. 1.733 dan 1 orang baru masing-
  masing, tapi tak ada baris baru sejak 11 Agu dan 30 Mei. Itu **impor satu kali**, dan sebagian
  besar sudah tercakup enam berkas CSV yang menunggu di gerbang impor. Cron untuk tabel beku adalah
  pekerjaan yang berjalan setiap malam untuk menemukan nol.

---

## KEPUTUSAN 3 — Promosi otomatis atau per-jalan disetujui?

Berlaku hanya kalau Keputusan 1 = (3).

**(a) Setiap jalan butuh persetujuan.** Aman, dan menjadi tumpukan pekerjaan harian yang, kalau
sehari terlewat, menumpuk sampai tak ada yang mau membukanya.

**(b) Otomatis untuk sumber yang sudah dipercaya, gerbang untuk sumber baru. ← rekomendasi saya**
Sumber dipromosikan otomatis setelah dua minggu berjalan tanpa anomali. Sumber yang baru dipasang
lewat gerbang. Ambang "anomali" harus berupa angka yang ditulis sekarang, bukan penilaian nanti.

**(c) Otomatis penuh.** Sama dengan Keputusan 1 opsi (1), hanya lewat satu tabel tambahan.

**Ambang yang saya usulkan** untuk menahan sebuah jalan (angka dari §2 rancangan, ukur ulang
sebelum dipasang):
- lebih dari **500** orang baru dalam satu malam dari satu sumber (laju harian tertinggi terukur:
  ~46/hari dari my20fit; 592 dalam satu minggu dari talent_accounts adalah ledakan yang sudah
  terjadi sekali)
- lebih dari **20%** baris sebuah sumber **hilang** dibanding tarikan kemarin (§4.3 rancangan —
  tabel yang di-truncate lalu diisi ulang tim lain terlihat persis seperti pengunduran diri massal)
- sumber apa pun mengembalikan **0 baris** padahal kemarin tidak nol

---

## KEPUTUSAN 4 — Jam berapa?

**Usul: 19:00 UTC (02:00 WIB).**

Bukan sekadar slot yang kosong. 20:00 UTC adalah `crm-refresh-customer-mirror`, yang menulis potret
harian yang dibaca layar direksi. Menjalankan pipeline **satu jam sebelumnya** berarti orang yang
dipromosikan malam itu terhitung di potret pagi harinya. Menjalankannya setelah 20:00 berarti setiap
orang baru terlambat satu hari penuh di layar direksi — dan tak akan ada yang bisa menjelaskan
kenapa angkanya tidak cocok.

Terpakai: 20:00, 20:30, 21:00 (`sync-ticket-events-daily`), tiap jam :00
(`cancel-expired-bookings`), tiap 5 menit (`crm-run-scheduled-sends`).

---

## Yang perlu dijawab lebih dulu, sebelum satu baris pun ditulis

1. **Keputusan 1** — tanpa ini, tak ada bentuk yang bisa dipilih.
2. **Keputusan 2** — menentukan berapa banyak yang dibangun.
3. Keputusan 3 dan 4 bisa menyusul; keduanya tidak mengubah bentuk, hanya perilakunya.

Dan satu hal yang bukan keputusan melainkan temuan, yang perlu diketahui pemilik apa pun
pilihannya:

> **127 baris `master_customer` punya `email` tetapi `email_normalized` NULL.** 28 di antaranya
> cocok dengan sumber-sumber ini. Pipeline yang men-dedup lewat `email_normalized` saja akan
> **membuat 28 duplikat orang yang sudah ada di CRM**, malam pertama ia jalan. Kunci dedup wajib
> `coalesce(email_normalized, email)`. Saya tidak memperbaiki 127 baris itu di putaran ini —
> itu tulisan ke `master_customer`, dan putaran ini nol tulisan.
