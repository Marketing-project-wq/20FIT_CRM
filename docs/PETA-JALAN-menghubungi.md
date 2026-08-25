# Peta jalan — separuh "menghubungi"

Sprint evaluasi (24 Agu 2026). **Belum dibangun apa pun.** Ini urutan, ketergantungan, dan
keputusan yang harus diambil pemilik produk sebelum bentuknya bisa dirancang. Rujukan lingkup:
[`KEBUTUHAN-SISTEM.md`](KEBUTUHAN-SISTEM.md).

Empat yang belum ada: **template**, **aksi ke segmen**, **unsubscribe untuk pengguna**, **workflow**.

---

## 1. Urutan + ketergantungan

```
template  ──┐
            ├──►  aksi manual ke segmen  ──►  workflow otomatis
unsubscribe ─┘        (kirim pertama)
```

1. **Template lebih dulu.** Aksi ke segmen DAN workflow keduanya memakainya
   (`KEBUTUHAN-SISTEM.md` §5: template disimpan & bisa diedit, lalu dipakai di workflow). Membangun
   pengiriman sebelum ada template berarti menaruh isi pesan di kode — persis yang §5 larang.
2. **Unsubscribe sebelum pengiriman pertama.** Tautan berhenti-berlangganan **harus** ada di email
   pertama yang dikirim (§6: pengguna diberi opsi unsubscribe). Tabel `crm_suppression` sudah ada;
   yang belum: **endpoint publik** (tanpa login) yang menerima klik unsubscribe dan menulis
   `crm_suppression` lewat jalur tulis atomik yang sudah ada (K-14). Jadi template **dan**
   unsubscribe keduanya prasyarat kirim pertama.
3. **Aksi manual ke segmen** (§3: email Mailtrap / chat / telepon-admin) — kirim pertama yang
   dipicu manusia. Memakai mesin segmen + suppression-exclude yang sudah ada (ekspor CSV sudah
   membuktikan jalur ini). Tambahannya: kirim Mailtrap + catatan pengiriman (audit §7).
4. **Workflow otomatis** paling akhir — ia butuh template, unsubscribe, jalur kirim, DAN sumber
   kejadian (bagian 2).

**Apakah saya setuju?** Ya, dengan satu penajaman: **template dan unsubscribe adalah prasyarat
sejajar** untuk kirim pertama (bukan berurutan) — email pertama butuh keduanya sekaligus. Sisanya
persis seperti diusulkan.

---

## 2. Arsitektur pemicu — **KEPUTUSAN PEMILIK PRODUK, tidak saya putuskan**

