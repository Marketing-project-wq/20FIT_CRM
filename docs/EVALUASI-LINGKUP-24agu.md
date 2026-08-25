# Evaluasi lingkup terhadap `KEBUTUHAN-SISTEM.md` — 24 Agustus 2026

Sprint evaluasi (bukan bangun fitur). Rujukan: [`KEBUTUHAN-SISTEM.md`](KEBUTUHAN-SISTEM.md).
**Nol penghapusan dilakukan** — tiap butir di bawah adalah laporan + usulan; penghapusan
menunggu persetujuan pemilik produk.

---

## A. Sapuan — yang bertentangan atau sudah tidak berguna

Tiap butir: **apa**, **kenapa tak sesuai**, **usulan** (hapus / ubah nama / biarkan), dan apakah
ia **menghalangi**, **membingungkan**, atau **masih berguna dengan nama lain**.

### A1. Bahasa "consent sebagai penghalang" — SUDAH DIREFRAME sprint ini (frame + bahasa)
- **Apa.** Kartu "Bisa dihubungi" (dashboard), subtitle & warn `/consent`, dan caveat "punya
  identifier ≠ bisa dihubungi" di `/quality` semuanya menjelaskan kontak lewat **consent**.
- **Kenapa tak sesuai.** `KEBUTUHAN-SISTEM.md` §7: consent **bukan** gerbang. Framing lama
  membingungkan (menyiratkan izin per-orang menahan kontak) padahal fungsinya sudah "pool −
  unsubscribe".
- **Dilakukan (frame/bahasa, nol perubahan angka/logika, K-36):** kartu dashboard →
  "seluruh pool − yang berhenti berlangganan"; `/consent` dibingkai ulang jadi **daftar
  unsubscribe** (register consent jadi arsip dasar hukum baca-saja); caveat `/quality` menunjuk
  unsubscribe. Sisa kalimat "apa pun status consent-nya" (di pesan suppression) **dibiarkan** —
  ia menegakkan "suppression menang", bukan menyajikan consent sebagai penghalang.

### A2. Peta `basis`→`purpose` (3P, `lib/crm/consent-policy.ts`) — LAPISAN YANG TAK MENENTUKAN APA PUN
- **Apa.** Modul + test yang memetakan `basis` (legacy_import_unverified / explicit_opt_in) →
  `purpose` (marketing / transactional), dengan satu flag `LEGACY_IMPORT_ALLOWS_MARKETING`.
- **Kenapa tak sesuai.** **Tidak diimpor oleh berkas non-test mana pun.** Jalur contactability
  yang benar-benar berjalan (`crm_contactable_counts` + `isContactableForPurpose`) hanya
  anti-join ke `crm_suppression` — tak pernah memanggil peta ini. Jadi ia sudah lapisan mati
  **sebelum** K-36; dengan K-36 (consent bukan gerbang) ia makin tak menentukan apa pun.
- **Usulan.** **Biarkan berkasnya (jangan hapus), tapi tandai "tidak aktif".** Ia catatan sah
  tentang bagaimana keputusan legal AKAN dikodekan bila consent kelak jadi pembeda lagi (syarat
  pembalikan K-36). Menghapusnya membuang cetak-biru pembalikan. Usulan konkret: tambah komentar
  kepala "TIDAK DIWIRING — arsip untuk pembalikan K-36" (belum dilakukan; menunggu izin).
- **Kategori:** masih berguna dengan peran berbeda (cetak-biru pembalikan), bukan penghalang.

### A3. Gerbang ekspor `approval` untuk `crm_operator` & `unit_manager` — **BUTUH KEPUTUSAN ANDA**
- **Apa.** Di `lib/auth/roles.ts`: `crm_operator` dan `unit_manager` punya
  `export.at_or_below_threshold = "approval"`, `export.above_threshold = "deny"`. Alur
  persetujuan **tak pernah dibangun**, jadi permintaan ekspor mereka **ditolak** dengan "butuh
  persetujuan, fitur belum tersedia".
- **Kenapa relevan.** `KEBUTUHAN-SISTEM.md` tak menyebut alur persetujuan ekspor. Jadi status
  "approval" kini menolak sesuatu yang dokumen kebutuhan tak minta ditolak — tapi **membuka
  ekspor adalah kewenangan mengirim data keluar**, bukan keputusan teknis.
- **Usulan.** **TIDAK saya putuskan.** Pertanyaan diangkat ke pemilik produk (bagian D-1).
  Tiga opsi: (a) biarkan menolak; (b) turunkan ke `allow` untuk ≤ ambang; (c) bangun alur
  persetujuan ringan. Sampai dijawab, perilaku sekarang (menolak) dipertahankan.

### A4. Dokumen rencana yang mungkin usang oleh `KEBUTUHAN-SISTEM.md`
- `docs/RENCANA-jalur-tulis-consent.md` — rencana jalur tulis consent. **Sebagian usang:** K-36
  membuat consent bukan gerbang, jadi "kanal opt-in per-orang" turun prioritas. **Usulan:** ubah
  status jadi "ditunda — lihat K-36", jangan hapus (jadi relevan lagi bila consent kembali jadi
  pembeda).
- `docs/RENCANA-koreksi-kontak.md`, `docs/RENCANA-multisumber.md`, `docs/RENCANA-render-data-nyata.md`,
  `docs/RENCANA-simpan-segmen.md`, `docs/RENCANA-tulis-demografi.md`, `docs/RENCANA-gerbang-nik.md`,
  `docs/RENCANA-ingest-ticket.md`, `docs/RENCANA-agregat-event-dashboard.md` — **tidak bertentangan**
  dengan dokumen kebutuhan; sebagian justru menyokong separuh "menghubungi" (simpan-segmen,
  agregat-event). **Usulan:** biarkan; tinjau saat peta jalan dieksekusi.

---

## B. Yang JELAS tetap (meski terdengar seperti kepatuhan)

Ditegaskan agar tidak ikut tersapu:

- **Audit pengiriman** — tiap kampanye yang gagal harus bisa ditelusuri & tak dikirim dua kali
  (`KEBUTUHAN-SISTEM.md` §7). **TETAP.**
- **`crm_suppression` + pemeriksaannya di tiap jalur keluar** — itulah tabel unsubscribe yang
  diminta (§6). **TETAP**, dan kini satu-satunya gerbang (K-36), jadi makin penting.
- **`crm_consent` (408.119 baris)** — catatan sah dasar hukum, baca-saja. **TETAP** (D-1).

---

## C. Ringkas status vs `KEBUTUHAN-SISTEM.md` §8

Separuh "mengenali" **ada**; separuh "menghubungi" **belum dimulai** — sesuai dokumen. Tidak ada
temuan yang membantah §8. Peta jalan separuh "menghubungi": [`PETA-JALAN-menghubungi.md`](PETA-JALAN-menghubungi.md).

---

## D. Pertanyaan untuk pemilik produk (juga terkumpul di laporan sprint)

1. **Gerbang ekspor** `crm_operator`/`unit_manager` (A3): tetap menolak, buka ≤ ambang, atau
   bangun alur persetujuan? (Kewenangan mengirim data keluar.)
2. Sisanya (kanal chat, pop-up, fitpoint, "tidak kembali", batas Mailtrap, arsitektur pemicu) di
   `PETA-JALAN-menghubungi.md` §Pertanyaan.
