# CLAUDE CODE PROMPT — Sprint 3I: Menutup Pintu RPC, lalu Mendaratkan Jalur Tulis

> **Ada satu temuan yang harus dikerjakan lebih dulu, dan ia sudah live di produksi sejak Sprint 3A.**
>
> Sprint 3H menemukan bahwa Supabase otomatis memberi `EXECUTE` ke `anon` dan `authenticated` pada setiap fungsi baru di skema `public`, lalu menutupnya untuk migrasi 9. Laporannya menyebut fungsi `crm_*` lama "mungkin punya pola serupa" dan tidak menyentuhnya.
>
> **Bukan mungkin. Sudah dikonfirmasi ke produksi 11 Agustus 2026:**
>
> ```
> crm_purge_audit_log(dry_run boolean)
>   prosecdef = true   (SECURITY DEFINER, berjalan sebagai postgres)
>   proacl    = =X/postgres | postgres=X/postgres | anon=X/postgres
>               | authenticated=X/postgres | service_role=X/postgres
> ```
>
> `crm_purge_audit_log` adalah fungsi yang **menonaktifkan trigger append-only, menghapus baris audit, lalu menyalakannya kembali.** `EXECUTE`-nya terbuka untuk `anon`. Siapa pun yang memegang anon key bisa memanggilnya lewat `POST /rest/v1/rpc/crm_purge_audit_log` dengan `{"dry_run": false}` — tanpa login, tanpa peran, melewati seluruh gerbang RBAC yang dibangun tujuh sprint terakhir.
>
> **Dampak hari ini terbatas, dan itu justru alasan memperbaikinya sekarang:** baris audit tertua 10 Agustus 2026, jadi belum ada yang >90 hari dan panggilan hari ini menghapus nol baris. Kategori kepatuhan (`role.*`, `consent.*`, `suppression.*`, `export.*`, `retention.*`) dilindungi permanen oleh allowlist **dan** jaring pengaman denylist. Yang masih bisa dilakukan hari ini: menulis baris `retention.purge_executed` tanpa batas ke tabel append-only yang tak bisa dibersihkan siapa pun. Dan sekitar **8 November 2026** baris operasional pertama melewati 90 hari — sejak saat itu siapa pun dengan anon key bisa menghapus catatan siapa melihat data pelanggan siapa.

---

## ATURAN PROSES

```bash
git fetch --all --prune
git log --oneline -3 origin/main
git log --oneline origin/main..HEAD
```

Harapan: `origin/main` di `eff733c`; branch memuat 3G (`9a7b296`, `ef0ea89`) dan 3H (`c63280a`, `15cb3f7`, `a0035d9`) — **lima commit belum ter-merge**, jalur tulis suppression belum live. Berbeda → **berhenti dan lapor**.

Sprint ini menyentuh skema produksi (migrasi 10). Gate: **tulis → tunjukkan → tunggu → jalankan → verifikasi.**

---

# PROMPT UNTUK CLAUDE CODE — SALIN MULAI DARI SINI

---

## TUGAS 1 — Migrasi 10: cabut `EXECUTE` dari `crm_purge_audit_log`

Polanya sudah kamu tulis sendiri di migrasi 9. Terapkan ke migrasi 8.

```sql
revoke all on function public.crm_purge_audit_log(boolean) from public, anon, authenticated;
grant execute on function public.crm_purge_audit_log(boolean) to service_role;
```

**Aturan:**

- **Migrasi baru (10), jangan ubah migrasi 8.** Migrasi 8 sudah diterapkan; berkasnya catatan sejarah. Tambahkan komentar di berkas migrasi 10 yang menjelaskan kenapa ia ada — supaya orang yang membaca migrasi 8 saja tidak mengira grant-nya masih terbuka.
- **Cek tanda tangan fungsinya dulu.** `revoke` pada tanda tangan yang salah gagal diam-diam. Konfirmasi argumennya benar-benar `(boolean)` sebelum menulis.
- Verifikasi setelah jalan: `proacl` hanya memuat `postgres` dan `service_role`. Tak boleh ada `=X/postgres` telanjang (itu PUBLIC), tak boleh ada `anon`, tak boleh ada `authenticated`.
- **Buktikan fungsinya masih bekerja** setelah dicabut: panggil `crm_purge_audit_log()` (default `dry_run=true`) lewat service role, pastikan ia tetap melaporkan dan tidak menulis apa pun. Mencabut hak jangan sampai mematahkan jalur yang sah.

