# CLAUDE CODE PROMPT — Sprint 3F: Consent Register (Fase 2 dibuka)

> **Legal sudah memeriksa dan mengizinkan. Migrasi 3 `crm_consent` boleh dijalankan.**
>
> Ini blokir terbesar sejak Sprint 2 dan pembukanya Fase 2. Tapi izin legal **bukan** izin untuk mengejar semuanya sekaligus. Sprint ini menjalankan migrasinya, membangun register-nya sebagai **baca saja**, dan membuat angka "bisa dihubungi" akhirnya diturunkan dari aturan sungguhan alih-alih ditulis nol.
>
> **Jalur tulis consent sengaja TIDAK dibangun sprint ini** — alasannya di TUGAS 5, dan itu alasan substansi, bukan kehati-hatian.
>
> **Yang TETAP ditahan:** pengisian `crm_*` dengan data pelanggan (Fase 0 / RLS OFF belum selesai), pengiriman pesan, ekspor, segment builder, alur approval, merge/unmerge.

---

## ATURAN PROSES

```bash
git fetch --all --prune
git log --oneline -3 origin/main
git log --oneline origin/main..HEAD
```

Harapan per 11 Agustus 2026: `origin/main` di `4bac312` (Sprint 3A, live dan dipakai orang); branch memuat `bf736b0`, `322377f`, `68dd66f`, `9c44c00` — empat sprint belum ter-merge. Berbeda → **berhenti dan lapor**.

**Ini sprint pertama sejak 3A yang menyentuh skema produksi.** Gate-nya lebih ketat, bukan lebih longgar: **tulis → tunjukkan → tunggu → jalankan → verifikasi.** Untuk TUGAS 2, "tunjukkan" berarti berhenti dan menampilkan SQL persisnya sebelum menjalankan apa pun.

---

## PRASYARAT

1. Bekerja di atas `9c44c00`. Baseline `npm test` hijau (170 test). Merah → berhenti dan lapor.
2. Kondisi terverifikasi 11 Agustus 2026: `to_regclass('public.crm_consent')` = **NULL** (tabel belum ada). Ledger memuat tujuh migrasi `crm_*` (enam satelit + `create_crm_purge_audit_log`), **tanpa** consent. Verifikasi ulang sendiri sebelum menjalankan.
3. **Proyek Supabase ini dipakai bersama tim lain.** Ledger menunjukkan migrasi dari sistem lain masuk di hari yang sama (`my20fit_email_templates`, `talent_documents_…`, `division_event_mirror`). Kamu bukan satu-satunya yang menulis ke database ini — jangan berasumsi ledger hanya berisi pekerjaanmu, dan jangan pernah menjalankan sesuatu yang menyentuh tabel di luar `crm_*`.

---

# PROMPT UNTUK CLAUDE CODE — SALIN MULAI DARI SINI

---

## TUGAS 1 — Catat apa yang legal sebenarnya setujui

**Kerjakan ini SEBELUM menyentuh migrasi.**

Header migrasi 3 memuat dua hal yang secara eksplisit ditandai menunggu legal. "Legal mengizinkan" tidak otomatis berarti keduanya terjawab:

| Item | Yang tertulis di migrasi | Yang perlu dipastikan |
|---|---|---|
| **K-1** — `on delete set null` + baris dipertahankan sebagai catatan historis | Anonimisasi hanya berlaku bila `evidence` **ikut dikosongkan** saat `customer_id` di-null-kan; `form_id`/`message_id` bisa membatalkan anonimisasi lewat join tabel lain | Apakah legal menyetujui pendekatan ini, dan siapa yang bertanggung jawab menegakkan pengosongan `evidence` |
| **Kosakata `basis`** | Hanya dua nilai sementara: `legacy_import_unverified`, `explicit_opt_in`. Ditandai **NEEDS LEGAL INPUT** (UU 27/2022, bukan GDPR — `legitimate_interest` sengaja tidak dipakai) | Apakah legal memberi daftar dasar pemrosesan final, atau dua nilai ini tetap sementara |

