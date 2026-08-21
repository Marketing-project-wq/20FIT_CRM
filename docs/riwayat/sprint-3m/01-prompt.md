# CLAUDE CODE PROMPT — Sprint 3M: Segment Builder (tanpa menyimpan, dulu)

> **Semua yang dibangun sekarang terbukti jalan di produksi.** Diverifikasi ulang
> 11 Agustus 2026 ~13:55 UTC:
>
> | | |
> |---|---|
> | `crm_audit_log` | 57 baris · `max(id)` 61 · sequence 61 |
> | `profile.viewed` | **3** — V-6 tertutup, detail profil bekerja |
> | `search.performed` | **7** — pencarian Sprint 3J bekerja |
> | gap | **tetap `4, 37, 38, 39`** — tidak bertambah sama sekali |
>
> **Empat belas operasi teraudit baru, nol gap baru** — termasuk tiga pembukaan detail
> profil, yaitu persis operasi yang dituduh rusak. Itu **melemahkan** hipotesis "detail
> profil rusak" secara meyakinkan, meski tetap tidak membuktikan penyebab gap 37–39.
> Perlakukan sebagai episode historis terbatas, bukan cacat sistemik. Yang bisa menjawab
> pastinya tetap hanya log Railway.
>
> Consent, suppression, contactability, pencarian, detail profil, layar audit — semuanya
> live dan terbukti. **Fase 3 akhirnya terbuka**, dan sprint ini mengambil bagian pertamanya.

---

## ATURAN PROSES

```bash
git fetch --all --prune
git log --oneline -3 origin/main
git log --oneline origin/main..HEAD
```

