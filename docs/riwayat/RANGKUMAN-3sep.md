# Rangkuman Pekerjaan — 20FIT CRM

**Repo:** `Marketing-project-wq/20FIT_CRM`
**Periode:** 31 Agustus – 3 September 2026
**Deploy:** merge ke `main` = deploy produksi otomatis lewat Railway (`crm.20fit.id`)
**Database:** Supabase plan Pro, backup harian (retensi 7 hari). Tidak ada staging — database yang ada adalah produksi.

> **Catatan bertanggal.** Isi utama di bawah adalah rekaman keadaan **pagi/siang 3 Sep 2026**.
> Beberapa butir maju di hari yang sama; lihat **"Pembaruan pasca-rangkuman (3 Sep 2026)"** di
> akhir berkas. Sesuai konvensi folder ini, badan rangkuman TIDAK diedit surut — ia rekaman apa
> yang diyakini saat itu; perubahan setelahnya dicatat terpisah dan bertanggal.

---

## Status PR

| PR | Judul | Status |
|----|-------|--------|
| #23 | Nama kampanye wajib + bounce-back segmen | **Merged** (`187431b`) |
| #24 | Backfill label + NOT NULL + celah spasi cron | **Merged** (`515ecb2`) |
| #25 | Preview "Pilih Template Awal" terbaca | **Merged** |
| #26 | Fix Asisten AI HTTP 524 | **Merged** |
| #27 | Impor CSV audiens (Fase 1) | **Merged** — migrasi TERTAHAN |
| #28 | Kriteria multi-nilai program + RFM | **Merged** (`8ac07c3`) |
| #29 | Dedup email-primer + laporan per-baris | **Draft** — ada pemblokir |
| #30 | Fix fokus input nama kampanye | **Draft** — siap merge |

---

## Yang sudah selesai

### Nama kampanye wajib (#23, #24)

Nama kampanye dulu opsional; kalau kosong sistem membuat nama otomatis dari segmen + tanggal. Sekarang wajib diisi (3–100 karakter), divalidasi di klien dan server. Resume run dikecualikan supaya kampanye berjalan tidak rusak.

Sembilan baris lama tanpa nama sudah di-backfill dengan format `{segmen} · {tanggal} {HH:MM}`, lalu kolom `label` dan `run_label` diberi constraint `NOT NULL`. Empat baris berlabel ISO (`Terjadwal 2026-08-31T06:00...`, `UJI kirim internal <ISO>`) ikut dirapikan ke format yang sama. Nol label ISO tersisa.

Celah spasi di jalur cron ditutup: `??` diganti `?.trim() ||`, supaya `run_label` berisi spasi tidak lolos lalu jadi NULL setelah constraint aktif.

### Bounce-back segmen (#23)

Link "Buat segmen baru" dulu melempar operator ke `/segments` yang ternyata cuma redirect ke `/campaigns`, sehingga draft kampanye hilang. Sekarang link menuju tab Segmen dengan draft tersimpan di `sessionStorage`, dan saat kembali draft dipulihkan serta segmen baru terpilih otomatis.

Diuji enam skenario di browser, termasuk tombol back browser dan draft berformat rusak. Semua lulus.

### Preview template (#25)

Thumbnail keempat starter dulu tampil sebagai gumpalan kecil di pojok — `transform: scale` tidak mengubah kotak layout, sehingga iframe 480×320 meluber di kontainer 250×160. Diperbaiki dengan iframe pada lebar asli 600px dan skala dihitung dari lebar kontainer.

Tinggi konten tiap template diukur sekali dengan headless browser lalu dibakukan sebagai `previewCropPx`, jadi tidak ada ekor abu-abu kosong. Mobile memakai crop 300px — angka ini dipilih karena 260px akan memotong tombol "Klaim Sekarang" di kartu Promo.

### Asisten AI (#26 + konfigurasi)

Perjalanan diagnosis yang panjang, dengan tiga hipotesis yang terbantahkan:

1. **HTTP 524** — `fetch` ke model dipanggil tanpa `AbortController`, jadi request menggantung sampai edge proxy memutus di ~100 detik. Diperbaiki dengan timeout 25 detik + pesan error yang bisa ditindaklanjuti.
2. **API key hilang** — salah. Ketiga variabel ada dan terisi.
3. **Slug model salah** — salah. `deepseek/deepseek-v4-flash-0731` valid di katalog OpenRouter.

