# PR: Sprint 3K + 3L + 3M + 3N + 3O + 3P → main

> ## 🧩 3P: CONSENT DICATAT (BUKAN DIASUMSIKAN), FILTER AND/OR, DATA DIRAPIKAN DI TAMPILAN
>
> Lima pekerjaan; **empat selesai, satu (pelengkapan profil sensitif) ditahan sadar** karena
> butuh penanganan NIK/kesehatan yang tak boleh dikebut.
> - **Consent (T1):** pemilik produk menyatakan semua data ber-consent untuk marketing+CS.
>   Pernyataan **diterima tapi dicatat, bukan ditanam** (K-03): peta `basis`→`purpose` di
>   satu modul teruji (`consent-policy.ts`), keputusan legal diisolasi ke **satu flag**
>   (`legacy→marketing` = `false` sampai dicatat resmi). **Backfill DITAHAN** — pertanyaan
>   cakupan-sumber & legacy-marketing belum terjawab tertulis (`SIGNOFF-legal-consent.md`).
> - **Filter AND/OR (T3):** pohon predikat (grup AND/OR, maks 2 tingkat/12 kondisi), **fungsi
>   murni** pohon→PostgREST + **dibacakan kembali dalam kalimat** ("(punya email ATAU punya
>   telepon) DAN unit arena"). Bentuk tak-terungkap **ditolak di validasi**, bukan
>   disederhanakan diam-diam. Jumlah berpasangan tetap; nol kriteria waktu (K-19).
> - **Nama (T4):** 30.307 nama campur-aduk dirapikan **di tampilan** (`display-name.ts` —
>   `dr.`/`H.`/`A.M.`/`bin`/`Nur-Aini`/`D'Souza`), **nama asli tetap terlihat & tetap
>   dicari** atas kolom sumber. Nama berangka (281) ditandai `/quality`. Nol UPDATE.
> - **Email typo (T5):** **`gmaol.com` = 986 baris, SEMUA impor 20 Apr satu instan →
>   kerusakan SISTEMATIS** (T-16), bukan 986 salah ketik. Deteksi+tanda+hitungan; **nol
>   koreksi otomatis** (`RENCANA-koreksi-kontak.md`).
> - **Pelengkapan profil (T2 — DITAHAN):** cocok diukur sendiri — Hyrox **152 profil** (bukan
>   288 baris), my20fit_profile 169, activity 44, rc_team_members **0** (nama-saja). NIK
>   **bukan** kunci. Build gerbang-`view_health`+masking+audit-buka direncanakan, tak dikebut.
> - Test **265 → 306**. Semua baca-saja; **nol perubahan skema** (backfill migrasi ditahan).
>
> ## 🔐 3O: SIKLUS INI TIDAK MENAMBAH PAPARAN APA PUN — IA MENGUKURNYA
>
> Seluruh sprint di PR ini **baca-saja, nol perubahan skema** pada jalur aplikasi. 3O tidak membangun fitur; ia
> menutup lubang perhatian: temuan terberat proyek ini — **NIK + data kesehatan ±1.100 orang
> terbaca `anon` tanpa login** — sebelumnya terkubur di poin 5 laporan 3N. 3O **mengukurnya
> tepat** (sapuan seluruh skema `public`: tabel RLS OFF × kolom sensitif, **hitungan saja,
> nol nilai diambil**) dan **mengangkatnya** ke `docs/ESKALASI-paparan-data-sensitif.md`
> (dua halaman, untuk pengambil keputusan), ke T-15, dan ke **puncak** `docs/riwayat/README.md`.
> Terberat: `cf_hyrox_participants` (RLS OFF) — NIK 1.030, tgl lahir, golongan darah, kontak
> darurat; plus diagnosa medis (`clinic_*` RLS OFF) dan `cf_user.password` bernama polos.
> **Pemeriksaan lapisan baca CRM (3O)** menemukan **nol** kolom sensitif keluar dari server;
> `customer_engagement` kini dijaga **test kolom aman** agar `raw_value` tak bisa diselipkan.
> **KOREKSI 3Q:** klaim 3O bahwa `master_customer`/`customer_engagement` "aman karena RLS ON"
> **keliru** — keduanya punya policy `authenticated_full_access` (baca+tulis untuk 887 akun,
> T-17). Hanya `crm_*` yang benar-benar terkunci. Dokumen eskalasi sudah dikoreksi (S-08, K-23).
> Perbaikan RLS sendiri milik pemilik data (menyalakan RLS tanpa policy memutus aplikasi tim
> lain) — **larangan sprint: jangan sentuh tabelnya**.
> **Validasi deploy tercepat:** buka `/settings/diagnostik` (3L) sekali — seluruh lapisan baca terperiksa.
>
> ## 🌐 3N: PROFIL BUKAN SATU BARIS — TAPI KOLOM WAKTUNYA CAP MUAT UNTUK KE-EMPAT KALINYA
>
> `customer_engagement` (90.419 baris, EKSISTING) menunjukkan di mana seorang pelanggan
> muncul di ekosistem 20FIT: arena, clinic, event, gym, membership, shop — dibaca **di
> tempat**, nol ingestion, nol salin ke `crm_*`, dikaitkan lewat `customer_id` (0 baris
> yatim). Ia menambah bagian **"Ekosistem 20FIT"** di detail profil, kriteria **unit +
> produk** di segment builder, dan blok kualitas ekosistem di `/quality`.
> **Temuan yang mengikat keputusan:** `last_seen_at` ternyata **cap waktu muat untuk 99,51%
> baris** (`= first_seen_at`). Aktivitas nyata hanya **444 baris (0,49%)**, semuanya di
> `live_txn_sync` (Transaksi Clinic + Transaksi Arena). Ini **kali keempat** sebuah kolom
> waktu ternyata cap muat (setelah `created_at`, `first_seen_at`, `last_activity_at`) —
> **pola, bukan kejutan** (T-14). Karena itu **tidak ada kriteria waktu** untuk ekosistem
> (K-19), dan setiap baris `last_seen_at` ditampilkan sesuai kelasnya: "aktivitas nyata"
> (tanggal), "tidak terekam" (cap muat — **bukan** em-dash, bukan "tidak aktif"), atau
> "anomali" (1 baris tanggal masa depan). Sumber aktivitas yang **belum** terwakili (HYROX,
> my20fit, race-timing) dipetakan tanpa dibangun: `docs/SUMBER-AKTIVITAS.md`.
>
> ## 📊 3M: LAYAR PERTAMA YANG MENUNJUKKAN BERAPA BANYAK ORANG YANG TIDAK BOLEH DIHUBUNGI
>
> Segment builder (`/segments`) menampilkan tiap definisi dengan **dua** angka
> berdampingan (PRD §18.8): **cocok kriteria** dan **boleh dihubungi**. Angka kedua **0**
> untuk definisi apa pun — sebuah segmen berisi 40.000 orang yang **tak satu pun** boleh
> dikirimi pesan, karena `crm_consent` kosong dan suppression menang. **Itu temuan, bukan
> fitur, dan bukan bug:** ia membuat konsekuensi "nol consent" terlihat sebagai angka, bukan
> catatan kaki. Builder **tidak menyimpan apa pun** (nol tabel/nama/simpan/ekspor/kirim/daftar
> orang) — penyimpanan adalah keputusan tersendiri (`docs/RENCANA-simpan-segmen.md`), karena
> aksi `segment.*` jatuh di antara allowlist & denylist migrasi 8 (kali **ketiga** pola ini).
>
> ## 🩺 3L: SIKLUS INI MEMASANG INSTRUMENNYA SEKALIGUS MEMBUAT PEMAKAIANNYA SATU KLIK
>
> 3K memberi produksi sebuah instrumen (pemantauan gap + jejak kegagalan), tapi **selama ia
> di branch, instrumen itu tak mencatat apa pun — tiap hari tak mendarat adalah hari
> kejadian berikutnya kembali hilang tanpa bekas.** 3L menutup lingkarnya: halaman
> **`/settings/diagnostik`** menghitung status tiap rute **dari `crm_audit_log`** (tak bisa
> basi), menjalankan pemeriksaan lapisan baca saat dibuka (`verify-live.mjs` tanpa terminal),
> menampilkan kesehatan gap, dan memberi **satu tautan** untuk menutup V-6. **Cara tercepat
> memvalidasi deploy-nya sendiri: buka satu halaman setelah deploy — seluruh lapisan baca
> terperiksa.** Dan ini memperbaiki pola yang menggigit tiga kali: bukti terlewat karena
> status disimpan di dokumen, bukan dihitung dari data (S-07, K-22). **Buktinya langsung:**
> saat 3L dibangun, V-6 tertutup di produksi (`profile.viewed id=51`) — status-terhitung
> menangkapnya otomatis; dokumen manual (dan prompt sprint ini) masih menulis "0".
>
> ## 🕳️ 3K MEMBUAT KEGAGALAN TERLIHAT — SELAMA INI HILANG TANPA JEJAK
>
> **Argumen mendaratkan siklus ini:** di produksi, sebuah `503`/`500` hilang tanpa bekas
> begitu responsnya terkirim. Bukti bahwa itu masalah nyata sudah ada: `crm_audit_log`
> punya **gap id `37,38,39`** — tiga operasi teraudit yang gagal (audit-write mengambil
> nomor sequence lalu di-rollback, tak meninggalkan baris). Sebelum 3K tak ada yang
> melihatnya, dan `profile.viewed` tetap **0** meski orang jelas menjelajah. 3K menjadikan
> **gap sebagai pemantauan tetap** (SQL + banner di `/settings`) dan memberi **setiap**
> route jejak kegagalan PII-free di log Railway, supaya gap berikutnya bisa **ditelusuri**,
> bukan hanya dihitung. **Root cause gap belum terbukti** (DB menerima tiap audit-write;
> lihat §7) — jadi tidak ada perbaikan yang dikarang; yang dibangun adalah **jejaknya**.
> Gap tidak bertambah (stabil di `37,38,39`), jadi tak ada yang sedang aktif rusak.
>
> ## 🔎 PENCARIAN INILAH YANG MEMBUAT JALUR SUPPRESSION BISA DIPAKAI
>
> Jalur tulis suppression (3H) **sudah ter-merge (PR #5) dan di main** — tapi titik
> masuknya adalah detail profil, dan **tak ada cara menemukan satu profil**. Tanpa
> pencarian, staf yang ditelepon seseorang yang minta berhenti harus membuka halaman demi
> halaman atau menyerah ke SQL Editor (melewati normalisasi, RBAC, dan audit). **Sprint 3J
> menambahkan pencarian profil** — itulah yang mengubah suppression dari "ada tapi tak
> terpakai" menjadi bisa diselesaikan tanpa meninggalkan aplikasi. Mendaratkan pencarian
> bersama pengunci keamanan (3I) lebih masuk akal daripada membiarkan jalur tulis menganggur.
>
> ## 🔒 3I MEMPERBAIKI LUBANG KEAMANAN YANG SUDAH LIVE (DB sudah ditutup)
>
> Migrasi 10 menutup `crm_purge_audit_log` — fungsi `SECURITY DEFINER` yang menonaktifkan
> trigger append-only lalu menghapus baris audit — yang `EXECUTE`-nya **terbuka ke `anon`**
> sejak Sprint 3A. **Migrasi 10 sudah diterapkan ke database** (verified: `proacl =
> {postgres, service_role}`); perbaikan keamanannya **tidak menunggu merge**. Yang di PR ini
> adalah berkas migrasinya + pagar test + dokumen — supaya repo cocok dengan produksi.
>
> **Branch:** `claude/lanjutkan-pekerjaan-mno804`
> **Base:** `main` @ `36a2291` (PR #6 — 3I + 3J + dokumentasi `docs/riwayat/` sudah ter-merge)
> **Catatan status:** 3K + 3L + 3M **sudah ter-merge ke `main` lewat PR #7** (`origin/main` @ `e366347`).
> Yang belum ter-merge di branch ini: **3N** (`354a4f0`, ekosistem `customer_engagement`) + **3O** (paparan sensitif). 3N menumpuk bersih di atas main baru (parent-nya `c3dc5ea` = 3M, kini di main) — tanpa rebase.
> **Perubahan skema/DB/migrasi: NOL** di 3K, 3L, 3M, 3N, dan 3O. Semua baca-saja; nol tulis ke data pelanggan/suppression/consent; tulis satu-satunya = self-audit `list.viewed`/`crm_audit_log` (diagnostik `view=diagnostik`, segment `view=segment_builder`), bukan aksi baru. 3N: `customer_engagement` dibaca di tempat, nol ingestion. 3O: hitungan saja, nol tabel tim lain disentuh.
> **JANGAN merge / buka PR ke `main` tanpa izin eksplisit.**
>
> > Catatan konteks: 3G + 3H (jalur tulis suppression) **sudah di main lewat PR #5**. Bagian
> > §3–§5 di bawah adalah **referensi operasional** untuk jalur yang kini live itu (bukti
> > K-3, revert tiga tingkat, pemantauan) — tetap berlaku, tapi bukan lagi yang di-review PR ini.

## 1. Yang berubah, per bagian

### Sprint 3G (pembersihan + persiapan pasca-merge — nol perubahan perilaku)
| Perubahan | Sifat |
|---|---|
| Hapus kode mati: `lib/auth/guard.ts` (tak dipakai), `hasAnyRole` (tak dipakai); perbaiki komentar yang kontradiktif | Pembersihan (nol perilaku) |
| `docs/PASCA-MERGE-monitoring-revert.md` — revert **dilatih** dari `eff733c` (terbukti kembali bersih ke 3A: pohon identik `4bac312`, build hijau, 126 test) + rencana pantau 30 menit | Dokumen |
| `docs/RINGKASAN-keputusan-merge.md` — ringkasan satu halaman non-teknis | Dokumen |
| `docs/TINJAUAN-pra-merge.md` (bila ada) + peta request-pertama di PR 3B–3F §6 | Dokumen |

### Sprint 3H (jalur tulis pertama — suppression)
| Perubahan | Sifat |
|---|---|
| **Migrasi 9** — `crm_record_suppression` + `crm_lift_suppression` (dua fungsi `SECURITY DEFINER`, `service_role` only). INSERT/reaktivasi + audit dalam **satu transaksi** (K-3). **Bukan tabel baru** | **MENGUBAH SKEMA PRODUKSI** |
| `POST /api/suppression` — catat permintaan berhenti; gate `consent.edit`; identitas dari `customer_id` (server baca `master_customer`) atau nilai ketikan; `dry_run` menampilkan bentuk ternormalisasi sebelum menulis | **BARU — MENULIS DATA** |
| `POST /api/suppression/lift` — cabut (status=`lifted`, **nol DELETE**); `lifted_reason` wajib; identitas di-resolve dari id baris server-side | **BARU — MENULIS DATA** |
| Detail profil: tombol "Catat permintaan berhenti" (peran `consent.edit`); **pilihan telepon/email eksplisit**; langkah tinjau; sukses menyatakan akibat | **MENGUBAH TAMPILAN** |
| `/consent`: entri langsung + **cabut per-baris** dengan alasan wajib + konfirmasi bahwa pencabutan mengaktifkan kembali kontak | **MENGUBAH TAMPILAN** |
| `lib/crm/suppression-input.ts` (murni, konsumen runtime **pertama** `normalize.ts`) + `lib/crm/suppression-write.ts` (server, bungkus RPC, **tak menulis audit sendiri**) | Kode |
| Test: 179 → **194** (+13 input, +1 seam D-2 kontabilitas, +1 aksi suppression = kepatuhan) | **Pagar** (test) |

### Sprint 3I (tutup pintu RPC yang terbuka, lalu daratkan)
| Perubahan | Sifat |
|---|---|
| **Migrasi 10** — `revoke all on crm_purge_audit_log(boolean) from public, anon, authenticated` + grant `service_role`. Menutup lubang `anon`-callable yang LIVE sejak 3A. `proacl` sesudahnya: `{postgres, service_role}`. `dry_run` masih bekerja lewat service role | **MENGUBAH SKEMA PRODUKSI (keamanan)** |
| `lib/crm/migration-execute-guard.test.ts` — pagar: setiap fungsi `crm_*` di migrasi wajib mencabut EXECUTE dari public/anon/authenticated di **berkas yang sama** (kecuali fungsi trigger & allowlist lintas-berkas). Dibuktikan menggigit | **Pagar** (test) |
| `docs/RISIKO-rpc-execute-terbuka.md` — pola auto-grant, contoh yang sudah diperbaiki, **101** fungsi non-`crm_*` yang masih terbuka (cara mengukurnya sendiri), sisanya keputusan pemilik project | Dokumen |
| README ledger diluruskan: 10 berkas repo → **11** entri ledger (migrasi 9 apply ganda), migrasi 10 ditambahkan, peringatan `db push` dibetulkan | Dokumen |
| Sapuan `crm_*`: 4 objek, semua fungsi `SECURITY DEFINER` kini terkunci; fungsi trigger `crm_audit_log_no_mutate` dinilai aman (tak bisa dipanggil via RPC) | Verifikasi |
| Test: 194 → **202** (+8 pagar EXECUTE) | **Pagar** (test) |

### Sprint 3J (pencarian profil — membuat suppression bisa dipakai)
| Perubahan | Sifat |
|---|---|
| `POST /api/search` — cari satu orang; gate `profile.view_list`; nama substring (trigram), telepon/email **sama persis** ternormalisasi; masking server-side | **BARU — BACA SAJA** |
| Audit `search.performed` (operasional, dipangkas > 90 hari): `kind` + `result_count` + `target_id` bila hasil **tepat satu**. **Query TIDAK disimpan** (ia identitas orang) | **BARU** |
| Pencarian di `/audience` di atas filter; telepon/email hasil-tunggal langsung ke profil; beda jelas "cari satu orang" (`search.performed`) vs "saring daftar" (`list.viewed`) | **MENGUBAH TAMPILAN** |
| `lib/crm/search.ts` (murni: validasi bentuk per kind, min 3 huruf nama, cap 10 + `too_many`, tolak pola sapuan) + `lib/crm/search-read.ts` (server) | Kode |
| `docs/PENCARIAN-exact-match.md` — kenapa telepon/email sama-persis & apa yang berubah bila diminta awalan | Dokumen |
| Konsumen runtime **kedua** kanon 3B (`normalize.ts`) — setelah jalur tulis suppression | — |
| Test: 202 → **219** (+16 pencarian: batas & penyalahgunaan; +1 aksi `search.performed` operasional) | **Pagar** (test) |

> **Nol perubahan skema di 3J.** Indeks yang dipakai (`idx_master_customer_name_trgm`,
> `idx_master_customer_phone_unique`, `idx_master_customer_email_unique`) sudah ada —
> diverifikasi di `pg_indexes` 2026-08-11. Pencarian dirancang **mengikuti** indeks yang
> ada, dan desain tercepat kebetulan juga yang paling aman (sama-persis, bukan awalan).

### Sprint 3K (kegagalan yang tidak meninggalkan jejak)
| Perubahan | Sifat |
|---|---|
| **Investigasi gap `37,38,39`** (tanpa menebak): DB menerima tiap audit-write (repro tabel temp), suppression RPC dikesampingkan (`crm_suppression`=0, raise sebelum audit). **Cacat deterministik tak terbukti**; gap stabil, tak bertambah. Tak ada perbaikan dikarang | Investigasi |
| `lib/crm/audit-gap.ts` (murni + test) — ringkas gap id; `id=4` known-legit; hitung "tak dikenal" | **Pagar** (test) |
| Banner **"Daftar ini tidak lengkap"** di `/settings` — jumlah id hilang & artinya; `fetchAuditLog` kini mengembalikan `gap` (min/max/count seluruh log) | **MENGUBAH TAMPILAN** |
| `lib/crm/failure-log.ts` — jejak kegagalan **PII-free** (hanya `code`/`status`) di **7 route** (500/503), mengikuti pola `login/actions.ts`. Kegagalan tak lagi hilang tanpa bekas | **BARU** |
| SQL deteksi gap di `docs/PASCA-MERGE-monitoring-revert.md`; keputusan **K-21** (gap = sinyal, JANGAN reset sequence) di `docs/riwayat/KEPUTUSAN.md` | Dokumen |
| V-7 tertutup di `docs/CEKLIS-verifikasi-live.md` (layar audit terbukti jalan; `id` 44–47) | Dokumen |
| Test: 219 → **227** (+8 gap-summary; batas & bentuk produksi nyata) | **Pagar** (test) |

> **Nol perubahan skema/DB/migrasi di 3K.** Tidak menulis `crm_audit_log` (hanya membaca
> min/max/count). Sequence tak disentuh — verified masih `47`, gap `4,37,38,39` utuh.

### Sprint 3L (satu klik, bukan satu ceklis)
| Perubahan bagi pemakai | Sifat |
|---|---|
| **`/settings/diagnostik`** (baru, gerbang `audit.view`) — status tiap rute **dihitung dari `crm_audit_log`**, pemeriksaan lapisan baca LULUS/GAGAL + waktu, kesehatan gap, dan **satu tautan** untuk menutup V-6 | **BARU** |
| `/settings` dapat tautan ke Diagnostik | **MENGUBAH TAMPILAN** |
| `lib/crm/verification-status.ts` (murni + test) — tiga kategori: `proven` / `unproven` / **`not_auditable`** (yang ketiga TAK disatukan dengan kedua, K-07) | Kode + **Pagar** |
| `lib/crm/diagnostic.ts` — pemanggil lapisan baca; **membuktikan nol audit ditulis** untuk rute yang diperiksa (test spy: nol write op) | Kode + **Pagar** |
| CEKLIS + `verify-live.mjs` jadi **jalur cadangan** ("app tak bisa dibuka"); status manual dipensiunkan → K-22, temuan S-07 | Dokumen |
| Test: 227 → **238** (+7 status, +4 diagnostik nol-tulis) | **Pagar** (test) |

### Sprint 3M (segment builder — menghitung, tak menyimpan)
| Perubahan | Sifat |
|---|---|
| `/segments` — ganti ComingSoon. Gate `segment.build` (super_admin/crm_manager/crm_operator/analyst; unit_manager own_unit → fail-closed; data_steward deny) | **BARU** |
| Kriteria: unit, segment (+ kohort NULL), kota (peringatan fill% **live** di tempat), revenue (punya/tanpa/**negatif** T-10), punya-telepon, punya-email. **Nol kriteria waktu** (K-19, dijelaskan di UI) | — |
| **Jumlah berpasangan** (PRD §18.8): cocok + boleh-dihubungi. Boleh-dihubungi **0** untuk semua definisi (consent kosong) — diturunkan dari `isContactableForMarketing`, bukan aturan kedua. Tautan ke `/consent` | **BARU** |
| Audit `list.viewed`/`master_customer` `view=segment_builder` (**bukan** `segment.*` — jatuh antara allowlist/denylist). Kota di-cap (K-17). **Nol baris orang ditampilkan** | — |
| Nol simpan/ekspor/kirim/daftar. `docs/RENCANA-simpan-segmen.md` (bentuk tabel = kriteria bukan `customer_id`; `segment.*` usulan operasional; urutan consent→simpan→kirim) | Dokumen |
| `lib/crm/segment.ts` (murni + test) + `lib/crm/segment-read.ts` (server) | Kode + **Pagar** |
| Test: 238 → **249** (+11 kriteria: closed-list, cap kota, nol jalur waktu, hitung kriteria aktif) | **Pagar** (test) |

> **Nol perubahan skema/DB di 3M.** Baca-saja atas `master_customer` + `crm_consent` +
> `crm_suppression`; satu-satunya tulis = audit `list.viewed` per perhitungan (button-triggered,
> bukan live). Nol daftar orang dikeluarkan.

### Sprint 3N (ekosistem 20FIT — baca `customer_engagement`, nol ingestion)
| Perubahan | Sifat |
|---|---|
| `lib/crm/engagement.ts` (server-only) — baca per-profil + agregat + resolusi id ekosistem. Kolom aman saja (**tanpa** `raw_value`/`source_row_id`/`period`). Kait lewat `customer_id` | **BARU — BACA SAJA** |
| `lib/crm/engagement-constants.ts` (murni + test) — kosakata 6 unit / 25 produk (kosakata SENDIRI, beda dari `AUDIENCE_UNITS`) + `classifyLastSeen` (real/cap-muat/anomali/missing) | Kode + **Pagar** |
| Detail profil: bagian **"Ekosistem 20FIT"** — tabel unit/produk/jumlah/terakhir; `last_seen_at` per baris diklasifikasi (cap-muat = "tidak terekam", **bukan** em-dash). **Nol audit kedua** (`profile.viewed` sudah mencakup) | **MENGUBAH TAMPILAN** |
| Segment builder: kriteria **unit + produk ekosistem** (closed-list). Jumlah berpasangan tetap (boleh-dihubungi tetap **0**). Distinct-id via paginasi kolom `customer_id`; intersect di memori (andalkan 0-yatim untuk jalur cepat) | **MENGUBAH TAMPILAN + BACA** |
| `/quality`: blok ekosistem — total baris, sebaran per-unit (live), baris tanggal-masa-depan (live). **Nol audit** (agregat tanpa parameter, K-07) | **MENGUBAH TAMPILAN** |
| `VERIFIED_ARTIFACTS` +2: `ecosystem_last_seen_load_stamp` (99,51% cap muat — antar-kolom, tak bisa live) + `ecosystem_coverage` (99,80% cakupan — count distinct) — bertanggal | Dokumen (di kode) |
| `docs/SUMBER-AKTIVITAS.md` — 4 sumber (HYROX 1.038, my20fit_profile 886, my20fit_user_activity 175, rc_team_members 1.545; rc_participant_photos **kosong**) dipetakan: kunci identitas (email/nama, **bukan** `customer_id`), waktu nyata?, keputusan pra-ingestion. **Nol ingestion dibangun** | Dokumen |
| T-14 (cap muat ke-4) + K-19 diperluas + `FAKTA-DATA.md` blok `customer_engagement` | Dokumen (riwayat) |
| Test: 249 → **262** (+12 `classifyLastSeen`/kosakata ekosistem; +1 kriteria ekosistem closed-list) | **Pagar** (test) |

> **Nol perubahan skema/DB/migrasi di 3N.** `customer_engagement` dibaca di tempat — nol
> INSERT ke `crm_*`, nol tabel/view/RPC baru, nol `setval`. Tulis satu-satunya tetap audit
> `list.viewed` per perhitungan segment (button-triggered). Detail profil **tidak** menulis
> audit kedua. Kolom sumber sensitif (`raw_value`, NIK/kesehatan di tabel lain) tak dibaca.

### Sprint 3O (ukur paparan data sensitif, angkat, jangan sentuh)
| Perubahan | Sifat |
|---|---|
| Sapuan seluruh skema `public`: tabel **RLS OFF × kolom sensitif** (NIK/kesehatan/DOB/darurat/kredensial). **Hitungan saja, nol nilai diambil.** T-02/T-03 diukur ulang (88.536 RLS OFF; **102** fungsi anon-exec, naik dari 101) | Pengukuran |
| `docs/ESKALASI-paparan-data-sensitif.md` — 2 halaman untuk pengambil keputusan: apa terpapar (per keparahan + jumlah **orang**), bagaimana (anon key di bundel JS), apa yang TIDAK (CRM RLS ON), kenapa bukan tugas CRM, urutan remediasi + siapa memutuskan, akibat bila didiamkan | Dokumen |
| T-15 di `TEMUAN.md` + **puncak** `docs/riwayat/README.md` (peringatan keamanan aktif) + blok paparan di `FAKTA-DATA.md` | Dokumen (riwayat) |
| **Pemeriksaan lapisan baca CRM sendiri:** setiap `.select()` ditelusuri — **nol** kolom sensitif keluar dari server; `date_of_birth` hanya muncul sebagai `count` di `/quality` (bukan nilai); audit `metadata`/log kegagalan PII-free | Verifikasi |
| Daftar kolom aman `customer_engagement` dipindah ke konstanta teruji (`ENGAGEMENT_SAFE_COLUMNS`/`ENGAGEMENT_FORBIDDEN_COLUMNS`); `select` dibangun darinya | Kode |
| Test: 262 → **265** (+3 penjaga kolom aman: `raw_value`/`source_row_id`/`period` tak boleh masuk `select`) | **Pagar** (test) |

> **Nol perubahan skema/DB di 3O.** Nol RLS dinyalakan, nol policy ditulis, nol tabel tim
> lain disentuh (hanya `count(*)`/`count(distinct)` untuk mengukur). Nol nilai NIK/kesehatan/
> kontak darurat masuk berkas atau laporan mana pun. Satu perubahan kode: refactor daftar
> kolom aman jadi konstanta teruji — tak mengubah kolom yang dibaca, hanya menjaganya.

> **Nol perubahan skema/DB/migrasi di 3L.** Diagnostik baca-saja; satu-satunya tulis =
> self-audit `list.viewed`/`crm_audit_log` (`view=diagnostik`). **Bukti nol-inflasi audit:**
> pemeriksaan memanggil lapisan baca (bukan route handler), diuji dengan spy client yang
> menegaskan nol `insert` ke `crm_audit_log`.

## 2. Yang TIDAK berubah (batas keras sprint ini)
- **Nol jalur tulis consent.** `crm_consent` masih baca-saja — belum ada kanal opt-in nyata untuk ditunjuk. Nol `INSERT` ke `crm_consent`.
- **Nol DELETE dari `crm_suppression`.** Pencabutan = `status='lifted'`. Sticky by design (D-4).
- **Nol backfill.** `legacy_import` ada di kosakata DB tetapi **tidak** ditawarkan aplikasi — mengisi massal butuh keputusan tim, bukan sprint ini.
- **Normalisasi tidak di SQL** (D-2). Fungsi hanya **menolak** yang belum ternormalisasi; normalisasi selalu di `lib/crm/normalize.ts`.
- **Hanya migrasi 9 (3H) + migrasi 10 (3I)**, nol migrasi lain. **Nol `supabase db push`.** Nol sentuh objek di luar `crm_*` (101 fungsi tim lain yang terbuka **tidak** disentuh — keputusan pemilik project, `docs/RISIKO-rpc-execute-terbuka.md`). `crm_user_role` tak disentuh. RLS tabel lama tak dinyalakan. `railway.json` (`NODE_ENV=production`) utuh.

## 3. Bukti atomik (K-3) — dijalankan, bukan diklaim
Migrasi 9 diverifikasi lewat probe **dalam transaksi yang di-ROLLBACK** (nol residu di produksi — `crm_suppression` tetap 0 baris, audit tetap 35):
- **Happy path:** satu panggilan → satu baris suppression **dan** satu baris audit tertaut (`target_id`).
- **Idempoten:** panggilan kedua identik → `noop`, audit **tidak** bertambah (1 baris untuk 2 panggilan).
- **Gagal di tengah:** trigger dipaksa menggagalkan INSERT audit → INSERT suppression **ikut rollback**; `leftover_suppression_rows = 0`. **Tidak ada baris separuh jadi.**
- **Jaring pengaman:** telepon `+…`/berawalan 0, email huruf besar/tanpa `@`, `reason_code` asing, `lifted_reason` kosong — semua ditolak.
- **Kunci EXECUTE:** `anon`/`authenticated` dicabut (Supabase memberi default; `revoke from public` tak cukup) — kini `service_role` saja.

## 4. Rencana revert — TIGA TINGKAT, jangan campur

Sprint ini memisahkan tiga hal yang dulu satu. Perlakukan berbeda:

### Tingkat 0 — MIGRASI 10 (JANGAN direvert)
Migrasi 10 mencabut `EXECUTE` terbuka dari `crm_purge_audit_log`. **Ia bukan bagian dari
revert siklus ini.** Mengembalikan grant terbuka = **membuka kembali lubang keamanan** yang
sudah live sejak 3A. Migrasi 10 berlaku di database terlepas dari merge kode; kalau kode
di-revert, migrasi 10 **tetap tinggal** — itu benar. Jangan `grant execute ... to anon`
atau `to public` untuk fungsi itu, dengan alasan apa pun.

### Tingkat 1 — KODE (bisa dikembalikan, aman)
`git revert` commit 3H (atau revert merge PR-nya). Aplikasi kembali baca-saja: tombol
"catat permintaan berhenti", entri `/consent`, dan pencabutan hilang. `/consent` kembali
seperti 3F (register baca-saja). **Ini aman dan cukup untuk mematikan jalur tulis.**

### Tingkat 2 — FUNGSI (bisa di-`drop`, aman)
Migrasi 9 hanya menambah dua fungsi (bukan tabel, bukan data). Bila ingin melumpuhkan
jalur tulis di level database (mis. kode masih nyangkut):
```sql
drop function if exists public.crm_record_suppression(text,text,text,text,uuid,text,uuid,text);
drop function if exists public.crm_lift_suppression(text,text,text,uuid,text);
```
Men-drop fungsi **tidak menghapus data apa pun** — hanya mencabut kemampuan menulis.
Aman kapan pun. (Ledger `apply_migration` tetap mencatat versinya; bereskan bila
membatalkan sepenuhnya.)

### Tingkat 3 — BARIS SUPPRESSION (TIDAK BOLEH DIHAPUS, titik)
```sql
-- JANGAN. Ini menghapus catatan permintaan orang sungguhan.
-- delete from crm_suppression where ...   ❌ SELAMANYA SALAH
```
- Sebuah baris `crm_suppression` `status='active'` adalah **permintaan seseorang untuk
  berhenti dihubungi**. Menghapusnya = menghilangkan permintaan itu = orang tersebut
  akan dihubungi lagi di kampanye pertama. Itu **bahaya nyata bagi orang**, bukan
  sekadar kotor secara teknis.
- Revert kode (Tingkat 1) **membiarkan** baris-baris ini — itu **benar**. Setelah revert
  mereka tak dibaca aplikasi apa pun, tapi tetap catatan sah; biarkan.
- Satu-satunya "pembatalan" sah untuk sebuah suppression adalah **pencabutan** (`lifted`)
  lewat jalur beralasan + teraudit — bukan `DELETE`. Keputusan menghapus permanen (bila
  pernah perlu) adalah keputusan pemilik data + legal, **bukan** on-call jam 2 pagi.

## 5. Yang dipantau 30 menit pertama setelah deploy

### 5a. Jalur tulis hidup — baris yang HARUS muncul saat orang memakai
```sql
-- Aksi audit baru dalam 30 menit. Boleh bertambah: suppression.added / suppression.lifted
-- (selain list.viewed / profile.viewed yang sudah ada). TIDAK boleh ada nama aksi lain.
select action, count(*) from crm_audit_log
where occurred_at > now() - interval '30 minutes'
group by action order by 2 desc;
```

### 5b. K-3 DITEGAKKAN — deteksi kegagalan atomik (ini inti sprint)
Satu-satunya cara melihat atomik benar-benar bekerja di produksi adalah mencari
**pasangan yang pincang**. Kedua kueri ini harus mengembalikan **nol baris**:
```sql
-- (1) Baris suppression TANPA baris audit pasangannya → K-3 bocor (tulis tanpa jejak).
select s.id, s.identity_kind, s.status, s.created_at
from crm_suppression s
left join crm_audit_log a
  on a.action = 'suppression.added'
 and a.target_table = 'crm_suppression'
 and a.target_id = s.id::text
where s.created_at > now() - interval '30 minutes'
  and a.id is null;

-- (2) Baris audit suppression.added TANPA baris suppression-nya → K-3 bocor (jejak hantu).
select a.id, a.target_id, a.occurred_at
from crm_audit_log a
left join crm_suppression s on s.id::text = a.target_id
where a.action = 'suppression.added'
  and a.occurred_at > now() - interval '30 minutes'
  and s.id is null;
```
Bila salah satu mengembalikan baris: **hentikan jalur tulis** (Tingkat 2 drop fungsi) dan
selidiki — transaksi tidak atomik seperti yang diklaim. (Probe ROLLBACK §3 membuktikan
ia atomik; kueri ini menjaga klaim itu tetap benar di produksi.)

### 5c. Suppression menang & consent tak tersentuh — verifikasi baris pertama
Setelah **satu** permintaan pertama dicatat lewat aplikasi:
```sql
select
  (select count(*) from crm_suppression) as suppression_rows,          -- naik 1
  (select count(*) from crm_audit_log where action='suppression.added'
     and occurred_at > now() - interval '30 minutes') as added_audit,  -- = 1
  (select count(*) from crm_consent) as consent_rows;                  -- TETAP 0 (nol tulis consent)
```
Kartu "Bisa dihubungi" di dashboard tetap **0** — kini nol karena **dua** alasan yang
keduanya benar: (a) nol consent marketing aktif (short-circuit), dan (b) bahkan bila ada,
suppression menang. Cabang "suppression menang" — kosong sejak tabel dibuat — akhirnya
dijalankan dengan data oleh baris pertama ini.

### 5d. Sisa (tak berubah dari 3G)
Log Railway: deploy hijau, `/health` (`env: configured`, `supabase: reachable`), prefix
`NODE_ENV=production` utuh, nol lonjakan 500 sistemik di `/api/*`.

## 6. Yang masih menggantung (status jujur, 11 Agu 13:39 UTC)
- **V-6 TERTUTUP** (baru) — `/audience/[id]` terbukti: `profile.viewed id=51`, `target_id`
  terisi, 13:38:31 UTC. V-7 (`/settings`) juga terbukti. `/api/search` terbukti. Kini
  **dihitung otomatis** di `/settings/diagnostik` — tak perlu diketik ke dokumen lagi.
- **RISIKO TERATAS TAK BERUBAH: penyebab gap `37,38,39` masih belum terbukti.** V-6
  tertutup **melemahkan** hipotesis "detail profil rusak" (ia jalan; gap tak bertambah dari
  sesi sukses 13:37–13:39), tapi tak **membuktikan** penyebabnya. Hanya **log Railway**
  jendela 08:01–08:58 UTC 11 Agu yang bisa menjawab — cari request `/api/audience/[id]`
  yang 503/dibatalkan. `get_logs` masih gagal untuk saya.
- **Baris suppression pertama belum ada** — jalur tulis (3H) + pencarian (3J) kini di main,
  jadi terjangkau; masih menunggu **permintaan nyata**. **Jangan** buatkan baris uji
  (`docs/PERTAMA-suppression.md`).
- **Dua commit belum ter-merge** (3K instrumen + 3L pemakaian-satu-klik). Selama di branch,
  jejak kegagalan 3K tak mencatat apa pun — kejadian berikutnya kembali hilang tanpa bekas.

## 7. Prasyarat & catatan merge
- **JANGAN merge / buka PR ke `main` tanpa izin eksplisit.** Push ke `main` memicu deploy
  Railway ke sistem yang dipakai orang.
- **3K & 3L baca-saja, nol skema.** Revert = `git revert` kode saja. **Migrasi 10 (3I)
  JANGAN direvert** (§4 Tingkat 0) — DB-nya sudah ditutup, dan 3I sudah di main via PR #6.
- **Validasi deploy 3L itu sendiri = buka `/settings/diagnostik`** setelah deploy: seluruh
  lapisan baca terperiksa dalam satu halaman. Yang bisa tanpa deploy sudah: tipe, lint,
  238 test, build produksi, dan bukti spy bahwa diagnostik nol-tulis audit.
- **Perbarui `docs/riwayat/` sebagai bagian dari siklus ini** (dan tiap siklus berikutnya):
  `LINIMASA.md` (baris sprint + status merge), `KEPUTUSAN.md`/`TEMUAN.md` bila ada yang baru,
  `FAKTA-DATA.md` bila angka DB bergerak (bertanggal), `sprint-3j/02-laporan.md` +
  `03-tinjauan.md`, dan simpan transkrip ke `transkrip/` sebelum sesi ditutup. Folder yang
  tak diperbarui menyimpang diam-diam dari kode — persis pola aturan-ganda yang dijaga proyek ini.
