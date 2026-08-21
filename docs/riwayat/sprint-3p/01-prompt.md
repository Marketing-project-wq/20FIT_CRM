# CLAUDE CODE PROMPT — Sprint 3P: Profil Lengkap, Filter AND/OR, dan Kerapian Data

> **Sprint besar. Lima pekerjaan, dan yang pertama menggerbangi sebagian yang lain.**
> Kalau terlalu besar untuk satu siklus, kerjakan TUGAS 1–3 lebih dulu dan laporkan
> TUGAS 4–5 sebagai sisa — jangan dipaksakan selesai setengah-setengah.

---

## TUGAS 1 — Consent: catat, jangan diasumsikan

Pemilik produk menyatakan: **seluruh data yang masuk sudah memiliki consent dari setiap
user, sehingga legal dipakai untuk marketing dan Customer Service.**

Pernyataan itu diterima. Yang **tidak** boleh dilakukan adalah menanamkannya sebagai
perilaku diam-diam — misalnya dengan membuat `isContactableForMarketing` mengembalikan
`true` untuk semua orang, atau melewati pemeriksaan consent. Seluruh arsitektur ini
dibangun di atas satu prinsip: **ketiadaan baris = penolakan** (K-03). Kalau consent-nya
memang ada, cara yang benar adalah **mencatatnya**, bukan mengasumsikannya. Itulah gunanya
`crm_consent`.

Bedanya besar dan praktis: consent yang tercatat bisa ditunjukkan saat ditanya, bisa
dicabut per orang, dan meninggalkan jejak audit. Consent yang diasumsikan tidak bisa
satu pun dari ketiganya.

**Sebelum menulis kode, kumpulkan dan tulis di `docs/SIGNOFF-legal-consent.md`:**

1. **Siapa yang menyatakan, kapan, dan mencakup sumber apa saja.** Sumbernya berbeda-beda
   — pendaftaran event, pasien clinic, booking arena, pengguna my20fit. Consent untuk satu
   sumber bukan consent untuk semuanya.
2. **`basis` mana yang dicatat.** CHECK constraint migrasi 3 hanya menerima dua nilai:
   `legacy_import_unverified` dan `explicit_opt_in`. Data impor massal 20 April 2026 —
   di mana `first_seen_at` seluruhnya cap waktu muat — tidak bisa jujur disebut
   `explicit_opt_in` kecuali ada catatan opt-in per orang yang bisa ditunjuk. Kalau
   catatannya ada, sebutkan di mana. Kalau tidak ada, `legacy_import_unverified` adalah
   nilai yang benar, dan itu bukan penghalang — asal keputusan berikutnya diambil sadar.
3. **Apakah `legacy_import_unverified` mengizinkan `purpose='marketing'`.** Ini keputusan
   pemilik produk dan legal, **bukan keputusanmu**. Mendaftar untuk lomba lari adalah
   consent untuk penyelenggaraan lomba; apakah ia juga consent untuk kirim promo adalah
   pertanyaan terpisah, dan UU 27/2022 memperlakukannya terpisah.

**Yang kamu bangun:** peta eksplisit `basis` → `purpose` yang diizinkan, di **satu**
modul, dengan test. Bukan tersebar di route, bukan implisit di query. Sehingga saat
keputusannya berubah, yang berubah satu tabel di satu berkas — dan siapa pun bisa melihat
aturan yang sedang berlaku tanpa membaca seluruh kode.

**Backfill consent HANYA setelah nomor 1–3 terjawab tertulis.** Bila diizinkan, tulis
lewat fungsi atomik (K-14, pola `crm_record_suppression`), satu `basis` yang jujur,
`evidence` yang menunjuk sumbernya, dan **suppression tetap menang** (K-13). Kalau belum
terjawab, kerjakan TUGAS 2–5 dan tinggalkan backfill-nya — sisanya tidak bergantung padanya.

---

## TUGAS 2 — Lengkapi profil dari sumber ekosistem

Sprint 3N sudah menyambungkan `customer_engagement` (99,8% cakupan, kaitan bersih). Sisanya
butuh pencocokan identitas, dan hasilnya **jauh lebih rendah** dari yang mungkin diharapkan.
Terverifikasi 11 Agustus 2026 lewat email ternormalisasi:

| Sumber | Baris | Cocok ke `master_customer` |
|---|---|---|
| `cf_hyrox_participants` | 1.038 (semua punya email) | **288** |
| `my20fit_profile` | 886 | **169** |
| `my20fit_user_activity` | 175 | 44 |
| `rc_team_members` | 1.545 | **tidak bisa** — hanya berkunci `name` |

**NIK tidak bisa dipakai sebagai kunci pencocokan.** `master_customer` tidak punya kolom
NIK, jadi NIK bukan jembatan — ia hanya data baru yang menempel **setelah** profilnya
tercocokkan lewat email. Sebutkan ini di laporan; ini kekeliruan yang wajar tapi mahal
kalau terlanjur dibangun.

**Aturan:**

- Pencocokan **wajib** lewat `normalize.ts` (K-06). Jangan bandingkan string mentah.
- **Nol tulis ke `master_customer` dan `crm_*`.** Baca dan gabungkan saat tampil, sama
  seperti `customer_engagement`. Menyalin akan membekukan salinan yang langsung basi.