Penyebab sebenarnya ditemukan dari Railway Deploy Logs: `ai_unavailable { code: 'empty model reply', status: null }`. `status: null` berarti HTTP 200 — panggilan berhasil, tapi isinya kosong. DeepSeek V4 Flash adalah model reasoning yang menaruh keluaran di field `reasoning`, sementara kode hanya membaca `message.content`.

Diperbaiki dengan mengganti `SEGMENT_AI_MODEL` ke `deepseek/deepseek-chat`. **Nol perubahan kode.**

**Temuan penting:** audit log menunjukkan asisten AI tidak pernah berhasil sekali pun sejak dipasang. Fitur ini live di produksi, terpasang rapi di UI, dan tidak ada yang menyadarinya sampai operator kebetulan mencobanya.

### Kriteria multi-nilai (#28)

`srcProgram` dan `srcRfm` dulu bertipe `string | null` — hanya satu nilai. Karena itu dropdown single-select, dan AI tidak bisa mengusulkan "Half + Double" meski permintaannya jelas.

Sekarang keduanya array. Semantiknya OR di dalam kriteria, AND antar-kriteria. Sanitizer menerima format lama (string → array satu elemen), jadi tidak perlu migrasi data — dan memang 0 dari 8 segmen tersimpan memakai `srcProgram`.

Diverifikasi pada data produksi: Half 71 + Double 80 = 151 gabungan, tumpang-tindih 0. Empat kategori Sportfest v.02 = 244. Union terbukti OR, bukan intersect.

Cap 10 nilai per kriteria dipasang di sanitizer (server), bukan hanya UI.

Gate klinis dijaga lockstep antara jalur AI dan jalur manual lewat test tripwire yang membandingkan keduanya per-fixture.

---

## Yang masih menggantung

### #29 — Pemblokir: celah suppression

Dedup diubah ke email-primer: cocok email → lewati; cocok telepon saja → tetap masuk dengan tanda "telepon bersama". Alasannya nomor telepon lazim dipakai bersama (pasangan, orang tua, nomor kantor), sehingga aturan lama menghapus orang sah secara diam-diam.

**Masalahnya:** implementasi me-null-kan telepon saat menulis (demi indeks unik). Karena `fetchSuppressedCustomerIds` mencocokkan lewat `phone_normalized` dan `email_normalized`, orang yang pernah men-suppress dirinya lewat nomor telepon bisa lolos dari suppression.

Claude Code sudah mengonfirmasi celah ini nyata. Rekomendasi perbaikannya belum diajukan.

Opsi yang sedang dipertimbangkan:
- Simpan nomor di kolom/tag terpisah — perlu dipastikan apakah suppression tetap mencocokkannya
- Longgarkan indeks unik telepon — perubahan skema lebih besar
- Tetap null-kan, tapi catat di laporan
- **Periksa status suppression dulu sebelum memutuskan cara impor** — kemungkinan paling bersih

### #30 — Siap merge

Input "Nama kampanye" kehilangan fokus tiap ketukan. Penyebabnya `Step` didefinisikan di dalam badan `CampaignFlow`, sehingga tiap render memberi identitas fungsi baru dan React membuang subtree beserta fokusnya.

Diperbaiki dengan hoist ke module scope. Ditambah test guard yang gagal kalau ada komponen React didefinisikan bersarang lagi.

**Catatan:** bug ini lolos dari semua gate — tsc, eslint, vitest, build semuanya hijau. Hanya ketahuan saat ada manusia yang mengetik.

### Migrasi impor CSV — tertahan

Migrasi `crm_ingest_csv_people` belum diterapkan. Konsekuensinya wizard bisa dibuka dan dry-run bisa jalan (nol tulisan), tapi fase execute gagal dengan "Gagal memproses impor. Coba lagi."

Dry-run sudah diuji dengan file contoh: 5 terbaca, 5 email valid, 1 duplikat, 4 masuk. Duplikatnya cocok lewat telepon, bukan email — mendemonstrasikan langsung risiko yang mendorong perubahan dedup di #29.

### Temuan dari uji file asli

- **Telepon rusak jadi notasi ilmiah.** File asli berisi `6,28129E+12` — Excel mengubah nomor telepon panjang dan digitnya hilang permanen. Akan terjadi di hampir setiap file yang pernah dibuka di Excel. Perlu deteksi dan peringatan.
- **File uji hanya berisi 1 baris**, padahal nama filenya menyebut 50. Ekspor kemungkinan terpotong.
- **Delimiter titik koma** (`;`) berhasil terdeteksi otomatis, perlu dikonfirmasi apakah andal.

