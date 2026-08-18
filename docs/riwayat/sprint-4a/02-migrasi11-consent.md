# CLAUDE CODE PROMPT — Migrasi 11: Backfill Consent (marketing + transactional)

> **Keputusan pemilik produk: JALANKAN migrasi 11**, dengan tiga perbaikan dan satu
> perluasan cakupan.
>
> **CS termasuk.** Backfill harus menulis `purpose='transactional'` juga, dengan
> `phone_call` sebagai channel — karena arus kerja yang paling sering dipakai staf adalah
> menelepon pelanggan untuk urusan layanan, dan itu bukan marketing. Tanpa ini, sistem akan
> menganggap pelanggan tak boleh dihubungi tepat saat CS paling butuh menghubunginya.
>
> Temuanmu soal `clinic_consents` benar dan penting: consent tindakan klinis (general,
> data_privacy, physiotherapy, sport_massage — per kunjungan, bertanda tangan) bukan
> consent kontak marketing. `legacy_import_unverified` untuk semua orang adalah pilihan
> yang jujur. Pertahankan.

---

## TIGA PERBAIKAN SEBELUM JALAN

**1. `grant execute ... to service_role` hilang.** SQL usulanmu hanya punya `revoke`.
Fungsi ini mungkin tetap jalan karena default privilege Supabase menyisakan grant
`service_role` — tapi itu menyandarkan fungsi pada default yang tidak kamu kendalikan, dan
K-15 dari Sprint 3I mensyaratkan **keduanya di berkas yang sama**. Migrasi 9 melakukannya
dengan benar; ikuti pola itu, dan pastikan pagar EXECUTE dari 3I meloloskannya.

**2. Angka "bisa dihubungi" salah di laporanmu.** Kamu menyebut ≈82.089 — itu angka
cakupan `customer_engagement` dari Sprint 3N, bukan gabungan pemilik identitas. Terverifikasi:
`email_normalized IS NOT NULL OR phone_normalized IS NOT NULL` = **82.253**, yaitu
**seluruh pool**. Setiap profil punya minimal satu identifier, terverifikasi sejak Sprint 3A.

**3. Sebutkan bahwa ini reversibel.** `crm_consent` punya **nol trigger** — berbeda dari
`crm_suppression` dan `crm_audit_log` yang append-only. `delete from crm_consent where
source = '20fit_data_import'` membatalkannya bersih, dan `evidence` yang menandai sumber
membuat undo-nya presisi. Tulis ini di berkas PR dan di rencana revert — keputusan ini jauh
lebih murah daripada terlihatnya, dan itu fakta yang layak diketahui pengambil keputusan.

---

## MATRIKS YANG DITULIS

| Purpose | Channel | Baris | Alasan |
|---|---|---|---|
| `marketing` | `email` | 81.637 | |
| `marketing` | `whatsapp` | 81.615 | |
| `transactional` | `email` | 81.637 | CS lewat email |
| `transactional` | `whatsapp` | 81.615 | kanal CS paling lazim |
| `transactional` | `phone_call` | 81.615 | **inti perluasan ini** |
| **Total** | | **408.119** | |

**`sms` sengaja TIDAK diisi.** Ia nilai yang sah di CHECK constraint, tapi 20FIT tidak
memakai kanal itu — baris consent untuk kanal yang tak pernah dipakai hanya menambah
kebisingan. Kalau kelak dipakai, tambahkan saat itu. Sebutkan keputusan ini di laporan.

`marketing` + `phone_call` juga tidak diisi: telepon marketing berbeda sifatnya dari
telepon layanan, dan tidak ada yang memintanya. Kalau nanti dibutuhkan, itu keputusan
tersendiri.

---

## RISIKO TEKNIS YANG HARUS DITANGANI — INI YANG TERBESAR

**Jalur baca contactability belum pernah dijalankan terhadap tabel yang berisi.**
Selama ini `crm_consent` kosong, sehingga `fetchContactableCount` dan
`isContactableForMarketing` **selalu short-circuit di nol** dan tidak pernah benar-benar
memproses satu baris pun. Setelah backfill, keduanya tiba-tiba berhadapan dengan 408.119
baris.

**Bahaya spesifiknya: PostgREST punya batas baris maksimum per request.** Bila lapisan baca
mengambil baris consent tanpa batas eksplisit, hasilnya akan **terpotong diam-diam** dan
menghasilkan angka "bisa dihubungi" yang salah — tanpa error, tanpa peringatan. Itu persis
kelas kegagalan yang berulang di proyek ini: angka yang terlihat presisi padahal bohong.

**Sebelum menjalankan backfill:**

1. Telusuri `fetchContactableCount`, `isContactableForMarketing`, dan jalur jumlah
   berpasangan di segment builder. Jawab: berapa baris yang diambil, adakah batas, dan apa
   yang terjadi pada 408 ribu.
2. Kalau menghitung lewat `head: true` + filter (tanpa menarik baris), aman. Kalau menarik
   `customer_id` lalu memotong di TypeScript, **itu akan pecah** — perbaiki lebih dulu.
