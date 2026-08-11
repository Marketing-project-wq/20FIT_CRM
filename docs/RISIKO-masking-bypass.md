# Risiko: masking & audit Sprint 3A bisa DILEWATI lewat `staging_20fit_data`

> **Status: MEMO KEPUTUSAN — belum ada tindakan.** Dokumen ini tidak menyalakan RLS,
> tidak menulis policy, dan tidak menyentuh `staging_20fit_data`. Itu keputusan tim
> (Fase 0 / PRD 17.3). Memo ini adalah bahan keputusannya.
>
> Diverifikasi ke database produksi 11 Agustus 2026.

## Ringkasan satu paragraf

Sprint 3A membangun dua kontrol privasi di audience pool: **masking telepon/email di
server** untuk peran `analyst` (PRD 17.1) dan **audit `list.viewed` wajib** pada setiap
pembacaan daftar (PRD 17.1). Keduanya benar — tetapi keduanya bisa **dilewati, bukan
ditembus**. Tabel `staging_20fit_data` (**88.536 baris**, RLS OFF, sumber impor yang
sama dengan `master_customer`) bisa dibaca **langsung** oleh siapa pun yang memegang
anon key, tanpa melewati `/api/audience` sama sekali. Hasilnya: telepon dan email
mentah untuk ~88 ribu orang, **tanpa masking** dan **tanpa satu pun baris audit**.

## Apa yang bisa dilewati

| Kontrol Sprint 3A | Cara kerjanya | Kenapa bisa dilewati |
|---|---|---|
| Masking server-side (`analyst` → `62…****`, `j***@…`) | Diterapkan di `lib/crm/audience.ts`, hanya pada jalur `/api/audience` | `staging_20fit_data` tidak lewat jalur itu. Dibaca langsung → nilai mentah |
| Audit `list.viewed` wajib | Ditulis oleh route handler `/api/audience`; baca tak tercatat ditolak | Pembacaan langsung `staging_20fit_data` tidak menyentuh route handler → **nol** baris audit |
| Cek peran fail-closed (`profile.view_list`) | `getCurrentUserRole()` + matriks RBAC di server | Tabel RLS OFF tidak mengenal peran CRM sama sekali; anon key = akses penuh baca |

Kontrol-kontrol itu memasang pintu di `/api/audience`. Serangan ini **tidak lewat
pintu** — ia masuk lewat PostgREST langsung ke tabel yang tak terkunci.

## Lewat jalur mana (konkret)

`staging_20fit_data` punya kolom kontak: `Name`, `Email`, `Numberphone`,
`Number phone 62`. Karena RLS OFF, PostgREST mengekspos tabel ke role `anon` dan
`authenticated`. Satu permintaan HTTP dengan anon key sudah cukup:

```
GET https://<project>.supabase.co/rest/v1/staging_20fit_data?select=Name,Email,Numberphone
Header: apikey: <ANON_KEY>
```

- Tidak ada sesi login yang dibutuhkan (anon, bukan authenticated, pun bisa).
- Tidak ada peran CRM yang dicek.
- Tidak ada masking.
- Tidak ada baris `list.viewed`.

Seorang `analyst` — yang di dalam aplikasi hanya boleh melihat kontak **tersamar** —
cukup membuka DevTools, mengambil anon key dari bundel yang sudah ada di browsernya,
dan menarik ~88 ribu telepon+email mentah. Tidak ada jejak.

## Siapa yang memegang anon key hari ini

Anon key **memang dirancang publik** — ia ditanam di bundel klien setiap aplikasi yang
bicara ke project Supabase ini (`NEXT_PUBLIC_SUPABASE_ANON_KEY` di CRM, dan kunci yang
sama/serumpun di seluruh aplikasi lain yang berbagi project `cpvzwqptzcxnwzfzgrmt` —
arena, clinic, my20fit, shop, rb, dst.). Konsekuensinya:

- Siapa pun yang pernah memuat **salah satu** aplikasi itu di browser sudah memiliki
  anon key (tinggal baca dari network tab atau sumber bundel).
- Anon key bukan rahasia dan tidak pernah dimaksudkan sebagai rahasia. Yang menjaga
  data adalah **RLS**, bukan kerahasiaan kunci. Untuk `staging_20fit_data`, RLS OFF,
  jadi tidak ada yang menjaga.

Artinya himpunan “yang bisa melakukan ini” bukan sekadar staf CRM — melainkan **semua
pengguna semua aplikasi 20FIT**, ditambah siapa pun yang pernah melihat trafiknya.

