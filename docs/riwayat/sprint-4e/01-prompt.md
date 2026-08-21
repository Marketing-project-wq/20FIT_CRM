# CLAUDE CODE PROMPT — Sprint 4E: Empat Layar Sisa, Termasuk `/quality`

> **Bukti pengaman menggigit di sesi lalu adalah yang terkuat sejauh ini** — bukan karena
> probe yang disuntik, melainkan karena `consent.warn.zeroBodyA` **benar-benar** memuat
> "no data" saat mengutip-untuk-menolak, dan guard menangkapnya tanpa direkayasa.
> Memperbaikinya dengan menulis ulang jadi "data we are still missing" alih-alih menambah
> pengecualian adalah respons yang tepat: guard-nya memang benar.
>
> **Gerbang diskusi `/quality` saya cabut** — bentuk pemetaannya ditentukan di bawah, jadi
> keempat layar sisa bisa dikerjakan tanpa putaran tambahan.

---

## ATURAN PROSES

```bash
git fetch --all --prune
git log --oneline -3 origin/main
git log --oneline origin/main..HEAD
```

Baseline test **495**. Berbeda → berhenti dan lapor.
**Nol perubahan gerbang, angka, atau logika kueri.**

---

# PROMPT UNTUK CLAUDE CODE — SALIN MULAI DARI SINI

---

## TUGAS 1 — Layar 3, 4, 5

Urutan tetap: **segment builder → audit → detail profil.**

Pola yang sudah terbukti dipakai apa adanya: rutekan tiap string lewat kamus, tambahkan id
ke `BILINGUAL_SCREENS`, biarkan penanda hilang sendiri dan pengaman memvalidasi kunci baru.

Temuanmu di `/consent` — bahwa unit yang jujur mencakup handler API yang menyusun pesan yang
muncul di dialog sebagai data — berlaku juga di sini. Periksa lebih dulu, per layar, mana
saja permukaan yang ikut: cabang akses-ditolak, pesan galat route, dan teks yang disusun
server lalu ditampilkan sebagai data. Sebutkan berapa berkas yang ternyata terlibat per layar.

Nuansa yang wajib bertahan di ketiga layar ini:

| Layar | Frasa | Yang harus bertahan |
|---|---|---|
| Segment builder | 92% dalam satu keranjang | RFM tak layak jadi dasar kampanye |
| | ambang segmen kecil (25) | dari agregat jadi pengungkapan individu |
| | OR lintas-tabel tidak tersedia | ditolak jujur, bukan diam-diam jadi AND |
| | butuh persetujuan, belum tersedia | ditolak karena alurnya belum ada, bukan tak berhak |
| Audit | dilemahkan, belum ditutup | temuan yang berhenti muncul bukan yang terjawab |
| | artefak verifikasi | baris audit sah yang bukan aktivitas nyata |
| | kelas retensi | operasional dipangkas 90 hari; kepatuhan permanen |
| | daftar ini tidak lengkap (gap id) | tiap id hilang = satu operasi teraudit yang gagal |
| Profil | cap muat, bukan aktivitas | tanggalnya nyata; artinya yang bukan aktivitas |
| | tidak terekam versus belum terisi | dua sebab berbeda, jangan disatukan |
| | ambigu — tidak bisa dipastikan | nilainya sah, urutannya yang tak pasti |
| | tidak ada sumber data (health) | bukan "kosong", bukan "sehat" |

---

## TUGAS 2 — `/quality`: bentuk pemetaan sudah ditentukan

Dugaan di prompt sebelumnya terkonfirmasi: `quality-types.ts` memang punya `key` di
`FillRate`, `IssueCount`, `SatelliteCoverage`, dan `VERIFIED_ARTIFACTS`. Verifikasi ulang,
lalu pakai bentuk ini.

**Pemetaan kunci kamus:**

```
quality.fill.<key>.label        quality.fill.<key>.note
quality.issue.<key>.label       quality.issue.<key>.definition
quality.satellite.<key>.label   quality.satellite.<key>.note
quality.artifact.<key>.label    quality.artifact.<key>.detail
```

Klien mencari lewat `key`, dengan **fallback ke teks server** (`note`, `definition`,
`detail`) bila kunci kamus tidak ada. Dengan begitu `quality.ts` tidak berubah sama sekali —
lapisan bacanya tak tersentuh, dan entri server baru muncul dalam bahasa Indonesia sampai
diterjemahkan alih-alih menampilkan kunci mentah.

**Tapi fallback itu punya harga, dan ini bagian terpentingnya:** kunci kamus yang hilang akan
**diam-diam** menampilkan bahasa Indonesia. Test paritas kunci yang ada tidak akan
menangkapnya, karena kuncinya memang tidak pernah ada di kedua kamus.

**Tutup dengan test berbasis data.** Ambil daftar `key` yang sebenarnya dipakai lapisan
server, lalu gagalkan bila ada satu pun yang tidak punya entri kamus di **kedua** bahasa.

Agar daftar itu bisa dibaca test, **pindahkan literal string kunci ke `quality-types.ts`**
(client-safe) sebagai konstanta terekspor, dan biarkan `quality.ts` mengimpornya.
`quality.ts` boleh berubah **hanya** sejauh mengganti literal dengan rujukan ke konstanta
itu — **nol perubahan pada kueri, filter, urutan, atau nilai apa pun**. Tunjukkan diff-nya
di laporan supaya terlihat bahwa yang berpindah hanya string.