Gate: tampilkan SQL, **berhenti**, tunggu konfirmasi, jalankan lewat `apply_migration` (bukan `db push`).

---

## TUGAS 2 — Sapu seluruh objek `crm_*`, lalu pasang pagarnya

Satu perbaikan tidak menyelesaikan kelas masalahnya. Migrasi berikutnya akan mengulanginya kecuali ada yang menahan.

**Sapuan:** periksa **setiap** fungsi dan objek di bawah nama `crm_*` — bukan hanya yang kamu ingat menulis. Laporkan tabel: nama, `prosecdef`, `proacl`, dan verdict. Sertakan `crm_audit_log_no_mutate` (fungsi trigger) dengan penilaianmu apakah `EXECUTE` terbuka di sana benar-benar berbahaya atau tidak — dan jelaskan alasannya, jangan sekadar melewatinya.

**Pagar:** tulis test yang membaca seluruh berkas di `supabase/migrations/` dan **gagal** bila ada `create function` / `create or replace function` di skema `public` yang tidak diikuti pencabutan `EXECUTE` dari `public`/`anon`/`authenticated` di berkas yang sama. Pesan gagalnya harus menjelaskan **kenapa** — bahwa Supabase auto-grant, dan `revoke ... from public` saja tidak mencabut grant eksplisit per-peran.

**Buktikan pagarnya menggigit,** seperti pagar Tailwind di 3B dan paritas retensi di 3E: simpangkan sementara, tunjukkan pesan gagalnya, kembalikan, tunjukkan hijau lagi. Lampirkan keduanya.

**Di luar `crm_*`: JANGAN SENTUH.** Terkonfirmasi ada **99** fungsi `SECURITY DEFINER` di skema `public` yang dapat dieksekusi `anon` di proyek ini — hampir semuanya milik sistem tim lain (arena, clinic, shop, rb, my20fit, rc, uob, talent). Itu bukan milikmu dan bukan lingkup sprint ini.

Yang **harus** kamu lakukan: tulis `docs/RISIKO-rpc-execute-terbuka.md` — jelaskan pola auto-grant-nya, tunjukkan `crm_purge_audit_log` sebagai contoh nyata yang sudah diperbaiki, sebutkan angka 99 beserta cara mengukurnya sendiri, dan tegaskan sisanya keputusan pemilik proyek. Bentuknya sama dengan `docs/RISIKO-masking-bypass.md`: kontrolnya tidak ditembus, melainkan **dilewati**.

---

## TUGAS 3 — Luruskan ledger migrasi di README

Apply ganda migrasi 9 di Sprint 3H meninggalkan **dua entri ledger** bernama `create_crm_record_suppression`. Fungsinya benar (`create or replace` idempoten), tapi hitungannya tidak lagi cocok.

Verifikasi sendiri, lalu perbarui tabel ledger di README supaya akurat: jumlah entri ledger versus jumlah berkas migrasi di repo, termasuk entri ganda dan entri migrasi 10. Peringatan `db push` bersandar pada hitungan ini — kalau angkanya salah, peringatannya kehilangan dasar.

---

## TUGAS 4 — Daratkan 3G + 3H

Lima commit sudah menunggu, dan jalur tulis suppression tidak melindungi siapa pun selama ia ada di branch.

- Perbarui `docs/PR-sprint-3g-3h.md` supaya mencakup 3I, dan naikkan satu kalimat ke paling atas: **migrasi 10 memperbaiki lubang keamanan yang sudah live** — itu argumen terkuat untuk mendaratkan siklus ini, bukan menundanya lagi.
- Migrasi 10 berlaku di database **terlepas dari** apakah kodenya di-merge. Tulis itu eksplisit: perbaikan keamanannya tidak menunggu deploy.
- Rencana revert tiga tingkat dari 3H tetap berlaku, ditambah satu baris: migrasi 10 **tidak boleh** ikut direvert. Mengembalikan grant yang terbuka adalah membuka kembali lubangnya.

**JANGAN merge sendiri.** Siapkan, lalu minta izin.

---

## TUGAS 5 — Dua verifikasi yang masih menggantung, dan baris suppression pertama