Ini penting karena `basis` adalah **CHECK constraint**. Kalau legal nanti menambah satu dasar pemrosesan, itu migrasi baru terhadap ledger yang sudah diverge — mahal. Sedangkan kalau daftarnya memang belum final, itu **bukan penghalang**: dua nilai sekarang cukup untuk register baca-saja, asal statusnya dicatat jujur, bukan diperlakukan seolah final.

**Tulis `docs/SIGNOFF-legal-consent.md`:** tanggal, siapa yang menyetujui, apa persisnya yang disetujui, dan **apa yang masih terbuka**. Kalau kamu tidak punya jawaban untuk salah satu baris di tabel atas, tulis "belum terjawab" — **jangan mengarang persetujuan yang tidak kamu lihat**. Dokumen ini akan jadi rujukan saat seseorang bertanya "atas dasar apa kolom ini begini".

---

## TUGAS 2 — Jalankan migrasi 3

**Jalankan apa adanya dari file `supabase/migrations/20260810074536_create_crm_consent.sql`.** Jangan "rapikan", jangan tambah indeks, jangan ubah satu constraint pun. File itu sudah ditinjau; mengubahnya sekarang berarti yang dijalankan bukan yang disetujui.

**Urutan wajib:**

1. Verifikasi `to_regclass('public.crm_consent')` masih NULL. Kalau sudah ada, **berhenti** — seseorang sudah menjalankannya.
2. **Tampilkan SQL persisnya dan berhenti.** Tunggu konfirmasi sebelum menjalankan.
3. Jalankan lewat jalur satu-per-satu yang ditinjau (`apply_migration`), **BUKAN** `supabase db push`. `db push` akan mencoba menjalankan ulang ketujuh migrasi repo karena tak satu pun timestamp nama file ada di ledger.
4. Verifikasi setelahnya: tabel ada; RLS **ON** dengan **nol** policy; keempat CHECK constraint terpasang; UNIQUE `(customer_id, channel, purpose)` ada; FK ke `master_customer` bersifat `ON DELETE SET NULL` (**bukan** cascade); jumlah baris **0**.
5. **Perbarui tabel ledger di README.** `apply_migration` mencap versinya sendiri yang tidak cocok dengan timestamp nama file — persis pola enam migrasi sebelumnya. Ganti baris "— dilewati (ditahan legal) —" dengan versi ledger sungguhan, dan perbarui peringatan `db push` supaya menyebut tujuh dari tujuh, bukan enam.

**Catatan operasional:** migrasi ini menambah FK ke `master_customer`, tabel yang sedang dipakai aplikasi lain di proyek bersama ini. Kuncinya singkat (tabel baru kosong, tak ada yang divalidasi), tapi sebutkan waktu jalannya di laporan.

**Nol backfill.** Jangan `INSERT` satu baris pun — tidak untuk 82.253 profil, tidak untuk satu profil uji. Alasannya di TUGAS 4, dan ini bukan kelalaian yang perlu ditambal nanti.

---

## TUGAS 3 — Layar `/consent`, baca saja

Ganti `ComingSoon`. Gerbang: `consent.edit` sudah dipakai `canSeeNav("/consent")` — jangan ubah gerbangnya meskipun layarnya baca saja untuk sekarang.

Aturan keras sama seperti layar baca lain: route handler server-side + service role (RLS ON tanpa policy — anon key tidak bisa dan tidak boleh), paginasi, nol tombol tulis. Aturan audit Sprint 3C berlaku: layar ini mengembalikan baris individual dan menerima filter, jadi **wajib audit** — pakai `list.viewed` dengan `target_table='crm_consent'`, **jangan** buat aksi baru.

**Yang ditampilkan:**

- Register consent (`crm_consent`) — **0 baris hari ini**
- Suppression list (`crm_suppression`) — **0 baris hari ini**
- Untuk keduanya: kosong ditampilkan sebagai kosong yang **bermakna**, bukan tabel hampa. Jelaskan apa artinya nol di sini dan apa konsekuensinya.