**`ARTIFACTS_VERIFIED_ON` saat ini string Indonesia** (`"11 Agustus 2026"`). Ubah jadi
tanggal ISO dan format per bahasa saat tampil, seperti tanggal lain di sistem ini. Tanggal
yang tertulis dalam satu bahasa di layar berbahasa Inggris adalah jenis kebocoran yang
paling mudah lolos peninjauan.

**Nama kolom teknis tetap** — `phone_normalized`, `last_activity_at`, `crm_profile_scores`,
dan seluruh nama tabel tampil apa adanya di kedua bahasa, dalam mono.

Nuansa `/quality` yang paling berisiko hilang: `0 (measured)` versus `— (no source)`,
`load timestamp`, `not filled in` versus `not recorded`, `segment terbalik` (kohort NULL
justru LTV tertinggi — bukan "data hilang"), dan `Rp 0 adalah fakta, bukan data hilang`.

---

## TUGAS 3 — Tinjauan pembaca baru, per layar

Untuk setiap layar yang selesai, buka dalam bahasa Inggris dan jawab apakah pembaca yang
baru pertama melihatnya masih menyadari peringatan yang relevan di sana.

Untuk `/quality` khususnya, keempat ini harus mendarat: gender 0% terisi, 98,65% lifetime
value bernilai nol, kolom waktu adalah cap muat, dan RFM 92% satu keranjang.

Yang jadi lebih ragu dalam bahasa Inggris diperbaiki kalimatnya, bukan diturunkan
standarnya. Laporkan yang sempat meleset.

---

## TUGAS 4 — Tinjau ulang ambang pengaman panjang

Setelah enam layar diterjemahkan, ambang 50% akhirnya punya data nyata untuk diuji.

Laporkan: berapa peringatan yang mendekati ambang, berapa yang butuh pengecualian, dan
apakah angkanya perlu digeser. Kalau **tak satu pun** peringatan sah mendekati 50%, ambangnya
terlalu longgar dan tidak akan menangkap pemangkasan sungguhan. Kalau banyak yang butuh
pengecualian, terlalu ketat. Sesuaikan dengan alasan, atau pertahankan dengan alasan.

---

## LARANGAN

| Jangan | Alasan |
|---|---|
| Jangan ubah kueri, filter, urutan, atau nilai di `quality.ts` | Hanya literal kunci yang boleh berpindah |
| Jangan biarkan kunci kamus hilang lolos karena fallback | Itu justru lubang yang dibuka fallback |
| Jangan terjemahkan nama kolom, nama tabel, atau nama aksi audit | Identifier, bukan label |
| Jangan terjemahkan nilai data tersimpan | `Campion user`, `Fitco User`, `source` tetap |
| Jangan persingkat peringatan agar rapi dalam bahasa Inggris | Panjangnya disengaja |
| Jangan tambahkan pengecualian pengaman untuk menghindari menulis ulang | Guard-nya benar; kalimatnya yang diperbaiki |
| Jangan tambahkan layar ke `BILINGUAL_SCREENS` sebelum tuntas | Penanda hilang padahal teks masih campur |
| Jangan ubah angka, gerbang peran, `0` versus `—`, penandaan asal | Sprint bahasa |
| Jangan ubah test lama supaya lolos | Tanda perilaku berubah |
| Jangan pakai kelas warna bernomor | K-11 |
| Jangan hapus prefix `NODE_ENV=production` di `railway.json` | Baca README dulu |

---

## LAPORAN PENUTUP

1. Status remote + kondisi database
2. **Layar 3–5** — mana tuntas, berapa berkas ternyata terlibat per layar, dan permukaan
   tersembunyi yang kamu temukan
3. **`/quality`** — diff `quality.ts` (harus hanya pemindahan literal), test berbasis data
   untuk kunci yang hilang, dan penanganan `ARTIFACTS_VERIFIED_ON`
4. **Nuansa** — keputusan untuk frasa di kedua tabel, dan yang baru kamu temui
5. **Tinjauan pembaca baru** — per layar, dan apa yang sempat meleset
6. **Ambang pengaman panjang** — data nyatanya, dan keputusanmu
7. Yang masih menggantung — sembilan item `MENUNGGU-TINDAKAN-MANUSIA.md`
8. Yang ditemukan tapi tidak disentuh
9. Yang TIDAK bisa kamu verifikasi

Kalau keempat layar tidak muat dikerjakan dengan benar, berhenti jujur seperti dua sesi
terakhir dan sebutkan berhenti di mana. Itu lebih baik daripada empat layar yang terburu.

Gate akhir: `tsc --noEmit` bersih, `next lint` bersih, seluruh test hijau, kedua pagar lama
(Tailwind dan EXECUTE) hijau, `NODE_ENV=production npm run build` lulus. Sebutkan jumlah test
sebelum (495) dan sesudah, dan konfirmasi test lama tidak dimodifikasi.

Jangan klaim apa pun yang belum kamu jalankan dan lihat hasilnya.

# SELESAI — AKHIR PROMPT
