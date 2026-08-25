# Rute disiapkan — WhatsApp, Fitpoint, Pop-up

Contacting-half TUGAS 4. **Siapkan rutenya, jangan bangun tempat kosong.** Tiap butir: apa yang
disiapkan, dan apa yang menunggu.

## 1. WhatsApp Business API — permukaan pengaturan (DIBANGUN, status "belum tersambung")

- **Permukaan:** panel status di `/settings` (`components/settings/whatsapp-panel.tsx`) yang membaca
  **presence** kredensial, bukan nilainya. Hari ini ketiganya absen → panel jujur berbunyi
  **"Belum tersambung"**, bukan layar yang tampak siap.
- **Kredensial (env var di Railway, seperti `MAILTRAP_API_TOKEN`, tak pernah ditampilkan kembali):**
  - `WHATSAPP_ACCESS_TOKEN` — access token API (rahasia)
  - `WHATSAPP_PHONE_NUMBER_ID` — id nomor pengirim
  - `WHATSAPP_BUSINESS_ACCOUNT_ID` — id WhatsApp Business Account
- **Menunggu:** pemilik produk memasang ketiga env var di Railway ("penyetelan kredensial menyusul").
- **Template WA:** penyimpanan template sudah menampung `wa_approval_status` + `wa_provider_template_id`
  (lihat `RENCANA-template-simpan.md`) — pesan di luar jendela 24 jam wajib template yang sudah
  disetujui Meta.

## 2. Fitpoint — KONTRAK data (dokumen, BUKAN tabel)

Datanya belum ada di Supabase (terukur 24 Agu: `my20fit_reward_claims` = 0 baris; tak ada tabel
saldo+kedaluwarsa). Akan diimpor kelak ke aplikasi yang sedang dikembangkan. **Yang disiapkan
adalah bentuk data yang harus diterima** agar pemicu "Fitpoint mendekati kedaluwarsa" bisa dibangun.
**Tidak membuat tabel** — bentuknya belum ditentukan siapa pun; membuat tabel sekarang = menebak.

**Kontrak minimal (yang harus ada di sumber saat tersedia):**

| Field | Tipe | Wajib | Catatan |
|---|---|---|---|
| pengenal pengguna | `customer_id` (uuid) **atau** email/telepon ternormalisasi | ✔ | harus bisa dicocokkan ke `master_customer` (K-06: email/telepon ternormalisasi) |
| saldo poin | integer | ✔ | poin yang masih berlaku |
| tanggal kedaluwarsa | `timestamptz` / `date` | ✔ | **tanggal kejadian nyata**, bukan cap muat (K-19) — pemicu bergantung padanya |
| (opsional) tanggal perolehan | `timestamptz` | — | untuk konteks pesan |

**Diskualifikasi:** bila "kedaluwarsa" ternyata cap muat (seperti kolom waktu lain, K-19), pemicu
tak bisa jujur — konfirmasi tanggalnya benar-benar bergerak sebelum membangun.

**Yang menyediakan:** pemilik sistem poin my20fit (di mana saldo & kedaluwarsa tersimpan — D-3 di
peta jalan).

## 3. Pop-up aplikasi 20FIT — DITUNDA (nol pekerjaan)

**Ditunda oleh pemilik produk** (24 Agu 2026): aplikasi 20FIT masih dikembangkan. **Tidak dibangun
apa pun**, termasuk tempat kosong. Sebabnya dicatat di sini supaya **tidak ditanyakan lagi tiap
sprint**: sampai aplikasi 20FIT punya cara **menerima** pesan dari luar (endpoint/inbox/push),
tak ada yang bisa dirancang dari sisi CRM. Buka kembali hanya bila pemilik produk menyatakan
aplikasi siap menerima.