**5a — Yang masih nol.** `profile.viewed` masih **0** dan belum ada `list.viewed` dengan `target_table='crm_audit_log'`. Detail profil dan layar audit `/settings` belum pernah dibuka satu kali pun sejak deploy. Keduanya sudah ada sebagai V-6/V-7 di ceklis — angkat ke bagian paling atas ceklis, karena keduanya hanya butuh satu orang membuka satu halaman dan sudah menunggu dua sprint.

**5b — Baris suppression pertama.** Setelah deploy, baris pertama harus berasal dari **permintaan nyata seseorang**, bukan dari uji coba. Kamu tidak boleh menulisnya: baris suppression tidak bisa dihapus, jadi baris uji akan jadi permanen dan mencemari catatan hukum.

Tulis `docs/PERTAMA-suppression.md` untuk orang yang akan mencatatnya:

- Apa yang dianggap permintaan sah, dan apa yang harus direkam sebagai `reason_code`
- Langkah persisnya di UI, termasuk langkah tinjau bentuk ternormalisasi sebelum menulis
- SQL untuk memastikan hasilnya benar: satu baris `crm_suppression`, satu baris `suppression.added` di audit, `crm_consent` tetap 0
- **SQL deteksi kegagalan atomik** dari PR §5c — baris suppression tanpa audit pasangannya, atau sebaliknya; keduanya harus nol. Ini satu-satunya cara melihat K-3 benar-benar ditegakkan di produksi, bukan hanya di probe rollback
- Apa yang harus dilakukan kalau ternyata salah orang yang di-suppress: **bukan** menghapus, melainkan `lifted` dengan alasan yang jujur

---

## LARANGAN

| Jangan | Alasan |
|---|---|
| Jangan ubah migrasi 8 atau migrasi mana pun yang sudah diterapkan | Berkasnya catatan sejarah; perbaikan lewat migrasi baru |
| Jangan sentuh fungsi atau tabel di luar `crm_*` | 99 fungsi bermasalah milik sistem tim lain — keputusan pemilik proyek |
| Jangan `INSERT` ke `crm_suppression` atau `crm_consent` | Baris suppression tak bisa dihapus; baris uji jadi permanen |
| Jangan bangun jalur tulis consent | Masih menunggu kanal opt-in yang nyata |
| Jangan buat migrasi lain selain migrasi 10 | Satu perubahan skema per siklus |
| Jangan jalankan `supabase db push` | Ledger diverge dan kini punya entri ganda |
| Jangan merge atau push ke `main` tanpa izin eksplisit | Deploy produksi ke sistem yang dipakai orang |
| Jangan buat/ubah/hapus `crm_user_role` | Mengendalikan akses akun manusia |
| Jangan `DELETE` dari `crm_suppression` | Sticky by design; pencabutan lewat `status='lifted'` |
| Jangan cetak PII di skrip, log, laporan, atau `metadata` audit | `identity_key` adalah PII |
| Jangan menyalakan RLS di tabel lama | Fase 0, milik tim |
| Jangan hapus prefix `NODE_ENV=production` di `railway.json` | Baca README dulu |

---

## LAPORAN PENUTUP

1. **Status remote + kondisi database** — apa adanya
2. **Migrasi 10** — SQL, versi ledger tercap, `proacl` sesudahnya, dan bukti `dry_run` masih bekerja lewat service role
3. **Sapuan `crm_*`** — tabel lengkap dengan verdict per objek, termasuk penilaianmu atas fungsi trigger; dan **bukti pagar gagal** saat disimpangkan, lalu hijau lagi
4. **Ledger** — hitungan entri versus berkas, dan baris README yang diperbarui
5. **Berkas PR** — kalimat teratas, dan catatan bahwa migrasi 10 tidak ikut direvert
6. **Dua verifikasi menggantung + panduan suppression pertama** — di mana, dan apa yang kamu minta dilakukan orang
7. **Yang ditemukan tapi tidak disentuh**
8. **Yang TIDAK bisa kamu verifikasi**

Gate akhir: `tsc --noEmit` bersih, `next lint` bersih, seluruh test hijau, `NODE_ENV=production npm run build` lulus. Sebutkan jumlah test sebelum dan sesudah.

Jangan klaim apa pun yang belum kamu jalankan dan lihat hasilnya.

# SELESAI — AKHIR PROMPT
