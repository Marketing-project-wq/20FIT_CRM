# Baris suppression PERTAMA — panduan untuk yang mencatatnya

> Untuk orang yang akan mencatat permintaan berhenti-dihubungi pertama lewat aplikasi
> (peran `super_admin`, `crm_manager`, atau `data_steward`). Baca sekali sebelum mulai.
>
> **Satu aturan di atas segalanya:** baris suppression **tidak bisa dihapus**. Ia catatan
> permintaan orang sungguhan. Karena itu baris pertama **harus** berasal dari permintaan
> nyata seseorang — **bukan uji coba**. Sebuah baris uji akan jadi permanen dan mencemari
> catatan hukum. Kalau kamu hanya ingin "mencoba fitur", **jangan** — jalur ini bukan
> tempat bereksperimen.

## 1. Apa yang dianggap permintaan sah, dan `reason_code`-nya

Suppression mencatat sesuatu yang **sudah terjadi**: seseorang meminta berhenti dihubungi.
Rekam `reason_code` yang paling jujur menggambarkan permintaan itu:

| Situasi nyata | `reason_code` |
|---|---|
| Orangnya sendiri minta berhenti (lewat WhatsApp, telepon, atau bilang ke staf) | `user_request` |
| Orangnya komplain / keberatan dihubungi | `complaint` |
| Nomor/email mati, bounce keras berulang | `bounce` |
| Permintaan lewat jalur hukum (kuasa hukum, surat resmi) | `legal` |

`legacy_import` **tidak** ditawarkan di aplikasi — itu untuk impor massal berbasis
keputusan tim, bukan pencatatan satu-per-satu, dan backfill dilarang. Kalau tidak ada
permintaan nyata untuk ditunjuk, **tidak ada yang dicatat**.

## 2. Langkah persis di UI

Dua titik masuk — pakai yang sesuai:

**A. Dari profil** (kalau orangnya ada di audience): buka `/audience` → klik namanya →
di detail profil klik **"Catat permintaan berhenti"**.

**B. Dari `/consent`** (kalau orangnya menelepon/menulis, tak perlu buka profil): buka
`/consent` → tombol **"Catat permintaan berhenti"** di bagian Daftar suppression.

Lalu, di kedua jalur:

1. **Pilih identitas yang disuppress — telepon ATAU email, eksplisit.** Satu profil bisa
   punya keduanya; aplikasi **tidak** menulis keduanya diam-diam. Kalau perlu menutup
   keduanya, catat **dua kali**.
   - Jalur A: pilih di antara telepon/email yang dimiliki profil.
   - Jalur B: pilih jenis, lalu ketik nilainya (boleh berantakan, mis. `0812-3456-789`).
2. Pilih **Alasan** (tabel §1) dan, opsional, **Catatan** singkat (mis. "minta stop lewat
   WA 11 Agu"). Catatan dibatasi panjang dan **tidak** masuk ke metadata audit.
3. Klik **Tinjau**. **INI LANGKAH PENTING:** server menormalkan identitas dan
   menampilkan **bentuk final yang akan ditulis** (telepon `62…` tanpa `+`; email huruf
   kecil). **Cocokkan bentuk itu dengan orang yang kamu maksud sebelum lanjut.** Kalau
   nomor/email tak bisa dinormalkan, aplikasi menolak — tidak ada yang ditulis.
4. Panel tinjau juga memberi tahu: baris baru, atau **mengaktifkan kembali** suppression
   yang pernah dicabut, atau sudah aktif (tak ada perubahan).
5. Klik **Catat permintaan**. Sukses menampilkan akibatnya: orang ini kini **tidak bisa
   dihubungi** untuk marketing apa pun status consent-nya.

## 3. SQL untuk memastikan hasilnya benar

Jalankan di SQL Editor Supabase **setelah** mencatat (semua `select`, tidak menulis):

```sql
-- (a) Satu baris crm_suppression baru, active. Ganti window bila perlu.
select id, identity_kind, status, reason_code, created_at
from crm_suppression
where created_at > now() - interval '15 minutes'
order by created_at desc;

-- (b) Satu baris audit suppression.added pasangannya (metadata NON-PII: tanpa identity_key).
select id, actor_email, action, target_table, target_id, metadata, occurred_at
from crm_audit_log
where action = 'suppression.added' and occurred_at > now() - interval '15 minutes'
order by id desc;

-- (c) crm_consent TIDAK bertambah — jalur tulis consent tidak dibangun.
select count(*) as consent_rows from crm_consent;   -- harus tetap 0
```
Harapan: (a) satu baris, (b) satu baris dengan `target_id` = id baris (a), (c) `0`.

## 4. SQL deteksi kegagalan atomik (K-3) — satu-satunya bukti nyata

Probe rollback sudah membuktikan atomik sebelum deploy. Di **produksi**, satu-satunya cara
melihat K-3 benar-benar ditegakkan adalah mencari **pasangan yang pincang**. Kedua kueri
ini **harus mengembalikan nol baris**:

```sql
-- (1) Baris suppression TANPA baris audit pasangannya → tulis tanpa jejak (K-3 bocor).
select s.id, s.identity_kind, s.status, s.created_at
from crm_suppression s
left join crm_audit_log a
  on a.action='suppression.added' and a.target_table='crm_suppression' and a.target_id=s.id::text
where s.created_at > now() - interval '30 minutes' and a.id is null;

-- (2) Baris audit suppression.added TANPA baris suppression-nya → jejak hantu (K-3 bocor).
select a.id, a.target_id, a.occurred_at
from crm_audit_log a
left join crm_suppression s on s.id::text = a.target_id
where a.action='suppression.added' and a.occurred_at > now() - interval '30 minutes'
  and s.id is null;
```
Kalau salah satu mengembalikan baris: transaksi **tidak** atomik seperti diklaim. Hentikan
jalur tulis (drop dua fungsi RPC, lihat `docs/PR-sprint-3g-3i.md` §4 Tingkat 2) dan
laporkan sebelum mencatat lagi.

## 5. Kalau ternyata SALAH ORANG yang di-suppress

**Jangan hapus.** `DELETE` dari `crm_suppression` dilarang — dan lagipula menghilangkan
jejak bahwa kesalahan pernah terjadi. Yang benar: **cabut** (`lifted`) dengan alasan jujur.

1. Buka `/consent` → baris suppression yang salah → tombol **Cabut**.
2. Isi **Alasan pencabutan** apa adanya (mis. "salah nomor — bukan orang yang minta stop,
   dikoreksi 11 Agu"). Alasan **wajib**.
3. Konfirmasi. Statusnya menjadi `lifted`, `lifted_at`/`lifted_reason` terisi, dan satu
   baris audit `suppression.lifted` ditulis atomik. Barisnya **tetap ada** (status
   berubah, bukan terhapus) — orang itu kini bisa dihubungi lagi (tunduk pada consent).

Memverifikasi pencabutan:
```sql
select id, identity_kind, status, lifted_at, lifted_reason
from crm_suppression where status='lifted' order by lifted_at desc limit 5;

select id, action, target_id, occurred_at
from crm_audit_log where action='suppression.lifted' order by id desc limit 5;
```

> Menyuppress orang yang salah lalu mencabutnya meninggalkan **dua** baris audit
> (`added` lalu `lifted`) — itu benar. Jejak kesalahan-dan-koreksi memang harus terlihat.
> Yang tak boleh: menghapus supaya "bersih". Bersih yang menghapus bukti bukan bersih.