- Laporkan tingkat kecocokan **di layar**, bukan hanya di laporan. Profil yang tidak
  tercocokkan harus terbaca "tidak ada data Hyrox untuk profil ini", bukan seolah orangnya
  tidak pernah ikut.
- `rc_team_members` **jangan dicocokkan lewat nama.** Nama tidak unik; salah cocok berarti
  menempelkan riwayat orang lain ke profil seseorang. Catat sebagai tidak bisa dipakai.

**Field sensitif — NIK, tanggal lahir, golongan darah, kontak darurat — digerbangi
`profile.view_health`** (`super_admin` dan `crm_manager` saja, per matriks PRD 17.2).
Untuk peran lain: disamarkan di server, seperti telepon dan email (K-02). NIK ditampilkan
tersamar secara default bahkan untuk yang berhak, dengan aksi eksplisit untuk membukanya,
dan **setiap pembukaan diaudit**. Nomor identitas kependudukan bukan field biasa di layar CS.

---

## TUGAS 3 — Filter AND/OR

Segment builder sekarang hanya bisa AND. Bangun kombinasi yang sebenarnya dibutuhkan —
"punya email **ATAU** punya nomor HP", "unit arena **ATAU** unit event", digabung **DAN**
dengan kriteria lain.

**Bentuk:** pohon predikat dengan grup. Satu grup punya operator (`AND`/`OR`) dan berisi
kondisi atau grup lain. Batasi kedalaman (dua tingkat sudah cukup untuk hampir semua
kebutuhan nyata) dan batasi jumlah kondisi — bukan karena performa, tapi karena filter
yang tak bisa dibaca manusia menghasilkan segmen yang tak bisa dipertanggungjawabkan.

**Yang wajib:**

- **Tampilkan kembali filternya dalam kalimat**, di atas hasilnya — "punya email ATAU
  punya telepon, DAN unit arena". Orang harus bisa membaca apa yang baru saja ia bangun
  sebelum mempercayai angkanya.
- Bangun sebagai **fungsi murni** yang mengubah pohon jadi kueri, dengan test untuk setiap
  bentuk: AND datar, OR datar, OR di dalam AND, grup kosong, satu kondisi. PostgREST punya
  batas pada logika bersarang — kalau sebuah bentuk tidak bisa diungkapkan dengan jujur,
  **tolak bentuk itu di validasi**, jangan diam-diam menyederhanakannya jadi sesuatu yang
  lain. Filter yang diam-diam berubah arti adalah kegagalan terburuk di layar ini.
- Struktur pohonnya masuk `metadata` audit (nilai dari daftar tertutup; teks bebas kena
  cap panjang, K-17).
- Aturan PRD §18.8 tidak berubah: setiap jumlah tampil berpasangan dengan jumlah yang boleh
  dihubungi. Bila TUGAS 1 belum menghasilkan backfill, angka kedua tetap 0 — dan itu benar.
- Tetap **tanpa** kriteria berbasis waktu (K-19).

---

## TUGAS 4 — Nama rapi, di lapisan tampilan

Kondisi sekarang, verifikasi ulang: **30.307** nama campur-aduk, **23.415** huruf kecil
semua, **3.525** kapital semua, 24.997 sudah rapi. Ada 43 nama bergelar dan 281 mengandung
angka.

**Jangan `UPDATE master_customer`.** Tabel itu dipakai sistem lain di proyek bersama ini,
dan aturannya read-only sejak Sprint 2. Rapikan **saat menampilkan** — fungsi murni,
dipakai semua layar, ditest.

`initcap()` Postgres dan `.toUpperCase()` naif akan merusak nama Indonesia. Tangani:

- **Gelar dan sapaan** — `H.`, `Hj.`, `dr.`, `Drs.`, `Ir.`, `S.Pd`, `M.M.` tetap pada
  bentuk lazimnya; `dr.` huruf kecil bukan salah ketik
- **Inisial** — `A.M. Rizki`, jangan jadi `A.m. Rizki`
- **Partikel dan awalan** — `bin`, `binti`, `van`, `de` mengikuti kebiasaan penulisannya
- **Tanda hubung dan apostrof** — `Nur-Aini`, `D'Souza` dikapitalisasi di kedua sisi
- **Spasi ganda dan spasi tepi** — 38 baris; rapikan saat tampil
- **Nama mengandung angka** — 281 baris; kemungkinan besar data sampah. **Tandai, jangan
  perbaiki.** Munculkan di `/quality` sebagai anomali seperti LTV negatif

Simpan **nama asli** tetap terlihat di detail profil, berdampingan dengan versi rapinya.
Kalau seseorang mencari lewat nama asli, ia harus tetap menemukannya — pencarian tetap
berjalan atas kolom sumber, bukan atas versi tampilan.

---

## TUGAS 5 — Email typo: tandai, jangan perbaiki sendiri

Terverifikasi 11 Agustus 2026:

| Domain | Baris |
|---|---|
| `gmaol.com` | **986** |
| `gmail.con` | 204 |
| `gmai.com` | 82 |
| `gamil.com` | 49 |