**Masalah (dari `KEBUTUHAN-SISTEM.md` §7):** tabel duplikasi (cermin) disegarkan **sekali sehari
03:00 WIB**. Pemicu workflow harus bereaksi pada kejadian yang **baru saja** terjadi ("orang ini
baru login"). Snapshot harian **tak bisa** menjawab itu — sampai 24 jam basi.

Tiga jalur, dengan konsekuensinya. **Sajikan, jangan pilih sendiri:**

| Opsi | Cara | Konsekuensi |
|---|---|---|
| **A. Polling langsung ke tabel sumber** | Job berkala (mis. tiap 5–15 mnt) meng-query `my20fit_user_activity`, `arena_class_bookings`, dll. langsung, cari baris baru sejak cek terakhir | Paling sederhana; nol perubahan skema di sistem sumber. Tapi: beban query berulang, latensi = interval polling, dan tiap sumber butuh "penanda sudah-diproses" (kolom/where by waktu). Cocok untuk pemicu yang toleran menit-an, bukan detik. |
| **B. Webhook dari sistem sumber** | Sistem sumber (my20fit, arena, dst.) memanggil endpoint CRM saat kejadian terjadi | Real-time, nol polling. Tapi: **butuh perubahan di SETIAP sistem sumber** — yang di luar kendali tim CRM (bukan hanya kode CRM). Ketergantungan lintas-tim; tak semua sumber punya kemampuan webhook. |
| **C. Tabel kejadian tersendiri (event log)** | Sumber (atau trigger DB) menulis ke satu tabel `crm_events` append-only; workflow membacanya | Satu jalur seragam untuk semua pemicu; audit alami; decoupled dari jadwal cermin. Tapi: butuh tiap sumber menulis ke sana (trigger DB per tabel sumber, atau perubahan di sumber) — kerja setup awal terbesar, imbalannya jalur pemicu paling bersih jangka panjang. |

Catatan: **cermin harian tetap dipakai untuk segmentasi** (mengenali & memfilter) — ia hanya
tak cocok sebagai sumber pemicu. Ketiga opsi hidup **berdampingan** dengan cermin, bukan
menggantikannya.

**Pertanyaan yang harus dijawab sebelum ada yang dirancang:** opsi mana (A/B/C, atau hibrida —
mis. A untuk sumber yang tak bisa webhook, B/C untuk yang bisa)? Ini menentukan bentuk seluruh
separuh sistem berikutnya.

---

## 3. Dua pemicu tanpa sumber — jangan bangun tempat kosongnya

`KEBUTUHAN-SISTEM.md` §9 + verifikasi 24 Agu (lampiran dokumen itu):

### "Tidak kembali"
- **Yang dibutuhkan:** sumber recency **nyata** (aktivitas, bukan cap muat) untuk lebih dari ~47
  pengguna. Kolom waktu `master_customer` & `customer_engagement` adalah cap muat (K-19). Satu-
  satunya recency nyata: `my20fit_user_activity` — dan itu hanya **47 dari 82.253 profil**
  (terukur 24 Agu; dokumen menyebut 44).
- **Siapa bisa menyediakan:** pemilik sistem sumber (arena/gym/clinic/my20fit) — sebuah kolom
  "last real activity" yang benar-benar bergerak, atau feed kejadian (opsi 2B/2C). **Tanpa itu,
  pemicu ini hanya bisa untuk ~47 pengguna my20fit** — keputusan D-4 di bawah.
- **Jangan** bangun layar "tidak kembali" yang selalu kosong untuk 99,9% pool.

### "Fitpoint mendekati kedaluwarsa"
- **Yang dibutuhkan:** tabel poin dengan **saldo** dan **tanggal kedaluwarsa** per pengguna. Tidak
  ditemukan. `my20fit_reward_claims` = **0 baris** (terukur 24 Agu).
- **Siapa bisa menyediakan:** pemilik sistem poin my20fit — di mana saldo & kedaluwarsa tersimpan
  (D-3). Tanpa itu pemicu #6 tak bisa dibuat. **Jangan** bangun tempat kosongnya.

---

## 4. Kanal chat & pop-up aplikasi — butuh keputusan sebelum dirancang

**Jangan asumsikan jawabannya.** Pertanyaan:

- **Kanal chat mana?** WhatsApp Business API, atau lainnya? Menentukan seluruh bentuk pengiriman
  chat (template harus disetujui Meta, format pesan, biaya per pesan, jendela 24 jam).
- **Pop-up di aplikasi 20FIT** — apakah aplikasinya punya cara **menerima** pesan dari luar
  (endpoint/inbox/push), atau perlu dibangun di sisi aplikasi? Tanpa mekanisme terima, pop-up tak
  bisa dikirim dari CRM.

---

## 5. Pertanyaan pemilik produk — daftar tunggal

1. **Arsitektur pemicu** (bagian 2): A (polling) / B (webhook) / C (event table) / hibrida?
   *Menentukan bentuk separuh sistem berikutnya.*
2. **Kanal chat**: WhatsApp Business API atau lainnya?
3. **Pop-up 20FIT**: aplikasinya bisa menerima pesan dari luar, atau perlu dibangun?
4. **Fitpoint**: di mana saldo & kedaluwarsa tersimpan? (Tanpa itu pemicu #6 mati.)
5. **"Tidak kembali"**: batasi ke ~47 pengguna my20fit yang punya recency nyata, atau tunda
   sampai ada sumber aktivitas lebih luas?
6. **Batas kirim Mailtrap**: berapa email/hari? Menentukan apakah kampanye besar butuh antrean.
7. **Gerbang ekspor** `crm_operator`/`unit_manager` (lihat `EVALUASI-LINGKUP-24agu.md` A3): tetap
   menolak, buka ≤ ambang, atau bangun alur persetujuan?

---

## 6. Yang TIDAK bisa diverifikasi dari sini

- Kemampuan webhook / endpoint-terima tiap sistem sumber & aplikasi 20FIT (di luar DB Supabase).
- Kebijakan & kuota Mailtrap (setelan akun, bukan DB).
- Apakah "tidak kembali"/"fitpoint" punya sumber di sistem lain yang belum tersambung ke Supabase.
