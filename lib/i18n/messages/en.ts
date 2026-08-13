/**
 * English dictionary (Sprint 4B). Typed as `Messages` (= the Indonesian shape), so a missing key
 * is a COMPILE error. Translations preserve the data-quality NUANCE deliberately: "not recorded"
 * (never "no data"), "not filled in" (never "empty"), "load timestamp" (never "date added"),
 * "0 (measured)" kept distinct from "—". Where a phrase can't carry the nuance in fewer words, the
 * sentence is lengthened rather than the meaning cut. Stored data values are NOT translated.
 */

import type { Messages } from "./id";

export const en: Messages = {
  coverage: {
    notEnglishYet: "This section isn't available in English yet — it's still shown in Indonesian.",
  },

  common: {
    appName: "20FIT CRM",
    languageName: "English",
    loading: "Loading…",
    retry: "Try again",
    back: "Back",
    dash: "—",
    measuredZero: "0 (measured)",
    noSource: "— (no source)",
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
    darkMode: "Dark mode",
    lightMode: "Light mode",
    language: "Language",
    signedInAs: "Signed in as",
    signOut: "Sign out",
  },

  access: {
    deniedBadge: "Access denied",
    dashboardHidden: "Figures hidden: your role isn't permitted to view the profile list (fail-closed).",
    loadFailed: "Figures failed to load. Cards show “—” rather than guessing.",
    segmentsDeniedScope:
      "The unit_manager role is limited to the units it manages, but the unit-scope table doesn't exist yet — access denied (fail-closed).",
    segmentsDeniedRole:
      "Building a segment needs the segment.build role (super_admin, crm_manager, crm_operator, analyst). data_steward is not entitled.",
  },

  dashboard: {
    title: "Dashboard",
    subtitle: "20FIT Audience Data & CRM",
    tz: "WIB",
    audienceSize: "Audience size",
    audienceSizeHint: "master_customer (read-only)",
    contactableMarketing: "Contactable · marketing",
    contactableMarketingHint: "active marketing consent − suppression",
    contactableService: "Contactable · service",
    contactableServiceHint: "active transactional consent − suppression (for CS/ops)",
    workflowActive: "Active workflows",
    workflowActiveHint: "no workflow table yet",
    lastProfile: "Profiles last added",
    lastProfileHint:
      "date of the last batch load (2 loads: 20 Apr & 31 Jul 2026) — not a continuous feed",
    importDob: "Date of birth · import data",
    importDobHint:
      "staging_20fit_data rows have a birth date (master_customer: 0) · ~98.6% matched to a profile (12 Aug 2026)",
    rfmTitle: "RFM spread · 20FIT import data",
    rfmNote:
      'From staging_20fit_data."RFM per paid order". “−” = no bucket (not empty). Stored spelling kept as-is. RFM per revenue 0% filled.',
    rfmNoBucket: "− (no bucket)",
  },

  audience: {
    maskedBadge: "Contacts masked",
    subtitlePre: "A single audience pool — ",
    subtitleMid: " profiles read directly from ",
    subtitlePost: " (read-only).",
    filterListLabel: "Filter the list",
    cityPlaceholder: "Search city…",
    allUnits: "All units",
    allSegments: "All segments",
    noSegment: "(no segment)",
    allRevenue: "All revenue",
    hasPaid: "Has paid",
    notPaid: "Hasn't paid",
    ariaUnit: "Filter by unit",
    ariaSegment: "Filter by segment",
    ariaRevenue: "Filter by revenue",
    thName: "Name",
    thPhone: "Phone",
    thEmail: "Email",
    thCity: "City",
    thUnit: "Unit",
    thSegment: "Segment",
    thLtv: "Lifetime value",
    thCreated: "Created",
    loading: "Loading…",
    failed: "Failed",
    noMatch: "No profiles match these filters.",
    noName: "(no name)",
    empty: "not filled in",
    zeroProfiles: "0 profiles",
    showingPre: "Showing ",
    showingOf: " of ",
    prev: "Previous",
    pageLabel: "Page",
    next: "Next",
    loadFailed: "Failed to load",
    connFailed: "Couldn't reach the server.",
    searchTitle: "Find one person",
    searchFillKeyword: "Enter a search term.",
    searchFailed: "Search failed",
    kindName: "Name",
    kindPhone: "Phone",
    kindEmail: "Email",
    phName: "min. 3 letters of a name…",
    phPhone: "full number (0812…, +62…, 62…)",
    phEmail: "full email address",
    searching: "Searching…",
    searchBtn: "Search",
    resultsSuffix: " results",
    maskedShort: "masked",
    openProfile: "Open profile",
    notFoundName: "Not found. Try a different part of the name.",
    notFoundId: "Not found. Make sure the number/email is complete and correct.",
    warn: {
      searchIntroA:
        "To find someone who just called — then open the profile & record their stop-contact request. Phone & email are matched EXACTLY (the full number/email is required), name by word fragments. This looks up ONE person (recorded as ",
      searchIntroB: ") — different from filtering the list below (",
      searchIntroC: ").",
      tooManyA: "Too many results (more than ",
      tooManyB:
        "). Narrow your keywords — this search deliberately offers no next page. To browse many people, use the filtered list below.",
      bannerTitle: "Data as-is from the legacy system — not yet remediated",
      bannerGender:
        "Gender, date of birth, and address are blank across the whole pool — shown as “not filled in”, never hidden.",
      bannerCity: "Only a small fraction have a city on file. Per-city targeting can't yet be justified.",
      bannerLtv:
        "Almost every lifetime value is zero. “Rp 0” is shown as-is, not masked as though the data were missing.",
      bannerSegment:
        "Segment is inverted. The cohort with no segment (NULL) actually has the highest average LTV — shown as-is, not tidied away.",
      bannerLastActiveA: "“Last active” is deliberately not shown. The column ",
      bannerLastActiveB: " is an import artefact — its date is real, but its meaning is not activity.",
      bannerFooterA: "The exact figures are computed straight from the database on ",
      bannerFooterB: ".",
      footer:
        "Read-only · no export/edit/delete buttons · click a name to open the profile (recorded as profile.viewed) · every list open is recorded (list.viewed) · contacts are masked on the server for the analyst role.",
    },
  },

  export: {
    headers: {
      customer_id: "customer_id",
      full_name: "name",
      email: "email",
      phone: "phone",
      city: "city",
      first_unit: "first_unit",
      segment: "segment",
      lifetime_value: "lifetime_value",
    },
    provTitle: "20FIT CRM — segment export",
    provDate: "date",
    provBy: "by",
    provCriteria: "criteria",
    provFooter:
      "suppression excluded · no NIK / clinical data · row count is on the last line (EOF)",
    provNoCriteria: "whole pool (no criteria)",
    eofTotal: "total_rows",
    auditFailed: "AUDIT_FAILED",
  },

  ai: {
    replyLanguageName: "English",
    timeUnexpressible:
      "Time-based criteria aren't possible: the time columns in this data are load timestamps, not activity (K-19).",
    clinicalBlocked: "A clinical criterion was requested but dropped — it needs profile.view_health.",
    unavailable: "The AI assistant is unavailable right now. Use the manual filters — every criterion is still there.",
  },
};