**Yang harus jujur terlihat, dan ini inti layarnya:**

> **Nol baris consent = nol orang boleh dikirimi marketing.** Bukan "belum ada data", melainkan "tidak ada dasar hukum untuk siapa pun".

Tampilkan juga hierarki aturannya, karena ini yang akan salah dipahami duluan: **suppression MENANG atas consent** — bila seseorang ada di suppression, ia tidak boleh dihubungi apa pun status consent-nya. Ini ditegakkan di kode, bukan di constraint database, jadi harus terbaca di layar.

Tampilkan kosakata `basis` yang berlaku beserta statusnya (final atau sementara, sesuai hasil TUGAS 1) — jangan tampilkan dua nilai sementara seolah daftar lengkap.

---

## TUGAS 4 — "Bisa dihubungi" diturunkan sungguhan

Sejak Sprint 3B kartu dashboard "Bisa dihubungi" menampilkan `0` **hardcode**, dengan hint bahwa consent register belum ada. Nilainya kebetulan benar, tapi asalnya salah: itu angka yang ditulis manusia, bukan dihitung.

Sekarang tabelnya ada. Turunkan angkanya dari aturan sungguhnya:

> **Bisa dihubungi** = punya baris consent `channel` tertentu, `purpose='marketing'`, `status='active'`, **DAN** identitas kontaknya tidak ada di `crm_suppression` dengan status aktif.

Hasilnya tetap `0` hari ini — tapi sekarang `0` itu **terukur**, dan aturan 3B berlaku sepenuhnya: `0` berarti sudah diukur, `—` berarti belum ada sumbernya. Kartu itu berpindah dari kolom kanan ke kolom kiri.

**Ketiadaan baris consent = TIDAK boleh dihubungi.** Fail-closed, konsisten dengan RBAC. Inilah kenapa TUGAS 2 melarang backfill: mem-`INSERT` 82.253 baris `legacy_import_unverified` akan membuat seluruh pool tampak punya dasar hukum yang tidak pernah diverifikasi siapa pun. Ketiadaan baris sudah menjawab dengan benar; menambahkannya justru merusak jawabannya.

Tulis aturan turunan ini **satu kali**, di satu modul, dengan test fungsi murninya (himpunan consent + himpunan suppression → boleh/tidak). Aturan yang bisa jadi fungsi murni harus punya test — aturan Sprint 3E berlaku terus.

---

## TUGAS 5 — Dokumentasikan kenapa jalur tulis ditunda

Ini bukan basa-basi. Ada dua alasan substantif, dan keduanya perlu tertulis supaya sprint berikutnya tidak mengulang analisisnya.

**Alasan 1 — K-3 tidak bisa dipenuhi dengan `supabase-js`.** Migrasi 3 mensyaratkan: setiap tulis/ubah baris consent **wajib satu transaksi** dengan penulisan `crm_audit_log`. Alasannya tertulis di header: baris current-state bisa di-`UPDATE`, jadi ia bukan bukti — buktinya adalah audit trail; audit best-effort berarti kekuatan pembuktian hilang tanpa disadari.

PostgREST **tidak bisa** membungkus dua `INSERT` ke tabel berbeda dalam satu transaksi. Artinya jalur tulis consent **mewajibkan fungsi Postgres** — dan itu DDL baru terhadap ledger yang diverge, keputusan tersendiri yang tidak boleh diselundupkan ke sprint ini.

**Alasan 2 — belum ada peristiwa consent untuk ditunjuk.** Mencatat `explicit_opt_in` tanpa peristiwa opt-in yang nyata berarti mengarang dasar hukum. Tidak ada formulir, tidak ada ingestion, tidak ada kanal yang menghasilkan peristiwa itu hari ini. Menyediakan tombolnya lebih dulu adalah mengundang orang mengisi apa yang belum terjadi — persis bahaya yang tabel ini ada untuk mencegahnya.