## Jumlah baris: 88.536 (bukan 87.966)

Prompt Sprint 3A menyebut 88.536; prompt Sprint 3B menyebut 87.966. **Yang benar
88.536**, dan selisih 570 itu bukan baris yang hilang atau bertambah:

- `select count(*) from staging_20fit_data` = **88.536** (hitungan eksak, 11 Agu 2026).
- **87.966** adalah `pg_class.reltuples` — *estimasi* perencana kueri Postgres yang
  hanya diperbarui saat `ANALYZE`/autovacuum, jadi tertinggal dari hitungan nyata. Itu
  angka yang tampil di daftar tabel (mis. `list_tables`/dashboard Supabase).
- Jadi 88.536 = kebenaran; 87.966 = statistik basi. Perbandingan: `master_customer`
  punya 82.253 baris — staging **lebih banyak** dari master (88.536 > 82.253), karena
  master adalah hasil dedup/kurasi dari staging. Dari 88.536 baris staging, 88.445
  punya email dan 88.495 punya nomor telepon — nyaris seluruhnya membawa PII kontak.

## Opsi mitigasi & konsekuensinya (untuk diputuskan tim, bukan sekarang)

| Opsi | Tindakan | Konsekuensi |
|---|---|---|
| **A. Nyalakan RLS di `staging_20fit_data`** (ini Fase 0) | `ALTER TABLE … ENABLE ROW LEVEL SECURITY`, lalu policy service-role-only | Setiap proses yang saat ini membaca staging dengan anon/authenticated key akan **putus** kecuali diberi policy. Pipeline ingestion/ETL mungkin bergantung padanya — harus dipetakan dulu. Ini persis keputusan Fase 0 |
| **B. Cabut GRANT SELECT dari `anon`/`authenticated`** | `REVOKE SELECT ON staging_20fit_data FROM anon, authenticated` | Lebih sempit dari RLS: memblokir baca anon tanpa menulis policy. Tetap perubahan privilege pada tabel bersama; service role tetap bisa. Tidak melindungi dari koneksi lain yang memakai role berbeda |
| **C. Pindahkan staging ke schema non-public / drop setelah ingestion** | Pindah ke schema privat, atau hapus bila impor sudah final | Menghilangkan paparan anon sepenuhnya. Syarat: pastikan ingestion memang satu kali & selesai, tidak ada job yang membacanya lagi |
| **D. Rotasi anon key / pisah project per aplikasi** | Ganti kunci, atau isolasi CRM ke project sendiri | Blast radius sangat besar: anon key dibagi banyak aplikasi live; rotasi memutus semuanya. Bukan langkah jangka pendek |
| **E. Status quo (tidak melakukan apa-apa)** | — | Masking & audit CRM tetap bisa dilewati. Paparan PDP untuk ~88 ribu kontak tetap terbuka, tanpa jejak. Risiko diterima secara sadar atau tidak — sebaiknya sadar |

## Ini MENAIKKAN urgensi Fase 0, bukan menggantikannya

RLS OFF di tabel lama sudah diketahui tim dan tercatat sebagai Fase 0 (PRD 17.3). Yang
**baru** dari memo ini bukan fakta RLS-OFF-nya, melainkan **konsekuensinya terhadap
kontrol yang baru saja dibangun**: selama `staging_20fit_data` (dan tabel impor lain
yang serupa) masih RLS OFF, masking dan audit wajib Sprint 3A **tidak memberi jaminan
apa pun** — keduanya duduk di sisi pintu yang salah. Fase 0 karenanya bukan lagi
sekadar higiene umum; ia kini **prasyarat bagi jaminan privasi CRM itu sendiri**.

Rekomendasi: naikkan Fase 0 untuk `staging_20fit_data` ke prioritas yang setara dengan
peluncuran fitur kontak apa pun — karena mengirim pesan berdasarkan consent tidak ada
artinya bila salinan mentah audiensnya bisa ditarik tanpa kontrol di sebelahnya.

## Yang TIDAK dilakukan memo ini

- Tidak menyalakan RLS. Tidak menulis policy. Tidak `REVOKE`. Tidak menyentuh data.
- Tidak mengubah `staging_20fit_data` dengan cara apa pun.

Semua di atas adalah keputusan tim (Fase 0). Dokumen ini hanya menaruh fakta dan
opsinya di atas meja.

---

> **Konteks lintas-sprint:** temuan `docs/riwayat/TEMUAN.md` **T-02** (kontrol dilewati, bukan ditembus) & kesalahan **S-01** (RLS-OFF bukan temuan baru).
