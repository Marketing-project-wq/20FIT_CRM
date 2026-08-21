# Rencana: koreksi kontak (typo email) — keputusan + bentuk, BELUM dibangun

> **Status: MEMO + RENCANA.** Sprint 3P membangun **deteksi + tanda** (per profil) dan
> **hitungan** (di `/quality`). Ia **tidak** membangun jalur koreksi, tabel, atau migrasi.
> Dokumen ini menaruh bentuknya di atas meja supaya saat dibangun, ia dibangun benar.

## Temuan yang memicu ini — `gmaol.com` bukan 986 salah ketik

Diverifikasi 11 Agustus 2026:

| Domain | Baris |
|---|---:|
| `gmaol.com` | **986** |
| `gmail.con` | 204 |
| `gmai.com` | 82 |
| `gamil.com` | 49 |

**986 baris `gmaol.com` seluruhnya `source='20fit_data_import'`, seluruhnya
`created_at = 2026-04-20` pada SATU instan, satu `first_seen_at`.** 986 salah ketik
independen tidak mendarat di satu instan. Ini **kerusakan sistematis saat impor** —
find/replace yang meleset atau pemetaan kolom yang salah pada muatan 20 April. Konsekuensi
yang lebih besar dari daftar typo: **kolom lain di muatan yang sama mungkin rusak dengan
pola serupa**. Itu perlu diselidiki oleh pemilik data sebelum ada koreksi apa pun — lihat
"Yang harus diselidiki dulu".

## Kenapa koreksi otomatis DILARANG

Mengubah alamat email seseorang atas tebakan bisa **mengirim data pribadinya ke orang
lain** — kerugian yang tak bisa ditarik, korbannya orang yang tak salah apa-apa. `gmaol.com`
memang hampir pasti `gmail.com`, tapi "hampir pasti" bukan "pasti", dan pemilik alamat asli
mungkin memang mengetik sesuatu yang lain. Karena itu: **nol koreksi massal, nol tombol
"perbaiki semua", konfirmasi manusia per baris.**

## Bentuk yang diusulkan — `crm_contact_correction` (BILA kelak dibuat)

Koreksi adalah **milik CRM**, TIDAK menimpa `master_customer` (read-only sejak Sprint 2).
Nilai asli selalu utuh & bisa dipulihkan.

```
crm_contact_correction
  id            uuid pk
  customer_id   uuid            -- FK master_customer (on delete set null, pola crm_consent)
  field         text            -- 'email' | 'phone' (closed list, CHECK)
  original_value text           -- nilai sumber, TAK PERNAH diubah
  corrected_value text          -- nilai yang disetujui manusia
  status        text            -- 'active' | 'reverted' (CHECK) — koreksi bisa dibatalkan
  confidence    text            -- 'high' | 'medium' saat disarankan (jejak, bukan gerbang)
  approved_by   uuid            -- aktor yang mengonfirmasi
  approved_at   timestamptz
  -- TIDAK menimpa master_customer; layar menggabungkan koreksi aktif saat menampilkan
```

**Aturan yang mengikat bentuk ini:**

- **Jalur tulis (K-14):** koreksi + baris audit dalam **satu transaksi** lewat fungsi
  `SECURITY DEFINER service_role`-only (pola `crm_record_suppression`). Bukan PostgREST
  `INSERT` telanjang.
