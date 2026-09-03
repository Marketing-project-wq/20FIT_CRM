# ESKALASI — `crm_send_config.daily_limit` tidak membatasi apa yang namanya janjikan

**Untuk:** pemilik produk. **Tanggal:** 3 September 2026.
**Status:** keputusan belum diambil. **Tidak ada perbaikan yang dibangun** — dokumen ini menyajikan
temuan, dampaknya pada keputusan yang sudah Anda ambil, dan tiga opsi dengan trade-off masing-masing.
Memilih di antaranya adalah keputusan Anda, bukan keputusan agen.

---

## 1. Dua temuan, satu kesimpulan

### T-43 — kegagalan tidak memakan budget

`lib/crm/send-run.ts`: `budget--` berada di dalam blok `try`, **setelah** pengiriman berhasil dicatat.
Cabang `catch` tidak pernah menyentuh budget.

**Bukti terukur (3 Sep 2026):** `daily_limit` = 1000; `crm_message_log` bertambah **18.243 baris**
pada hari itu. Budget hanya turun **124** kali sepanjang run, tak pernah mencapai 0, jadi **nol**
penerima ditangguhkan dan 18.119 percobaan gagal berjalan tanpa rem apa pun.

### T-44 — keberhasilan keluar dari penghitung

`todaySentCount()` (`lib/crm/send-campaign.ts`) menghitung `crm_message_log` dengan
`.eq("status","sent")` saja. Webhook Mailtrap memindahkan baris yang sama ke `delivered`
(`app/api/mailtrap/webhook/route.ts`, `patch.status = effect.status`; penjaga replay isi-jika-NULL
tepat di bawahnya). Baris yang paling terbukti berhasil justru berhenti dihitung.

**Bukti terukur untuk 3 Sep 2026:**

```
todaySentCount() akan mengembalikan : 2
Diterima provider hari itu (2xx)    : 124
→ 98,4% pengiriman berhasil hilang dari penghitung plafon
```

**Batas dampaknya, dinyatakan apa adanya:** `todaySentCount()` dipanggil **sekali** di awal run;
di dalam run budget dilacak di memori. Maka dalam **satu** run kebocoran ini tidak berpengaruh —
budget in-memory tetap membatasi. Yang nyata adalah **lintas run dalam hari yang sama**: run kedua
membaca `alreadyToday` = 2 → budget = 998, padahal 124 sudah terkirim. Rantai tiga kampanye berarti
plafon 1000 berlaku **per kampanye**, bukan per hari.

### Kesimpulan gabungan

> `crm_send_config.daily_limit` bukan plafon harian atas apa pun. Ia membatasi **pengiriman berhasil
> di dalam satu run**, dan tidak lebih.

---

## 2. Kenapa ini keputusan Anda, bukan perbaikan rutin

Keduanya menyentuh keputusan yang sudah Anda ambil:

1. **Jatah 300 workflow / 700 manual** (`docs/PETA-WORKFLOW.md` §7, 31 Agu 2026) membaca **penghitung
   yang sama**. Kalau penghitungnya berubah arti, pembagian 300/700 juga berubah arti — sebuah
   workflow yang hari ini "aman di bawah 300" bisa besok menabrak plafon, atau sebaliknya.