**Tulis `docs/RENCANA-jalur-tulis-consent.md`:** bentuk fungsi Postgres yang dibutuhkan, apa yang harus dijamin atomik, apa yang harus masuk `evidence` dan apa yang **dilarang** masuk (K-1), serta prasyarat non-teknis — kanal apa yang harus ada dulu supaya `explicit_opt_in` punya arti.

---

## TUGAS 6 — Perbarui berkas PR

`docs/PR-sprint-3b-3e.md` → cakup 3F, ganti nama. Yang wajib berubah:

- **Sprint ini mengubah skema produksi.** Sampai sekarang seluruh branch bisa direvert dengan mengembalikan kode. Tidak lagi: tabel `crm_consent` tetap ada setelah revert kode. Tulis itu eksplisit, sertakan `drop table if exists public.crm_consent;` dari blok ROLLBACK migrasi, dan sebutkan kapan drop itu aman (selama nol baris) dan kapan tidak (begitu ada satu baris consent, ia jadi catatan hukum).
- Risiko teratas tetap sama dan kini lebih besar: **lima sprint** kode belum pernah dieksekusi terhadap Supabase, dan sekarang ada tabel baru yang hanya disentuh oleh kode yang belum pernah jalan.

**JANGAN merge, jangan buka PR ke `main` tanpa izin eksplisit.**

---

## LARANGAN

| Jangan | Alasan |
|---|---|
| Jangan ubah isi migrasi 3 | Yang dijalankan harus yang ditinjau dan disetujui |
| Jangan `INSERT` satu baris pun ke `crm_consent` | Ketiadaan baris adalah jawaban yang benar (TUGAS 4) |
| Jangan bangun jalur tulis consent | K-3 butuh fungsi Postgres — keputusan tersendiri (TUGAS 5) |
| Jangan jalankan `supabase db push` | Akan menjalankan ulang tujuh migrasi repo |
| Jangan buat migrasi/view/RPC lain selain migrasi 3 | Ledger diverge; satu perubahan skema per sprint |
| Jangan sentuh tabel di luar `crm_*` | Proyek Supabase ini dipakai bersama tim lain |
| Jangan merge atau push ke `main` | Deploy produksi ke sistem yang sedang dipakai orang |
| Jangan buat/ubah/hapus `crm_user_role` | Mengendalikan akses akun manusia |
| Jangan buat aksi audit baru | Allowlist migrasi 8 memangkas per nama eksak |
| Jangan jadwalkan purge | Memo keputusan sudah ada |
| Jangan menyalakan RLS di tabel lama | Fase 0, milik tim |
| Jangan cetak PII di skrip, log, atau laporan | — |
| Jangan hapus prefix `NODE_ENV=production` di `railway.json` | Baca README dulu — sudah salah dua kali |

---

## LAPORAN PENUTUP

1. **Status remote** — keluaran `fetch` + tiga `git log`, apa adanya
2. **Sign-off legal** — apa yang disetujui, apa yang masih terbuka, dan status kosakata `basis`
3. **Migrasi 3** — SQL yang dijalankan, versi ledger yang tercap, hasil verifikasi keenam poin (tabel, RLS, CHECK, UNIQUE, FK `set null`, 0 baris), waktu jalan, dan baris README yang diperbarui
4. **Layar consent** — bagaimana nol baris ditampilkan sebagai bermakna, dan bagaimana "suppression menang" terbaca
5. **Bisa dihubungi** — aturan turunannya, di mana ditulis, testnya, dan konfirmasi hasilnya `0` **terukur**
6. **Jalur tulis** — ringkasan rencana dan dua alasan penundaan
7. **Berkas PR** — nama baru, dan kalimat tentang revert yang tidak lagi cukup mengembalikan kode
8. **Yang ditemukan tapi tidak disentuh**
9. **Yang TIDAK bisa kamu verifikasi**

Gate akhir: `tsc --noEmit` bersih, `next lint` bersih, seluruh test hijau, `NODE_ENV=production npm run build` lulus. Sebutkan jumlah test sebelum dan sesudah.

Jangan klaim apa pun yang belum kamu jalankan dan lihat hasilnya.

# SELESAI — AKHIR PROMPT