- **Aksi audit `contact.corrected` / `contact.reverted`.** Ini jatuh di antara allowlist &
  denylist retensi (migrasi 8) — sama seperti `segment.*`. Ia **kepatuhan** ("siapa mengubah
  kontak siapa, kapan, dari apa ke apa") → masuk **denylist** (dilindungi permanen), dan itu
  butuh migrasi ke `crm_purge_audit_log` + paritas `retention-policy.ts` **dalam satu commit**
  (K-09). Keputusan sadar, bukan diselundupkan.
- **Tampilan menggabungkan, tidak membekukan:** layar membaca koreksi aktif dan menampilkan
  nilai terkoreksi + tetap menunjukkan aslinya (pola sama seperti nama rapi di 3P). Nilai
  asli **selalu terlihat dan bisa dipulihkan** (`status='reverted'`).
- **Suppression & consent tak berubah:** koreksi email tidak menyentuh kontaktabilitas;
  `isContactableForMarketing` tetap satu-satunya aturan.

## Yang harus diselidiki dulu (pemilik data, sebelum koreksi apa pun)

1. **Apakah kerusakan `gmaol.com` juga mengenai kolom lain** muatan 20 April (nama, telepon,
   kota)? Bila ya, itu temuan impor, bukan sekadar typo — dan koreksi per-baris email tak
   menyelesaikannya.
2. **Apakah domain asli benar-benar `gmail.com`** untuk baris-baris itu, atau `gmaol.com`
   menutupi campuran (sebagian mungkin domain lain yang kebetulan ikut ter-replace)?

## Yang dibangun 3P (dan hanya ini)

- `lib/crm/email-typo.ts` (murni + test): deteksi via daftar typo dikenal + jarak edit 1 ke
  domain populer; domain sah mirip (`gmail.co.uk`, `yahoo.co.id`) lolos.
- Detail profil: **tanda** "mungkin salah ketik" + saran + keyakinan. Nol tombol perbaiki.
- `/quality`: hitungan domain typo dikenal (live, OR of likes). Deteksi jarak-edit
  per-profil saja (tak bisa live via PostgREST).

---

> **Konteks:** K-14 (tulis atomik dengan audit), K-09 (satu sumber retensi), K-13
> (suppression menang), `docs/riwayat/TEMUAN.md` (typo sistematis sebagai temuan impor),
> `docs/RENCANA-simpan-segmen.md` (pola "aksi jatuh antara dua daftar").

---

## Temuan lanjutan — `email_normalized` NULL: 19 rusak + 108 tak ternormalkan (20 Agu 2026)

Dipicu oleh ekspor "telepon saja" yang ternyata menampilkan email (filter memakai
`email_normalized`, tampilan memakai `email` — dua field beda). Diukur langsung ke DB
(`cpvzwqptzcxnwzfzgrmt`): **127 profil punya `email` terisi tetapi `email_normalized` NULL.**
Terbelah tegas oleh sumber:

| sumber | jumlah | bentuk email | arti |
|---|---:|---|---|
| `20fit_data_import` (20 Apr 2026) | **19** | cacat (`@gmail` tanpa TLD, `gmail:com`, `gmail,com`, `@gmail.c` terpotong) | benar-benar "tak punya email pakai" |
| `live_txn_ingest` (31 Jul 2026) | **108** | **sah** (`joseph.soegandhi@gmail.com`, dst.) | email pakai, TAPI jalur ingest tak mengisi `email_normalized` |

**Sebab 108-nya:** `email_normalized` diisi oleh backfill/normalisasi satu-kali; jalur tulis
**`live_txn_ingest`** (muatan 31 Juli) menulis `email` mentah tapi **tidak** mengisi
`email_normalized`. Jadi 108 orang dengan email sah tercatat "tanpa email" oleh setiap
hitungan yang memakai `email_normalized` — termasuk dashboard "bisa dihubungi", pencocokan
consent, dan filter segmen. `phone_normalized` NULL yang punya `phone_raw` = **0**, jadi sisi
telepon bersih; hanya email yang bermasalah.

**Keputusan untuk ekspor (Export sprint, MASALAH 3):** `email_normalized` adalah identitas
kontak kanonik di SELURUH sistem, jadi ekspor memakainya untuk **filter DAN tampilan** (kolom
email menampilkan `email_normalized`, bukan `email` mentah). Ini menutup kebocoran (kategori
"tanpa email" tak lagi mencetak email) dan menjaga ekspor konsisten dengan angka lain. Ekspor
**tidak** beralih ke `email` mentah — itu akan ikut mencetak 19 alamat rusak dan memisahkan
ekspor dari setiap hitungan lain.

**Yang masih menggantung (perbaikan hulu, BUKAN di ekspor):** normalkan 108 email sah itu —
paling benar dengan membuat jalur `live_txn_ingest` mengisi `email_normalized` memakai
normalizer yang sama, atau backfill satu-kali atas 108 baris. Sampai itu terjadi, 108 orang
tetap terhitung "tanpa email" di mana-mana (0,13% dari 80.999 — kecil, tapi nyata) dan luput
dari kampanye email. Ini pekerjaan pemilik data + jalur ingest, sama seperti koreksi typo di
atas; ekspor tak boleh menebak diam-diam.
