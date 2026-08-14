# CLAUDE CODE PROMPT — Migrasi 13: Perbaiki Dulu, Baru Jalankan

> **Jangan jalankan SQL yang kamu ajukan apa adanya.** Saya uji badan query-nya langsung ke
> produksi, dan ia **3,85 detik** — lebih lambat daripada jalur embed yang mau digantikan
> (~2,9 detik). Migrasinya akan memperburuk keadaan, bukan memperbaiki.
>
> Ada juga satu pertanyaan desain yang harus dijawab sebelum fungsi ini ada, karena
> jawabannya tidak bisa diuji hari ini dan akan mengeras diam-diam.

---

## MASALAH 1 — `count(distinct)` di dalam `GROUP BY` memaksa sort seluruh 408 ribu baris

`EXPLAIN ANALYZE` atas query yang kamu ajukan, produksi, 12 Agustus 2026:

```
GroupAggregate                                    actual time=3765..3842
  -> Incremental Sort                             actual time=1487..3768
       Sort Key: c.purpose, c.customer_id
       Pre-sorted Groups: 2  Sort Method: external merge
       Average Disk: 7696kB  Peak Disk: 9624kB
       -> Nested Loop Anti Join                   actual time=6.7..3389
            -> Index Only Scan ... Heap Fetches: 0    rows=408119
Execution Time: 3845.836 ms
```

Indeksnya dipakai dengan sempurna — `Heap Fetches: 0`. Tapi `count(distinct)` memaksa
Postgres **mengurutkan seluruh 408.119 baris** sebelum menghitung, dan itu tumpah ke disk.
Menaikkan `work_mem` ke 16MB akan menampung tumpahannya, tapi sortnya tetap terjadi — kamu
membayar pengurutan 408 ribu baris hanya untuk menghitung 164 ribu pasangan unik.

**Bentuk yang benar: lakukan `distinct` lebih dulu di subquery, baru anti-join dan hitung.**
Sudah saya uji ke produksi:

```sql
select c.purpose, count(*) as cnt
from (
  select distinct purpose, customer_id
  from public.crm_consent
  where status = 'active'
    and purpose in ('marketing','transactional')
    and customer_id is not null
) c
where not exists ( ...anti-join suppression yang sama... )
group by c.purpose;
```

```
HashAggregate                                     actual time=801.8..801.8
  -> Nested Loop Anti Join                        rows=164506
       -> HashAggregate  Group Key: purpose, customer_id
            Planned Partitions: 4  Batches: 5  Disk Usage: 16064kB
            -> Index Only Scan ... Heap Fetches: 0
Execution Time: 805.217 ms
```

**805 ms versus 3.846 ms — 4,8× lebih cepat**, dan hasilnya identik: `marketing` 82.253,
`transactional` 82.253 (sudah saya jalankan tanpa `EXPLAIN`, bukan diperkirakan).

Perhatikan: angka 805 ms itu **masih tanpa** `work_mem` yang dinaikkan — HashAggregate-nya
masih tumpah (`Disk Usage: 16064kB`, 5 batches). Dengan `set local work_mem` yang memadai di
dalam fungsi, ia muat di memori dan turun lagi. **16MB mungkin masih kurang** untuk
menampung 16 MB tumpahan plus overhead; ukur, jangan tebak, dan naikkan sampai
`Batches: 1`. Jangan berlebihan juga — ini instance kecil dan `work_mem` berlaku per operasi.

**Pakai bentuk ini, lalu ukur ulang dan laporkan angkanya.** Kalau setelah `work_mem`
hasilnya masih di atas satu detik, katakan begitu.

---

## MASALAH 2 — Granularitas suppression belum diputuskan, dan ini akan mengeras diam-diam

Anti-join yang kamu tulis mengecualikan **seluruh pelanggan** bila **salah satu**
identitasnya ada di suppression. Jadi bila nomor telepon seseorang di-suppress, consent
email-nya ikut gugur — untuk marketing **dan** layanan sekaligus.

Itu tafsir paling ketat, dan mungkin memang yang diinginkan. Tapi itu **belum pernah
diputuskan siapa pun**, dan ada dua bahaya:

**(a) Divergensi dengan aturan TypeScript.** `isContactableForPurpose` menerima daftar
identitas dan kunci suppression. Kalau ia mengecualikan **per identitas** sementara RPC
mengecualikan **per pelanggan**, keduanya memberi jawaban berbeda begitu baris suppression
pertama masuk — dan hari ini **tidak ada test yang bisa menangkapnya**, karena dengan nol
baris suppression keduanya menghasilkan angka yang sama. Ini persis pola K-09 yang sudah
dua kali menggigit proyek ini (kanon telepon, daftar retensi).

**(b) Konsekuensi bisnisnya nyata.** Seseorang yang bilang "jangan telepon saya" belum tentu
bermaksud "jangan kirim email invoice". Mengecualikan seluruh purpose berarti CS kehilangan
jalur layanan karena permintaan yang menyangkut marketing.

**Yang harus kamu kerjakan:**

1. **Baca `isContactableForPurpose` dan tentukan granularitas apa yang sebenarnya
   diterapkannya sekarang.** Laporkan apa adanya, bukan apa yang seharusnya.
2. **Samakan keduanya**, dan tulis aturannya di satu tempat sebagai keputusan `K-` di
   `docs/riwayat/KEPUTUSAN.md` — termasuk syarat pembalikannya.
3. **Tulis test fungsi murni** untuk kasus yang tidak bisa diuji lewat data: telepon
   di-suppress tetapi email tidak, untuk marketing dan untuk transactional. Test itu yang
   mengunci keputusannya, karena database tidak bisa.

Kalau kamu memilih tetap "seluruh pelanggan gugur", itu pilihan yang sah — **asal tertulis
dan diuji**, bukan tersirat di satu `NOT EXISTS`.