2. **Ramp bertahap** di `docs/RENCANA-batas-kirim.md` ("beberapa ratus per hari, naikkan ~2× tiap
   ~2 hari") seluruhnya bersandar pada plafon harian yang benar-benar harian. Sekarang tidak.
3. **Kampanye penyelesaian ke ~12.021 orang** (angka dari pemilik; tidak saya ukur ulang) harus
   dijalankan **lintas hari/run** — persis skenario
   yang dibocorkan T-44.

> **Rekomendasi operasional: kampanye penyelesaian sebaiknya TIDAK dijalankan sebelum keputusan ini
> diambil.** Dengan perilaku sekarang, plafon harian tidak akan menahannya seperti yang diharapkan.

---

## 3. Opsi (tidak dipilih — trade-off apa adanya)

### Opsi (a) — hitung semua baris ber-`provider_message_id`

Ganti `.eq("status","sent")` menjadi "baris hari ini yang punya `provider_message_id`" (atau
`sent_at is not null`).

- **Menyelesaikan:** T-44 sepenuhnya. Baris yang berpindah ke `delivered`/`bounced` tetap dihitung,
  karena penanda "provider menerimanya" tak pernah dicabut. Untuk 3 Sep angkanya jadi 124, bukan 2.
- **Tidak menyelesaikan:** T-43. Percobaan gagal tetap tak memakan budget.
- **Biaya:** paling kecil — satu perubahan query, tanpa migrasi, tanpa kolom baru. Arti "1000" tetap
  "1000 pengiriman berhasil per hari", jadi jatah 300/700 tetap terbaca seperti sebelumnya.
- **Risiko:** bergantung pada `provider_message_id`/`sent_at` selalu terisi saat diterima; hari itu
  memang begitu (124/124), tapi Mailtrap boleh mengembalikan 2xx tanpa `message_ids` — baris seperti
  itu akan lolos hitungan. Memakai `sent_at` menutup celah itu (diisi oleh kode kami, bukan provider).

### Opsi (b) — hitung PERCOBAAN, bukan keberhasilan

Kurangi budget untuk setiap percobaan (sukses maupun gagal), dan hitung semua baris hari ini.

- **Menyelesaikan:** T-43 dan T-44 sekaligus. Kejadian 18.243-baris-pada-hari-berplafon-1000 menjadi
  mustahil menurut definisi.
- **Biaya:** **mengubah arti angkanya.** "1000" berhenti berarti "1000 orang dihubungi" dan menjadi
  "1000 percobaan". Hari dengan banyak kegagalan akan menghabiskan plafon tanpa menghubungi siapa pun,
  sehingga kirim yang sah tertunda ke hari berikutnya. Jatah 300/700 harus dibaca ulang dan mungkin
  diangkakan ulang.
- **Risiko:** interaksi dengan retry — kalau nanti ada percobaan ulang otomatis, satu penerima bisa
  memakan beberapa jatah.
- **Catatan:** dengan berhenti-otomatis 20-kegagalan-beruntun (K-56) yang sudah dipasang sprint ini,
  skenario terburuk yang memotivasi opsi ini sudah jauh lebih kecil — run 3 Sep akan berhenti pada
  percobaan ke-20, bukan ke-18.119. Opsi (b) tetap bernilai untuk kegagalan yang **berselang-seling**
  (yang tak pernah membuat 20 beruntun), bukan untuk tembok.

### Opsi (c) — penghitung terpisah, dipersistensi, lepas dari status pesan

Tabel/kolom penghitung sendiri (mis. `crm_send_counter(day, attempts, successes)`), ditulis saat
kirim, dibaca saat menentukan budget.

- **Menyelesaikan:** T-43 dan T-44, **dan** memutus ketergantungan pada status pesan yang memang
  berubah sepanjang siklus hidupnya (`sent` → `delivered` → `bounced` → `complained`). Sumber
  kebocoran T-44 hilang secara struktural, bukan ditambal.
- **Memungkinkan:** memisahkan plafon **percobaan** dari plafon **berhasil** — dua angka untuk dua
  pertanyaan berbeda, yang kemungkinan besar memang yang Anda inginkan.
- **Biaya:** paling besar. Butuh migrasi (tabel baru + grant + RLS mengikuti pola 13 tabel `crm_*`),
  penulisan penghitung di jalur kirim, dan penanganan kasus proses mati di tengah run (penghitung bisa
  menyimpang dari log — sekarang tak mungkin, karena log **adalah** penghitungnya).
- **Risiko:** mengingkari aturan yang sengaja ditulis di `send-run.ts` aturan 3 — *"batas harian
  dihitung DARI LOG, tak pernah penghitung terpisah yang bisa menyimpang"*. Aturan itu ada karena
  penghitung terpisah pernah menyimpang di sistem lain. Kalau opsi (c) dipilih, aturan 3 harus dicabut
  **secara sadar** dan diganti aturan rekonsiliasi (mis. penghitung diverifikasi ulang terhadap log
  tiap hari), bukan diam-diam dilanggar.

---

## 4. Yang TIDAK boleh ikut berubah

- **`daily_limit` sebagai `failure_cause` tetap tidak ditulis siapa pun.** Nilai `'daily_limit'` ada di
  `crm_message_log_failure_cause_check` tapi **tak ada satu jalur kode yang menulisnya** — penerima di
  atas budget **ditangguhkan** (dibiarkan tak ter-claim untuk run berikutnya), bukan digagalkan.
  Terkonfirmasi 3 Sep 2026. Apa pun opsi yang dipilih, jangan mulai menulisnya: "ditunda" dan "gagal"
  adalah dua hal berbeda, dan menyatukannya adalah kelas kesalahan yang sama dengan T-40.
- **Auto-stop bounce 5%** tak pernah dikopel ke batas harian (aturan pemilik e). Berlaku juga untuk
  ambang 20-kegagalan-beruntun (K-56).

## 5. Apa yang perlu dari Anda

1. Pilih (a), (b), (c), atau kombinasi — atau nyatakan perilaku sekarang dapat diterima dengan
   plafon dibaca ulang sebagai "per run".
2. Kalau jatah 300/700 perlu diangkakan ulang setelah arti penghitung berubah, sebutkan angkanya.
3. Konfirmasi apakah kampanye penyelesaian (~12.021 orang, angka Anda) ditahan sampai keputusan ini diambil.
