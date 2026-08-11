# Rencana jalur tulis consent — dan kenapa ditunda

> Ditulis Sprint 3F supaya sprint berikutnya tidak mengulang analisisnya. Jalur tulis
> consent **sengaja tidak dibangun** sprint ini. Dua alasan di bawah adalah substansi,
> bukan kehati-hatian.

## Kenapa ditunda

### Alasan 1 — K-3 tidak bisa dipenuhi dengan `supabase-js`

Migrasi 3 (header + PRD 8.7) mewajibkan **K-3**: setiap tulis/ubah baris `crm_consent`
**wajib satu transaksi** dengan penulisan `crm_audit_log`. Alasannya: baris current-state
bisa di-`UPDATE`, jadi ia **bukan** bukti — buktinya adalah audit trail. Audit
best-effort = kekuatan pembuktian hilang tanpa disadari.

PostgREST (yang dipakai `supabase-js`) **tidak bisa** membungkus dua `INSERT` ke tabel
berbeda dalam satu transaksi. Konsekuensinya: jalur tulis consent **mewajibkan fungsi
Postgres** (`SECURITY DEFINER`, atomik). Itu **DDL baru** terhadap ledger yang sudah
diverge — keputusan tersendiri, satu perubahan skema per sprint, tidak boleh
diselundupkan ke sprint yang tugasnya menjalankan migrasi 3.

### Alasan 2 — belum ada peristiwa consent untuk ditunjuk

Mencatat `explicit_opt_in` tanpa **peristiwa opt-in yang nyata** = mengarang dasar hukum.
Hari ini tidak ada formulir, tidak ada ingestion, tidak ada kanal yang menghasilkan
peristiwa itu. Menyediakan tombol tulis lebih dulu **mengundang** orang mengisi apa yang
belum terjadi — persis bahaya yang tabel ini ada untuk mencegahnya.

## Bentuk fungsi Postgres yang dibutuhkan (rancangan, bukan implementasi)

Sebuah fungsi tunggal, mis. `crm_record_consent(...)`, `SECURITY DEFINER`,
`search_path=public`, yang dalam **satu transaksi**:

1. `INSERT ... ON CONFLICT (customer_id, channel, purpose) DO UPDATE` baris `crm_consent`
   (current-state; UNIQUE sudah ada).
2. `INSERT` satu baris `crm_audit_log` dengan aksi dari allowlist yang SUDAH ada —
   **`consent.*`** adalah kategori kepatuhan (dikecualikan purge permanen), jadi pakai
   nama seperti `consent.recorded` / `consent.withdrawn`. **Jangan** buat kategori baru
   di luar `consent.*` (allowlist migrasi 8 & `retention-policy.ts`).
3. Mengembalikan id baris consent.

**Yang harus dijamin atomik:** langkah 1 dan 2 sukses/gagal bersama. Tidak boleh ada
baris consent tanpa baris audit, maupun sebaliknya. Inilah yang PostgREST tak bisa
jamin dan kenapa fungsi Postgres wajib.

### Apa yang MASUK `evidence` (NON-PII) dan apa yang DILARANG (K-1)

- **Boleh:** penanda peristiwa non-tertaut — mis. jenis kanal, stempel waktu, versi
  formulir, ringkasan teks persetujuan. Konteks yang menjawab "atas dasar peristiwa apa".
- **DILARANG / harus bisa dikosongkan:** `form_id`, `message_id`, atau id apa pun yang
  bisa **me-relink identitas** lewat join tabel lain. K-1 mensyaratkan: saat
  `customer_id` di-null-kan (rutin penghapusan), `evidence` **WAJIB ikut
  dikosongkan/dipangkas** ke bentuk tak-tertaut. Anonimisasi set-null **tidak berlaku**
  bila `evidence` masih menyimpan pointer yang bisa ditelusuri balik.
  - **Terbuka (SIGNOFF):** siapa yang bertanggung jawab menegakkan pengosongan ini, dan
    apakah legal menyetujui pendekatannya — lihat `docs/SIGNOFF-legal-consent.md`. Harus
    dijawab **sebelum** jalur hapus dibangun.

## Prasyarat NON-teknis (harus ada dulu)

`explicit_opt_in` baru punya arti bila ada **kanal yang menghasilkan peristiwa opt-in
nyata**. Minimal salah satu harus ada lebih dulu:

- Formulir/landing dengan checkbox consent yang tercatat (form20fit atau setara), atau
- Ingestion yang membawa bukti consent terverifikasi dari sistem sumber, atau
- Alur double-opt-in (mis. konfirmasi WhatsApp/email) yang peristiwanya bisa ditunjuk.

Sampai salah satu ada, satu-satunya `basis` yang jujur adalah `legacy_import_unverified`
— yang **bukan** dasar untuk mengontak. Karena itu jalur tulis tanpa kanal = jalur untuk
mengarang `explicit_opt_in`.

## Urutan yang disarankan (bukan sprint ini)

1. Legal menutup **K-1** dan memberi daftar `basis` final (SIGNOFF).
2. Bangun **satu** kanal peristiwa opt-in nyata.
3. Migrasi terpisah: fungsi Postgres `crm_record_consent` (atomik consent + audit).
4. Baru jalur tulis di aplikasi, memanggil fungsi itu — bukan dua `INSERT` terpisah.

---

> **Konteks lintas-sprint:** keputusan `docs/riwayat/KEPUTUSAN.md` **K-13** (jalur tulis pertama = suppression, bukan consent) & **K-14** (atomik dengan audit).
