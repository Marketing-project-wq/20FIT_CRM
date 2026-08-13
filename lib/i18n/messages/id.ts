/**
 * Indonesian dictionary — the SOURCE OF TRUTH for keys (Sprint 4B). English (./en.ts) is typed as
 * `Messages = typeof id`, so a key missing from English is a COMPILE error; a runtime parity test
 * (i18n.test.ts) then catches extra/missing keys in EITHER direction. Values are plain `string`
 * (no `as const`) precisely so English may differ in text while matching in shape.
 *
 * SCOPE: the chrome + dashboard + access/error surfaces + the server surfaces (CSV export headers
 * & provenance, the AI assistant's unexpressible language). Deep operational screens (/quality
 * body, profile detail, segment builder, consent, audit) are intentionally NOT in this dictionary
 * yet — see docs and the closing report. This keeps the warning prose from being softened in a
 * rushed pass; it is Indonesian-only until a careful translation lands.
 *
 * NEVER put a STORED DATA VALUE here (Campion user, Fitco User, New User, phone_normalized) — those
 * are data, not labels, and stay verbatim in both languages.
 */

export const id = {
  coverage: {
    // Shown at the top of a screen whose content is still Indonesian-only, when English is chosen.
    // A LABELLED mix reads as work-in-progress; a silent one reads as breakage.
    notEnglishYet: "Bagian ini belum tersedia dalam bahasa Inggris — masih ditampilkan dalam bahasa Indonesia.",
  },

  common: {
    appName: "20FIT CRM",
    languageName: "Bahasa Indonesia",
    loading: "Memuat…",
    retry: "Coba lagi",
    back: "Kembali",
    dash: "—",
    // The K-08 distinction, in words, reused wherever the 0-vs-— rule is explained.
    measuredZero: "0 (terukur)",
    noSource: "— (tidak ada sumber)",
  },

  nav: {
    dashboard: "Dashboard",
    audience: "Audience",
    segments: "Segments",
    workflows: "Workflows",
    campaigns: "Campaigns",
    templates: "Templates",
    messages: "Messages",
    consent: "Consent",
    quality: "Quality",
    exports: "Exports",
    settings: "Settings",
    darkMode: "Mode gelap",
    lightMode: "Mode terang",
    language: "Bahasa",
    signedInAs: "Masuk sebagai",
    signOut: "Keluar",
  },

  access: {
    deniedBadge: "Akses ditolak",
    // Dashboard cards hidden because the role can't see the profile list.
    dashboardHidden: "Angka disembunyikan: peran Anda tidak berizin melihat daftar profil (fail-closed).",
    loadFailed: "Angka gagal dimuat. Kartu menampilkan “—” alih-alih menebak.",
    segmentsDeniedScope:
      "Peran unit_manager dibatasi pada unit yang dikelola, tetapi tabel unit-scope belum ada — akses ditolak (fail-closed).",
    segmentsDeniedRole:
      "Membangun segmen butuh peran segment.build (super_admin, crm_manager, crm_operator, analyst). data_steward tidak berhak.",
  },

  dashboard: {
    title: "Dashboard",
    subtitle: "Audience Data & CRM 20FIT",
    tz: "WIB",
    audienceSize: "Ukuran audiens",
    audienceSizeHint: "master_customer (baca saja)",
    contactableMarketing: "Bisa dihubungi · marketing",
    contactableMarketingHint: "consent marketing aktif − suppression",
    contactableService: "Bisa dihubungi · layanan",
    contactableServiceHint: "consent transactional aktif − suppression (untuk CS/operasional)",
    workflowActive: "Workflow aktif",
    workflowActiveHint: "belum ada tabel workflow",
    lastProfile: "Profil terakhir bertambah",
    lastProfileHint:
      "tanggal muatan batch terakhir (2 muatan: 20 Apr & 31 Jul 2026) — bukan feed berkelanjutan",
    importDob: "Tanggal lahir · data impor",
    importDobHint:
      "baris staging_20fit_data punya tgl lahir (master_customer: 0) · ~98,6% cocok ke profil (12 Agu 2026)",
    rfmTitle: "Sebaran RFM · data impor 20FIT",
    // The RFM note keeps the "− = no bucket, not empty" nuance and the "spelling kept" rule.
    rfmNote:
      'Dari staging_20fit_data."RFM per paid order". “−” = tanpa bucket (bukan kosong). Ejaan tersimpan dipertahankan apa adanya. RFM per revenue 0% terisi.',
    rfmNoBucket: "− (tanpa bucket)",
  },

  // /audience page (Sprint 4D screen 1) — browse pool + single-person search + quality banner.
  // Sentences with an inline mono token / link / count are split into parts so the exact styling
  // survives translation. Warnings live under audience.warn.* (guarded).
  audience: {
    maskedBadge: "Kontak disamarkan",
    subtitlePre: "Pool audiens tunggal — ",
    subtitleMid: " profil dibaca langsung dari ",
    subtitlePost: " (baca saja).",
    filterListLabel: "Saring daftar",
    cityPlaceholder: "Cari kota…",
    allUnits: "Semua unit",
    allSegments: "Semua segment",
    noSegment: "(tanpa segment)",
    allRevenue: "Semua revenue",
    hasPaid: "Pernah membayar",
    notPaid: "Belum membayar",
    ariaUnit: "Filter unit",
    ariaSegment: "Filter segment",
    ariaRevenue: "Filter revenue",
    thName: "Nama",
    thPhone: "Telepon",
    thEmail: "Email",
    thCity: "Kota",
    thUnit: "Unit",
    thSegment: "Segment",
    thLtv: "Lifetime value",
    thCreated: "Dibuat",
    loading: "Memuat…",
    failed: "Gagal",
    noMatch: "Tidak ada profil yang cocok dengan filter ini.",
    noName: "(tanpa nama)",
    empty: "belum terisi",
    zeroProfiles: "0 profil",
    showingPre: "Menampilkan ",
    showingOf: " dari ",
    prev: "Sebelumnya",
    pageLabel: "Hal",
    next: "Berikutnya",
    loadFailed: "Gagal memuat",
    connFailed: "Gagal terhubung ke server.",
    // Single-person search box.
    searchTitle: "Cari satu orang",
    searchFillKeyword: "Isi kata kunci pencarian.",
    searchFailed: "Gagal mencari",
    kindName: "Nama",
    kindPhone: "Telepon",
    kindEmail: "Email",
    phName: "min. 3 huruf nama…",
    phPhone: "nomor lengkap (0812…, +62…, 62…)",
    phEmail: "alamat email lengkap",
    searching: "Mencari…",
    searchBtn: "Cari",
    resultsSuffix: " hasil",
    maskedShort: "disamarkan",
    openProfile: "Buka profil",
    notFoundName: "Tidak ditemukan. Coba potongan nama lain.",
    notFoundId: "Tidak ditemukan. Pastikan nomor/email lengkap dan benar.",
    warn: {
      // ID: "Untuk menemukan orang yang baru saja menelepon — lalu buka profil & catat permintaan
      //      berhenti. Telepon & email dicocokkan sama persis (harus lengkap), nama dengan potongan
      //      kata. Ini mencari SATU orang (search.performed) — berbeda dari menyaring daftar (list.viewed)."
      // EN below. Nuance at risk: that single-person search and list-browse are DIFFERENT audited
      // actions — collapsing them hides which one the user is doing (and which audit row it writes).
      searchIntroA: "Untuk menemukan orang yang baru saja menelepon — lalu buka profil & catat permintaan berhenti dihubungi. Telepon & email dicocokkan sama persis (harus nomor/email lengkap), nama dengan potongan kata. Ini mencari satu orang (tercatat ",
      searchIntroB: ") — berbeda dari menyaring daftar di bawah (",
      searchIntroC: ").",
      // ID: "Terlalu banyak hasil (lebih dari N). Persempit kata kuncinya — pencarian ini sengaja
      //      tidak menawarkan halaman berikutnya. Untuk menelusuri banyak orang, pakai daftar tersaring."
      // Nuance at risk: the cap is a DELIBERATE anti-harvest limit, not a technical page limit —
      // "narrow the query" is the intended path, not "load more".
      tooManyA: "Terlalu banyak hasil (lebih dari ",
      tooManyB: "). Persempit kata kuncinya — pencarian ini sengaja tidak menawarkan halaman berikutnya. Untuk menelusuri banyak orang, pakai daftar tersaring di bawah.",
      // Quality banner — the qualitative warnings that stay true regardless of the count.
      bannerTitle: "Data apa adanya dari sistem lama — belum diremediasi",
      // Nuance: "belum terisi" (not filled in) — the field is empty, but shown honestly, not hidden.
      bannerGender: "Gender, tanggal lahir, dan alamat kosong untuk seluruh pool — ditampilkan sebagai “belum terisi”, tidak disembunyikan.",
      bannerCity: "Kota hanya terisi sebagian kecil. Penargetan per kota belum bisa dipertanggungjawabkan.",
      // Nuance: "Rp 0" is a MEASURED value shown as-is, not masked as missing data.
      bannerLtv: "Hampir semua lifetime value bernilai nol. “Rp 0” ditampilkan apa adanya, bukan disamarkan sebagai data hilang.",
      // Nuance: the counter-intuitive finding is shown as-is, not "tidied" away.
      bannerSegment: "Segment terbalik. Kohort tanpa segment (NULL) justru memiliki rata-rata LTV tertinggi — ditampilkan apa adanya, tidak dirapikan.",
      // Nuance: load-stamp, not activity — the column is an import artefact, its DATE is real but its MEANING isn't activity.
      bannerLastActiveA: "“Terakhir aktif” sengaja tidak ditampilkan. Kolom ",
      bannerLastActiveB: " adalah artefak impor, bukan jejak aktivitas.",
      bannerFooterA: "Angka pastinya dihitung langsung dari database di ",
      bannerFooterB: ".",
      // Read-only provenance footer. Nuance: every list open and profile open is audited, and
      // contact is masked ON THE SERVER for analyst — not hidden in the client.
      footer: "Baca saja · nol tombol ekspor/edit/hapus · klik nama untuk membuka profil (tercatat sebagai profile.viewed) · setiap pembukaan daftar tercatat (list.viewed) · kontak disamarkan di server untuk peran analyst.",
    },
  },

  export: {
    // CSV header labels — these ARE user-facing (column titles in the downloaded file), so they
    // follow the language. Stored values under them are never translated.
    headers: {
      customer_id: "customer_id",
      full_name: "nama",
      email: "email",
      phone: "telepon",
      city: "kota",
      first_unit: "unit_pertama",
      segment: "segment",
      lifetime_value: "lifetime_value",
    },
    // Provenance block written inside the file so a leaked export stays traceable.
    provTitle: "20FIT CRM — ekspor segmen",
    provDate: "tanggal",
    provBy: "oleh",
    provCriteria: "kriteria",
    provFooter:
      "suppression dikecualikan · tanpa NIK / data klinis · jumlah baris ada di baris terakhir (EOF)",
    provNoCriteria: "seluruh pool (tanpa kriteria)",
    eofTotal: "total_baris",
    auditFailed: "AUDIT_GAGAL",
  },

  ai: {
    // Reasons the assistant returns for requests it cannot express — surfaced in the user's
    // language. The model is instructed to answer in this language.
    replyLanguageName: "Bahasa Indonesia",
    timeUnexpressible:
      "Kriteria berbasis waktu tidak bisa: kolom waktu di data ini adalah cap muat, bukan aktivitas (K-19).",
    clinicalBlocked: "Kriteria klinis diminta tapi dibuang — butuh profile.view_health.",
    unavailable: "Asisten AI sedang tidak tersedia. Pakai filter manual — semua kriteria tetap ada.",
  },
} satisfies I18nShape;

/** Shape guard so both dictionaries are objects of nested string records (no accidental non-string). */
type I18nShape = Record<string, Record<string, string | Record<string, string>>>;

/** The key/shape contract English must satisfy. */
export type Messages = typeof id;
