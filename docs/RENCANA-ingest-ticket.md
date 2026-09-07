# RENCANA — Ingest pembeli ticket.20fit.id (event "Indonesia Sports Summit 2026 – JHR")

> ## ✏️ KOREKSI (2026-09-02) — `legacy_import_unverified` TIDAK berlaku untuk jalur `csv_import`
>
> Dokumen ini (dan T-24) menyatakan bahwa impor massal masuk sebagai **`legacy_import_unverified`** =
> ada di pool tetapi TIDAK boleh dikirimi pemasaran. Dengan keputusan pemilik produk **2026-09-02**,
> aturan itu **SALAH untuk jalur impor CSV audiens** (`source='csv_import'`, lihat
> `docs/RENCANA-impor-audiens.md`). Bedanya jelas dan sengaja dibedakan:
>
> - **Jalur `csv_import` → LANGSUNG contactable.** Data ini bukan daftar asing: consent sudah diberikan
>   **di titik pengumpulan** (mis. formulir pendaftaran Sportfest), dan impor hanya memindahkan data yang
>   seharusnya sudah ada di Supabase. Jadi K-36 berlaku penuh: consent bukan gerbang, unsubscribe +
>   suppression tetap satu-satunya pengunci. Operator **wajib** mengisi "sumber pengumpulan" yang
>   disimpan sebagai **bukti** (baris `crm_consent`, basis `explicit_opt_in`) — bukti, bukan gerbang.
> - **`legacy_import_unverified` tetap berlaku** untuk impor yang provenance-nya **memang tidak
>   diketahui** — daftar asing tanpa titik-consent yang jelas (mis. skenario 598 pembuka tiket di
>   dokumen ini, selama §4 belum dijawab). Itu masuk pool tapi tidak dipasarkan.
>
> **Jangan** memakai keputusan `csv_import` sebagai preseden untuk daftar asing. Yang membedakan bukan
> "diimpor lewat CSV atau tidak" — yang membedakan adalah **apakah consent benar-benar diperoleh di titik
> pengumpulan**. Kalau tidak jelas, default tetap `legacy_import_unverified`.

**Status: INVESTIGASI — BERGATE. Belum diimplementasikan.** Dokumen ini TUGAS B: memetakan apa yang
bisa dan tidak bisa dikerjakan, bukan membangun pipeline. Tidak ada kode ingest yang ditulis sampai
pemilik menyetujui salah satu opsi di bawah.

Diverifikasi lewat Supabase MCP + pembacaan Edge Function `sync-ticket-events`, 2026-08-21.

---

> ## ⛔ BLOKIR
>
> **Ingestion 598 pembeli DIBLOKIR sampai status consent di checkout ticket.20fit.id diketahui.**
> Kalau checkout tidak meminta izin dihubungi, mereka masuk sebagai `legacy_import_unverified` — ada di
> pool, **tidak boleh** dikirimi pemasaran (T-24, sama seperti seluruh pool). Membangun pipeline sebelum
> fakta ini jelas berarti menambah 598 baris yang **belum tentu bisa dipakai** — kerja yang mungkin
> sia-sia, plus 598 PII baru yang wajib dijaga tanpa nilai pemasaran yang pasti.
>
> Ini **bukan** "belum diketahui" yang pasif — ini **prasyarat keras**. Dua hal harus jelas SEBELUM ada
> baris kode ingest: **(1)** jalur akses pembeli (embed API vs koneksi DB langsung — §2/§3), dan
> **(2)** ada/tidaknya titik consent pemasaran di checkout (§4). Salah satu belum jelas → tetap diblokir.

---

## 1. Apa yang benar-benar ditarik sekarang

`sync-ticket-events` (Edge Function, versi 1, `verify_jwt=true`) memanggil **satu** endpoint:

```
GET https://ticket.20fit.id/api/embed/v1/events
Authorization: Bearer <TICKET_EMBED_KEY>
```

Untuk tiap event ia membaca **hanya katalog**: `slug`, `title`, `organizer`, `venue`, `city`,
`startsAt`, `priceFromSen`, `bannerUrl`, dan array `ticketTypes[]` (dari situ `sold` dan `quota`
dijumlahkan). Nilai yang disimpan ke `my20fit_ticket_events`:

