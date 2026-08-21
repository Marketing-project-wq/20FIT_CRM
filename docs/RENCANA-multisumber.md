# Rencana: pelengkapan profil multi-sumber (TUGAS 3, di-scope 12 Agu 2026)

> **Status: DI-SCOPE, BELUM DIBANGUN.** Penundaan ketiga — bagian ini di-scope dengan skema
> nyata yang diinspeksi (bukan hanya diulang dari prompt), supaya sesi berikut turn-key.
> Pola mengikuti Sprint 3R (`lib/crm/enrichment.ts`): **nol tulis, gabung saat tampil, cocok
> lewat identitas ternormalisasi (K-06), kolom aman sebagai konstanta teruji**.

## STATUS 12 Agu 2026 (pembaruan)
- **SELESAI:** lapisan baca + tampilan arena/gym (email-first) — commit sebelumnya.
- **SELESAI:** rantai klinis (TUGAS 3) — `lib/crm/clinic-source.ts`, phone-first (12 vs 106),
  via `patient_id`, seluruhnya di balik `profile.view_health`, identitas + hitungan + booking
  terakhir (bukan isi klinis), audit KINDS di baris `profile.viewed` yang ada. Terbukti +
  teruji + terpasang di profil.
- **INVESTIGASI SELESAI (TUGAS 2):** `clinic_transactions` 2.277/2.477 baris `patient_id` NULL
  (impor spreadsheet tak tertaut); 200 tertaut 100% valid. `clinic_posture_scans` (2) +
  `clinic_patient_packages` (6) terlalu tipis → tak ditampilkan per-profil.
- **TERSISA:** TUGAS 4 (blok cakupan `/quality`) + TUGAS 5 (filter segmen sumber baru).

### Cakupan terukur (profil distinct tercocokkan) — untuk blok /quality (TUGAS 4)
| Sumber | Baris | Cocok | Kunci |
|---|---|---|---|
| arena_class_bookings | 2.731 | 639 | email |
| arena_bookings | 247 | 13 | email |
| arena_package_orders | 63 | 31 | email |
| gym_class_bookings | 10 | 6 | email |
| gym_membership_orders | 3 | 0 | email |
| arena_members | 3 | 0 | email |
| clinic_patients | 143 | 12 (email) / **106 (telepon)** | telepon dulu |
| clinic_transactions | 2.477 | 200 tertaut · **2.277 patient_id NULL** | temuan kualitas |

Cakupan rendah = identitas antar-sistem belum terpadu — **temuan kualitas data**, bukan bug.
Bingkai begitu di layar.

## Yang SUDAH dikerjakan (slice arena/gym awal)
1. **Ukur ulang jumlah** (tabel hidup, bertumbuh sejak 11 Agu) — selisih di bawah.
2. **Inspeksi skema nyata** 8 sumber utama → kunci cocok + kolom aman vs sensitif teridentifikasi.
3. **Temuan keselamatan:** `clinic_patients` menyimpan **`id_number` (NIK), `date_of_birth`,
   `address`, `occupation`, `emergency_contact_name`, `emergency_contact_phone`** — SEMUA
   sensitif, WAJIB di balik `profile.view_health`, nilainya **tak pernah** ke metadata audit
   (sama seperti gerbang 3R). Ini alasan `clinic_*` tak boleh digabung sembarangan.

## Selisih jumlah (11 Agu → 12 Agu)
| Sumber | 11 Agu | 12 Agu | Kunci cocok (dari skema) |
|---|---|---|---|
| arena_class_bookings | 2.727 | **2.731** | `email`, `phone` |
| arena_bookings | 247 | 247 | `email`, `phone` |
| clinic_bookings | 170 | **173** | `patient_id`→clinic_patients, `phone` (email hanya 2/173) |
| clinic_patients | 137 | **139** | `email`, `phone` |
| arena_package_orders | 62 | 62 | `email` |
| gym_class_bookings | 10 | 10 | `email` |
| arena_members / gym_membership_orders | 3 / 3 | 3 / 3 | `email` |
| clinic_assessments / clinic_screenings | 149 / 131 | **151 / 137** | `patient_id` |

## Kunci cocok + kolom AMAN per sumber (skema terverifikasi)
Cocok **email dulu** (`normalizeEmail`), **telepon fallback** (`normalizePhoneID`) — **catat
kunci yang dipakai** agar tingkat keyakinan terlihat. **Nol cocok-nama-saja.**

| Sumber | Kolom identitas | Kolom AMAN untuk ditampilkan | Sensitif (JANGAN kecuali view_health) |
|---|---|---|---|
| arena_class_bookings | email, phone | booking_code, schedule_id, status, price, utm_source | — |
| arena_bookings | email, phone | booking_code, unit_id, booking_date, start_time, status, price | notes |
| arena_members | email, phone | member_code, is_active | — |
| arena_package_orders | email, phone | order_code, package_name, sessions, status | — |
| gym_class_bookings | email, phone | booking_code, schedule_id, status | — |
| gym_membership_orders | email, phone | order_code, plan_name, duration_months, status | — |
| clinic_bookings | patient_id, phone, (email) | booking_code, service_id, status | notes |
| **clinic_patients** | email, phone | patient_code, is_active | **id_number (NIK), date_of_birth, gender, address, occupation, emergency_contact_name, emergency_contact_phone** |

`notes` free-text di mana pun → jangan tampilkan mentah (bisa memuat catatan pribadi).

## Rantai `clinic_*` lewat `patient_id`
Cocokkan `clinic_patients` ke `master_customer` (email/phone) → dapat `clinic_patients.id` →
sambungkan tabel klinis lewat `patient_id`: `clinic_visits`, `clinic_assessments`,
`clinic_screenings`, `clinic_posture_scans`, `clinic_patient_packages`, `clinic_transactions`.
**Bukan** langsung ke master_customer. Data klinis = kesehatan → gerbang `profile.view_health`.

## Rencana bangun (urutan)
1. `lib/crm/multisource-constants.ts` — `MULTISOURCE_SAFE_COLUMNS` per sumber (pola
   `ENGAGEMENT_SAFE_COLUMNS`), + registry {sumber → kunci cocok, tabel, kolom identitas}.
2. `lib/crm/multisource.ts` — resolver: email→phone match, `resolveMultiSourceForProfile(email,phone)`
   mengembalikan per-sumber baris aman + **kunci yang dipakai** (untuk label keyakinan). Rantai
   `patient_id` untuk klinis. **Nol tulis.** Field sensitif hanya bila `canViewHealth`.
3. `components/audience/profile-detail.tsx` — bagian "Sumber lain 20FIT" ala 3R; profil tak
   cocok → "tidak ada data … untuk profil ini", bukan bidang kosong.
4. `/quality` — tingkat kecocokan per sumber (cocok/tak cocok, kunci mana).
5. Segment: kondisi filter AND/OR per sumber (mis. "punya booking arena"), **jumlah berpasangan**
   (§18.8) — angka contactable kedua kini bukan nol (pasca Migrasi 11).
6. Tes: match-key resolution (pure), safe-column allowlist (guard), sensitive-gating.

## Larangan yang mengikat (dari prompt)
Nol tulis · nol cocok-nama-saja · nol kriteria waktu (K-19) · kolom aman sebagai konstanta ·
field sensitif di balik `profile.view_health`, nilainya tak pernah ke metadata · `clinic_*`
lewat `patient_id`.
