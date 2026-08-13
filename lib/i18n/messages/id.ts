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

  // /consent (Sprint 4D screen 2) — consent register + do-not-contact list + two write dialogs.
  // The compliance-critical consequence lines ("cannot be contacted") live under consent.warn.* so
  // BOTH guards protect them. The three write-path route handlers read these SAME keys via
  // getServerDict, so an API message matches the language of the screen that triggered it.
  consent: {
    title: "Consent",
    // subtitle split around the mono doc PATH (a file path — kept verbatim, never translated).
    subtitleA: "Register dasar hukum kontak & daftar do-not-contact — baca saja. Fase 2 dibuka; jalur tulis ditunda ( ",
    subtitleB: " ).",
    // basis vocabulary block. The `value`s (legacy_import_unverified, explicit_opt_in) are STORED
    // vocabulary and stay verbatim; only these explanatory NOTES follow the language.
    basisHeadingA: "Kosakata ",
    basisProvisional: "sementara — menunggu daftar final legal",
    basisNoteLegacy: "impor lama; sejak keputusan pemilik produk (12 Agu 2026) mengizinkan marketing + transactional (docs/SIGNOFF-legal-consent.md)",
    basisNoteOptin: "opt-in eksplisit tercatat — dasar terkuat, mengizinkan semua purpose",
    basisFooter: "Dua nilai ini bukan daftar lengkap. Status sign-off: docs/SIGNOFF-legal-consent.md.",
    sectionConsent: "Register consent",
    sectionSuppression: "Daftar suppression",
    thProfile: "Profil",
    thChannel: "Channel",
    thPurpose: "Purpose",
    thBasis: "Basis",
    thStatus: "Status",
    thRecorded: "Dicatat",
    thKind: "Jenis",
    thIdentity: "Identitas",
    thReason: "Alasan",
    thAction: "Aksi",
    orphan: "(yatim)",
    maskedShort: "disamarkan",
    recordButton: "Catat permintaan berhenti",
    liftButton: "Cabut",
    loading: "Memuat…",
    failed: "Gagal",
    connFailed: "Gagal terhubung ke server.",
    loadFailed: "Gagal memuat",
    zeroRows: "0 baris",
    showingPre: "Menampilkan ",
    showingOf: " dari ",
    prev: "Sebelumnya",
    pageLabel: "Hal",
    next: "Berikutnya",
    emptyConsentWhat: "Register consent kosong.",
    emptySuppWhat: "Daftar suppression kosong.",
    // page-level access-denied (role branch); the scope branch reuses access.segmentsDeniedScope.
    pageDeniedRole: "Register consent hanya untuk super_admin, crm_manager, dan data_steward. Bila RBAC belum di-provision, semua akses ditolak — ini perilaku fail-closed yang benar.",
    // RECORD_REASONS labels — mapped by STORED value; the values (user_request, …) never translate.
    reasonUserRequest: "Diminta orangnya (WhatsApp / telepon / staf)",
    reasonComplaint: "Komplain atau keberatan",
    reasonBounce: "Bounce keras / nomor sudah mati",
    reasonLegal: "Permintaan lewat jalur hukum",
    // ── record-suppression dialog ──
    formTitle: "Catat permintaan berhenti dihubungi",
    fldIdentity: "Identitas yang disuppress",
    noContactToSuppress: "Profil ini tidak punya telepon maupun email untuk disuppress.",
    kindPhone: "Telepon",
    kindEmail: "Email",
    onlySelectedNote: "Hanya identitas yang dipilih yang disuppress. Untuk menutup keduanya, catat dua kali.",
    directPhonePlaceholder: "mis. 0812… atau 62812…",
    directEmailPlaceholder: "mis. nama@domain.com",
    normalizeNoteA: "Dinormalkan di server (",
    normalizeNoteB: ") sebelum ditulis. Bentuk akhirnya ditampilkan di langkah tinjauan.",
    normalizePhone: "62… tanpa +",
    normalizeEmail: "huruf kecil",
    fldReason: "Alasan",
    reasonPlaceholder: "— pilih alasan —",
    fldDetail: "Catatan (opsional)",
    detailPlaceholder: "Konteks singkat, mis. “minta stop lewat WA 11 Agu”.",
    cancel: "Batal",
    reviewing: "Meninjau…",
    review: "Tinjau",
    willWrite: "Akan ditulis",
    change: "Ubah",
    recording: "Mencatat…",
    recordConfirm: "Catat permintaan",
    recorded: "Tercatat",
    done: "Selesai",
    // ── lift-suppression dialog ──
    liftTitle: "Cabut suppression",
    liftReasonLabel: "Alasan pencabutan (wajib)",
    liftPlaceholder: "mis. “orang yang sama minta diaktifkan kembali lewat WA 11 Agu”.",
    lifting: "Mencabut…",
    liftConfirm: "Cabut suppression",
    lifted: "Dicabut",
    // ── mundane server/validation messages (not nuance-bearing → plain keys, no guard) ──
    apiRoleDenied: "Hanya super_admin, crm_manager, dan data_steward yang boleh melihat register consent.",
    apiRoleDeniedRecord: "Hanya super_admin, crm_manager, dan data_steward yang boleh mencatat suppression.",
    apiRoleDeniedLift: "Hanya super_admin, crm_manager, dan data_steward yang boleh mencabut suppression.",
    apiAuditFailed: "Pembacaan ditolak: gagal mencatat audit (akuntabilitas).",
    apiBadJson: "Body JSON tidak valid.",
    apiInvalidKind: "Pilih identitas yang disuppress: telepon atau email.",
    apiInvalidReason: "Alasan tidak valid untuk pencatatan manual.",
    apiNoPhoneOnProfile: "Profil ini tidak punya nomor telepon untuk disuppress.",
    apiNoEmailOnProfile: "Profil ini tidak punya email untuk disuppress.",
    apiMissingIdentity: "Isi nomor telepon atau email yang minta berhenti.",
    apiNotNormalizablePhone: "Nomor telepon tidak bisa dinormalkan ke bentuk 62… — tidak disimpan.",
    apiNotNormalizableEmail: "Email tidak valid (harus mengandung @) — tidak disimpan.",
    apiMissingLiftReason: "Alasan pencabutan wajib diisi.",
    apiAlreadyLifted: "Suppression ini sudah dicabut sebelumnya.",
    // client-side form validation
    valPickIdentity: "Pilih identitas mana yang disuppress.",
    valFillIdentity: "Isi nomor telepon atau email.",
    valPickReason: "Pilih alasan permintaan.",
    valReviewFailed: "Gagal meninjau",
    valRecordFailed: "Gagal mencatat",
    valLiftFailed: "Gagal mencabut",
    warn: {
      // ZeroMeaning banner. ID below; EN in en.ts. Nuance at risk: "0 rows" is NOT "no data yet" —
      // it is "no lawful basis for ANYONE", the correct FAIL-CLOSED answer. Softening it to "empty"
      // would read as a data gap to fix, not a deliberate contact ban.
      zeroTitle: "Nol baris consent = nol orang boleh dikirimi marketing",
      zeroBodyA: "Ini bukan “belum ada data”. Ini “tidak ada dasar hukum untuk siapa pun”. Ketiadaan baris consent adalah jawaban fail-closed yang benar: tanpa baris consent ",
      zeroBodyB: " ",
      zeroBodyC: ", seseorang tidak boleh dihubungi untuk marketing. Kartu “Bisa dihubungi” di dashboard menghitung dari aturan ini — hasilnya 0 terukur, bukan 0 yang ditulis tangan.",
      // Backfilled banner. Nuance at risk: the backfill is REVERSIBLE and honestly labelled
      // "unverified per person"; suppression still WINS. Dropping "reversible"/"suppression wins"
      // would overstate the strength of a legacy consent basis.
      backfilledTitleA: "Consent legacy sudah dibackfill — basis ",
      backfilledBodyA: "Migrasi 11 mencatat consent aktif untuk impor lama atas keputusan pemilik produk (12 Agu 2026): marketing + transactional, dengan basis ",
      backfilledBodyB: " yang jujur menandai “belum diverifikasi per orang”. Suppression tetap menang atas consent (K-03). Ini reversibel: ",
      backfilledBodyC: " nol trigger, dan menghapus baris ",
      // origin-marking predicate — a stored SQL literal, identical in both languages (never translated).
      backfilledBodyD: " membatalkannya bersih.",
      // SuppressionWins banner. Nuance at risk: the hierarchy is enforced in CODE (one tested
      // function), not a DB constraint — so it MUST be readable here; and suppression is keyed on the
      // contact identity, not customer_id, so it survives profile deletion & re-import.
      winsTitle: "Suppression MENANG atas consent",
      winsBodyA: "Bila sebuah identitas kontak ada di ",
      winsBodyB: " (status active), ia tidak boleh dihubungi apa pun status consent-nya — walau punya opt-in aktif. Hierarki ini ditegakkan di kode (satu fungsi teruji, ",
      winsBodyC: "), bukan di constraint database, jadi harus terbaca di sini. Suppression di-key pada identitas kontak (telepon/email ternormalisasi), bukan pada ",
      winsBodyD: ", supaya bertahan lintas penghapusan profil & impor ulang.",
      // Empty-state explanations. Nuance at risk (suppression): zero suppression is NOT "safe to
      // contact" — the thing holding contact is the ABSENCE OF CONSENT above, not absence of suppression.
      emptyConsentWhy: "Belum ada satu baris pun. Backfill legacy (Migrasi 11) sudah disetujui pemilik produk tapi belum dijalankan di lingkungan ini; sampai dijalankan, nol tetap jawaban fail-closed yang benar. Basis yang akan dipakai: legacy_import_unverified (jujur menandai “belum diverifikasi per orang”).",
      emptySuppWhy: "Belum ada satu baris pun. Nol suppression bukan berarti aman untuk mengontak — yang menahan kontak adalah ketiadaan consent (di atas), bukan ketiadaan suppression.",
      footer: "Suppression: catat & cabut (atomik dengan audit, nol DELETE) · consent tetap baca-saja (menunggu kanal opt-in) · dibaca via service role server-side · pembukaan halaman ini tercatat (list.viewed, crm_consent).",
      // Record-dialog description. Nuance at risk: recording a stop-request PROTECTS the person; it
      // is not a punishment, and there is no delete button — a lift goes through its own audited path.
      formDesc: "Mencatat permintaan yang sudah terjadi — seseorang minta berhenti dihubungi. Ini bukan menghukum siapa pun; ini melindungi mereka. Nol tombol hapus: pencabutan lewat jalur tersendiri.",
      // Review-step "what will happen" notes — the three write outcomes.
      willDoNoop: "Sudah ada suppression AKTIF untuk identitas ini — mencatat lagi tidak mengubah apa pun.",
      willDoReactivate: "Identitas ini pernah disuppress lalu dicabut — ini akan MENGAKTIFKAN kembali.",
      willDoInsert: "Baris suppression baru akan dibuat.",
      // Review-step consequence. Nuance at risk: after recording, contact is blocked REGARDLESS of
      // consent status, and the row is a record of a real person's request — not deleted, only lifted.
      reviewConsequence: "Setelah dicatat, identitas ini tidak bisa dihubungi untuk marketing apa pun status consent-nya. Baris ini adalah catatan permintaan orang sungguhan — tidak dihapus, hanya bisa dicabut (dengan alasan dan audit).",
      // Lift-dialog description. Nuance at risk: lifting RE-ENABLES contact (still subject to consent);
      // the row is not deleted — status flips to lifted and the lift itself is audited.
      liftDescA: "Mencabut suppression ",
      liftDescB: " mengembalikan kemungkinan menghubungi orang ini (tetap tunduk pada status consent). Barisnya tidak dihapus — statusnya menjadi lifted dan pencabutan ini tercatat di audit.",
      // Server write-path consequences (returned by the API, shown in the dialog). Same nuance:
      // "cannot be contacted, whatever the consent status" must survive translation.
      srvSuppressed: "Permintaan berhenti dicatat. Orang ini kini TIDAK bisa dihubungi, apa pun status consent-nya.",
      srvReactivated: "Suppression diaktifkan kembali. Orang ini kini TIDAK bisa dihubungi, apa pun status consent-nya.",
      srvNoop: "Sudah ada suppression aktif untuk identitas ini — tidak ada perubahan.",
      srvWriteFailedRecord: "Gagal mencatat suppression. Tidak ada baris separuh jadi.",
      srvWriteFailedLift: "Gagal mencabut suppression. Tidak ada perubahan separuh jadi.",
      srvLiftSuccess: "Suppression dicabut. Orang ini kini BISA dihubungi kembali (tunduk pada status consent).",
    },
  },

  // /segments (Sprint 4E screen 3) — segment builder + AI assistant + AND/OR filter tree.
  // Hidden surfaces folded in: the readback sentences (describeFilterTree / describeProposal) and
  // the filter validator (validateFilterTree) are pure tested fns that emit these words; they take
  // an optional lang (default "id") so old tests are untouched. Nuance-bearing warnings live under
  // segments.warn.* (guarded). Numbers/counts are interpolated by the component, not stored here.
  segments: {
    subtitleA: "Susun kriteria, lihat jumlahnya, ubah, lihat lagi. Tidak ada yang disimpan — tanpa tabel, tanpa nama segmen (penyimpanan ditunda; ",
    subtitleB: ").",
    criteriaTitle: "Kriteria",
    aiTitle: "Asisten AI (opsional)",
    aiDescA: "Jelaskan segmennya dengan kata-kata (mis. “pelanggan yang ikut RUNFEST dan punya email”). AI mengusulkan kriteria — Anda tetap meninjau, mengubah, lalu menekan Hitung sendiri. Kriteria waktu tidak bisa (kolom waktu = cap muat, K-19); permintaan klinis butuh ",
    aiDescB: ".",
    aiPlaceholder: "Jelaskan segmen dengan kata-kata…",
    aiProposing: "Mengusulkan…",
    aiPropose: "Usulkan (AI)",
    aiProposalLabel: "Usulan: ",
    aiNotesLabel: "Catatan AI: ",
    aiClinicalBlockedA: "Kriteria klinis diminta tapi dibuang — butuh ",
    aiClinicalBlockedB: ".",
    aiUnexpressibleTitle: "Tidak bisa diungkapkan:",
    aiApply: "Terapkan usulan",
    aiIgnore: "Abaikan",
    aiNothingToApply: "Tak ada kriteria yang bisa diterapkan.",
    ecoTitle: "Ekosistem 20FIT",
    ecoUnitLabel: "Unit ekosistem",
    ecoProductLabel: "Produk ekosistem",
    ecoAllUnits: "Semua unit ekosistem",
    ecoAllProducts: "Semua produk",
    ecoBothNote: "Unit dan produk dipilih bersamaan: menyaring satu engagement yang cocok keduanya sekaligus. Karena tiap produk hanya milik satu unit, kombinasi lintas-unit berjumlah 0.",
    srcHyroxLabel: "Peserta Hyrox (152 profil)",
    srcMy20fitLabel: "Pengguna my20fit (169 profil)",
    srcRecencyLabel: "Punya aktivitas nyata (my20fit_user_activity — hanya 44 profil)",
    srcArenaLabel: "Ada di arena (kelas / booking / paket / member)",
    srcGymLabel: "Ada di gym (kelas / membership)",
    srcClinicPatientLabel: "Pasien klinik ",
    srcClinicPatientTag: "(kesehatan · view_health)",
    srcClinicTxnLabel: "Punya transaksi klinik ",
    rfmLabel: "RFM (per paid order)",
    rfmAll: "Semua RFM",
    programLabel: "Ikut program",
    programAll: "Semua program",
    programGroupNonClinical: "Program (non-klinis)",
    programGroupClinical: "Klinik (kesehatan · view_health)",
    stagingGated: "digerbangi",
    stagingHidden: "disembunyikan —",
    computeBtn: "Hitung",
    computing: "Menghitung…",
    exportBtn: "Ekspor CSV",
    exporting: "Mengekspor…",
    countMatchedLabel: "Cocok kriteria",
    countMatchedSub: "orang memenuhi definisi ini",
    countMktLabel: "Boleh dihubungi · marketing",
    countMktSub: "consent marketing aktif & tidak disuppress",
    countSvcLabel: "Boleh dihubungi · layanan",
    countSvcSub: "consent layanan (transactional) aktif & tidak disuppress — untuk CS/operasional",
    openConsent: "Buka Consent",
    computeFailed: "Gagal menghitung",
    connFailed: "Gagal terhubung ke server.",
    exportFailed: "Gagal mengekspor",
    proposeFailed: "Gagal mengusulkan",
    // ── filter tree builder ──
    treeIntro: "Semua baris digabung dengan DAN. Sebuah baris bisa berupa satu kondisi, atau grup ATAU (mis. “punya email ATAU punya telepon”). Maks 2 tingkat, 12 kondisi.",
    fieldUnit: "Unit",
    fieldSegment: "Segment",
    fieldCity: "Kota",
    fieldRevenue: "Revenue",
    fieldHasPhone: "Punya telepon",
    fieldHasEmail: "Punya email",
    noSegmentOption: "(tanpa segment)",
    revHas: "Punya (> 0)",
    revNone: "Tanpa (0/kosong)",
    revNegative: "Negatif (T-10)",
    cityInputPlaceholder: "mis. Jakarta",
    removeCondition: "Hapus kondisi",
    removeGroup: "Hapus grup",
    orGroupLabel: "Grup ATAU",
    addOrCondition: "kondisi ATAU",
    addCondition: "Tambah kondisi",
    addOrGroup: "Tambah grup ATAU",
    filterReadLabel: "Filter terbaca: ",
    everyoneNoConditions: "semua orang (belum ada kondisi)",
    // ── readback words (describeFilterTree / describeProposal, lang-aware) ──
    rbEveryone: "semua orang",
    rbAnd: "DAN",
    rbOr: "ATAU",
    rbUnit: "unit",
    rbNoSegment: "tanpa segment",
    rbSegment: "segment",
    rbCityContainsA: "kota memuat “",
    rbCityContainsB: "”",
    rbHasRevenue: "punya revenue",
    rbNegativeRevenue: "revenue negatif",
    rbNoRevenue: "tanpa revenue",
    rbHasPhone: "punya telepon",
    rbHasEmail: "punya email",
    rbWholePoolNoCriteria: "seluruh pool (tidak ada kriteria terbaca)",
    rbEcoUnit: "ekosistem unit",
    rbEcoProduct: "ekosistem produk",
    rbHyrox: "peserta Hyrox",
    rbMy20fit: "pengguna my20fit",
    rbRecency: "punya aktivitas nyata",
    rbArena: "ada di arena",
    rbGym: "ada di gym",
    rbClinicPatient: "pasien klinik",
    rbClinicTxn: "punya transaksi klinik",
    rbRfm: "RFM",
    rbProgram: "ikut program",
    rbWordCity: "kota",
    rbWordRevenue: "revenue",
    // ── validator errors (validateFilterTree, lang-aware) ──
    vUnknownUnit: "unit tidak dikenal",
    vUnknownSegment: "segment tidak dikenal",
    vUnknownRevenue: "revenue tidak dikenal",
    vCityEmpty: "kota kosong",
    vCityTooLong: "kota terlalu panjang",
    vCityUnsafe: "kota memuat karakter yang tak bisa diungkapkan aman",
    vUnknownField: "field tidak dikenal",
    vRootMustBeGroup: "akar filter harus sebuah grup",
    vMaxConditionsA: "maksimum ",
    vMaxConditionsB: " kondisi",
    vEmptyGroup: "grup kosong tidak diperbolehkan",
    vMaxDepthA: "kedalaman maksimum ",
    vMaxDepthB: " grup",
    // ── route messages (server, via getServerDict) ──
    apiRoleDenied: "Membangun segmen butuh peran segment.build (super_admin, crm_manager, crm_operator, analyst).",
    apiBadJson: "Body JSON tidak valid.",
    apiClinicalNeedsHealth: "Kriteria klinis butuh peran profile.view_health (menyaring pasien = menyimpulkan status kesehatan).",
    apiBadFilterA: "Filter ditolak: ",
    apiBadFilterB: ".",
    apiAuditFailed: "Perhitungan ditolak: gagal mencatat audit (akuntabilitas).",
    apiAssistRoleDenied: "Butuh peran segment.build.",
    apiAssistEmpty: "Tulis deskripsi segmennya dulu.",
    apiAssistAuditFailed: "Usulan ditolak: gagal mencatat audit (akuntabilitas).",
    warn: {
      // TimeBanned banner. Nuance at risk: time columns are LOAD stamps, not activity — a recency
      // filter would look precise while being meaningless. The box is absent on purpose.
      timeBannedTitle: "Tidak ada kriteria berbasis waktu — dan itu disengaja",
      timeBannedA: "Tidak ada “bergabung dalam N hari”, tidak ada recency. Semua kolom waktu di data ini (",
      timeBannedB: ", ",
      timeBannedC: ", ",
      timeBannedD: ") adalah cap waktu muat — satu instan per sumber, bukan jejak aktivitas (K-19, ",
      timeBannedE: "). Menyaring berdasarkan itu menghasilkan angka yang tampak tegas tapi tak bermakna. Kotaknya sengaja tidak ada supaya tak ada yang tergoda memakainya.",
      // Ecosystem note. Nuance: last_seen_at is 99,51% a load stamp — still no time criteria.
      ecoDescA: "Menyaring profil yang punya minimal satu baris di ",
      ecoDescB: " pada unit / produk terpilih. Kosakata ini beda dari “Unit” di atas (ada ",
      ecoDescC: " & ",
      ecoDescD: "). Tetap tanpa kriteria waktu: ",
      ecoDescE: " 99,51% cap muat.",
      // Unmatched-source note. Nuance: "real activity" is presence, NOT a time criterion —
      // last_active_at is real but only for 44/82.253; a time filter would hide 99,9% of the pool.
      srcRecencyA: "Cocok lewat email ternormalisasi (K-06). “Aktivitas nyata” adalah presensi, bukan kriteria waktu: ",
      srcRecencyB: " nyata tapi hanya untuk 44/82.253 — menjadikannya filter waktu akan terlihat presisi sambil menyembunyikan 99,9% pool (K-19).",
      // Clinic-hidden note (no view_health). Nuance: filtering "clinic patient" = inferring health.
      clinicHiddenA: "Kriteria klinik (pasien / transaksi) disembunyikan — butuh ",
      clinicHiddenB: ". Menyaring “pasien klinik” = menyimpulkan status kesehatan.",
      // Sources AND note. Nuance at risk: cross-table OR is honestly REFUSED (PostgREST can't express
      // it in one query) rather than silently turned into AND.
      sourcesAndA: "Arena/gym cocok lewat email; klinik lewat telepon dulu (K-06). Semua kondisi sumber di-AND-kan (irisan himpunan). OR lintas-tabel tidak tersedia — PostgREST tak bisa mengungkapkannya jujur dalam satu query, jadi tak disediakan pilihannya alih-alih diam-diam ber-AND.",
      // RFM warning. Nuance at risk: RFM can't segment — New User = 92% of pool; filtering it ≈
      // filtering everyone; the top two buckets are ~66 people. Don't build a campaign on it (T-19).
      rfmA: "RFM hampir tak bisa menyegmentasi: ",
      rfmB: " = 81.213 (92% pool), dua keranjang teratas (",
      rfmC: "+",
      rfmD: ") cuma 66 orang. Menyaring “New User” ≈ menyaring semua orang; “Loyal” = 65 orang. Jangan susun kampanye di atasnya (T-19).",
      // Staging note. Nuance: stored spelling (Campion user) kept as-is; clinical program infers health.
      stagingA: "Dari ",
      stagingB: " — impor yang sama dengan master, cocok 98,6% lewat email (K-06). RFM ditampilkan apa adanya termasuk ejaan tersimpan (",
      stagingC: ") — tidak “diperbaiki” agar tetap cocok dengan sumber. Program pasien klinik menyimpulkan status kesehatan, jadi ",
      stagingD: " ",
      stagingE: ". Di-AND-kan dengan kriteria lain.",
      // City warning (numbers interpolated by the component).
      cityA: "Kota hanya terisi ",
      cityB: " (",
      cityC: " dari ",
      cityD: "). Menyaring kota atas data yang ±93% kosong hanya menyaring “orang yang kotanya kebetulan tercatat” — hasilnya tampak tegas tapi menyesatkan.",
      // Export note. Nuance: the EOF row is the completeness proof; a truncated file must not be trusted.
      exportNoteA: "Ekspor mengalirkan CSV (suppression dikecualikan, tanpa NIK / data klinis). Berkas diakhiri baris ",
      exportNoteB: " — jika baris itu tak ada, unduhan terpotong & jangan dipakai sebagai data lengkap.",
      // Small-segment warning. Nuance at risk: below 25, a segment shifts from aggregate to individual
      // disclosure; the count is still shown (hiding 0 hides the measured), but not an anonymous aggregate.
      smallSegmentA: "Segmen sangat kecil (",
      smallSegmentB: " profil). Di bawah ",
      smallSegmentC: " orang, sebuah segmen praktis menunjuk individu tertentu — sifatnya berubah dari agregat jadi pengungkapan. Angka tetap ditampilkan (0 disembunyikan justru menyembunyikan yang terukur), tapi jangan diperlakukan sebagai agregat anonim. Builder ini tak pernah mengeluarkan daftar orang (itu tugas /audience, tersamar & teraudit).",
      // Zero-contactable notes. Nuance: zero of N — no active consent (or suppression wins, K-03).
      mktZeroA: "Nol dari ",
      mktZeroB: ". Tak ada consent ",
      mktZeroC: " aktif (atau suppression menang, K-03). ",
      svcZeroA: "Nol dari ",
      svcZeroB: ". Tak ada consent ",
      svcZeroC: " aktif (atau suppression menang, K-03).",
      // Read-only footer. Nuance at risk: nothing is saved/exported/sent because the FLOW isn't built
      // yet — "a button that refuses is worse than no button" — not because the role lacks permission.
      footer: "Baca saja · nol simpan/ekspor/kirim (belum ada; tombol yang menolak lebih buruk dari tak ada tombol) · nol daftar orang (segment builder yang mengeluarkan daftar = ekspor tanpa nama — pakai /audience) · tiap perhitungan tercatat (list.viewed).",
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