`sold_count = Σ ticketTypes[].sold` — **angka agregat, bukan daftar orang.**

**Tidak ada satu baris pun** di fungsi ini yang meminta pembeli, peserta, order, atau email.
Endpoint yang dipanggil hanya `/events`. Konfirmasi prompt: cron ini menarik katalog + angka saja.

Baris eventnya di DB:

| name | sold_count | status | rc_event_id | starts | synced |
|---|---|---|---|---|---|
| Indonesia Sports Summit 2026 – Jakarta Hybrid Race | **598** | on_sale | **NULL** | 2026-09-11 | 2026-08-20 |

`rc_event_id = NULL` → tidak tertaut ke race `rc_events` mana pun, jadi tidak ada `rc_participants`
atau `rc_ticket_invites` untuk event ini. **598 murni angka penjualan; nol identitas.**

---

## 2. Empat pertanyaan investigasi

**(1) Apakah endpoint sumber juga menyediakan pembeli?**
**Tidak bisa saya verifikasi dari sini.** Kode hanya memanggil `/events`. Apakah embed API punya
endpoint seperti `/events/{slug}/orders` atau `/attendees` **tidak diketahui** — fungsi tak pernah
mencobanya, dan saya tidak punya `TICKET_EMBED_KEY` maupun akses langsung ke ticket.20fit.id dari
lingkungan ini. Catatan penting: kunci ini bernama **embed key**. Kunci embed biasanya ber-scope
katalog publik (untuk disematkan di halaman promosi), sehingga **belum tentu** mengekspos PII
pembeli walaupun datanya ada di database ticket.20fit.id. Pemilik menyatakan "email pembeli
tersimpan dan bisa diakses" — itu mungkin benar di level **database** ticket.20fit.id, tetapi jalur
akses (embed API vs koneksi DB langsung vs endpoint terautentikasi lain) **harus dipastikan dulu**
sebelum ada rencana teknis. Saya tidak menebak.

**(2) Bentuk data pembeli — ada gender/DOB seperti `rc_ticket_invites`?**
**Tidak bisa saya verifikasi** tanpa contoh payload pembeli dari ticket.20fit.id. Yang bisa saya
katakan: event JHR sebelumnya yang formnya masuk ke sistem ini (`rc_ticket_invites`, PLATAROX 16 Jul)
menyimpan per peserta: `name, email, phone_number, gender, date_of_birth` (dan field terlarang NIK/
golongan darah/kontak darurat). **Jika** ticket.20fit.id memakai form serupa, bentuknya mungkin mirip
— tapi ini asumsi, bukan fakta terverifikasi.

**(3) Apakah checkout meminta izin dihubungi (consent)?**
**Tidak diketahui.** Tidak ada data checkout ticket.20fit.id di sistem ini untuk diperiksa. Pada form
JHR yang ADA di sini (`rc_ticket_invites.form_data.ticket_fields`), satu-satunya field mirip-consent
adalah **health/liability waiver** ("…I voluntarily participate at my own risk…") — itu persetujuan
risiko olahraga, **bukan** izin pemasaran. Tidak ada checkbox "boleh dihubungi untuk promosi". Jika
checkout ticket.20fit.id sama, maka 598 orang itu **tidak** punya consent pemasaran (lihat §4).

**(4) Estimasi berapa dari 598 yang sudah ada di `master_customer`?**
**Tidak bisa diestimasi dengan andal — nol identitas untuk dicocokkan.** Kita tidak punya satu pun
email/telepon dari 598 itu, jadi tak ada yang bisa di-anti-join ke pool. Satu-satunya proksi lemah:
event JHR sebelumnya (PLATAROX, 819 peserta) beririsan ~32% dengan pool (233 dari 723 identitas unik
sudah ada). Menerapkan laju itu ke 598 memberi **kira-kira ~190 mungkin sudah dikenal, ~408 baru** —
tapi ini analogi antar-event yang berbeda audiens; **jangan** dijadikan angka perencanaan. Angka
sebenarnya baru bisa dihitung setelah ada email/telepon 598 orang tersebut.

