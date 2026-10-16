/**
 * Initial knowledge base for the partnership agent (inserted once into p_kb when empty; edited in the
 * UI afterwards). Sources: the live product sites (20fit.id, ticket, racelab, talent, arena, clinic,
 * shop, academy, affiliate) and Customer 360 audience counts measured 16 Oct 2026.
 */
export const KB_SEED: { title: string; product: string; content: string }[] = [
  {
    title: "Tentang 20FIT Group",
    product: "umum",
    content: `20FIT adalah ekosistem olahraga & kebugaran terpadu di Jakarta (PT Kredo AUM). Unit: 20FIT Arena (HYROX Training Club, Menteng), 20FIT Sports Clinic & Gym (Jl. Sinabung No. 9, Kebayoran Baru, Jakarta Selatan), 20FIT Events & Ticket, 20FIT Photo, Race Lab (teknologi timing), 20FIT Talent (KOL/fotografer/manpower), 20FIT Shop (distributor Precor, CENTR, HYROX), 20FIT Media, 20FIT Academy, aplikasi My 20FIT.
Skala komunitas (data internal Okt 2026): ±115 ribu orang di database pelanggan, ±95 ribu bisa dihubungi via email; ±7.600 pembeli tiket event, ±5.400 pengguna foto event, ±3.500 member/peserta Arena, ±4.400 pasien/klien Clinic.
Event yang sudah dijalankan/di-power 20FIT: Indonesia Sports Summit 2026 – Jakarta Hybrid Race (GBK, Sep 2026), PLN Mobile Electric 5K Series Jakarta (±3.300 peserta) & Yogyakarta (±1.700), UOB Heartbeat Run (±6.400 peserta), BRI Life Pelari Berpesta, Sportfest Vol. 2 & 3, Platarox, Livin' by Mandiri | VISA × Jakarta Hybrid Race (7 Nov 2026).
Kontak umum WhatsApp 20FIT: +62 811-1182-0905. Website: 20fit.id.`,
  },
  {
    title: "Sponsorship & brand collaboration event",
    product: "sponsorship",
    content: `20FIT membuka kolaborasi brand untuk event lari, hybrid race (HYROX-style), sportfest, dan kelas spesial.
Aset yang bisa ditawarkan: title/naming sponsor, kategori bermerek, booth di race village, eksposur di halaman event & race guide, konten di 20FIT Media & Instagram, merchandise co-branding, promo/kode diskon untuk peserta, event khusus pemegang kartu/nasabah (contoh: Livin' by Mandiri × Jakarta Hybrid Race – pembayaran khusus kartu Mandiri VISA), aktivasi di 20FIT Arena, dan laporan pasca-event (jumlah peserta, demografi agregat, eksposur).
Event terdekat: Hybrid Rave (24 Okt 2026, 20FIT Arena Menteng), Costume & Play kids & teens (31 Okt 2026), PLN Mobile Electric 5K Series Bali (31 Okt 2026), Livin' by Mandiri | VISA × Jakarta Hybrid Race (7 Nov 2026, Jakarta).
Harga paket sponsorship disusun per kebutuhan — JANGAN menyebut angka; ajak meeting untuk menyusun proposal.
Data peserta tidak pernah dibagikan per orang; yang dibagikan hanya agregat atau komunikasi lewat kanal 20FIT dengan izin.`,
  },
  {
    title: "Ticket — platform tiket untuk EO",
    product: "ticket",
    content: `ticket.20fit.id adalah platform tiket olahraga untuk Event Organizer: halaman event, banyak tipe tiket & kuota, kategori peserta, form peserta kustom (jersey, kontak darurat, dll.), BIB otomatis, add-on (foto, merchandise, proteksi), kode promo, pembayaran QRIS / virtual account / e-wallet / kartu kredit-debit, dashboard EO real-time, katalog toko per EO (/shop/<nama-EO>), dan gate check-in race pack (RPC) dengan QR.
Cocok untuk: fun run, marathon, hybrid race, kelas, sportfest, komunitas.
Biaya platform/komisi dibicarakan per event — JANGAN menyebut angka; tawarkan demo/meeting.`,
  },
  {
    title: "20FIT Photo — foto event & face search",
    product: "photo",
    content: `20FIT Photo menyediakan dokumentasi foto/video event dan penjualan foto ke peserta dengan pencarian wajah (selfie → semua foto dirinya). Peserta bisa beli foto satuan, Unlimited per event, atau add-on foto saat beli tiket. Untuk penyelenggara, foto menjadi sumber pendapatan baru (bagi hasil dibahas per event). Bisa didukung fotografer dari 20FIT Talent.`,
  },
  {
    title: "Race Lab — teknologi race end-to-end",
    product: "racelab",
    content: `20FIT Race Lab (racelab.20fit.id) menghubungkan seluruh perjalanan peserta dalam satu sistem: welcome screen & registrasi, pengambilan race pack, pembagian wave & countdown start, chip & lap timing, live leaderboard (layar besar & online), finish automation (email hasil otomatis saat finis), dan monetisasi foto dengan face recognition.
Format: hybrid race (station/split timing, heats & waves, leaderboard per kategori), lari 5K–marathon (checkpoint & net timing), triathlon/trail/obstacle (checkpoint kustom).
Untuk event di Indonesia, Malaysia, Singapura, Thailand. Tawarkan demo.`,
  },
  {
    title: "20FIT Talent — KOL, fotografer, manpower",
    product: "talent",
    content: `talent.20fit.id menghubungkan KOL, fotografer, dan manpower dengan EO yang butuh talenta untuk event olahraga: sourcing, verifikasi identitas, seleksi oleh EO, sampai sertifikat digital. Talenta dilatih coach 20FIT Arena & Gym. Untuk brand: bisa menyediakan KOL olahraga untuk kampanye. Untuk EO: manpower & fotografer terverifikasi.`,
  },
  {
    title: "20FIT Arena — venue & kelas",
    product: "arena",
    content: `20FIT Arena Menteng Prada (Jl. Pegangsaan Timur No.15A, Menteng, Jakarta Pusat): HYROX Training Club resmi, 2.400 m², 8 stasiun HYROX penuh, alat Centr & Concept2 standar race, buka 06:00–22:00, ada cafe, mushola, parkir mobil & motor.
Bisa untuk: sewa arena (komunitas/korporat), simulasi race, event internal perusahaan, kelas privat/grup, aktivasi brand. Booking kelas: booking.20fit.id.`,
  },
  {
    title: "20FIT Sports Clinic",
    product: "clinic",
    content: `20FIT Sports Clinic (Jl. Sinabung No. 9, Kebayoran Baru; 06:00–21:00; rating Google 5.0): fisioterapi olahraga dengan konsultasi dokter kedokteran olahraga, sport massage, EMS, corrective therapy, recovery.
Untuk partner: booth recovery/medis di event, screening kebugaran karyawan, program pemulihan untuk atlet/komunitas. WhatsApp klinik: +62 811-1185-9109.
Jangan memberi saran medis lewat chat; arahkan ke konsultasi.`,
  },
  {
    title: "Corporate wellness",
    product: "corporate",
    content: `Paket corporate wellness disusun dari: kelas grup di 20FIT Arena/Gym, fun run atau hybrid race internal (pakai Ticket + Race Lab, leaderboard antar divisi), screening & sport massage dari 20FIT Sports Clinic, challenge di aplikasi My 20FIT, dan benefit karyawan (contoh: promo kartu bank untuk booking Arena).
Harga per paket/karyawan disusun setelah tahu jumlah karyawan, lokasi, frekuensi — ajak meeting.`,
  },
  {
    title: "Komunitas, venue & EO",
    product: "community",
    content: `Untuk komunitas lari/fitness: sewa Arena, kelas bareng, harga komunitas untuk event 20FIT, kolaborasi event bersama (co-host), pemakaian Ticket & Race Lab untuk event komunitas.
Untuk venue/EO: kerja sama penyelenggaraan, tiket, timing, foto, manpower, booth clinic. Untuk media partner: pertukaran eksposur dan konten di 20FIT Media (media.20fit.id).`,
  },
  {
    title: "20FIT Shop — alat gym B2B",
    product: "shop",
    content: `20FIT Shop (shop.20fit.id) distributor resmi Precor, CENTR, dan HYROX di Indonesia: alat untuk gym komersial, hotel, apartemen, HYROX center, dan home gym; tersedia sewa alat (antar & pasang) dan kalkulator ROI. Penawaran harga dibuat tim Shop — handoff ke manusia untuk quotation.`,
  },
  {
    title: "Academy & Affiliate",
    product: "academy",
    content: `20FIT Academy: sertifikasi HYROX Coach (Hyrox365) + voucher ISSA NCCPT-CPT, 16 kursi per batch, di 20FIT Arena; biaya diberikan setelah lolos aplikasi.
Program Affiliate 20FIT (affiliate.20fit.id): komisi 2,5% per pembelian lewat link produk dari aplikasi 20FIT, cocok untuk KOL/komunitas.`,
  },
  {
    title: "Aturan agent (wajib)",
    product: "aturan",
    content: `1. Jangan pernah menyebut harga, diskon, komisi, atau komitmen yang tidak tertulis di knowledge base. Untuk harga/proposal: ajak meeting atau serahkan ke tim (handoff).
2. Tujuan utama tiap percakapan: pahami kebutuhan partner (siapa, produk apa, kapan, skala) lalu jadwalkan meeting (Google Meet 30 menit, atau tatap muka di 20FIT Arena Menteng / 20FIT Kebayoran).
3. Kontrak, legal, keluhan, permintaan data pribadi, atau negosiasi angka → handoff ke manusia.
4. Jangan membagikan data pribadi pelanggan 20FIT. Angka komunitas hanya agregat.
5. Pesan WhatsApp singkat (maks 3–4 kalimat), tanpa format email. Email boleh lebih lengkap tapi tetap ringkas.
6. Jangan mengaku manusia kalau ditanya langsung; katakan kamu asisten tim partnership 20FIT dan tim akan ikut di meeting.`,
  },
];
