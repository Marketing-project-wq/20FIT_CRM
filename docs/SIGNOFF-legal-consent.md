# Sign-off legal — migrasi 3 `crm_consent`

> Rujukan saat seseorang bertanya “atas dasar apa kolom consent ini begini”. Ditulis
> **sebelum** migrasi dijalankan (Sprint 3F). Aturannya: apa yang tidak saya lihat
> persetujuannya, ditulis **“belum terjawab”** — bukan diarang jadi persetujuan.

## Apa yang jelas disetujui

- **Menjalankan migrasi 3 `crm_consent` di produksi** — legal sudah memeriksa dan
  mengizinkan (pembuka Sprint 3F). Ini yang membuka Fase 2. Isi migrasi **tidak diubah**
  dari yang ditinjau; yang dijalankan = yang disetujui.

## Yang perlu dipastikan — status per hari ini

| Item | Yang tertulis di migrasi | Status sign-off |
|---|---|---|
| **K-1 — `on delete set null` + baris dipertahankan sebagai catatan historis** | Anonimisasi hanya benar bila `evidence` **ikut dikosongkan** saat `customer_id` di-null-kan; `form_id`/`message_id` bisa membatalkan anonimisasi lewat join tabel lain. | **BELUM TERJAWAB.** Saya tidak melihat pernyataan legal yang secara eksplisit menyetujui pendekatan set-null-plus-pengosongan-`evidence`, maupun menunjuk **siapa** yang bertanggung jawab menegakkan pengosongan `evidence` saat penghapusan. Penegakan itu belum ada kodenya (rutin penghapusan Sprint 3+ belum dibangun). **Konsekuensi hari ini: nol** — tabel kosong, tak ada `customer_id` yang akan di-null-kan. Tapi harus dijawab sebelum jalur hapus dibangun. Dicatat sebagai syarat terbuka di `docs/RENCANA-jalur-tulis-consent.md`. |
| **Kosakata `basis`** | CHECK dua nilai sementara: `legacy_import_unverified`, `explicit_opt_in`. Ditandai **NEEDS LEGAL INPUT** (UU 27/2022, bukan GDPR; `legitimate_interest` sengaja tak dipakai). | **BELUM TERJAWAB / diperlakukan SEMENTARA.** Saya tidak melihat daftar dasar pemrosesan **final** dari legal. Dua nilai ini **cukup untuk register baca-saja** sekarang, dan statusnya ditampilkan **eksplisit sebagai “sementara”** di layar `/consent` — tidak diperlakukan seolah lengkap. Bila legal menambah satu dasar, itu **migrasi baru** terhadap CHECK (ledger diverge — mahal), jadi keputusannya perlu diambil sadar, bukan diselundupkan. |

## Kenapa “belum final” bukan penghalang

`basis` yang belum final **tidak menghalangi** register baca-saja: nol baris consent
hari ini, jadi tak ada baris yang bergantung pada nilai `basis` mana pun. Yang penting
statusnya **jujur** — ditampilkan sebagai sementara, bukan final. Register ini
memverifikasi bentuk & aturan, bukan mengisi dasar hukum.

## Yang TIDAK dilakukan sprint ini (dan alasannya, agar sign-off ini lengkap)

- **Nol backfill.** Tidak ada `INSERT` — bukan 82.253 baris `legacy_import_unverified`,
  bukan satu baris uji. Mem-backfill akan membuat seluruh pool tampak punya dasar hukum
  yang **tidak pernah diverifikasi** siapa pun. Ketiadaan baris = jawaban yang benar
  (“tidak ada dasar untuk siapa pun”); menambah baris merusaknya. Lihat TUGAS 4.
- **Nol jalur tulis.** K-3 (tulis consent wajib satu transaksi dengan `crm_audit_log`)
  tak bisa dipenuhi PostgREST → butuh fungsi Postgres (DDL, keputusan tersendiri). Dan
  belum ada peristiwa `explicit_opt_in` nyata untuk ditunjuk. Rincian & prasyarat di
  `docs/RENCANA-jalur-tulis-consent.md`.

## Tindak lanjut yang harus dijadwalkan tim (bukan sprint ini)

1. Legal mengonfirmasi/menutup **K-1**: setujui pendekatan evidence-clearing dan tunjuk
   penanggung jawab, sebelum rutin penghapusan dibangun.
2. Legal memberikan **daftar `basis` final** (atau menyatakan dua nilai ini memang
   final) — supaya perubahan CHECK, bila perlu, direncanakan sebagai migrasi sadar.

---

## Pembaruan Sprint 3P (11 Agustus 2026) — pernyataan consent pemilik produk

