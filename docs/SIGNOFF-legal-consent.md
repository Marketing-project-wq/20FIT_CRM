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
