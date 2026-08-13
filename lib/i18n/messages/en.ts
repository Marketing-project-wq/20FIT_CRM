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