---

## 3. Yang TIDAK bisa saya verifikasi dari lingkungan ini (dikatakan terus terang)

- Apakah embed API ticket.20fit.id punya endpoint pembeli/attendee.
- Skema/field data pembeli di ticket.20fit.id (termasuk apakah ada gender/DOB/consent).
- Isi `TICKET_EMBED_KEY` dan scope-nya (katalog saja vs termasuk PII).
- Apakah ada jalur akses lain (koneksi DB langsung, endpoint admin terautentikasi) yang dimaksud
  pemilik saat berkata "bisa diakses".

Langkah pemastian yang HANYA bisa dilakukan pemilik / yang punya kredensial:
`curl -H "Authorization: Bearer $TICKET_EMBED_KEY" https://ticket.20fit.id/api/embed/v1/events?debug=1`
(fungsi sudah mendukung `?debug=1` → mengembalikan 1 event mentah) untuk melihat field apa yang
dikembalikan upstream; lalu memeriksa apakah ada endpoint order/attendee terdokumentasi.

---

## 4. Consent — batas yang tidak boleh dilanggar

Konsisten dengan TUGAS A4 dan seluruh pool (82.253 identitas `legacy_import_unverified`): **membeli
tiket ≠ opt-in pemasaran.** Bila 598 orang ini kelak diingest, mereka masuk sebagai
`legacy_import_unverified` — ada di pool, **tidak boleh** dikirimi pemasaran — kecuali ada bukti titik
consent pemasaran eksplisit di checkout ticket.20fit.id. Sampai bukti itu ada, asumsinya: tidak ada
consent pemasaran.

---

## 5. Opsi bergate (pilih; belum dikerjakan)

- **B-opsi-1 — Pastikan jalur akses dulu.** Pemilik menjalankan `?debug=1` + memastikan apakah embed
  API mengekspos pembeli. Kalau ya → rencana teknis ingest disusun (endpoint, field allowlist sama
  seperti A3: name/email/phone/gender/DOB; NIK & kesehatan DILARANG; consent = legacy). Kalau tidak →
  opsi 2/3.
- **B-opsi-2 — Jalur non-embed.** Jika email pembeli hanya ada lewat koneksi DB langsung / endpoint
  admin ticket.20fit.id, definisikan jalur itu (kredensial, scope, jadwal) sebagai rencana terpisah.
  Di luar jangkauan lingkungan ini.
- **B-opsi-3 — Tunda.** Biarkan `sold_count: 598` sebagai angka katalog; tidak ingest pembeli sampai
  ada nilai bisnis + jalur consent yang jelas.

**Rekomendasi:** B-opsi-1 sebagai langkah pertama (murah, memastikan fakta), lalu putuskan. Tidak ada
kode ingest ditulis sampai jalur akses **dan** basis consent dipastikan.

---

## 6. Rekomendasi yang jauh lebih bernilai daripada backfill mana pun

`rc_ticket_invites` **membuktikan** form pendaftaran event 20FIT sudah mengumpulkan **gender 100%
(819/819)** dan **tanggal lahir 92% (752/819)** — kualitas demografi terbaik di seluruh database ini.
Yang **tidak** dikumpulkan form itu hanyalah satu hal: **consent pemasaran** (T-24).

Maka rekomendasi ke pemilik: **tambahkan satu checkbox consent pemasaran di form pendaftaran event.**
Sekali diubah, **setiap event berikutnya langsung menghasilkan profil yang boleh dihubungi**
(`explicit_opt_in` — dasar hukum terkuat, tanpa perdebatan) lengkap dengan gender + DOB — sejak hari
pertama, tanpa backfill, tanpa menunggu sign-off legal untuk populasi lama. Nilainya **jauh** melampaui
ingest 598 pembeli lama yang consent-nya tak pasti: yang satu memperbaiki aliran ke depan secara permanen;
yang lain menambal satu event ke belakang dengan risiko hukum.