**986 baris `gmaol.com` hampir pasti bukan 986 salah ketik independen.** Pola sebesar itu
menunjuk kerusakan sistematis saat impor — find/replace yang meleset, atau pemetaan kolom
yang salah. **Selidiki dulu.** Kalau memang sistematis, hal yang sama mungkin mengenai
kolom lain, dan itu temuan yang jauh lebih besar daripada daftar typo. Laporkan apa pun
yang kamu temukan sebelum menyentuh satu pun baris.

**Koreksi otomatis DILARANG.** Mengubah alamat email seseorang berdasarkan tebakan bisa
mengirimkan data pribadinya ke orang lain — kerugiannya tak bisa ditarik kembali, dan
korbannya adalah orang yang tidak melakukan kesalahan apa pun. Yang dibangun:

- **Deteksi** kandidat typo lewat daftar domain yang dikenal + jarak edit ke domain populer.
  Tampilkan sebagai **saran** dengan tingkat keyakinannya
- **Konfirmasi manusia per baris.** Nol koreksi massal, nol tombol "perbaiki semua"
- Koreksi yang disetujui **tidak menimpa `master_customer`** — simpan sebagai koreksi milik
  CRM dengan nilai asli tetap utuh dan baris audit per koreksi. Nilai asli harus selalu
  bisa dilihat dan dipulihkan
- Perlakukan sebagai **jalur tulis**, jadi K-14 berlaku: satu transaksi dengan auditnya.
  Ini butuh tabel dan fungsi baru — **tulis rencananya dulu** di
  `docs/RENCANA-koreksi-kontak.md`, jangan bangun migrasinya di sprint yang sudah sepadat ini
- Domain yang mirip tapi sah harus lolos: `gmail.co.uk`, `yahoo.co.id` bukan typo

Sebelum itu semua siap, tampilkan saja **tandanya** di detail profil dan hitungannya di
`/quality`. Menandai sudah bernilai; menebak tidak.

---

## LARANGAN

| Jangan | Alasan |
|---|---|
| Jangan membuat consent dianggap ada tanpa baris `crm_consent` | K-03: ketiadaan baris = penolakan. Catat, jangan asumsikan |
| Jangan backfill consent sebelum `basis` dan cakupan sumbernya tertulis | CHECK constraint hanya menerima dua nilai; salah pilih sulit diperbaiki |
| Jangan `UPDATE` / `INSERT` ke `master_customer` | Read-only sejak Sprint 2; dipakai sistem lain |
| Jangan koreksi email otomatis atau massal | Salah koreksi = kirim data pribadi ke orang lain |
| Jangan cocokkan `rc_team_members` lewat nama | Nama tidak unik; salah cocok = riwayat orang lain menempel di profil |
| Jangan pakai NIK sebagai kunci pencocokan | `master_customer` tak punya kolom NIK |
| Jangan tampilkan NIK tanpa gerbang, masking default, dan audit per pembukaan | Nomor identitas kependudukan |
| Jangan diam-diam menyederhanakan filter yang tak bisa diungkapkan | Filter yang berubah arti adalah kegagalan terburuk di layar itu |
| Jangan sediakan kriteria berbasis waktu | K-19: seluruh kolom waktu cap muat |
| Jangan menyalakan RLS di tabel tim lain | Fase 0; eskalasi sudah ada di `docs/ESKALASI-paparan-data-sensitif.md` |
| Jangan buat migrasi selain yang diizinkan TUGAS 1 | Satu perubahan skema per siklus |
| Jangan merge atau push ke `main` tanpa izin eksplisit | Produksi sedang dipakai orang |
| Jangan hapus prefix `NODE_ENV=production` di `railway.json` | Baca README dulu |

---

## LAPORAN PENUTUP

1. **Status remote + kondisi database**
2. **Consent** — apa yang sudah tertulis, apa yang masih terbuka, peta `basis`→`purpose`
   yang kamu bangun, dan apakah backfill dijalankan atau ditahan **beserta alasannya**
3. **Pelengkapan profil** — tingkat kecocokan yang kamu ukur sendiri, bagaimana profil tak
   tercocokkan dijelaskan di layar, dan bagaimana NIK digerbangi
4. **Filter AND/OR** — bentuk yang didukung, bentuk yang **ditolak** dan kenapa, dan
   bagaimana filternya dibacakan kembali ke pengguna
5. **Nama** — aturan yang kamu terapkan, kasus yang diuji, dan bagaimana nama asli tetap
   terlihat serta tetap bisa dicari
6. **Email** — hasil penyelidikan `gmaol.com`: sistematis atau tidak, dan buktinya
7. **Yang ditemukan tapi tidak disentuh**
8. **Yang TIDAK bisa kamu verifikasi**

Gate akhir: `tsc --noEmit` bersih, `next lint` bersih, seluruh test hijau,
`NODE_ENV=production npm run build` lulus. Sebutkan jumlah test sebelum dan sesudah.

Jangan klaim apa pun yang belum kamu jalankan dan lihat hasilnya.

# SELESAI — AKHIR PROMPT