Harapan: `origin/main` di `36a2291` (PR #6, memuat 3I+3J+docs); branch memuat `5b6bcc2`
(3K di-rebase) dan `73173de` (3L) — **dua commit belum ter-merge**. Baseline test **238**.
Berbeda → **berhenti dan lapor**.

**Nol perubahan skema sprint ini.** Alasannya di TUGAS 4, dan itu bukan kehati-hatian.

---

# PROMPT UNTUK CLAUDE CODE — SALIN MULAI DARI SINI

---

## TUGAS 1 — Segment builder yang tidak menyimpan apa pun

Ganti `ComingSoon` di `/segments`. Gerbang: `segment.build` — `super_admin`,
`crm_manager`, `crm_operator`, `analyst`, dan `unit_manager` (own unit → **fail-closed**,
tabel scope masih belum ada, jangan dilonggarkan). `data_steward` tidak berhak.

**Definisi segmen dibangun, dihitung, dan dibuang.** Tidak ada tabel, tidak ada
penyimpanan, tidak ada nama segmen. Pengguna menyusun kriteria, melihat berapa orang yang
cocok, mengubah kriteria, melihat lagi. Itu saja.

**Kriteria yang boleh dipakai** — hanya kolom yang benar-benar membawa informasi:

| Kriteria | Kolom | Catatan |
|---|---|---|
| Unit | `first_unit` | 100% terisi |
| Segment | `segment` | 98,5% terisi; kohort NULL wajib bisa dipilih terpisah |
| Kota | `city` | **7,03% terisi** — tampilkan angka itu di sebelah kriterianya |
| Revenue | `lifetime_value` | punya (>0) / tanpa (=0) / **negatif** (1 baris, T-10) |
| Punya identifier | `phone_normalized`, `email_normalized` | punya telepon / punya email |

**Kriteria berbasis waktu DILARANG.** Tidak ada "bergabung dalam N hari terakhir", tidak
ada recency, tidak ada `created_at`, `first_seen_at`, `last_activity_at`. Ketiganya cap
waktu muat — `docs/KOLOM-WAKTU.md`, keputusan K-19. Segmentasi recency **tidak mungkin
jujur** dengan data hari ini, dan menyediakan kotaknya berarti mengundang orang memakainya.
Tulis alasannya di UI, jangan cuma menghilangkan pilihannya — orang akan menanyakannya.

**Kota butuh peringatan di tempat.** Menyaring kota atas data yang 93% kosong akan
mengembalikan hasil yang tampak tegas padahal hanya menyaring "orang yang kotanya
kebetulan tercatat". Sebutkan itu di sebelah kriterianya, bukan di catatan kaki.

---

## TUGAS 2 — Setiap jumlah tampil berpasangan

Aturan PRD §18.8, dan sprint ini adalah tempat ia paling berarti:

> **Jumlah audiens tidak pernah ditampilkan tanpa jumlah yang boleh dihubungi.**

Untuk setiap definisi, tampilkan keduanya berdampingan:

- **Cocok kriteria** — berapa orang yang memenuhi
- **Boleh dihubungi** — berapa dari mereka yang punya consent marketing aktif **dan**
  tidak ada di suppression

Angka kedua adalah **0** hari ini, untuk definisi apa pun, karena `crm_consent` kosong.
Itu bukan bug dan bukan sesuatu yang perlu disembunyikan — itu justru pelajaran yang harus
dilihat tim: segmen berisi 40.000 orang yang tak satu pun boleh dikirimi pesan. Pakai
`isContactableForMarketing` yang sudah ada (Sprint 3F); **jangan tulis aturan kedua.**

Jelaskan kenapa nol: register consent kosong, dan suppression menang atas consent.
Tautkan ke `/consent`.

**Nol tombol ekspor, nol tombol kirim, nol tombol simpan.** Alur approval belum ada,
pengiriman belum ada, dan penyimpanan ditunda (TUGAS 4). Menyediakan tombol yang lalu
menolak lebih buruk daripada tidak ada tombol.

---

## TUGAS 3 — Audit dan masking

**Menghitung segmen adalah pembacaan daftar dengan parameter pengguna** → wajib audit
(K-07). Pakai `list.viewed` dengan `target_table='master_customer'` dan
`metadata.view='segment_builder'`. **Jangan buat aksi `segment.*` baru** — alasannya di
TUGAS 4, dan ini penting.

Yang masuk `metadata`: kriteria yang dipakai (nama kolom dan nilai pilihan dari daftar
tertutup), jumlah cocok, dan jumlah boleh dihubungi. Nilai kota adalah ketikan pengguna —
berlaku cap panjang seperti K-17.

**`analyst` boleh membangun segmen tetapi tidak boleh melihat kontak.** Kalau layar ini
menampilkan contoh baris, kontaknya wajib disamarkan di server seperti di `/audience`.
Lebih aman lagi: **jangan tampilkan baris sama sekali** di layar ini — sebuah segment
builder yang mengeluarkan daftar orang adalah ekspor tanpa nama. Cukup jumlah. Kalau
pengguna ingin melihat orangnya, itu tugas `/audience` yang sudah punya masking dan audit
sendiri.

Ukuran halaman tidak berlaku di sini karena tak ada baris yang dikirim — tapi **batasi
jumlah kombinasi kriteria per request** supaya layar ini tidak jadi alat menghitung ulang
seluruh pool berkali-kali.

---

## TUGAS 4 — Tulis keputusan penyimpanan, jangan kerjakan

Menyimpan segmen butuh tabel. Tabel butuh migrasi. Tapi ada halangan kedua yang lebih
mudah terlewat, dan ini **kali ketiga** pola yang sama muncul:

**Aksi `segment.*` tidak ada di daftar mana pun.** Allowlist migrasi 8 memuat
`profile.viewed`, `list.viewed`, `search.%`, `login.%`. Denylist kepatuhan memuat
`consent.%`, `suppression.%`, `role.%`, `profile.deleted`, `export.%`, `retention.%`.
Sebuah aksi `segment.created` jatuh di **antara keduanya** — tidak pernah dipangkas, tidak
pernah dilindungi, menumpuk selamanya tanpa ada yang sadar. Persis nasib yang dihindari
untuk `quality.viewed` di Sprint 3B dan dikonfirmasi ulang untuk `suppression.*` di 3H.

Menambahkannya berarti mengganti fungsi `crm_purge_audit_log` lewat migrasi baru, plus
memperbarui `lib/crm/retention-policy.ts` dan test paritasnya **dalam commit yang sama**
(K-09). Itu keputusan tersendiri dan tidak boleh diselundupkan ke sprint yang sedang
membangun layar.

**Tulis `docs/RENCANA-simpan-segmen.md`:**

- Bentuk tabel yang dibutuhkan, dan apa yang **tidak** boleh disimpan di dalamnya —
  definisi segmen menyimpan kriteria, **bukan** daftar `customer_id` hasilnya. Menyimpan
  hasil berarti membekukan salinan pool yang akan basi dan luput dari suppression
- Klasifikasi retensi yang tepat untuk `segment.*` (operasional atau kepatuhan) beserta
  alasannya, dan apa konsekuensi tiap pilihan
- Kenapa segmen tersimpan **belum berguna** hari ini: ekspor terblokir, pengiriman
  terblokir, dan `crm_consent` kosong sehingga setiap segmen berjumlah nol yang boleh
  dihubungi
- Urutan yang benar: consent punya isi → segmen layak disimpan → baru ekspor/kirim

---

## TUGAS 5 — Yang masih menggantung

- **Dua commit belum ter-merge** (3K, 3L). Perbarui berkas PR jadi mencakup 3M. Kalimat
  teratas: layar ini adalah yang pertama menunjukkan **berapa banyak orang yang tidak
  boleh dihubungi** — itu temuan, bukan fitur.
- **Baris suppression pertama** belum ada. Jalur tulis dan pencarian sudah di `main` dan
  terbukti jalan, jadi hambatannya bukan lagi teknis. Panduan siap di
  `docs/PERTAMA-suppression.md`. **Jangan buat baris uji.**
- **Penyebab gap 37–39** masih belum terbukti dan kini kecil kemungkinannya sistemik.
  Catat statusnya di `docs/riwayat/TEMUAN.md`: dilemahkan oleh 14 operasi sukses berikutnya,
  belum ditutup. Jangan tutup temuan yang belum terjawab hanya karena berhenti muncul.
- Perbarui `docs/riwayat/` seperti biasa — V-6 tertutup, `search.performed` terbukti.

**JANGAN merge sendiri.** Siapkan, lalu minta izin.

---

## LARANGAN

| Jangan | Alasan |
|---|---|
| Jangan buat tabel, migrasi, view, atau RPC | Penyimpanan segmen adalah keputusan tersendiri (TUGAS 4) |
| Jangan buat aksi audit `segment.*` | Jatuh di antara allowlist dan denylist — menumpuk selamanya |
| Jangan sediakan kriteria berbasis waktu | K-19: semua kolom waktu adalah cap muat |
| Jangan tampilkan daftar orang di segment builder | Segment builder yang mengeluarkan daftar adalah ekspor tanpa nama |
| Jangan tampilkan jumlah audiens tanpa jumlah yang boleh dihubungi | PRD §18.8 |
| Jangan tulis aturan contactability kedua | `isContactableForMarketing` sudah ada (K-03) |
| Jangan sediakan tombol ekspor, kirim, atau simpan | Ketiganya belum ada; tombol yang menolak lebih buruk daripada tak ada tombol |
| Jangan longgarkan fail-closed `unit_manager` | Tetap NIHIL sampai tabel scope ada |
| Jangan `INSERT` uji ke `crm_suppression` atau `crm_consent` | Baris suppression tak bisa dihapus |
| Jangan setval atau reset `crm_audit_log_id_seq` | K-21: gap adalah bukti |
| Jangan sentuh objek di luar `crm_*` dan `master_customer` (baca saja) | 101 fungsi milik tim lain |
| Jangan merge atau push ke `main` tanpa izin eksplisit | Produksi sedang dipakai orang |
| Jangan hapus prefix `NODE_ENV=production` di `railway.json` | Baca README dulu |

---

## LAPORAN PENUTUP

1. **Status remote + kondisi database** — termasuk gap dan sequence sekarang
2. **Segment builder** — kriteria yang tersedia, bagaimana larangan waktu dijelaskan di UI,
   dan bagaimana peringatan kota ditempatkan
3. **Jumlah berpasangan** — bagaimana "boleh dihubungi" diturunkan, dan bagaimana nol
   dijelaskan tanpa terlihat seperti kerusakan
4. **Audit & masking** — bentuk `metadata`, dan keputusanmu soal menampilkan baris atau tidak
5. **Rencana penyimpanan** — ringkasan, terutama klasifikasi retensi `segment.*` yang kamu usulkan
6. **Yang masih menggantung** — dua commit, baris suppression pertama, status temuan gap
7. **Yang ditemukan tapi tidak disentuh**
8. **Yang TIDAK bisa kamu verifikasi**

Gate akhir: `tsc --noEmit` bersih, `next lint` bersih, seluruh test hijau,
`NODE_ENV=production npm run build` lulus. Sebutkan jumlah test sebelum (238) dan sesudah.

Jangan klaim apa pun yang belum kamu jalankan dan lihat hasilnya.

# SELESAI — AKHIR PROMPT