3. Aturan "suppression menang" harus tetap benar. Dengan nol baris suppression, hasilnya
   sama saja hari ini — tapi jangan sampai perbaikan performa menghapus pemeriksaannya.

**Sesudah menjalankan:** buka dashboard dan segment builder, ukur waktunya, dan bandingkan
angka "bisa dihubungi" dengan `count(distinct customer_id)` langsung lewat SQL. Kalau
berbeda, jalur bacanya terpotong — laporkan dan perbaiki sebelum apa pun dianggap selesai.

---

## PERUBAHAN KODE YANG MENGIKUTI

**`isContactableForMarketing` sekarang kurang.** CS butuh pertanyaan yang berbeda: "boleh
dihubungi untuk urusan layanan". Jadikan aturannya **sadar-purpose** — satu fungsi murni
yang menerima purpose, bukan dua fungsi yang menyalin logika (K-09: satu aturan, satu
tempat). Suppression tetap menang untuk keduanya.

**Peta `basis`→`purpose` di `lib/crm/consent-policy.ts`** harus mengizinkan
`legacy_import_unverified` untuk **marketing dan transactional**. Ubah petanya, bukan
kondisi yang tersebar; perbarui test paritasnya dalam commit yang sama.

**Di layar, tampilkan keduanya.** Dashboard dan segment builder menampilkan "bisa dihubungi
(marketing)" dan "bisa dihubungi (layanan)" terpisah. Menyatukannya jadi satu angka akan
menyembunyikan perbedaan yang justru jadi alasan perluasan ini dibuat.

---

## GATE

Tunjukkan SQL migrasi 11 final — dengan `grant execute`, matriks lima kombinasi, dan
`ON CONFLICT DO NOTHING` — lalu **berhenti** dan tunggu konfirmasi. Setelah dikonfirmasi:
`apply_migration` (bukan `db push`), jalankan `crm_backfill_consent()`, verifikasi.

Yang tetap dari usulanmu dan sudah benar: `basis='legacy_import_unverified'`,
`evidence` menunjuk sumber + tanggal impor tanpa PII, idempoten lewat unique key, satu baris
audit `consent.backfilled` (prefiks `consent.%` sudah di denylist kepatuhan — dikecualikan
permanen, dan itu klasifikasi yang tepat).

**Idempotensi wajib dibuktikan**, bukan diasumsikan: jalankan dua kali, tunjukkan panggilan
kedua menyisipkan **nol** baris. Baris audit kedua yang berbunyi "0 baris" boleh saja —
sebutkan saja bahwa itu memang perilakunya.

---

## LARANGAN

| Jangan | Alasan |
|---|---|
| Jangan pakai `explicit_opt_in` | Tidak ada catatan opt-in per orang; jawaban harus cocok dengan kenyataan |
| Jangan pakai `clinic_consents` sebagai consent marketing | Itu consent tindakan klinis — penilaianmu sudah benar |
| Jangan isi `sms` atau `marketing`+`phone_call` | Tak dipakai / tak diminta; keputusan tersendiri bila perlu |
| Jangan hapus pemeriksaan suppression saat mengoptimalkan | Nol baris sekarang tidak berarti selamanya |
| Jangan tarik baris consent tanpa batas ke TypeScript | 408 ribu baris; PostgREST memotong diam-diam |
| Jangan ubah CHECK constraint migrasi 3 | Sudah diterapkan; kelimanya sudah lolos |
| Jangan `UPDATE`/`DELETE` di `master_customer` | Read-only per desain |
| Jangan buat aksi audit baru | `consent.backfilled` sudah cocok prefiks `consent.%` |
| Jangan buat migrasi lain selain 11 | Satu perubahan skema per siklus |
| Jangan jalankan `supabase db push` | Ledger diverge dan punya entri ganda |
| Jangan merge atau push ke `main` tanpa izin eksplisit | Produksi sedang dipakai orang |

---

## LAPORAN PENUTUP

1. **Status remote + kondisi database**
2. **Pemeriksaan jalur baca SEBELUM backfill** — berapa baris diambil, ada batas atau
   tidak, dan apa yang kamu perbaiki
3. **Migrasi 11** — SQL final, versi ledger tercap, konfirmasi `proacl` hanya `postgres` +
   `service_role`, dan bukti idempoten (jalan kedua = 0 baris)
4. **Hasil backfill** — baris tertulis per purpose dan channel, dan **jumlah profil
   contactable untuk marketing dan untuk layanan**, dibandingkan dengan
   `count(distinct customer_id)` lewat SQL
5. **Sesudah** — waktu muat dashboard dan segment builder, dan konfirmasi angkanya cocok
   (tidak terpotong)
6. **Aturan sadar-purpose** — di mana ditulis, dan konfirmasi suppression tetap menang
7. **Reversibilitas** — kalimat yang kamu tulis di berkas PR
8. **Yang TIDAK bisa kamu verifikasi**

Gate akhir: `tsc --noEmit` bersih, `next lint` bersih, seluruh test hijau,
`NODE_ENV=production npm run build` lulus. Sebutkan jumlah test sebelum (324) dan sesudah.

Jangan klaim apa pun yang belum kamu jalankan dan lihat hasilnya.

# SELESAI — AKHIR PROMPT
