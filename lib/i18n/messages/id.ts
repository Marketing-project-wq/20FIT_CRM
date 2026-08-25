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
    // K-28: the label on the collapsed "why does this matter" disclosure next to a one-line warning.
    why: "Kenapa?",
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

  // Tab labels for the consolidated screens (nav rebuild: 11 menu → 7).
  tabs: {
    audienceList: "Daftar",
    audienceUnsubscribe: "Unsubscribe",
    audienceQuality: "Kualitas",
    templatesTemplate: "Template",
    templatesHistory: "Riwayat Kirim",
    settingsLog: "CRM Log",
    settingsManager: "20FIT Manager",
    settingsConsent: "Consent",
    settingsWhatsapp: "WhatsApp Business API",
    menu: "Menu",
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
    audienceDeniedScope:
      "Peran unit_manager dibatasi pada unit yang dikelola, tetapi tabel unit-scope belum ada — akses ditolak (fail-closed) sampai tabel itu dibangun.",
    audienceDeniedRole:
      "Peran Anda tidak memiliki izin untuk melihat daftar profil. Bila RBAC belum di-provision, semua akses ditolak — ini perilaku fail-closed yang benar.",
    profileDeniedRole: "Peran Anda tidak memiliki izin untuk melihat profil.",
    templatesDeniedRole: "Peran Anda tidak memiliki izin untuk melihat template dan riwayat kirim.",
  },

  dashboard: {
    title: "Dashboard",
    subtitle: "Audience Data & CRM 20FIT",
    tz: "WIB",
    // Kesegaran per blok — kata-kata SAMA di seluruh layar (satu baris kecil per blok):
    todayLabel: "Hari ini", // memperjelas tanggal di kepala = hari ini, BUKAN kapan data diperbarui
    freshLive: "dihitung saat halaman dibuka",
    freshSnapshot: "snapshot cermin", // + tanggal-waktu refresh
    freshManual: "diukur manual", // + tanggal pengukuran
    // Progressive-load: skeleton = sedang dihitung; state gagal per bagian; tombol coba lagi.
    computing: "Sedang menghitung…",
    // Penanda pratinjau — IKUT ter-render (bukan hanya di URL /dev/preview), supaya screenshot
    // fixture tak pernah lagi salah dibaca sebagai produksi. Hanya muncul saat isPreview.
    previewBanner: "PRATINJAU · DATA FIXTURE — BUKAN ANGKA PRODUKSI",
    blockFailed: "Bagian ini gagal dimuat.",
    blockRetry: "Coba lagi",
    audienceSize: "Ukuran audiens",
    audienceSizeHint: "master_customer (baca saja)",
    contactableMarketing: "Bisa dihubungi · marketing",
    contactableMarketingHint: "seluruh pool − yang berhenti berlangganan",
    contactableService: "Bisa dihubungi · layanan",
    contactableServiceHint: "seluruh pool − yang berhenti berlangganan (untuk CS/operasional)",
    workflowActive: "Workflow aktif",
    workflowActiveHint: "belum ada tabel workflow",
    lastProfile: "Profil terakhir bertambah",
    lastProfileHint:
      "tanggal muatan batch terakhir (2 muatan: 20 Apr & 31 Jul 2026) — bukan feed berkelanjutan",
    importDob: "Tanggal lahir · data impor",
    importDobHint:
      "baris staging_20fit_data punya tgl lahir (master_customer: 0) · ~99,5% cocok ke profil (diukur manual · 24 Agu 2026)",
    rfmTitle: "Sebaran RFM · data impor 20FIT",
    // The RFM note keeps the "− = no bucket, not empty" nuance and the "spelling kept" rule.
    rfmNote:
      'Dari cermin (82.253 profil tercocokkan · snapshot) — sama dengan segment builder, jadi angkanya beda dari impor mentah staging (88.536). “−” = tanpa bucket (bukan kosong). Setiap bucket kosakata tertutup selalu tampil (0 = terukur, bukan hilang). Ejaan tersimpan dipertahankan apa adanya.',
    rfmNoBucket: "− (tanpa bucket)",
    // Dashboard Visual sprint — tiga lapis, visualisasi, kesegaran.
    liveTitle: "Sumber hidup versus pool beku",
    liveNote: "Pool CRM adalah snapshot beku — muatan terakhir 31 Jul 2026, dan tak ada pipeline yang menyalurkan pendaftar baru ke dalamnya. Sumber di bawah dihitung langsung tiap request, jadi selisih “belum di pool” naik sendiri saat ada pendaftar baru — itu jawaban jujur untuk “terupdate otomatis”.",
    poolLayerA: "Pool CRM: ",
    poolLayerB: " profil, muatan terakhir ",
    poolLayerC: " · nol profil baru sejak 1 Agustus (bukan hitungan berjalan).",
    srcMy20fit: "my20fit",
    srcHyrox: "Hyrox",
    srcArena: "Arena",
    srcGym: "Gym",
    srcClinic: "Klinik",
    totalLabel: "di sumber",
    gapLabel: "belum di pool",
    gapWhy: "“Belum di pool” = orang di sistem sumber yang belum punya profil master (dicocokkan lewat email/telepon ternormalisasi). Angka per sumber TIDAK dijumlahkan: satu orang bisa ada di dua sumber, dan menggabungkan kunci email vs telepon tak bisa diandalkan. Dihitung langsung, nol tulis, nol salin.",
    unitTitle: "Sebaran unit bisnis",
    unitNote: "Profil distinct per unit ekosistem. Lima unit dibaca dari cermin (snapshot); shop dihitung langsung (cermin tak punya kolomnya).",
    unitScaleNote: "Panjang batang memakai skala akar, BUKAN sebanding lurus — supaya unit terkecil (gym, shop) tetap terlihat di sebelah yang terbesar. Angkanya yang benar; batang hanya isyarat.",
    snapshotBadge: "snapshot",
    refreshedPrefix: "cermin diperbarui ",
    staleA: "Snapshot cermin berumur lebih dari ",
    staleB: " jam — angka unit bisa tertinggal dari sumber hidup. Jalankan refresh cermin untuk menyegarkan.",
    eventTitle: "Sebaran event",
    eventNote: "Pendaftaran per produk event (jumlah baris, bukan orang distinct — satu orang bisa mendaftar beberapa event). Diurut terbanyak.",
    eventShowTop: "Tampilkan sepuluh teratas saja",
    eventShowAllA: "Tampilkan semua (+",
    eventShowAllB: " lagi)",
    coverageTitle: "Cakupan kontak",
    coverageBoth: "Email dan telepon",
    coverageEmailOnly: "Email saja",
    coveragePhoneOnly: "Telepon saja",
    coverageNeither: "Tak punya keduanya",
    coveragePhoneNote: "“Telepon” = nomor telepon tersimpan. Status WhatsApp BELUM diverifikasi — jangan susun kampanye WhatsApp di atas angka ini. “Tak punya keduanya” = 0 terukur (bukan disembunyikan).",
    // Ekspor per kategori cakupan kontak → lewat mesin ekspor segmen yang sudah ada.
    coverageExportTitle: "Ekspor CSV per kategori",
    coverageExportBtn: "Ekspor",
    coverageExportBusy: "Mengekspor…",
    coverageExportEmpty: "0 — tak ada yang bisa diekspor",
    coveragePhoneOnlyWarn: "Kategori “telepon saja” tak punya email — daftar ini tak bisa dipakai untuk kampanye email.",
    coverageExportNote: "Ekspor lewat mesin segmen yang sama: suppression dikecualikan, gerbang peran berlaku, NIK & data klinis tak pernah masuk berkas, dan jumlah baris nyata ditulis di akhir berkas.",
    coverageExportFailed: "Ekspor gagal.",
    // D redesign — satu kartu ringkas (pool + jangkauan), tabel selisih, kartu kandidat, Fitco.
    summaryTitle: "Pool & jangkauan",
    summaryPoolLabel: "Pool CRM (master_customer)",
    summaryReachAll: "seluruh pool dapat dihubungi · nol berhenti berlangganan",
    gapTableSource: "Sumber",
    candTitle: "Kandidat belum di pool",
    candLabel: "belum jadi audiens · bukan pool · bukan bisa dipasarkan",
    candNote:
      "Angka ini BEDA dari selisih live di atas: populasi sumbernya berbeda (mis. di sini arena_bookings 4; di selisih live arena dihitung dari tabel arena lain). Kandidat = snapshot cermin (dedup lintas sumber); selisih = dihitung saat halaman dibuka. Keduanya benar, menghitung hal berbeda.",
    candSourceCol: "Sumber (mentah)",
    candCountCol: "Kandidat",
    fitcoTitle: "Partisipasi Fitco",
    fitcoMatched: "tercocokkan ke profil",
    fitcoUnmatched: "belum tercocokkan",
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
    loadMore: "Muat lagi",
    allLoaded: "Semua sudah dimuat.",
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
    // One box, kind detected from the input's shape (shown before searching, overridable).
    detectedAsPre: "Dikenali sebagai ",
    detectAutoSuffix: " · otomatis dari isian",
    detectManualSuffix: " · dipilih manual",
    detectOverrideHint: "Ubah jenis:",
    detectBackToAuto: "otomatis",
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
    subtitleA: "Daftar berhenti berlangganan (unsubscribe) — satu-satunya gerbang kontak (K-36). Register consent tetap disimpan sebagai catatan dasar hukum, baca-saja.",
    // basis vocabulary block. The `value`s (legacy_import_unverified, explicit_opt_in) are STORED
    // vocabulary and stay verbatim; only these explanatory NOTES follow the language.
    basisHeadingA: "Kosakata ",
    basisProvisional: "sementara — menunggu daftar final legal",
    basisNoteLegacy: "impor lama; sejak keputusan pemilik produk (12 Agu 2026) mengizinkan marketing + transactional (docs/SIGNOFF-legal-consent.md)",
    basisNoteOptin: "opt-in eksplisit tercatat — dasar terkuat, mengizinkan semua purpose",
    basisFooter: "Dua nilai ini bukan daftar lengkap. Status sign-off: docs/SIGNOFF-legal-consent.md.",
    sectionConsent: "Catatan consent (arsip dasar hukum)",
    sectionSuppression: "Daftar berhenti berlangganan (unsubscribe)",
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
      zeroTitle: "Consent bukan gerbang — nol baris consent tidak menahan kontak (K-36)",
      zeroBodyA: "Sejak pemilik produk menyatakan seluruh pengguna boleh dihubungi (24 Agu 2026, K-36), consent berhenti jadi gerbang. Baris consent kini catatan dasar hukum, bukan penentu boleh-tidaknya kontak. Yang menahan kontak untuk ",
      zeroBodyB: " ",
      zeroBodyC: " hanyalah berhenti berlangganan (unsubscribe). Kartu “Bisa dihubungi” di dashboard menghitung seluruh pool dikurangi yang berhenti berlangganan — hasilnya angka terukur, bukan yang ditulis tangan.",
      // Backfilled banner. Nuance at risk: the backfill is REVERSIBLE and honestly labelled
      // "unverified per person"; suppression still WINS. Dropping "reversible"/"suppression wins"
      // would overstate the strength of a legacy consent basis.
      backfilledTitleA: "Consent legacy sudah dibackfill — basis ",
      backfilledBodyA: "Backfill mencatat consent aktif untuk impor lama atas keputusan pemilik produk (12 Agu 2026): marketing + transactional, dengan basis ",
      backfilledBodyB: " yang jujur menandai “belum diverifikasi per orang”. Suppression tetap menang atas consent. Ini reversibel: ",
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
      emptyConsentWhy: "Catatan consent kosong di lingkungan ini. Itu tidak lagi menahan kontak siapa pun (K-36 — consent bukan gerbang): baris consent adalah arsip dasar hukum, dan gerbang sesungguhnya hanyalah berhenti berlangganan (unsubscribe) di daftar bawah.",
      emptySuppWhy: "Belum ada satu baris pun. Nol berhenti berlangganan berarti seluruh pool boleh dihubungi — unsubscribe adalah satu-satunya gerbang, dan consent bukan gerbang (K-36).",
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
      liftDescB: " mengembalikan kemungkinan menghubungi orang ini kembali. Barisnya tidak dihapus — statusnya menjadi lifted dan pencabutan ini tercatat di audit.",
      // Server write-path consequences (returned by the API, shown in the dialog). Same nuance:
      // "cannot be contacted, whatever the consent status" must survive translation.
      srvSuppressed: "Permintaan berhenti dicatat. Orang ini kini TIDAK bisa dihubungi, apa pun status consent-nya.",
      srvReactivated: "Suppression diaktifkan kembali. Orang ini kini TIDAK bisa dihubungi, apa pun status consent-nya.",
      srvNoop: "Sudah ada suppression aktif untuk identitas ini — tidak ada perubahan.",
      srvWriteFailedRecord: "Gagal mencatat suppression. Tidak ada baris separuh jadi.",
      srvWriteFailedLift: "Gagal mencabut suppression. Tidak ada perubahan separuh jadi.",
      srvLiftSuccess: "Suppression dicabut. Orang ini kini BISA dihubungi kembali.",
    },
  },

  // /segments (Sprint 4E screen 3) — segment builder + AI assistant + AND/OR filter tree.
  // Hidden surfaces folded in: the readback sentences (describeFilterTree / describeProposal) and
  // the filter validator (validateFilterTree) are pure tested fns that emit these words; they take
  // an optional lang (default "id") so old tests are untouched. Nuance-bearing warnings live under
  // segments.warn.* (guarded). Numbers/counts are interpolated by the component, not stored here.
  segments: {
    subtitleA: "Susun kriteria, lihat jumlahnya, ubah, lihat lagi. Tidak ada yang disimpan — tanpa tabel, tanpa nama segmen. Penyimpanan ditunda.",
    criteriaTitle: "Kriteria",
    aiTitle: "Asisten AI",
    aiOptional: "pintasan opsional",
    groupDemografi: "Demografi",
    groupDemografiHint: "Atribut orangnya — kota, revenue, unit, segmen — digabung dengan AND/OR.",
    groupKontak: "Kontak",
    groupKontakHint: "Apakah profil bisa dihubungi. Bukan atribut demografi, jadi berdiri sendiri.",
    groupPerilaku: "Perilaku",
    groupPerilakuHint: "Jejak lintas-tabel: keterlibatan ekosistem, sumber (Hyrox/arena/gym/klinik/my20fit), program, RFM.",
    kontakHasEmail: "Hanya yang punya email",
    kontakHasPhone: "Hanya yang punya telepon",
    cityCaveatTitle: "Kota tak bisa diandalkan untuk memfilter",
    aiDescA: "Jelaskan segmennya dengan kata-kata (mis. “pelanggan yang ikut RUNFEST dan punya email”). AI mengusulkan kriteria — Anda tetap meninjau, mengubah, lalu menekan Hitung sendiri. Kriteria waktu tidak bisa (kolom waktu = cap muat); permintaan klinis butuh ",
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
    savePlaceholder: "Nama segmen",
    saveBtn: "Simpan segmen",
    saving: "Menyimpan…",
    saveOk: "Segmen tersimpan.",
    saveFailed: "Gagal menyimpan segmen.",
    countMatchedLabel: "Cocok kriteria",
    countMatchedSub: "orang memenuhi definisi ini",
    countMktLabel: "Boleh dihubungi · marketing",
    countMktSub: "consent marketing aktif & tidak disuppress",
    countSvcLabel: "Boleh dihubungi · layanan",
    countSvcSub: "consent layanan (transactional) aktif & tidak disuppress — untuk CS/operasional",
    mirrorFreshA: "Filter sumber (Hyrox, arena, dll.) dibaca dari cermin data — disegarkan ",
    mirrorFreshB: ".",
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
    revNegative: "Negatif (anomali)",
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
    rbNoPhone: "tanpa telepon",
    rbNoEmail: "tanpa email",
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
      timeBannedD: ") adalah cap waktu muat — satu instan per sumber, bukan jejak aktivitas. Menyaring berdasarkan itu menghasilkan angka yang tampak tegas tapi tak bermakna. Kotaknya sengaja tidak ada supaya tak ada yang tergoda memakainya.",
      // Ecosystem note. Nuance: last_seen_at is 99,51% a load stamp — still no time criteria.
      ecoDescA: "Menyaring profil yang punya minimal satu baris di ",
      ecoDescB: " pada unit / produk terpilih. Kosakata ini beda dari “Unit” di atas (ada ",
      ecoDescC: " & ",
      ecoDescD: "). Tetap tanpa kriteria waktu: ",
      ecoDescE: " 99,51% cap muat.",
      // Unmatched-source note. Nuance: "real activity" is presence, NOT a time criterion —
      // last_active_at is real but only for 44/82.253; a time filter would hide 99,9% of the pool.
      srcRecencyA: "Cocok lewat email ternormalisasi. “Aktivitas nyata” adalah presensi, bukan kriteria waktu: ",
      srcRecencyB: " nyata tapi hanya untuk 44/82.253 — menjadikannya filter waktu akan terlihat presisi sambil menyembunyikan 99,9% pool.",
      // Clinic-hidden note (no view_health). Nuance: filtering "clinic patient" = inferring health.
      clinicHiddenA: "Kriteria klinik (pasien / transaksi) disembunyikan — butuh ",
      clinicHiddenB: ". Menyaring “pasien klinik” = menyimpulkan status kesehatan.",
      // Sources AND note. Nuance at risk: cross-table OR is honestly REFUSED (PostgREST can't express
      // it in one query) rather than silently turned into AND.
      sourcesAndA: "Arena/gym cocok lewat email; klinik lewat telepon dulu. Semua kondisi sumber di-AND-kan (irisan himpunan). OR lintas-tabel tidak tersedia — tak bisa diungkapkan jujur dalam satu query, jadi tak disediakan pilihannya alih-alih diam-diam ber-AND.",
      // RFM warning. Nuance at risk: RFM can't segment — New User = 92% of pool; filtering it ≈
      // filtering everyone; the top two buckets are ~66 people. Don't build a campaign on it (T-19).
      rfmA: "RFM hampir tak bisa menyegmentasi: ",
      rfmB: " = 81.213 (92% pool), dua keranjang teratas (",
      rfmC: "+",
      rfmD: ") cuma 66 orang. Menyaring “New User” ≈ menyaring semua orang; “Loyal” = 65 orang. Jangan susun kampanye di atasnya.",
      // Staging note. Nuance: stored spelling (Campion user) kept as-is; clinical program infers health.
      stagingA: "Dari ",
      stagingB: " — impor yang sama dengan master, cocok 98,6% lewat email. RFM ditampilkan apa adanya termasuk ejaan tersimpan (",
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
      mktZeroC: " aktif (atau suppression menang). ",
      svcZeroA: "Nol dari ",
      svcZeroB: ". Tak ada consent ",
      svcZeroC: " aktif (atau suppression menang).",
      // Read-only footer. Nuance at risk: nothing is saved/exported/sent because the FLOW isn't built
      // yet — "a button that refuses is worse than no button" — not because the role lacks permission.
      footer: "Nol daftar orang (penyusun yang mengeluarkan daftar orang = ekspor tanpa nama — pakai /audience) · simpan kriteria & ekspor digerbangi peran (PRD 17.2) · tiap perhitungan tercatat (list.viewed).",
    },
  },

  // /settings governance page (Sprint 4E screen 4) — audit log + RBAC roles panel + page chrome.
  // The marker screen is "audit" but the honest unit is the WHOLE /settings page (roles-panel too).
  // Audit ACTION NAMES (profile.viewed, list.viewed, …) are identifiers — kept verbatim in mono,
  // never translated (LARANGAN). Retention-note action lists render the mono tokens inline with
  // literal ", " separators, so only the prose is a dict key.
  audit: {
    settingsTitle: "Settings",
    settingsSubtitle: "Tata kelola: peran RBAC (beri, ubah, cabut — khusus Super Admin), jejak audit (baca), arsip consent (baca), dan status WhatsApp Business API.",
    emailUnresolved: "email tak teresolusi",
    diagnostikLink: "Buka Diagnostik — status verifikasi & pemeriksaan lapisan baca",
    pageDeniedRole: "Pengaturan (peran & audit log) hanya untuk super_admin dan crm_manager. Bila RBAC belum di-provision, semua akses ditolak — ini perilaku fail-closed yang benar.",
    // roles panel
    rolesTitle: "Peran (RBAC)",
    rolesSubtitleA: "Daftar peran (baca). Pemberian peran hanya untuk Super Admin (K-43) dan ber-audit (role.granted, disimpan permanen). Matriks izin: ",
    rolesSubtitleB: " (PRD 17.2, disetujui Jeff 2026-08-10).",
    grantTitle: "Beri, ubah, atau cabut peran (khusus Super Admin)",
    grantDesc: "Memberi peran = memberi seluruh izin peran itu. Hanya Super Admin. Tiap perubahan tercatat di audit (role.granted / role.revoked, permanen). Email harus sudah punya akun 20FIT — CRM tidak membuat akun baru.",
    grantEmail: "Email pengguna",
    grantEmailPh: "orang@20fit.id",
    grantRole: "Peran",
    grantBtn: "Beri / ubah",
    granting: "Menyimpan…",
    grantOk: "Peran disimpan: ",
    grantErrDenied: "Hanya Super Admin yang boleh mengubah peran.",
    grantErrBadRole: "Peran tidak dikenal.",
    grantErrUserNotFound: "Tak ada akun 20FIT dengan email itu. CRM tidak membuat akun baru — buat dulu di 20FIT.",
    grantErrSelfDemote: "Super Admin tidak boleh menurunkan atau mencabut peran dirinya sendiri.",
    grantErrLastSuperAdmin: "Ini Super Admin terakhir — tidak boleh diturunkan atau dicabut. Angkat Super Admin lain dulu.",
    grantErrNotAssigned: "Pengguna itu belum punya peran untuk dicabut.",
    grantErrWriteFailed: "Gagal menyimpan peran — periksa log.",
    revokeBtn: "Cabut",
    revoking: "Mencabut…",
    revokeOk: "Peran dicabut: ",
    revokeConfirm: "Cabut peran pengguna ini? Ia kehilangan seluruh akses CRM.",
    rolesNotProvisioned: "RBAC belum di-provision",
    rolesNotProvisionedA: "Tabel ",
    rolesNotProvisionedB: " belum ada. Jalankan migrasi lalu seed super_admin pertama; daftar peran akan muncul di sini.",
    thUser: "Pengguna",
    thRole: "Peran",
    thGranted: "Diberikan",
    rolesEmpty: "Belum ada peran yang di-assign.",
    // audit panel
    auditTitle: "Audit log",
    auditSubtitle: "Jejak “siapa melakukan apa”. Append-only — tidak ada tombol hapus atau edit karena trigger database menolaknya. Setiap pembukaan halaman ini sendiri tercatat.",
    catCompliance: "Kepatuhan",
    catOperational: "Operasional",
    catAll: "Semua",
    inRangeLabel: "Dalam rentang ini: ",
    inRangeCompliance: "Kepatuhan ",
    inRangeOperational: "Operasional ",
    inRangeOther: " · Lain ",
    inRangeTotal: " · total ",
    filterActionLabel: "Aksi / prefiks",
    filterActionPlaceholder: "mis. role. atau list.viewed",
    filterActorLabel: "Email aktor",
    filterActorPlaceholder: "mis. tifany@",
    filterFrom: "Dari",
    filterTo: "Sampai",
    apply: "Terapkan",
    reset: "Reset",
    thTime: "Waktu (WIB)",
    thActor: "Aktor",
    thAction: "Aksi",
    thRetention: "Retensi",
    thTarget: "Target",
    thSummary: "Ringkasan",
    loading: "Memuat…",
    failed: "Gagal",
    noMatch: "Tidak ada baris audit yang cocok.",
    artifactTag: "artefak",
    systemActor: "sistem",
    zeroRows: "0 baris",
    showingPre: "Menampilkan ",
    showingOf: " dari ",
    prev: "Sebelumnya",
    pageLabel: "Hal",
    next: "Berikutnya",
    loadFailed: "Gagal memuat",
    connFailed: "Gagal terhubung ke server.",
    // /settings/roles subpage chrome (RolesPanel itself is already translated).
    rolesPageDeniedRole: "Halaman ini butuh peran dengan izin melihat audit log (super_admin, crm_manager). Bila RBAC belum di-provision, semua akses ditolak — fail-closed yang benar.",
    allSettingsLink: "← Semua pengaturan",
    // RETENTION_LABEL (audit-log-constants). "Operasional"/"Kepatuhan" as retention CLASS labels.
    retOperational: "Operasional · dipangkas > 90 hari",
    retCompliance: "Kepatuhan · disimpan permanen",
    retOther: "Lain · tak masuk allowlist purge",
    // route messages
    apiRoleDenied: "Hanya super_admin dan crm_manager yang boleh melihat audit log (PRD 17.2).",
    apiAuditFailed: "Pembacaan ditolak: gagal mencatat audit (akuntabilitas).",
    warn: {
      // RetentionNote. Nuance at risk: an operational row that STOPS APPEARING (purged after 90d)
      // is not one that has been answered — "absence of old rows doesn't mean nothing happened".
      // The two retention CLASSES (operational pruned 90d / compliance permanent) must stay distinct.
      retentionTitle: "Log ini bukan riwayat lengkap",
      retentionA: "Kebijakan retensi memangkas kategori operasional (",
      retentionB: ") setelah 90 hari; kategori kepatuhan (",
      retentionC: ") dikecualikan permanen. Ketiadaan baris operasional lama tidak berarti tidak ada yang terjadi. Fungsi purge belum dijadwalkan, jadi sampai hari ini belum ada satu baris pun yang benar-benar terpangkas.",
      // Nuance: the stored filter value in list.viewed metadata is USER-TYPED, not curated data.
      retentionNoteA: "Catatan: nilai filter yang tersimpan di ",
      retentionNoteB: " baris ",
      retentionNoteC: " (mis. kota) berasal dari ketikan pengguna, bukan data terkurasi — diperlakukan apa adanya dan dibatasi panjangnya.",
      // GapNote. Nuance at risk: each MISSING id is one FAILED audited operation — the row that
      // should have recorded it is itself the one that never landed. The sequence is never reset.
      gapTitleA: "Daftar ini tidak lengkap — ",
      gapTitleB: " nomor id tanpa baris",
      gapBodyA: "Sepanjang audit log, rentang id ",
      gapBodyB: " (",
      gapBodyC: " nomor) hanya memuat ",
      gapBodyD: " baris. ",
      gapBodyE: " nomor tidak punya baris: ",
      gapBodyF: " sah (artefak uji yang dihapus) dan ",
      gapBodyG: " tak dikenal.",
      gapBody2A: "Id memakai sequence: sebuah operasi teraudit yang gagal atau di-rollback tetap mengambil nomornya lalu tak meninggalkan baris. Jadi tiap id yang hilang adalah satu operasi teraudit yang gagal — barisnya yang seharusnya mencatatnya justru yang tak pernah mendarat. ",
      gapUnexplainedHint: "Yang tak dikenal perlu ditelusuri di log Railway. ",
      gapBody2B: "Sequence tidak pernah diisi ulang atau diatur ulang — itu menghapus satu-satunya bukti.",
      // Read-only footer.
      footer: "Append-only · nol tombol hapus/edit · dibaca via service role server-side · pembukaan halaman ini tercatat (list.viewed).",
      // ARTIFACT_ROWS (by id). Nuance: a legitimate audit row that is a TEST artifact, not real activity.
      artifact1: "Artefak uji trigger append-only (Sprint 2B) — bukan aktivitas.",
      artifact5: "Artefak verifikasi retensi (Sprint 3A) — pemangkasan uji, bukan aktivitas.",
    },
  },

  // /quality — data-quality dashboard (Sprint 5B). The app's largest warning surface: fill-rate
  // notes, defect definitions, and the "cannot be computed live" artifacts are all load-bearing
  // prose, so every one of them sits under quality.warn.* where the length + forbidden-term guards
  // measure it. Short labels/titles/captions stay outside .warn.. Structured rows are keyed by the
  // data key (fill/issue/satellite/artifact) so the client resolves label + warning by key, with
  // the server's Indonesian text as the fallback. Stored data values (Campion user, table/column
  // names, program names) are NOT translated — they are data, verbatim in both languages.
  quality: {
    title: "Quality",
    subtitlePre: "Kondisi data apa adanya di",
    subtitlePost: "— dihitung ulang tiap halaman dibuka, tak ada angka yang ditulis tangan.",
    recompute: "Hitung ulang",
    computing: "Menghitung agregat…",
    loadFailed: "Gagal memuat",
    connectFailed: "Gagal terhubung ke server.",
    deniedBadge: "Akses ditolak",
    deniedScope:
      "Peran unit_manager dibatasi pada unit yang dikelola, tetapi tabel unit-scope belum ada — akses ditolak (fail-closed) sampai tabel itu dibangun.",
    deniedRole:
      "Peran Anda tidak berizin melihat kualitas data profil. Bila RBAC belum di-provision, semua akses ditolak — perilaku fail-closed yang benar.",

    reachTitle: "Punya identifier ≠ bisa dihubungi",
    reachBody1: "Seluruh",
    reachBody2:
      "profil dianggap boleh dihubungi (K-36). Catatan dasar hukum di",
    reachBody3: "bukan gerbang; satu-satunya yang menghapus seseorang adalah berhenti berlangganan di",
    reachBody4:
      "— halaman ini mengukur kelengkapan data, bukan izin mengirim.",

    panel: {
      fillTitle: "Fill rate",
      identifiersTitle: "Identifier tidak valid",
      anomaliesTitle: "Anomali nilai",
      duplicatesTitle: "Duplikat",
      queuesTitle: "Antrean orphan & pengecualian",
      satellitesTitle: "Kurasi & skor",
      ecosystemTitle: "Ekosistem 20FIT — customer_engagement",
      stagingTitle: "Cakupan data impor — staging_20fit_data ★",
      enrichmentTitle: "Cakupan sumber ekosistem tak-tercocok",
      multisourceTitle: "Cakupan sumber lain — arena / gym",
      clinicTitle: "Cakupan klinik",
      artifactsTitle: "Temuan yang tidak bisa dihitung live",
    },

    caption: {
      fillPre: "Berapa persen dari",
      fillPost:
        "profil yang punya isi di tiap field. “Terisi” berarti NOT NULL — tidak ada penilaian mutu isi di sini. Ambang warna (≥95% hijau, ≥60% kuning) adalah konvensi tampilan, bukan SLA dari PRD.",
      identifiers:
        "Pemeriksaan bentuk, bukan verifikasi bahwa nomor atau email benar-benar aktif. Nol di sini bukan jaminan keterkiriman.",
      anomalies:
        "Nilai yang lolos semua pemeriksaan bentuk tetapi tidak masuk akal secara bisnis — dan yang paling penting, tidak tertangkap oleh filter di layar lain.",
      duplicates:
        "Penandaan berasal dari proses impor lama. Alur merge/unmerge belum dibangun, jadi angka ini hanya bisa naik.",
      queues:
        "Baris yang tidak masuk ke master. Persentase dihitung terhadap jumlah profil master sebagai pembanding skala, bukan sebagai bagian dari master.",
      satellites:
        "Tabel satelit crm_* sudah ada tetapi belum terisi. Ini bukan “skor basi” — skornya belum pernah dihitung sama sekali.",
      ecosystem:
        "Jejak keterlibatan lintas unit dari tabel customer_engagement — dibaca di tempat, tanpa disalin ke crm_*. Yang tampil di sini hanya yang bisa dihitung live; dua angka terpenting (% cap muat dan cakupan profil) ada di panel bertanggal di bawah.",
      staging:
        "Impor yang SAMA dengan master_customer, dicocokkan lewat email ternormalisasi (K-06). Inilah sumber yang mengisi tanggal lahir (master_customer: 0), kota, RFM, dan keikutsertaan program. Nol tulis, nol salin.",
      enrichment:
        "Sumber lain (Hyrox, my20fit) dikaitkan ke profil lewat email ternormalisasi (K-06). “Cocok” = profil master berbeda (satu email bisa banyak baris sumber). rc_team_members dikecualikan (berkunci nama).",
      multisource:
        "Dikaitkan lewat email ternormalisasi (K-06). Baris bernilai nol tetap ditampilkan (0 terukur, bukan tak ada sumber).",
      clinic:
        "Klinik dicocokkan TELEPON dulu (K-06): email hanya menemukan sebagian kecil karena banyak pasien tak punya email — bukan karena mereka tak ada di master.",
      artifactsPre: "Hal-hal berikut sudah diverifikasi langsung ke database pada",
      artifactsPost:
        "tetapi tidak bisa dihitung ulang lewat API baca yang dipakai halaman ini (tidak ada perbandingan antar-kolom maupun regex). Angkanya statis dan sengaja diberi tanggal — jangan dibaca sebagai angka hari ini.",
    },

    fillLabel: {
      full_name: "Nama",
      phone: "Telepon",
      email: "Email",
      first_unit: "Unit pertama",
      segment: "Segment",
      city: "Kota",
      gender: "Gender",
      date_of_birth: "Tanggal lahir",
      address: "Alamat",
      lifetime_value: "Lifetime value > 0",
    },
    issueLabel: {
      phone_not_62: "Telepon tidak berawalan 62",
      email_no_at: "Email tanpa pola @domain.tld",
      email_known_typo_domain: "Domain email salah ketik (daftar dikenal)",
      ltv_negative: "Lifetime value negatif",
      name_with_digits: "Nama mengandung angka",
      flagged_duplicate: "Ditandai kemungkinan duplikat",
      merged: "Sudah di-merge",
      orphan: "Antrean orphan",
      excluded: "Dikecualikan dari master",
    },
    satelliteLabel: {
      demographic: "Kurasi demografis",
      behavior: "Satelit perilaku",
      scores: "Skor turunan",
    },
    artifactLabel: {
      last_activity: "“Terakhir aktif” bukan data aktivitas",
      segment_inverted: "Segment terbalik",
      source_two_batches: "“live_txn_ingest” adalah muatan batch, bukan feed hidup",
      first_seen_is_load_stamp: "“first_seen_at” adalah cap muat untuk 98,7% pool",
      first_seen_after_created: "14 baris “pertama terlihat” setelah dibuat (kontradiksi logis)",
      nik_derivation: "NIK Hyrox → gender + tanggal lahir (mengisi field yang 0% terisi)",
      nik_date_swap: "321 tanggal lahir tersimpan hari-bulan TERTUKAR (NIK yang benar)",
      ecosystem_last_seen_load_stamp: "“last_seen_at” ekosistem adalah cap muat untuk 99,51% baris",
      ecosystem_coverage: "82.089 dari 82.253 profil (99,80%) punya jejak ekosistem",
      staging_email_match: "staging_20fit_data cocok 98,6% ke master lewat email",
      staging_dob_ambiguity: "Tanggal lahir impor: 0 tertukar terbukti, 2.232 hari-bulan ambigu",
    },

    eco: {
      totalRows: "Total baris engagement",
      spreadNote: "Sebaran per unit (baris, bukan pelanggan — satu pelanggan bisa punya beberapa produk di unit yang sama):",
      futureLabel: "Baris last_seen_at di masa depan",
    },
    staging: {
      rowsImport: "Baris impor",
      hasEmail: "Punya email",
      hasDob: "Punya tgl lahir",
      dobParseTitle: "Penguraian tanggal lahir",
      parsed: "berhasil diurai",
      failed: "gagal (ditandai, bukan dibuang)",
      ambiguous: "hari-bulan ambigu (≤12 di dua posisi — tak bisa dipastikan)",
      swapped: "terbukti tertukar (bulan > 12)",
      implausible: "umur mustahil (<10 / >100 / masa depan)",
      umurPre: "Silang Umur (as-of snapshot 20 Apr 2026, memvalidasi TAHUN saja — menukar hari-bulan tak mengubah umur):",
      umurChecked: "diperiksa",
      umurExact: "sama persis",
      umurOff1: "beda 1 tahun (drift snapshot, wajar)",
      umurConflict: "bentrok ≥2 tahun (konflik tahun nyata)",
      rfmTitle: "RFM per paid order",
      noBucket: "− (tanpa bucket)",
      programTitle: "Keikutsertaan program",
    },
    enrich: {
      matchedFrom: "profil cocok dari",
      sourceRows: "baris sumber",
      unmatched: "tak tersambung ke master",
    },
    multi: {
      matched: "profil cocok",
      hasEmail: "punya email",
      rows: "baris",
      noEmailPre: "baris tanpa email (identifier kosong)",
      allHaveEmail: "semua baris punya email",
      hasEmailNoMaster: "punya email tapi tak ada di master",
    },
    clinic: {
      matchedPhone: "cocok via telepon",
      matchedEmail: "via email",
      fromPatients: "dari",
      patients: "pasien",
      hasPhone: "punya telepon",
      hasEmail: "punya email",
      txTitle: "clinic_transactions — tautan pasien",
      txLinked: "tertaut",
      txNullFk: "patient_id NULL",
      txFrom: "dari",
      sparsePre: "Terlalu tipis untuk ditampilkan per-profil (dicatat di sini):",
    },
    footer: {
      computedPre: "Dihitung",
      computedPost: "· agregat saja, tak ada baris individual dibaca · agregat tetap tanpa parameter pengguna — tidak diaudit",
    },
    fillBarAria: "terisi",

    // Every load-bearing warning sentence lives here (path contains ".warn.") so the length +
    // forbidden-term guards measure it. Keys mirror the data key of the row they explain.
    warn: {
      fill_city:
        "Satu-satunya sinyal geografis yang ada. Selama masih di bawah 10%, penargetan per kota tidak bisa dipertanggungjawabkan.",
      fill_gender:
        "Kosong total di sistem lama. Perlu diisi lewat lapisan kurasi (crm_profile_demographic), bukan dengan menebak dari nama.",
      fill_date_of_birth:
        "Kosong total di master_customer. Tanpa ini tidak ada kampanye ulang tahun dan tidak ada segmentasi usia.",
      fill_address: "Kosong total di master_customer — belum terisi satu baris pun.",
      fill_lifetime_value:
        "Bukan field kosong: nilainya ada, tetapi nol. Sisanya belum pernah tercatat membayar — “Rp 0” adalah fakta yang terukur, bukan data yang hilang.",
      issue_phone_not_62:
        "phone_normalized IS NOT NULL AND NOT LIKE '62%'. Pemeriksaan bentuk awalan saja — panjang dan prefiks operator tidak divalidasi di sini (PostgREST tanpa regex).",
      issue_email_no_at:
        "email_normalized IS NOT NULL AND NOT LIKE '%@%.%'. Ini uji bentuk paling longgar; nol di sini TIDAK berarti semua email valid atau terkirim.",
      issue_email_known_typo_domain:
        "email_normalized berakhir pada domain typo yang dikenal (gmaol.com, gmail.con, …). gmaol.com sendiri = 986 baris, SEMUANYA dari impor 20 April 2026 satu instan — kerusakan sistematis, bukan 986 salah ketik independen. DITANDAI, bukan diperbaiki otomatis: mengubah email atas tebakan bisa mengirim data pribadi ke orang lain.",
      issue_ltv_negative:
        "lifetime_value < 0. Baris ini TIDAK TERLIHAT di filter revenue halaman Audience — “punya revenue” menyaring > 0 dan “tanpa revenue” menyaring 0/NULL, jadi nilai negatif jatuh di luar keduanya dan hanya muncul saat filter “Semua”. Diangkat di sini justru karena di sana ia menghilang.",
      issue_name_with_digits:
        "full_name mengandung minimal satu digit 0–9. Kemungkinan besar data sampah (mis. nomor antrean ikut ke kolom nama). DITANDAI, bukan diperbaiki: master_customer read-only, dan perapian nama terjadi di lapisan tampilan, bukan dengan menebak nama yang benar.",
      issue_flagged_duplicate:
        "is_potential_duplicate = true. Ditandai oleh proses impor lama; belum ada alur merge/unmerge di aplikasi ini.",
      issue_merged: "is_merged = true. Nol berarti belum satu pun duplikat diselesaikan.",
      issue_orphan:
        "Baris di customer_orphan — data yang tidak bisa dikaitkan ke satu profil master.",
      issue_excluded:
        "Baris di customer_excluded. Jumlahnya besar dan alasan pengecualian belum ditinjau ulang di sprint ini.",
      satellite_demographic: "Tabel sudah ada, belum diisi — ingestion masih ditahan.",
      satellite_behavior:
        "Belum diisi. Sumber perilaku yang tersedia masih terlarang sampai diremediasi.",
      satellite_scores:
        "Belum diisi. Semua profil belum terskor — bukan “skor basi”, melainkan skor yang belum pernah ada.",
      ecoSpreadFuture:
        "last_seen_at > sekarang — cacat data (tanggal yang belum terjadi tak bisa jadi aktivitas). Sejajar dengan LTV negatif dan first_seen_at > created_at: ditampilkan, bukan diperbaiki (K-20). Ini SATU-satunya bagian cap-muat ekosistem yang bisa dihitung live (perbandingan ke literal waktu, bukan antar-kolom).",
      stagingRfm:
        "Ejaan tersimpan dipertahankan (Campion user), tidak “diperbaiki”. RFM per revenue 0% terisi — jadi bucket dihitung dari paid order, bukan revenue.",
      stagingProgram:
        "“−” berarti tidak ikut, NULL berarti belum terisi (dibedakan). Arena / GYM / Paid Shop nol terukur — barisnya tetap ditampilkan (K-08).",
      clinicPhoneWhy:
        "Jauh lebih banyak pasien punya telepon daripada email — itu sebabnya kecocokan telepon jauh lebih tinggi, bukan karena email lebih bersih.",
      clinicTxWhy:
        "Sebab yang berbeda: impor spreadsheet yang tak pernah ditautkan ke pasien — bukan tingkat kecocokan. Baris yang tertaut valid 100%.",
      artifact_last_activity:
        "81.944 dari 82.253 baris (99,62%) punya last_activity_at yang persis sama dengan first_seen_at — artefak impor, bukan jejak aktivitas. Kolom ini sengaja tidak ditampilkan di mana pun.",
      artifact_segment_inverted:
        "1.242 profil tanpa segment (NULL) justru memiliki rata-rata lifetime value TERTINGGI — kelompok kosong itu bukan “data hilang” melainkan pelanggan paling bernilai. Ditampilkan apa adanya; tidak ada aturan yang “merapikan” ini.",
      artifact_source_two_batches:
        "master_customer datang sebagai DUA muatan batch, bukan satu impor dan bukan pipeline berkelanjutan: 20fit_data_import 81.178 baris (semua created_at 2026-04-20) dan live_txn_ingest 1.075 baris (semua created_at 2026-07-31 — satu instan, bukan sepekan). Jadi kartu “Profil terakhir bertambah: 31 Juli” = tanggal muatan batch terakhir, BUKAN pipeline yang telat — nama “live_txn_ingest” untuk sumber yang hanya berjalan sekali adalah label yang menyesatkan.",
      artifact_first_seen_is_load_stamp:
        "first_seen_at hanya membawa informasi nyata pada 1.075 baris live_txn_ingest. Untuk 81.178 baris 20fit_data_import (98,69%) ia satu instan (2026-04-20), yakni cap waktu muat — bukan “pertama terlihat”. Konsekuensinya: segmentasi berbasis recency TIDAK bisa jujur dengan data hari ini. Rinciannya di docs/KOLOM-WAKTU.md.",
      artifact_first_seen_after_created:
        "14 baris punya first_seen_at LEBIH BARU dari created_at (selisih terbesar 7 hari 11 jam), semuanya di live_txn_ingest. Sebuah baris yang “pertama terlihat” setelah barisnya sendiri dibuat adalah kontradiksi, bukan sekadar data kotor. Seperti LTV negatif, ia tak muncul di filter layar mana pun — PostgREST tak punya perbandingan antar-kolom — jadi diangkat di sini sebagai temuan terverifikasi. Diverifikasi 11 Agustus 2026.",
      artifact_nik_derivation:
        "Dari 1.030 NIK di cf_hyrox_participants, 971 bisa diurai (16 digit valid); 59 panjang salah, tak diurai. Menghasilkan gender (486 perempuan / 484 laki-laki) dan tanggal lahir + provinsi — tiga field yang 0% terisi di master_customer. Aturan abad eksplisit: yy≤11 → 2000-an, selebihnya 1900-an; hasil di luar 1946–2011 DITANDAI, bukan ditebak. Diturunkan saat tampil (gerbang profile.view_health), NOL tulis. Diverifikasi 11 Agustus 2026.",
      artifact_nik_date_swap:
        "Dari 967 NIK terurai yang punya tgl_lahir tersimpan: 614 cocok persis, 321 punya HARI dan BULAN tertukar di kolom tersimpan, 32 beda karena hal lain. 321 bukan salah ketik independen — bug parsing DD/MM saat impor, pola SISTEMATIS sama seperti gmaol.com (T-16). Untuk 321 baris itu, tanggal dari NIK lebih dapat dipercaya daripada kolom tersimpan. Layar menampilkan KEDUANYA beserta asalnya. Diverifikasi 11 Agustus 2026.",
      artifact_ecosystem_last_seen_load_stamp:
        "customer_engagement: 89.974 dari 90.419 baris (99,51%) punya last_seen_at = first_seen_at — cap waktu muat, bukan aktivitas. Hanya 444 baris (0,49%) membawa aktivitas nyata, SEMUANYA dari live_txn_sync dan terpusat di Transaksi Clinic (274) dan Transaksi Arena (170). Ini KALI KEEMPAT sebuah kolom waktu ternyata cap muat — pola, bukan kejutan. Konsekuensi: TIDAK ada kriteria waktu di segment builder untuk ekosistem (K-19). Diverifikasi 11 Agustus 2026.",
      artifact_ecosystem_coverage:
        "customer_engagement mencakup 82.089 profil master berbeda dari 82.253 (99,80%; count distinct — tak bisa live via PostgREST), lewat 90.419 baris, 0 baris yatim. 164 profil tidak muncul sama sekali di ekosistem. Sebaran didominasi satu produk: membership/Fitco User = 67.828 baris (75%). Diverifikasi 11 Agustus 2026.",
      artifact_staging_email_match:
        "staging_20fit_data adalah impor yang SAMA dengan master_customer: 88.536 baris, 88.445 punya email; 81.079 dari 82.253 profil master (98,62%) cocok lewat email ternormalisasi (count distinct — tak bisa live via PostgREST). Kontras tajam dengan seluruh sumber ekosistem lain digabung (922 profil, 1,12%). Sumber inilah yang membawa tanggal lahir (5.467 baris — master_customer 0), kota, RFM, dan program. Nol tulis, nol salin. Diverifikasi 12 Agustus 2026.",
      artifact_staging_dob_ambiguity:
        "Seluruh 5.467 tgl lahir di staging_20fit_data berbentuk ISO yyyy-mm-dd dan 0 punya field bulan > 12 — jadi TIDAK ada baris yang terbukti tertukar (beda dari cf_hyrox_participants: 321 tertukar, T-16). Namun 2.232 punya field bulan DAN hari sama-sama ≤ 12: urutannya tak bisa dipastikan dari nilainya, jadi DITANDAI ambigu, tak pernah ditebak. Umur hanya memvalidasi TAHUN (menukar hari-bulan tak mengubah umur): 0 baris meleset ≥ 2 tahun. Umur TIDAK dipakai sebagai umur yang ditampilkan; umur selalu dihitung ulang dari tanggal. Diverifikasi 12 Agustus 2026.",
    },
  },

  // WhatsApp Business API connection status on /settings (contacting-half TUGAS 4). Shows PRESENCE
  // of the env-var credentials only, never a value; today all absent → honest "not connected".
  messaging: {
    waTitle: "WhatsApp Business API",
    waSubtitle: "Kanal chat untuk pengiriman. Kredensial disimpan sebagai environment variable di Railway (seperti token Mailtrap), tidak pernah ditampilkan kembali. Penyetelan kredensial menyusul.",
    waNotConnected: "Belum tersambung",
    waConnected: "Tersambung",
    waFieldToken: "Access token",
    waFieldPhone: "Nomor pengirim (phone number id)",
    waFieldAccount: "Business Account id",
    waConfigured: "terpasang",
    waNotSet: "belum diatur",
    waNote: "Sampai ketiganya terpasang, tidak ada pesan WhatsApp yang bisa dikirim. Ini status, bukan formulir — kredensial diatur di Railway, bukan di sini.",
  },

  // Public self-service unsubscribe page (contacting-half TUGAS 3). Reached from a link in an
  // email — no session — so it reads the language from ?lang (default id) and pulls these strings
  // directly from the dictionary. Recipients are mixed-language, hence both are kept complete.
  unsubscribe: {
    title: "Berhenti berlangganan",
    checking: "Memeriksa tautan…",
    invalidTitle: "Tautan tidak berlaku",
    invalidBody: "Tautan ini tidak sah atau sudah tidak berlaku. Bila Anda ingin berhenti dihubungi, balas email yang Anda terima atau hubungi tim 20FIT.",
    unavailableBody: "Layanan sedang tidak tersedia. Coba lagi nanti.",
    promptEmail: "Anda akan berhenti menerima email dari CRM 20FIT di alamat:",
    promptPhone: "Anda akan berhenti menerima pesan dari CRM 20FIT di nomor:",
    confirmButton: "Ya, berhenti berlangganan",
    working: "Memproses…",
    doneTitle: "Anda telah berhenti berlangganan",
    doneBody: "Permintaan Anda tercatat. Anda tidak akan lagi menerima pesan pemasaran dari CRM 20FIT lewat kontak ini.",
    alreadyBody: "Kontak ini memang sudah berhenti berlangganan sebelumnya — tidak ada yang berubah.",
    resubscribe: "Berubah pikiran? Hubungi tim 20FIT untuk berlangganan kembali.",
    failed: "Gagal memproses permintaan. Coba lagi nanti.",
  },

  // ComingSoon nav stubs (Sprint 4F) — user-openable routes that were hardcoded Indonesian with
  // no marker. Translated (short text) rather than marked. Titles stay proper nav names.
  stubs: {
    comingSoon: "Segera hadir",
    phase3: "Fase 3",
    phase4: "Fase 4",
    campaigns: "Kampanye manual: pilih segmen, pilih template, lihat estimasi biaya, minta persetujuan, kirim.",
    messages: "Log setiap pengiriman — kanal, status, dan alasan pemblokiran yang selalu terlihat.",
    exports: "Riwayat ekspor dengan pemohon, tujuan, jumlah baris, dan status persetujuan.",
    templates: "Register template WhatsApp dan email dengan status persetujuan Meta dan kategori.",
    workflows: "Mesin workflow marketing dengan sembilan guard. Diblokir sampai consent register aktif.",
  },

  // Messages screen (send path) — read-only log of every send. Born bilingual.
  messagesPage: {
    subtitle: "Setiap pengiriman — kanal, status, dan sebab gagal — ditampilkan apa adanya.",
    deniedRole: "Peran Anda tidak memiliki akses ke log pengiriman.",
    lastSend: "Pengiriman terakhir",
    never: "Belum ada",
    emptyTitle: "Belum ada pengiriman.",
    emptyBody: "Log terisi begitu kampanye pertama berjalan. Kirim nyata masih diblokir sampai token Mailtrap dirotasi.",
    breakdownTitle: "Ringkasan status",
    colWho: "Pelanggan",
    colChannel: "Kanal",
    colStatus: "Status",
    colCause: "Sebab",
    colWhen: "Waktu",
    identityNote: "Alamat tujuan tidak ditampilkan — disimpan hanya sebagai hash untuk penelusuran, tak pernah dibaca (sama seperti masking di layar lain).",
    stQueued: "Antre",
    stSent: "Terkirim",
    stDelivered: "Sampai",
    stBounced: "Bounce",
    stComplained: "Komplain",
    stFailed: "Gagal",
    stSkipped: "Dilewati (suppress)",
    causeInvalid: "Alamat tak valid",
    causeHardBounce: "Bounce keras",
    causeProvider: "Ditolak penyedia",
    causeDaily: "Batas harian",
    causeUnknown: "Tak diketahui",
  },

  // Campaigns console (send path) — compose flow + pre-launch block. Born bilingual.
  campaignsPage: {
    subtitle: "Susun kirim: pilih segmen, pilih template, lihat penerima setelah suppression, konfirmasi, kirim.",
    deniedRole: "Peran Anda tidak memiliki akses untuk menyusun pengiriman.",
    blockNoTemplateTitle: "Belum ada template email aktif",
    blockNoTemplateBody: "Alur kirim berhenti di sini sampai ada template aktif yang memuat tautan unsubscribe. Buat dulu di Templates.",
    blockHostTitle: "Domain tautan unsubscribe tak cocok dengan host",
    blockHostBody: "Tautan unsubscribe akan menunjuk domain yang berbeda dari host yang menyajikan aplikasi — kirim akan ditolak. Setel NEXT_PUBLIC_APP_URL ke host yang benar dulu.",
    docsTitle: "Cara kerja & batas (penjelasan, bukan kontrol)",
    steps: {
      step1Title: "1 · Siapa",
      step1Hint: "Pilih segmen tersimpan, atau buat baru. Jumlah penerima pastinya (setelah suppression) muncul di langkah Pesan.",
      step1SegmentLabel: "Segmen tersimpan",
      step1SummarySuffix: "bisa dihubungi (marketing)",
      step1BuildNew: "Buat segmen baru",
      step1BuildNewHint: "Susun kriteria, hitung, lalu simpan. Segmen tersimpan akan muncul di daftar di atas.",
      toStep2: "Lanjut ke Pesan",
      step2Title: "2 · Pesan",
      step2Hint: "Pilih template dan lihat isi yang akan dikirim, lalu hitung penerima setelah suppression.",
      step2PreviewLabel: "Pratinjau isi",
      step2CountBtn: "Hitung penerima",
      step2SummarySuffix: "akan dikirimi",
      toStep3: "Lanjut ke Kirim",
      step3Title: "3 · Kirim",
      step3Hint: "Pilih run, konfirmasi, kirim. Penerima dihitung ulang saat kirim; selisih ditampilkan.",
      step3SummarySuffix: "terkirim",
    },
    blockTitle: "Kirim nyata masih diblokir",
    blockBody: "Nol email kampanye ke alamat pelanggan sampai dua prasyarat beres: rotasi token Mailtrap dan SPF/DKIM/DMARC untuk 20fit.id. Sampai itu, hanya alamat internal @20fit.id yang bisa dikirimi.",
    flowTitle: "Alur kirim",
    flow1: "Pilih segmen dan lihat berapa penerima setelah suppression dikurangkan.",
    flow2: "Pilih template email aktif (versi yang benar-benar dikirim tercatat).",
    flow3: "Untuk lebih dari 500 penerima, konfirmasi kedua sebelum tombol kirim aktif.",
    flow4: "Setiap email memuat tautan unsubscribe bertanda tangan — syarat, bukan kebiasaan.",
    flow5: "Kirim; kegagalan per penerima tercatat dengan sebabnya, tak menghentikan sisanya.",
    limitsTitle: "Batas yang berlaku",
    limit1: "Batas harian mulai 1.000/hari, dihitung dari log pengiriman (bukan penghitung terpisah).",
    limit2: "Konfirmasi kedua wajib di atas 500 penerima.",
    limit3: "Auto-stop bila bounce keras melewati 5% (disetujui 24 Agu).",
    suppressionNote: "Suppression diperiksa SAAT KIRIM, bukan saat segmen dihitung — unsubscribe yang masuk di antaranya tetap dihormati.",
    templatesActive: "Template email aktif",
    templatesNone: "Belum ada template email aktif — buat dulu di Templates.",
    pendingTitle: "Form kirim langsung menyusul",
    pendingBody: "Menyusun-dan-kirim di layar menyusul setelah segmen bisa disimpan dan kedua prasyarat kirim terpenuhi. Jalur kirim sendiri sudah dibangun dan teruji.",
    composer: {
      title: "Susun kirim",
      segmentLabel: "Segmen tersimpan",
      templateLabel: "Template email",
      noSegments: "Belum ada segmen tersimpan. Simpan satu di layar Segments.",
      noTemplates: "Belum ada template email aktif — buat dulu di Templates.",
      previewBtn: "Lihat penerima",
      previewing: "Menghitung…",
      matched: "Cocok",
      withEmail: "Punya email",
      noContact: "Tanpa email",
      suppressed: "Di-suppress (dilewati)",
      sendable: "Akan dikirimi",
      daysA: "Segmen melebihi jatah harian — perlu sekitar ",
      daysB: " hari. Sisanya menunggu Anda menjalankan ulang kampanye ini; kirim ganda dicegah.",
      confirmLargeLabel: "Saya paham ini lebih dari 500 penerima.",
      runTitle: "Kirim sebagai run yang mana?",
      runHint: "Run baru mengirim ulang ke orang yang sama (terbitan berikutnya). Melanjutkan run yang ada melewati siapa pun yang sudah terkirim di run itu.",
      runResumeHeading: "Lanjutkan run yang ada",
      runNewHeading: "Mulai run baru",
      runResumeBadge: "LANJUTKAN",
      runNewBadge: "RUN BARU",
      runNoRuns: "Belum ada run untuk pasangan segmen + template ini.",
      runUntitled: "Tanpa nama",
      runSentSuffix: "terkirim di run ini",
      runStatusDraft: "draf",
      runStatusSending: "berjalan",
      runLabelField: "Nama run (opsional)",
      runLabelPlaceholder: "mis. Newsletter Sept #1",
      runsLoading: "Memuat run…",
      runChooseFirst: "Pilih dulu: lanjutkan run atau mulai baru.",
      sendBtn: "Kirim",
      sending: "Mengirim…",
      blockedBtn: "Kirim diblokir (token belum dirotasi)",
      driftWarnA: "Jumlah berubah sejak Anda melihatnya: sekarang ",
      driftWarnB: " akan dikirimi. Tekan Kirim lagi untuk melanjutkan dengan angka ini.",
      errClinical: "Segmen ini memakai kriteria klinis; peran Anda tak berwenang memakainya.",
      errNoUnsub: "Template ini tak memuat tautan unsubscribe — tak bisa dipakai.",
      errDenied: "Peran Anda tak berwenang menyusun pengiriman.",
      errNotFound: "Segmen tak ditemukan.",
      errNeedConfirm: "Centang konfirmasi lebih-dari-500 dulu.",
      errRunNotFound: "Run tak ditemukan lagi — segarkan daftar dan pilih lagi.",
      errRunCreate: "Gagal membuka run baru.",
      errSendThrew: "Kirim gagal sebelum selesai; run ditandai berhenti dengan sebabnya. Periksa run untuk detail.",
      errHostMismatch: "Host tautan unsubscribe berbeda dari host yang melayani aplikasi — tautannya akan mati. Setel NEXT_PUBLIC_APP_URL ke host yang benar sebelum kirim.",
      resultTitle: "Hasil kirim",
      resRunLabelNew: "Run baru",
      resRunLabelResume: "Lanjutan run",
      resSent: "Terkirim",
      resAlreadySent: "Sudah terkirim di run ini (dilewati)",
      resSkipped: "Dilewati (suppress)",
      resFailed: "Gagal",
      resWithheld: "Ditahan (pra-luncur)",
      resInternalNote: "Kirim nyata mati — hanya alamat internal yang dikirimi; alamat pelanggan ditahan.",
    },
    sendTest: {
      title: "Uji kirim internal (pra-luncur)",
      desc: "Pool pelanggan tak memuat alamat @20fit.id, jadi uji internal lewat composer menghasilkan nol penerima. Harness ini menyuntikkan satu alamat internal (dari SEND_TEST_INTERNAL_ADDRESS) ke engine, ports, audit, dan gerbang yang SAMA — membuktikan rantainya, bukan tiruannya. Hanya jalan saat kirim nyata mati.",
      runBtn: "Jalankan uji kirim internal",
      running: "Menjalankan…",
      cleanupBtn: "Bersihkan data uji",
      cleaning: "Membersihkan…",
      errDenied: "Peran Anda tak berwenang.",
      errRealSend: "Kirim nyata sedang menyala — harness dinonaktifkan (bukan pintu belakang).",
      errNoTarget: "SEND_TEST_INTERNAL_ADDRESS belum diset di lingkungan.",
      errNotInternal: "Alamat tujuan bukan @20fit.id — ditolak.",
      errTemplate: "Gagal menyiapkan template uji.",
      errSegment: "Gagal menyiapkan segmen uji.",
      errRun: "Gagal membuka run uji.",
      errMissingEnv: "Variabel lingkungan wajib belum diset (pasang semua sekaligus): ",
      errSendThrew: "Kirim melempar sebelum baris pertama; run ditandai berhenti dengan sebab: ",
      errUnexpected: "Galat tak terduga saat menjalankan uji — periksa log dan run.",
      errHostMismatch: "Host tautan unsubscribe berbeda dari host aplikasi — tautannya akan mati. Setel NEXT_PUBLIC_APP_URL dulu. ",
      resultTitle: "Hasil uji",
      target: "Tujuan",
      run: "Run",
      runStatus: "Status run",
      provider: "provider_message_id",
      logStatus: "Status baris log",
      auditCount: "Baris audit campaign.sent",
      sent: "Terkirim",
      withheld: "Ditahan (pra-luncur)",
      failed: "Gagal",
      providerNull: "kosong (klien tak menerima id dari Mailtrap — temuan)",
      cleanupDone: "Segmen uji diarsipkan: ",
      permanentTitle: "Tertinggal permanen (append-only)",
    },
  },

  // Profile detail (/audience/[id]) — Sprint 5B-T2. Nuance-critical prose lives under profile.warn.*
  // so the forbidden-term + length guards protect it (cap muat ≠ aktivitas, tidak terekam ≠ belum
  // terisi, ambigu ≠ invalid, tidak ada sumber ≠ kosong/sehat, tidak tersambung ≠ tak pernah ikut).
  profile: {
    pageTitle: "Profil",
    back: "Kembali ke audience",
    loading: "Memuat profil…",
    notFoundBadge: "Tidak ditemukan",
    notFoundText: "Profil tidak ditemukan.",
    errorBadge: "Gagal",
    errorText: "Profil gagal dimuat.",
    noName: "Tanpa nama",
    originalNameLabel: "Nama asli (dari sumber): ",
    contactMasked: "Kontak disamarkan",
    merged: "Sudah di-merge",
    possibleDup: "Kemungkinan duplikat",
    recordStop: "Catat permintaan berhenti",
    tabDemografi: "Demografi",
    tabPerilaku: "Perilaku",
    tabsAria: "Bagian profil",
    // section titles
    secContact: "Kontak",
    secAttr: "Atribut",
    secIdentity: "Identitas",
    secTrail: "Jejak waktu",
    secCuration: "Kurasi & duplikat",
    secEcosystem: "Ekosistem 20FIT",
    secOtherSources: "Sumber lain 20FIT",
    secImport: "Data impor 20FIT — partisipasi",
    secHealth: "Health flags",
    // contact fields
    fPhone: "Telepon",
    fEmail: "Email",
    fCity: "Kota",
    typoBadge: "Mungkin salah ketik",
    typoSuggest: "saran: ",
    confHigh: "keyakinan tinggi",
    confMed: "keyakinan sedang",
    typoNote: " — perlu konfirmasi manusia, tidak diperbaiki otomatis",
    // attributes
    fFirstUnit: "Unit pertama",
    fSegment: "Segment",
    noSegment: "(tanpa segment)",
    fLtv: "Lifetime value",
    fSource: "Sumber",
    // identity
    fNik: "NIK",
    fromPrefix: " · dari ",
    fromWord: "dari",
    fDob: "Tanggal lahir",
    fGender: "Gender",
    gMale: "Laki-laki",
    gFemale: "Perempuan",
    otherDiffer: " · sumber lain berbeda",
    fProvince: "Provinsi pendaftaran KTP (dari NIK)",
    provinceCodeA: "kode ",
    provinceCodeB: " (referensi wilayah belum tersedia)",
    provinceNote: " · tempat KTP diterbitkan, bukan domisili sekarang",
    fAddress: "Alamat",
    fEmergency: "Kontak darurat",
    srcNik: "NIK",
    srcStaging: "data impor 20FIT",
    srcHyrox: "Hyrox",
    srcStaff: "input staf",
    // demographic fill form
    fillTitle: "Lengkapi demografi (isi yang kosong)",
    fillGender: "Gender",
    fillDob: "Tanggal lahir",
    fillPick: "— pilih —",
    fillSave: "Simpan",
    fillSaving: "Menyimpan…",
    fillSaved: "Tersimpan. Memuat ulang…",
    fillMinOne: "Isi minimal satu field.",
    fillFailPrefix: "Gagal (",
    fillConnErr: "Gagal menghubungi server.",
    // time trail
    tCreated: "Dibuat (cap waktu muat batch)",
    tFirstSeenReal: "Pertama terlihat",
    tFirstSeen: "First-seen",
    tUpdated: "Diperbarui",
    // curation
    cNotes: "Catatan",
    cTags: "Tag",
    cDupReason: "Alasan duplikat",
    // ecosystem table
    loadFailBadge: "Gagal dimuat",
    ecoEmptyBadge: "Tidak muncul di ekosistem",
    groupClinic: "klinik",
    ecoColUnit: "Unit",
    ecoColProduct: "Produk",
    ecoColCount: "Jumlah",
    ecoColLast: "Terakhir",
    lsReal: "aktivitas nyata",
    lsFuture: "anomali: tanggal di masa depan",
    lsMissing: "tidak ada",
    lsLoadStamp: "tidak terekam",
    lsLoadStampTitle: "last_seen_at = first_seen_at → cap waktu muat, bukan aktivitas",
    // other sources
    srcLoadFailBadge: "Sebagian gagal dimuat",
    keyEmail: "cocok via email",
    keyPhone: "cocok via telepon (format, keyakinan lebih rendah)",
    keyPhonePlain: "cocok via telepon",
    attendanceSuffix: " kehadiran",
    rowsSuffix: " baris",
    hideDetail: "Sembunyikan detail",
    showDetailA: "Lihat detail (",
    showDetailB: " booking)",
    classNotFound: "Nama kelas tak ditemukan",
    classCodesPrefix: " (kode: ",
    my20Plus: "Plus member",
    my20User: "Pengguna",
    my20Onboard: " · onboarding selesai",
    hyroxLabel: "Hyrox",
    teamPrefix: " · tim ",
    registerPrefix: " · daftar ",
    bloodLabel: "Golongan darah (medis · view_health)",
    activityLabel: "Aktivitas nyata (my20fit)",
    activityVisitsSuffix: " kunjungan",
    activityLastActivePrefix: " · terakhir aktif ",
    clinicTitle: "Klinik — keterlibatan (view_health)",
    clinicPatientPrefix: "Pasien ",
    clinicBooking: "Booking",
    clinicVisit: "Kunjungan",
    clinicAssessment: "Assessment",
    clinicScreening: "Skrining",
    clinicTransaction: "Transaksi",
    clinicLatestBooking: "Booking terakhir: ",
    notConnectedBadge: "Tidak tersambung ke sumber lain",
    mirrorStampPrefix: " · penanda kehadiran cermin per ",
    // import (participation)
    impRfm: "RFM (per paid order)",
    impRfmNoBucket: "− (tanpa bucket)",
    impPrograms: "Program yang diikuti",
    // footer
    footer:
      "Baca saja · nol tombol edit/hapus/merge · pembukaan profil ini tercatat sekali (profile.viewed) — pindah tab bukan pembacaan baru · kontak & data sensitif ditahan di server untuk peran tanpa izin (tab hanya tata letak).",

    warn: {
      // "belum terisi" ≠ "empty" (a measured zero); guarded.
      emptyField: "belum terisi",
      // ecosystem
      ecoLoadFail:
        "Data ekosistem gagal dimuat untuk profil ini. Sisa profil tetap tampil — bagian ini dibaca terpisah dan tidak menahan pembukaan profil.",
      ecoEmptyA: "Profil ini tidak punya satu pun baris di ",
      ecoEmptyB:
        " (arena, clinic, event, gym, membership, shop). Ini kosong yang jujur — bukan “tidak aktif”, melainkan tidak tercatat di sumber ekosistem mana pun.",
      // all-load-stamp banner (cap muat ≠ aktivitas / date added)
      allLoadA: "Semua ",
      allLoadB: " titik ekosistem profil ini ",
      allLoadStrong1: "cap waktu muat",
      allLoadC: "). Riwayat aktivitasnya",
      allLoadStrong2: " belum terekam",
      allLoadD: " — itu bukan sama dengan “tidak aktif”.",
      futureA: "Setidaknya satu baris punya ",
      futureB: " di masa depan — cacat data, ditampilkan apa adanya.",
      ecoWhyA: "“Terakhir” hanya menunjukkan tanggal bila baris membawa aktivitas nyata (",
      ecoWhyB: ") — di data ini hampir seluruhnya berasal dari ",
      ecoWhyC:
        " (Transaksi Arena / Transaksi Clinic). Selebihnya cap waktu muat, ditandai “tidak terekam”. Dibaca-saja, tanpa ",
      ecoWhyD: " / NIK / data sensitif lain (Fase 0). Tautan ke profil lewat ",
      ecoWhyE: ", bukan telepon/email.",
      // SourceLine unmatched ≠ "never participated" — the field label above names the source.
      sourcesLoadFail: "Satu atau lebih sumber gagal dimuat; yang berhasil tetap tampil di bawah.",
      sourceNoData: "tidak ada baris untuk profil ini di sumber ini",
      // not connected (tidak tersambung ≠ tak pernah ikut)
      notConnectedFullA: "Profil ini ",
      notConnectedFullStrong: "tidak tersambung",
      notConnectedFullB: " ke sumber 20FIT lain mana pun",
      notConnectedFullC:
        ". Ini kosong yang jujur: tak ada kunci (email/telepon) yang cocok ke sumber itu, bukan “belum aktif”.",
      notConnectedSnapshotPrefix: "Dari penanda kehadiran cermin per ",
      notConnectedSnapshotSuffix: " — “tidak tersambung” berasal dari snapshot ini, bukan pemeriksaan langsung.",
      notConnectedLinePrefix: "Tidak tersambung ke: ",
      sourcesWhyA: "Dicocokkan lewat ",
      sourcesWhyStrong: "email ternormalisasi",
      sourcesWhyB:
        " dulu, lalu telepon (arena/gym/klinik) — nol cocok-nama-saja. “Tidak tersambung” berarti tak ada kunci yang cocok ATAU profil memang tak ada di sumber itu. Dibaca & digabung saat tampil, nol tulis, nol salin ke ",
      sourcesWhyC: ". Sumber klinis digerbangi ",
      sourcesWhyD:
        " dan hanya membawa identitas + volume keterlibatan + booking terakhir — isi klinis (diagnosa, hasil, obat) sengaja tidak dibawa.",
      // matchless (no email/phone)
      unmatchableSources: "Profil ini tak punya email atau telepon untuk dicocokkan ke sumber lain.",
      // identity ambiguity (ambigu ≠ invalid)
      dobAmbNik: "tahun (abad) di luar rentang wajar — ditandai, tidak dipaksakan",
      dobAmbStaging: "hari & bulan sama-sama ≤ 12 — urutan tak bisa dipastikan; ditandai, tidak ditebak",
      dobSwap: "tersimpan hari-dulu (bulan > 12) — dibaca ulang dengan benar & ditandai",
      dobConflictWhyA: "Ditampilkan satu nilai (paling andal: ",
      dobConflictWhyB: "), tapi sumber lain tidak sepakat — ",
      dobConflictWhyStrong: "tidak dipilih diam-diam",
      dobConflictWhyC:
        "Prioritas: NIK (posisi digit baku, nol ambiguitas hari-bulan) → impor → sumber lain → input staf.",
      identityWhyA:
        "NIK ditampilkan penuh (keputusan pemilik produk) — nilainya tetap TIDAK pernah masuk audit/metadata maupun ekspor CSV, dan tak pernah jadi kunci pencocokan. Gender/tanggal lahir/provinsi ",
      identityWhyStrong: "diturunkan dari NIK",
      identityWhyB: " (",
      identityWhyC: "); provinsi = tempat KTP diterbitkan, bukan domisili. Identitas digerbangi ",
      identityWhyD: " (K-31, sama seperti telepon/email); golongan darah & data klinis tetap ",
      identityWhyE: ".",
      identityGatedA: "NIK, gender, tanggal lahir, provinsi, alamat, dan kontak darurat ada tapi digerbangi — butuh peran ",
      identityGatedB: ".",
      // time trail
      firstSeenRealNote: " · dari transaksi (nyata)",
      firstSeenNote: " · cap waktu muat, BUKAN “pertama terlihat”",
      trailWhyA: "“First-seen” hanya bermakna pada baris ",
      trailWhyB: "; untuk ",
      trailWhyC:
        " (98,7% pool) ia sama dengan waktu muat. Segmentasi berbasis recency tidak bisa jujur dengan data ini.",
      // fill note
      fillNoteA: "Hanya field yang kosong di semua sumber ditawarkan; nilai tersimpan sebagai ",
      fillNoteB: " dan tercatat di audit. Mengoreksi nilai yang sudah ada bukan lewat jalur ini.",
      // import
      importFail: "Data impor gagal dimuat. Sisa profil tetap tampil.",
      importUnmatchable: "Profil ini tak punya email untuk dicocokkan ke data impor.",
      importNotMatchedA: "Profil ini tidak ada di data impor ",
      importNotMatchedB: ".",
      importNoProgram: "tidak tercatat ikut program apa pun di data impor",
      importClinicalWithheldA: "Program klinik (pasien 20FIT Clinic) disembunyikan — butuh ",
      importClinicalWithheldB: " (menandai pasien = status kesehatan).",
      importWhyA: "Dari ",
      importWhyB: " (impor yang sama dengan master), dicocokkan lewat ",
      importWhyStrong: "email ternormalisasi",
      importWhyC: " — bukan nama. Nol tulis, nol salin: dibaca & digabung saat tampil. Tanggal lahir + kota dari impor ini pindah ke ",
      importWhyD: " / ",
      importWhyE: " (Demografi) — yang tersisa di sini adalah partisipasi (RFM + program).",
      // health flags (tidak ada sumber ≠ kosong/sehat ≠ unavailable)
      healthNoSourceBadge: "Tidak ada sumber data",
      healthNoSourceB:
        " tidak memiliki kolom kesehatan apa pun. Satu-satunya sumber (",
      healthNoSourceC:
        ") di luar lingkup dan masih RLS OFF. Ini bukan “sehat” dan bukan nol terukur — memang belum ada sumbernya. Gerbang ",
      healthNoSourceD: " dipertahankan agar tetap benar begitu sumbernya ada.",
    },
  },

  // Auth pages (Sprint 4F) — /login, /forgot-password, /reset-password. Pre-session so they default
  // to Indonesian; translated so a persisted "en" cookie (an en user who logged out) is honoured.
  // Server pages read getServerDict; the reset FORM (client) reads a LangProvider the page wraps it in.
  auth: {
    loginTitle: "Masuk",
    loginSubtitle: "Audience Data & CRM · alat internal 20FIT",
    emailLabel: "Email",
    passwordLabel: "Kata sandi",
    forgotLink: "Lupa kata sandi?",
    loginButton: "Masuk",
    loginFootnote: "Akun dibuat oleh admin. Tidak ada registrasi mandiri.",
    errInvalid: "Email atau kata sandi salah.",
    errMissing: "Email dan kata sandi wajib diisi.",
    errUnavailable: "Tidak dapat terhubung ke server autentikasi. Coba lagi sebentar lagi, atau hubungi admin bila berlanjut.",
    errGeneric: "Tidak dapat masuk. Coba lagi.",
    forgotTitle: "Lupa kata sandi",
    forgotSubtitle: "Kami kirim kode verifikasi ke email Anda untuk mengatur ulang kata sandi",
    sendCodeButton: "Kirim kode",
    backToLogin: "Kembali ke halaman masuk",
    forgotErrInvalid: "Masukkan alamat email yang valid.",
    forgotErrUnavailable: "Tidak dapat mengirim kode saat ini. Coba lagi sebentar lagi, atau hubungi admin bila berlanjut.",
    resetTitle: "Kata sandi baru",
    resetSubtitle: "Masukkan kode dari email lalu buat kata sandi baru",
    // reset form (client)
    resetDone: "Kata sandi berhasil diubah. Silakan masuk dengan kata sandi baru Anda.",
    resetToLoginButton: "Ke halaman masuk",
    resetNeedFlow: "Halaman ini perlu dibuka dari alur lupa kata sandi. Mulai dengan memasukkan email Anda.",
    resetToForgotButton: "Ke halaman lupa kata sandi",
    resetSentA: "Kode dikirim ke ",
    resetSentB: ". Kode berlaku ",
    resetSentC: " dan hanya dapat dipakai sekali.",
    codeLabel: "Kode verifikasi",
    newPasswordLabel: "Kata sandi baru",
    confirmPasswordLabel: "Ulangi kata sandi baru",
    minCharsPlaceholderA: "Minimal ",
    minCharsPlaceholderB: " karakter",
    saving: "Menyimpan…",
    saveButton: "Simpan kata sandi baru",
    resendCooldownA: "Kirim ulang kode (",
    resendCooldownB: "s)",
    resending: "Mengirim ulang…",
    resendButton: "Kirim ulang kode",
    resetNoticeSent: "Kode baru sudah dikirim bila email tersebut terdaftar. Periksa kotak masuk dan folder spam.",
    resetErrIncomplete: "Sesi reset tidak lengkap. Mulai lagi dari halaman lupa kata sandi.",
    resetErrCodeDigitsA: "Kode terdiri dari ",
    resetErrCodeDigitsB: " digit angka.",
    resetErrMinCharsA: "Kata sandi baru minimal ",
    resetErrMinCharsB: " karakter.",
    resetErrMismatch: "Konfirmasi kata sandi tidak cocok.",
    resetErrWrongCode: "Kode salah. Periksa lagi angka yang Anda masukkan lalu coba lagi.",
    resetErrSetFailed: "Gagal mengatur kata sandi baru. Minta kode baru lalu coba lagi.",
    // Distinct reset-failure states (incident 24 Agu 2026 — one message hid several).
    resetCodeAccepted: "Kode diterima. Sekarang atur kata sandi baru Anda — tak perlu memasukkan kode lagi.",
    resetErrExpired: "Kode sudah kedaluwarsa (berlaku 1 jam). Minta kode baru lalu masukkan yang baru.",
    resetErrUsed: "Kode ini sudah dipakai untuk verifikasi. Kata sandi hampir selesai — cukup atur kata sandinya di bawah.",
    resetErrPwSame: "Kata sandi baru harus BERBEDA dari kata sandi lama. Masukkan yang lain.",
    resetErrPwWeak: "Kata sandi baru terlalu lemah untuk kebijakan sistem. Coba yang lebih panjang / lebih kuat.",
    resetErrPwRejected: "Kata sandi baru ditolak. Coba kata sandi lain — tak perlu kode baru, kodenya sudah diterima.",
    resetErrConn: "Tidak dapat terhubung ke server. Coba lagi sebentar lagi.",
    // pre-auth chrome (Sprint auth-UI): placeholder, password toggle, theme toggle
    emailPlaceholder: "nama@20fit.id",
    showPassword: "Tampilkan kata sandi",
    hidePassword: "Sembunyikan kata sandi",
    themeDark: "Mode gelap",
    themeLight: "Mode terang",
  },

  export: {
    // CSV header labels — these ARE user-facing (column titles in the downloaded file), so they
    // follow the language. Stored values under them are never translated.
    headers: {
      customer_id: "customer_id",
      full_name: "nama",
      email: "email",
      phone_normalized: "telepon",
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
    // Leading word of the download file name (followed by category-date-time).
    fileBaseName: "segmen",
    // Written into the file when streaming throws mid-export, so a truncated download announces
    // itself instead of looking complete (no EOF total = truncated, but this is explicit).
    aborted: "GAGAL: ekspor terputus, jangan pakai berkas ini",
  },

  ai: {
    // Reasons the assistant returns for requests it cannot express — surfaced in the user's
    // language. The model is instructed to answer in this language.
    replyLanguageName: "Bahasa Indonesia",
    timeUnexpressible:
      "Kriteria berbasis waktu tidak bisa: kolom waktu di data ini adalah cap muat, bukan aktivitas.",
    clinicalBlocked: "Kriteria klinis diminta tapi dibuang — butuh profile.view_health.",
    unavailable: "Asisten AI sedang tidak tersedia. Pakai filter manual — semua kriteria tetap ada.",
  },
} satisfies I18nShape;

/** Shape guard so both dictionaries are objects of nested string records (no accidental non-string). */
type I18nShape = Record<string, Record<string, string | Record<string, string>>>;

/** The key/shape contract English must satisfy. */
export type Messages = typeof id;