---

## Ditunda (sengaja)

**RPC-OR.** Sekarang N program = N panggilan RPC. Satu query OR akan membuatnya 1 panggilan. Rencana siap, belum dikerjakan.

**Auto-count debounce.** Hitungan tidak ter-update saat chip ditambah/dihapus, jadi operator bisa memilih empat program tanpa melihat hasilnya membengkak. Menunggu RPC-OR dulu supaya panggilannya murah.

**Index pada join email — TIDAK dibuat, dan ini keputusan.** Satu RPC = 75 ms karena dua tabel di-seq-scan. Tampak seperti kasus jelas untuk menambah index, tapi pengukuran membuktikan sebaliknya: dengan functional index pada email, query justru jadi **1.164 ms — 15× lebih lambat**. Penyebabnya predikat selektif ada di kolom program (73 dari 88.536 baris), bukan email; index email menggoda planner memilih merge join yang menyapu seluruh index master. Diuji dengan `CREATE INDEX` dalam transaksi lalu `ROLLBACK`.

**Materialisasi keanggotaan program.** Akan memperbaiki setiap hitungan segmen, tapi keputusan sistemik yang lebih besar.

**Impor Excel (.xlsx).** Butuh library binary. CSV dulu.

**Terjemahan layar Templates.** Masih hardcoded Indonesia, belum masuk `BILINGUAL_SCREENS`.

**Tabel riwayat impor.** `crm_import_batch` ternyata tidak pernah dibuat — "batch" cuma UUID di `tags` dan `evidence`. Rollback per-batch tetap jalan, tapi tidak ada satu tempat untuk melihat riwayat impor.

---

## Keputusan kebijakan

**Consent untuk impor CSV.** Sempat diputuskan konservatif (`legacy_import_unverified`, tidak boleh dipasarkan), lalu dikoreksi: baris impor **langsung contactable**, karena consent sudah diberikan di titik pengumpulan dan impor hanya memindahkan data yang seharusnya sudah ada di Supabase.

Field "sumber pengumpulan" tetap **wajib** — bukan sebagai gerbang, tapi sebagai bukti. Kalau suatu saat ditanya kenapa seseorang dikirimi email, jawabannya harus ada di data.

Konflik dokumentasi antara K-36 dan `RENCANA-ingest-ticket.md` dikoreksi dengan catatan bertanggal, membedakan `csv_import` (provenance diketahui) dari `legacy_import_unverified` (provenance tidak diketahui), supaya tidak jadi preseden untuk daftar pihak ketiga.

**Telepon palsu di master:** ~150 dari 81.680 (~0,2%) berpola jelas palsu. Kecil, bukan sistemik. Tidak dibersihkan.

**"Sportfest 2 dan 3" tidak ada di data.** Yang ada hanya Sportfest v.02 (Half, Relay, Double, Single). Multi-select memperbaiki "Half + Double", tapi kosakata "Sportfest 2/3" tetap tidak eksis. Menunggu klarifikasi dengan operator — tidak ada kosakata ditambahkan berdasarkan tebakan.

---

## Insiden keamanan

`SEGMENT_AI_API_KEY` (OpenRouter) sempat terekspos penuh dalam screenshot dashboard Railway. Key sudah dirotasi dan di-deploy ulang.

Belum dicek: riwayat penggunaan di dashboard OpenRouter, untuk memastikan tidak ada pemakaian yang bukan dari Anda.

---

## Pola yang muncul berulang

Tiga kali dalam periode ini, sesuatu yang terlihat sehat ternyata tidak berfungsi:

1. **Asisten AI** — gate hijau, test lulus, nol keberhasilan sejak dipasang
2. **Fokus input nama kampanye** — semua gate hijau, tapi tidak bisa diketik manusia
3. **Celah suppression di #29** — tidak akan ada yang mengeluh, karena tidak ada yang tahu email terkirim ke orang yang seharusnya tidak menerimanya

Ketiganya lolos dari tsc, eslint, vitest, dan build. Yang menemukan bukan monitoring, melainkan operator yang kebetulan mencoba memakainya — dan untuk kasus ketiga, tidak akan pernah ada operator yang menemukannya sama sekali.

Ini alasan kuat untuk membangun diagnostik yang bisa dibaca admin: satu tempat yang menampilkan kapan terakhir tiap integrasi berhasil. Usulannya sudah diminta, belum diajukan.

---

## Langkah berikutnya

