# Keputusan: kapan menjadwalkan `crm_purge_audit_log`

> **Status: MEMO KEPUTUSAN — tidak ada penjadwalan yang dipasang.** Fungsi
> `crm_purge_audit_log(dry_run boolean default true)` sudah ada sejak Sprint 3A dan
> **sengaja belum dijadwalkan**. Memo ini menaruh angka nyata di meja supaya tim bisa
> memutuskan; ia **tidak** memasang cron. Diverifikasi ke database 11 Agustus 2026.

## Yang sudah dibangun (dan yang belum)

- Fungsi purge: **ada**, teruji (dry-run + eksekusi terkontrol di Sprint 3A).
- Allowlist yang dipangkas: `profile.viewed`, `list.viewed`, `search.*`, `login.*`,
  setelah **90 hari**. Kategori kepatuhan (`consent.*`, `suppression.*`, `role.*`,
  `profile.deleted`, `export.*`, `retention.*`) **dikecualikan permanen**.
- Penjadwalan: **belum ada.** Sampai hari ini **nol baris pernah terpangkas** oleh
  jadwal — satu-satunya pemangkasan yang pernah terjadi adalah baris uji sintetis di
  verifikasi Sprint 3A (`id=5`, `retention.purge_executed`, 1 baris).

## Laju pertumbuhan yang terukur hari ini — dan kenapa belum bisa diekstrapolasi

Isi `crm_audit_log` per 11 Agustus 2026 (27 baris):

| Jam (UTC) | Operasional | Kepatuhan | Aktor unik |
|---|---|---|---|
| 10 Agu 13:00 | 0 | 0 | — (1 baris artefak `test.trigger_check`) |
| 11 Agu 03:00 | 0 | 3 | 2 (system:seed ×2, system:retention ×1) |
| 11 Agu 05:00 | 18 | 0 | 1 (`tifany@`) |
| 11 Agu 06:00 | 5 | 0 | 1 (`tifany@`) |

Bacaan jujurnya:

- **Operasional = 23 baris, semuanya dari SATU orang dalam ~2 jam** sesi eksplorasi.
  Ini burst pengujian, **bukan** beban tunak. Mengalikannya jadi "≈11 baris/jam × 24 ×
  365" akan menghasilkan angka yang terlihat presisi tapi salah — tidak ada yang
  memakai sistem 2 jam itu secara representatif.
- **Kepatuhan = 3 baris, semuanya dari sistem** (dua `role.granted` seed + satu
  `retention.purge_executed`). Kategori ini tumbuh hanya saat ada **peristiwa tata
  kelola nyata** (pemberian peran, perubahan consent, suppression, ekspor) — jarang,
  dan justru itu yang ingin disimpan permanen.

Yang bisa disimpulkan **tanpa** mengarang angka:
- Volume operasional berskala dengan **(jumlah pengguna × sesi × klik)**. Satu penguji
  saja sudah menghasilkan rasio **23 : 3** operasional : kepatuhan dalam satu sore.
  Begitu tim lain ikut, rasio itu memburuk cepat — baris kepatuhan yang jadi alasan
  tabel ini ada akan terkubur. (Itulah kenapa layar audit kini default berpihak
  kepatuhan — lihat `/settings`.)
- Baris operasional **tidak** bernilai kepatuhan jangka panjang: ia menjawab "siapa
  melihat daftar", berguna beberapa minggu untuk investigasi, tidak setelah itu.

## Kapan volume operasional mulai mengganggu

Bukan soal ukuran tabel (Postgres santai dengan jutaan baris kecil), tapi soal **sinyal
tenggelam dalam derau**:

1. **Ambang keterbacaan** — saat layar audit default (kepatuhan) masih lega, tapi tab
   "Semua"/"Operasional" jadi dinding ribuan baris seragam sehingga pencarian manual
   lewat rentang tanggal mulai lambat secara persepsi. Dengan pemakaian multi-tim, ini
   tercapai dalam **hitungan minggu**, jauh sebelum ada masalah performa.
