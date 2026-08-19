# RENCANA — Merender Halaman dengan Data Nyata (di Balik Login)

> **Status: OPSI, belum dijalankan.** Ditulis atas permintaan sprint "Penjadwalan Refresh
> Cermin + Kemampuan Melihat Render" (19 Agu 2026). Jalur ini **butuh persetujuan** karena
> memasukkan service-role key ke sandbox — sebuah paparan yang harus disadari, bukan
> diselundupkan. **Jangan jalankan tanpa persetujuan pemilik produk.**

---

## Kenapa dokumen ini ada

Selama berbulan-bulan tidak ada satu halaman pun yang bisa dilihat ter-render dari sandbox.
Dua lapis memblokir:

1. **Egress.** Sandbox memblokir koneksi keluar; browser Playwright dan panggilan Supabase
   sama-sama terhalang kecuali host-nya di-allowlist.
2. **Login.** Aplikasi butuh sesi auth. Membuka allowlist saja hanya memberi halaman login,
   bukan dashboard.

Ada **dua jawaban** untuk ini, dan keduanya sudah/akan ada di repo:

| Jalur | Butuh kredensial? | Butuh egress? | Risiko | Status |
|---|---|---|---|---|
| **A — Pratinjau fixture** (`/dev/preview`) | Tidak | Tidak (browser sudah terpasang) | Nihil | **SUDAH ADA** (sprint ini) |
| **B — Data nyata di balik login** | Ya (service-role key) | Ya (host Supabase) | **Paparan kunci** | **Dokumen ini — belum dijalankan** |

**Jalur A menutup 95% kebutuhan** "lihat render": tata letak, skala batang, warna, peringatan
basi, uji-lima-detik — semua bisa diperiksa dengan fixture. Jalur B hanya perlu bila yang
diuji justru **kesetiaan angka nyata end-to-end** (mis. memverifikasi query benar-benar
mengembalikan 82.253, bukan sekadar bahwa komponen merender angka yang diberi).

---

## Jalur B — langkah, bila disetujui

### Prasyarat yang harus dibuka pemilik produk

1. **Allowlist egress** untuk host proyek Supabase:
   - `cpvzwqptzcxnwzfzgrmt.supabase.co` (REST + auth)
   - (opsional) `cpvzwqptzcxnwzfzgrmt.supabase.co:5432` bila mau koneksi Postgres langsung
2. **Service-role key** proyek `cpvzwqptzcxnwzfzgrmt` — diserahkan lewat kanal aman, **bukan**
   ditempel di prompt atau di-commit.

### Langkah

```bash
# 1. .env.local — JANGAN commit. .gitignore sudah mengecualikan .env*.local; verifikasi dulu.
cat > .env.local <<'EOF'
NEXT_PUBLIC_SUPABASE_URL=https://cpvzwqptzcxnwzfzgrmt.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon key>
SUPABASE_SERVICE_ROLE_KEY=<service-role key>   # <-- paparan; lihat "Risiko"
EOF

# 2. Lewati login. Aplikasi memakai sesi auth Supabase; dua pilihan:
#    (a) Tambah rute dev khusus yang membuat server-client dengan service-role dan
#        merender screen langsung — TANPA cookie sesi. Pola /dev/* + notFound() di produksi
#        sudah melindunginya (lihat app/dev/layout.tsx). Ini yang paling bersih.
#    (b) Suntik cookie sesi hasil login manual ke context Playwright. Lebih ringkas tapi
#        cookie itu sendiri jadi kredensial yang harus dijaga.
#    Pilih (a): reuse pola dev, nol kredensial di browser.

# 3. Jalankan + screenshot (browser sudah terpasang, tak perlu unduh):
PORT=3939 npm run dev &
node screenshot.js   # executablePath: /opt/pw-browsers/chromium-1194/chrome-linux/chrome
```

### Sesudahnya — WAJIB

```bash
shred -u .env.local 2>/dev/null || rm -f .env.local   # hapus kunci dari disk sandbox
git status --short                                     # pastikan .env.local TIDAK ter-stage
```

---

## Risiko — kunci service-role di sandbox

Service-role key **melewati semua RLS**. Di sandbox itu berarti:

- **Paparan disk.** Selama `.env.local` ada, siapa pun/apa pun dengan akses baca ke sandbox
  bisa membaca kunci penuh-akses ke seluruh basis data produksi. Sandbox ephemeral, tapi
  "ephemeral" bukan "aman" — snapshot, log, atau proses lain bisa menangkapnya.
- **Paparan proses.** `process.env` terlihat oleh setiap child process. Setiap dependensi
  yang dijalankan `npm` saat server hidup bisa membacanya.
- **Bukan paparan sementara yang bisa diabaikan.** Kunci yang pernah menyentuh sandbox harus
  dianggap berpotensi bocor; mitigasi yang benar adalah **rotasi kunci** setelah selesai,
  bukan sekadar menghapus file.

**Karena itu jalur A (fixture) adalah default, dan jalur B butuh keputusan sadar.** Kalau
jalur B dipakai, rencanakan rotasi service-role key sesudahnya sebagai bagian dari prosedur,
bukan sebagai renungan belakangan.

---

## Rekomendasi

Pakai **jalur A** untuk semua pemeriksaan tampilan. Buka **jalur B hanya** bila ada
pertanyaan yang benar-benar butuh angka nyata mengalir lewat query nyata sampai ke pixel —
dan bila dibuka, perlakukan service-role key sebagai kredensial produksi yang, begitu
menyentuh sandbox, dijadwalkan untuk dirotasi.