1. **Merge #30** — bug produksi, operator tidak bisa mengetik nama kampanye
2. **Selesaikan celah suppression di #29** — rekomendasi perbaikan, lalu implementasi
3. **Tambahkan deteksi telepon notasi ilmiah** ke #29
4. **Siapkan file CSV asli yang benar** — kolom telepon diformat sebagai Teks, pastikan berisi semua baris
5. **Ulangi dry-run dengan file asli** — periksa pemetaan kolom dan angka duplikat
6. **Baru putuskan penerapan migrasi impor**
7. RPC-OR → auto-count debounce
8. Diagnostik admin
9. Klarifikasi "Sportfest 2/3"
10. Cek riwayat penggunaan OpenRouter

---

## Pembaruan pasca-rangkuman (3 September 2026)

Butir-butir berikut maju **setelah** rangkuman di atas ditulis, di hari yang sama. Dicatat
terpisah agar badan rangkuman tetap menjadi rekaman bertanggal apa adanya.

**#30 — MERGED.** Fix fokus (hoist `Step` ke module scope + test guard anti-komponen-bersarang)
sudah di-merge ke `main` dan ter-deploy. Langkah berikutnya #1 tuntas.

**#29 — Langkah berikutnya #3 (deteksi telepon notasi ilmiah) tuntas + dua tambahan transparansi**,
sudah di-push (tetap Draft, migrasi tetap tertahan):

- **Telepon rusak format Excel.** `isExcelBrokenPhone()` mendeteksi pola notasi ilmiah
  (`6,28129E+12`, `6.28129E+12`, `6E+12`). Teleponnya **dikosongkan, tidak ditebak**; baris tetap
  masuk kalau emailnya valid; dihitung sebagai kategori tersendiri di ringkasan/laporan ("Telepon
  rusak (format Excel) — N baris") beserta cara memperbaiki (format kolom sebagai **Teks** lalu
  ekspor ulang). Diperiksa juga: `normalizePhoneID("6,28129E+12")` **mengembalikan `null`, bukan
  sampah** — jadi nomor rusak tidak pernah tersimpan di DB; deteksi ini menambah keterlihatan, bukan
  menambal integritas data.
- **Delimiter.** papaparse auto-detect `, ; \t |` andal untuk kasus normal; gagal saat pemisah juga
  muncul sebagai isi di banyak baris, atau file satu kolom. Layar pemetaan kini menampilkan pemisah
  terdeteksi + jumlah kolom, dengan peringatan bila hanya 1 kolom terbaca (gejala klasik file
  `;`/tab salah dibaca sebagai koma).
- **Kolom tak terpetakan.** Ringkasan kini menyebut kolom yang di-"abaikan" (mis. "Event") — drop
  diam-diam adalah cara data hilang tanpa ketahuan.

Gate hijau (tsc, eslint, 1289 test, build). Test menambah cakupan `isExcelBrokenPhone` + jalur
normalize/plan.

**Celah suppression #29 — rekomendasi kini SUDAH diajukan** (menunggu keputusan pemilik, belum
dikoding). Evaluasi opsi:

- **(a) Simpan nomor mentah di kolom terpisah** — **tidak menutup celah**;
  `fetchSuppressedCustomerIds` hanya membaca `phone_normalized`/`email_normalized`, tidak membaca
  kolom lain.
- **(b) Longgarkan indeks unik telepon** — satu-satunya yang menutup **sekarang + masa depan**
  sepenuhnya, tapi mengubah invariant master (banyak hal bersandar padanya); tidak proporsional
  untuk kasus telepon-bersama yang jarang.
- **(c)** varian relaksasi/penanda lain — tidak setara (b), tidak menutup penuh.
- **(d) [rekomendasi]** saat impor, bila telepon cocok kontak yang ADA **dan** telepon itu sedang
  ter-suppress → jangan buat identitas bisa-dikontak dari baris itu (lewati). Email-primer tetap
  untuk kasus lain. Hanya di tingkat planner (`loadKeys` sudah memuat `suppressedPhones` +
  `existingPhones`), **tanpa perubahan skema**, tanpa over-suppression. Menutup celah **sepenuhnya
  untuk data yang ada saat impor**. Batas jujur: bila seseorang ber-telepon-bersama meng-*unsubscribe*
  **setelah** impor, telepon yang sudah di-null tetap tak tercocokkan — hanya ditutup penuh oleh (b).
  Saran: **(d) sekarang** + catat (b) sebagai opsi masa-depan bila telepon-bersama terbukti sering.