2. **Ambang biaya query** — `count(exact)` untuk paginasi dan rasio mulai terasa saat
   tabel menembus ratusan ribu baris. Masih jauh.

Sinyal pemicunya sudah ada di layar: **rasio kepatuhan : operasional dalam rentang yang
dilihat.** Saat operasional secara konsisten membanjiri (mis. > 95% baris 30 hari
terakhir), itulah tanda purge perlu jalan — dan karena cutoff-nya 90 hari, menyalakan
purge tidak akan menyentuh apa pun yang lebih muda dari itu.

## Opsi penjadwalan & konsekuensinya

| Opsi | Cara | Konsekuensi |
|---|---|---|
| **A. Tetap manual (status quo)** | Jalankan `select crm_purge_audit_log(false)` sesekali, sadar | Nol risiko otomasi liar; tapi bergantung pada seseorang ingat. Sinyal kapan menjalankan: rasio di layar audit |
| **B. Cron bulanan via pg_cron** | Jadwalkan `crm_purge_audit_log(false)` sebulan sekali | Butuh ekstensi `pg_cron` + DDL — dan ledger migrasi diverge (lihat README), jadi ini keputusan tim, bukan sisipan sprint. Retensi jadi otomatis & konsisten. Risiko: purge berjalan tanpa mata manusia — mitigasi: fungsi sudah menulis `retention.purge_executed` tiap kali, jadi tetap ada jejak |
| **C. Cron + notifikasi** | Seperti B, plus kirim ringkasan hasil purge | Paling aman operasional; paling banyak bagian bergerak untuk dibangun |
| **D. Panggil dari job aplikasi** | Route/worker terjadwal memanggil fungsi | Menaruh logika retensi di aplikasi, bukan DB — menyebar tanggung jawab; tidak disarankan selagi app masih evaluasi |

Catatan penting untuk semua opsi: fungsi **menonaktifkan lalu menyalakan kembali**
trigger append-only secara sengaja. Menjadwalkannya berarti proses otomatis akan
memegang kemampuan mematikan proteksi itu sejenak. Fungsi sudah menuliskan
`retention.purge_executed` sebelum memangkas (kategori kepatuhan → tak pernah dipangkas),
jadi setiap eksekusi meninggalkan bukti permanen. Itu peredam yang benar; jangan
hilangkan.

## Risiko: menjadwalkan terlalu dini vs terlalu lambat

- **Terlalu dini** (mis. sekarang, saat data uji): membuang jejak `list.viewed` yang
  mungkin masih berguna untuk memverifikasi bahwa kontrol Sprint 3A benar-benar
  berjalan di produksi (justru bukti pemakaian nyata yang sedang kita kumpulkan). Karena
  cutoff 90 hari, "terlalu dini" secara praktis tidak menghapus apa pun sekarang — tapi
  menjadwalkannya sebelum tim melihat perilakunya melanggar prinsip "penjadwalan adalah
  keputusan sadar setelah melihat perilaku".
- **Terlalu lambat**: baris operasional menumpuk sampai layar audit jadi sulit dipakai
  dan sinyal kepatuhan tenggelam. Tidak berbahaya bagi data (kepatuhan tetap aman), tapi
  mengikis kegunaan alat akuntabilitas justru saat makin banyak orang memakainya.

## Rekomendasi (untuk diputuskan tim)

Tunggu sampai ada **pemakaian multi-tim nyata selama beberapa minggu**, pantau rasio
kepatuhan : operasional di layar audit, lalu pilih **Opsi B atau C** saat operasional
konsisten mendominasi. Sampai saat itu, **Opsi A** (manual, sadar) sudah cukup — dan
karena purge belum jalan, layar audit sudah memberi tahu pembaca bahwa ketiadaan baris
lama belum berlaku hari ini.

**JANGAN pasang cron sekarang.** Memo ini bahan keputusan; pelaksanaannya milik tim.

---

> **Konteks lintas-sprint:** temuan `docs/riwayat/TEMUAN.md` **T-12** (kebisingan audit; penjadwalan purge masih terbuka).