**Pernyataan yang diterima:** pemilik produk menyatakan *seluruh data yang masuk sudah
memiliki consent dari tiap user, sehingga legal dipakai untuk marketing dan Customer
Service.* Pernyataan ini **diterima** — tetapi menurut K-03 ia harus **dicatat**, bukan
ditanam diam-diam (mis. membuat `isContactableForMarketing` mengembalikan `true` untuk
semua). Consent tercatat bisa ditunjukkan, dicabut per orang, dan beraudit; consent yang
diasumsikan tak satu pun. Karena itu 3P membangun **peta `basis`→`purpose`** di satu modul
teruji (`lib/crm/consent-policy.ts`), **bukan** backfill diam-diam.

### Tiga pertanyaan yang harus terjawab sebelum backfill — status

1. **Siapa menyatakan, kapan, cakupan sumber apa.** Dinyatakan pemilik produk (lisan,
   diteruskan lewat prompt Sprint 3P, 11 Agu 2026). **Cakupan sumber: belum dirinci.**
   Sumbernya berbeda-beda — pendaftaran event (Hyrox, race), pasien clinic, booking arena,
   pengguna my20fit — dan consent satu sumber bukan consent semua. Pernyataan "seluruh data"
   belum dipetakan ke daftar sumber konkret dengan tanggal & bentuk persetujuannya. **Terbuka.**
2. **`basis` mana yang dicatat.** Impor massal 20 April 2026 punya `first_seen_at`
   **seluruhnya cap waktu muat** (T-08) — **tidak ada catatan opt-in per orang** yang bisa
   ditunjuk. Maka `explicit_opt_in` **tidak jujur** untuk pool impor; nilai yang benar adalah
   **`legacy_import_unverified`**. Itu bukan penghalang — asal keputusan berikutnya sadar.
   **Terjawab: `legacy_import_unverified`.**
3. **Apakah `legacy_import_unverified` mengizinkan `purpose='marketing'`.** **Keputusan
   pemilik produk + legal, BUKAN keputusan kode ini.** Pemilik produk menyatakan ya secara
   lisan, tetapi belum ada catatan resmi yang (a) memetakan sumber dan (b) menyatakan basis
   impor legacy mengizinkan marketing. UU 27/2022 memisahkan "daftar lomba" dari "setuju
   promo". **Terbuka — diisolasi ke satu flag** `LEGACY_IMPORT_ALLOWS_MARKETING` (kini
   `false`). Membaliknya adalah tindakan tercatat, bukan rapikan kode.

### Peta yang dibangun (`lib/crm/consent-policy.ts`)

| `basis` | `transactional` | `marketing` |
|---|---|---|
| `explicit_opt_in` | ✅ | ✅ |
| `legacy_import_unverified` | ✅ | ⛔ sampai flag dibalik (keputusan legal) |

Satu gate `purposePermittedForBasis(basis, purpose)` yang **wajib** dipanggil jalur tulis
consent mana pun, fail-closed. Saat legal memutuskan, **satu konstanta** berubah.

### Keputusan backfill: **DITAHAN**

Backfill **tidak dijalankan** sprint ini. Alasan, eksplisit:
- Pertanyaan **1** (cakupan sumber) dan **3** (legacy→marketing) **belum terjawab tertulis
  resmi** — baru pernyataan lisan. Backfill sekarang akan membuat 82.253 profil tampak
  punya dasar hukum marketing yang belum diverifikasi per sumber — persis yang SIGNOFF 3F
  tolak.
- Backfill butuh **jalur tulis atomik** (K-14, pola `crm_record_suppression`) → **migrasi
  fungsi baru**. Prompt mengizinkan migrasi itu **hanya setelah 1–3 terjawab**. Karena
  belum, tak ada migrasi dibuat.
- **Suppression tetap menang** (K-13): apa pun backfill kelak, aturan kontak tunggal
  `isContactableForMarketing` tak diubah — suppression di atas consent, tak ada jalan pintas.

**Agar backfill bisa jalan (follow-up terjadwal, bukan sprint ini):** legal + pemilik
produk mencatat (1) daftar sumber + bentuk consent-nya dan (3) apakah `legacy_import_unverified`
mengizinkan marketing. Bila ya, balik `LEGACY_IMPORT_ALLOWS_MARKETING` dan tulis fungsi
backfill atomik dengan `basis='legacy_import_unverified'`, `evidence` menunjuk sumber, satu
transaksi dengan audit. Bila hanya transactional/CS yang disetujui, backfill dengan
`purpose='transactional'` saja — dan angka "boleh dihubungi untuk **marketing**" tetap 0,
yang benar.

---

> **Konteks lintas-sprint:** keputusan `docs/riwayat/KEPUTUSAN.md` **K-12** (migrasi 3 dijalankan apa adanya; syarat legal masih terbuka). Peta `basis`→`purpose`: `lib/crm/consent-policy.ts`. Jalur tulis: `docs/RENCANA-jalur-tulis-consent.md`.