---

## MASALAH 3 — Kunci yang hilang di `jsonb_object_agg` bisa terbaca "—"

`GROUP BY` tidak menghasilkan baris untuk purpose yang jumlahnya nol, sehingga kuncinya
**hilang** dari JSON. `coalesce` hanya menangani kasus kosong total.

Aturan K-08 berlaku: **`0` berarti terukur nol, `—` berarti tidak ada sumbernya.** Kalau
pemanggil membaca kunci yang hilang sebagai `undefined` lalu merender `—`, layar akan
berbohong — ia akan bilang "tidak ada sumbernya" padahal jawabannya nol dan terukur.

Pastikan fungsinya **selalu mengembalikan kedua kunci**, `marketing` dan `transactional`,
dengan nilai `0` bila memang nol. Jangan serahkan ke pemanggil.

---

## SESUDAH PERBAIKAN — jalankan

Setelah ketiga hal di atas beres: **tampilkan SQL final, berhenti sebentar**, lalu terapkan
lewat `apply_migration` (bukan `db push`).

Verifikasi:

1. `EXPLAIN ANALYZE` sebelum dan sesudah **dengan angka**. Acuan: jalur embed ~2,9 dtk;
   bentuk lama yang kamu ajukan 3,85 dtk; bentuk baru tanpa `work_mem` 805 ms.
2. Hasilnya **tidak berubah**: 82.253 untuk kedua purpose.
3. `proacl` hanya `postgres` dan `service_role`.
4. Versi ledger tercap, README diperbarui.
5. Sambungkan ke `dashboard.ts`. **Segment builder tetap memakai jalur embed** — kriterianya
   ada di tabel induk, jadi join-nya wajib. Dua jalur berbeda; beri komentar yang menjelaskan
   kenapa, supaya tak ada yang menyatukannya nanti.

---

## SISANYA — lanjutkan TUGAS 3

Pelengkapan multi-sumber sudah tiga kali tertunda, dan `docs/RENCANA-multisumber.md` sudah
memuat rencananya lengkap. **Bangun sekarang**, mulai dari lapisan baca dan tampilan profil;
`/quality` dan filter menyusul bila waktunya habis — tapi laporkan sejauh mana sampainya,
jangan sekadar "ditunda".

Temuanmu bahwa `clinic_patients` memuat `id_number`, `date_of_birth`, `address`, dan
`emergency_contact_*` itu penting dan benar: gerbang `profile.view_health` wajib, nilainya
tidak pernah masuk `metadata`, dan `clinic_*` disambung lewat `patient_id` — bukan join
langsung ke `master_customer`.

Aturan lain tidak berubah: `normalizeEmail` dulu lalu `normalizePhoneID` sebagai fallback
dengan pencatatan kunci mana yang dipakai; nol cocok-nama-saja; nol tulis; kolom aman
sebagai konstanta teruji; tingkat kecocokan tampil di layar; nol kriteria berbasis waktu.

---

## LARANGAN

| Jangan | Alasan |
|---|---|
| Jangan terapkan SQL versi `count(distinct)` di dalam `GROUP BY` | Terukur 3,85 dtk — lebih lambat dari jalur yang digantikan |
| Jangan naikkan `work_mem` global | Instance kecil; di dalam fungsi saja, dan ukur sampai `Batches: 1` |
| Jangan biarkan granularitas suppression tersirat di `NOT EXISTS` | Tak bisa diuji lewat data hari ini; wajib tertulis dan di-test |
| Jangan kembalikan JSON tanpa kunci untuk purpose bernilai nol | K-08: `0` bukan `—` |
| Jangan satukan jalur dashboard dan segment builder | Yang satu tak butuh join, yang satu wajib |
| Jangan cocokkan lewat nama saja | Salah cocok = riwayat orang lain menempel di profil |
| Jangan `UPDATE`/`INSERT`/`DELETE` di `master_customer` atau tabel tim lain | Proyek bersama |
| Jangan buat migrasi selain 13 | Satu perubahan skema per siklus |
| Jangan tulis baris consent atau suppression uji | Consent uji mencemari hitungan; suppression tak bisa dihapus |
| Jangan arahkan Railway ke `main` sebelum merge | Produksi mundur enam commit; angka salah tanpa error |
| Jangan merge ke `main` sendiri | Izin tetap di tangan pemilik |
| Jangan hapus prefix `NODE_ENV=production` di `railway.json` | Baca README dulu |

---

## LAPORAN PENUTUP

1. **Status remote + kondisi database**
2. **Migrasi 13** — SQL final, `work_mem` yang kamu pilih dan **bukti `Batches: 1`**,
   `EXPLAIN ANALYZE` sebelum vs sesudah dengan angka, versi ledger, `proacl`
3. **Granularitas suppression** — apa yang sebenarnya dilakukan `isContactableForPurpose`
   sekarang, keputusan yang kamu ambil, dan test yang menguncinya
4. **Kunci JSON** — bagaimana kamu memastikan kedua purpose selalu ada
5. **Hasil tidak berubah** — 82.253 untuk keduanya
6. **Sumber baru** — sejauh mana sampainya, tingkat kecocokan per sumber, dan apa yang tersisa
7. **Yang masih menggantung**
8. **Yang ditemukan tapi tidak disentuh**
9. **Yang TIDAK bisa kamu verifikasi**

Gate akhir: `tsc --noEmit` bersih, `next lint` bersih, seluruh test hijau,
`NODE_ENV=production npm run build` lulus. Sebutkan jumlah test sebelum (340) dan sesudah.

Jangan klaim apa pun yang belum kamu jalankan dan lihat hasilnya.

# SELESAI — AKHIR PROMPT
