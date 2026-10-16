/**
 * Business-unit identities for flow emails. Logos are the official 20FIT sub-brand lockups (media.20fit.id
 * library), trimmed + resized to 2× display height and hosted in the CRM's public `brand-assets` bucket
 * under email/. Contacts are the ones each unit publishes on its own site (checked 16 Oct 2026).
 * Colors follow the unit's existing campaigns (Arena dark + lime, Clinic navy + teal, Event black + red).
 */

const ASSET = "https://cpvzwqptzcxnwzfzgrmt.supabase.co/storage/v1/object/public/brand-assets/email";

export type BrandKey = "group" | "event" | "photo" | "clinic" | "arena" | "shop" | "app" | "media" | "academy";

export interface Brand {
  key: BrandKey;
  label: string;          // shown in the builder
  senderName: string;     // email From display name
  logo: { url: string; width: number; height: number; alt: string };
  headerBg: string;       // band behind the logo
  headerLine: string;     // thin accent line under the header
  kicker: string;         // small caps label above the headline
  accent: string;         // CTA background, links, promo border
  accentText: string;     // CTA text color
  ink: string;
  muted: string;
  pageBg: string;
  location?: string;
  whatsapp?: { label: string; href: string };
  instagram?: { handle: string; href: string };
  email?: string;
  web: { label: string; href: string };
  reason: string;         // "Kamu menerima email ini karena …"
}

const logo = (file: string, w: number, h: number, alt: string, displayH: number) => ({
  url: `${ASSET}/${file}`,
  height: displayH,
  width: Math.round((w * displayH) / h),
  alt,
});

const GROUP_FOOTER = "20FIT Group · Jl. Sinabung No. 9, Kebayoran Baru, Jakarta Selatan 12120";

export const BRANDS: Record<BrandKey, Brand> = {
  group: {
    key: "group", label: "20FIT Group", senderName: "20FIT",
    logo: logo("logo-20fit-dark.png", 281, 72, "20FIT", 32),
    headerBg: "#ffffff", headerLine: "#e4002b", kicker: "20FIT", accent: "#e4002b", accentText: "#ffffff",
    ink: "#1d1d1f", muted: "#6e6e73", pageBg: "#f4f4f5",
    whatsapp: { label: "+62 811-1182-0905", href: "https://wa.me/628111820905" },
    instagram: { handle: "@20fitid", href: "https://instagram.com/20fitid" },
    email: "info@20fit.id",
    web: { label: "20fit.id", href: "https://20fit.id" },
    reason: "kamu bagian dari komunitas 20FIT",
  },
  event: {
    key: "event", label: "20FIT Event (Ticket)", senderName: "20FIT Event",
    logo: logo("logo-event-white.png", 597, 72, "20FIT Event", 30),
    headerBg: "#0b0b0b", headerLine: "#e4002b", kicker: "20FIT EVENT", accent: "#e4002b", accentText: "#ffffff",
    ink: "#141414", muted: "#6b6b67", pageBg: "#f2f0eb",
    whatsapp: { label: "+62 823-1624-1507", href: "https://wa.me/6282316241507" },
    instagram: { handle: "@20fit.id", href: "https://instagram.com/20fit.id" },
    web: { label: "ticket.20fit.id", href: "https://ticket.20fit.id" },
    reason: "kamu terdaftar sebagai peserta event 20FIT",
  },
  photo: {
    key: "photo", label: "20FIT Photo", senderName: "20FIT Photo",
    logo: logo("logo-photo-dark.png", 486, 64, "20FIT Photo", 28),
    headerBg: "#ffffff", headerLine: "#e4002b", kicker: "20FIT PHOTO", accent: "#e4002b", accentText: "#ffffff",
    ink: "#141414", muted: "#6b6b67", pageBg: "#f2f0eb",
    whatsapp: { label: "+62 823-1624-1507", href: "https://wa.me/6282316241507" },
    instagram: { handle: "@20fit.id", href: "https://instagram.com/20fit.id" },
    web: { label: "photo.20fit.id", href: "https://photo.20fit.id" },
    reason: "kamu peserta atau pembeli foto event 20FIT",
  },
  clinic: {
    key: "clinic", label: "20FIT Sports Clinic", senderName: "20FIT Sports Clinic",
    logo: logo("logo-clinic-white.png", 377, 88, "20FIT Sports Clinic", 40),
    headerBg: "#07384a", headerLine: "#1fa9c6", kicker: "20FIT SPORTS CLINIC", accent: "#127e9a", accentText: "#ffffff",
    ink: "#07384a", muted: "#3d6573", pageBg: "#eef9fc",
    location: "Jl. Sinabung No. 9, Kebayoran Baru, Jakarta Selatan",
    whatsapp: { label: "+62 811-1185-9109", href: "https://wa.me/6281111859109" },
    instagram: { handle: "@20fitsportsclinic", href: "https://instagram.com/20fitsportsclinic" },
    web: { label: "clinic.20fit.id", href: "https://clinic.20fit.id" },
    reason: "kamu bagian dari komunitas 20FIT",
  },
  arena: {
    key: "arena", label: "20FIT Arena", senderName: "20FIT Arena",
    logo: logo("logo-arena-white.png", 553, 64, "20FIT Arena", 30),
    headerBg: "#0b0b0b", headerLine: "#dfff3a", kicker: "20FIT ARENA", accent: "#0b0b0b", accentText: "#dfff3a",
    ink: "#141414", muted: "#6b6b67", pageBg: "#f2f0eb",
    location: "Jl. Pegangsaan Timur No. 15A, Menteng, Jakarta Pusat",
    whatsapp: { label: "+62 821-1518-204", href: "https://wa.me/628211518204" },
    instagram: { handle: "@20fit.arena", href: "https://instagram.com/20fit.arena" },
    web: { label: "booking.20fit.id", href: "https://booking.20fit.id" },
    reason: "kamu bagian dari komunitas 20FIT Arena",
  },
  shop: {
    key: "shop", label: "20FIT Shop", senderName: "20FIT Shop",
    logo: logo("logo-shop-dark.png", 546, 72, "20FIT Shop", 30),
    headerBg: "#ffffff", headerLine: "#e4002b", kicker: "20FIT SHOP", accent: "#e4002b", accentText: "#ffffff",
    ink: "#1d1d1f", muted: "#6e6e73", pageBg: "#f4f4f5",
    whatsapp: { label: "+62 852-1955-3765", href: "https://wa.me/6285219553765" },
    instagram: { handle: "@20fit.shop", href: "https://instagram.com/20fit.shop" },
    web: { label: "shop.20fit.id", href: "https://shop.20fit.id" },
    reason: "kamu bagian dari komunitas 20FIT",
  },
  app: {
    key: "app", label: "20FIT App", senderName: "20FIT App",
    logo: logo("logo-20fit-dark.png", 281, 72, "20FIT", 32),
    headerBg: "#ffffff", headerLine: "#e4002b", kicker: "20FIT APP", accent: "#e4002b", accentText: "#ffffff",
    ink: "#1d1d1f", muted: "#6e6e73", pageBg: "#f4f4f5",
    email: "info@20fit.id",
    instagram: { handle: "@20fitid", href: "https://instagram.com/20fitid" },
    web: { label: "my.20fit.id", href: "https://my.20fit.id" },
    reason: "kamu punya akun atau pernah bertransaksi di 20FIT",
  },
  media: {
    key: "media", label: "20FIT Media", senderName: "20FIT Media",
    logo: logo("logo-20fit-dark.png", 281, 72, "20FIT", 32),
    headerBg: "#ffffff", headerLine: "#1d1d1f", kicker: "20FIT MEDIA", accent: "#1d1d1f", accentText: "#ffffff",
    ink: "#1d1d1f", muted: "#6e6e73", pageBg: "#f4f4f5",
    email: "info@20fit.id",
    instagram: { handle: "@20fitid", href: "https://instagram.com/20fitid" },
    web: { label: "media.20fit.id", href: "https://media.20fit.id" },
    reason: "kamu bagian dari komunitas 20FIT",
  },
  academy: {
    key: "academy", label: "20FIT Academy", senderName: "20FIT Academy",
    logo: logo("logo-20fit-white.png", 283, 72, "20FIT", 30),
    headerBg: "#0b0b0b", headerLine: "#e4002b", kicker: "20FIT ACADEMY", accent: "#e4002b", accentText: "#ffffff",
    ink: "#141414", muted: "#6b6b67", pageBg: "#f2f0eb",
    whatsapp: { label: "+62 823-1624-1507", href: "https://wa.me/6282316241507" },
    email: "academy@20fit.id",
    web: { label: "20FIT Academy", href: "https://academy-production-7cf1.up.railway.app" },
    reason: "kamu bagian dari komunitas 20FIT",
  },
};

export const GROUP_ADDRESS = GROUP_FOOTER;

/** Ecosystem row in every footer — the "benang merah": each unit one tap away. */
export const ECOSYSTEM: { label: string; icon: string; href: string }[] = [
  { label: "Event", icon: `${ASSET}/icon-event.png`, href: "https://ticket.20fit.id" },
  { label: "Photo", icon: `${ASSET}/icon-photo.png`, href: "https://photo.20fit.id" },
  { label: "Arena", icon: `${ASSET}/icon-arena.png`, href: "https://booking.20fit.id" },
  { label: "Clinic", icon: `${ASSET}/icon-clinic.png`, href: "https://clinic.20fit.id" },
  { label: "App", icon: `${ASSET}/icon-app.png`, href: "https://my.20fit.id" },
  { label: "Media", icon: `${ASSET}/icon-media.png`, href: "https://media.20fit.id" },
];

/** Which unit an email speaks for: explicit node.brand wins, else the CTA's destination decides. */
export function detectBrand(explicit: unknown, ctaUrl: unknown): Brand {
  if (typeof explicit === "string" && explicit in BRANDS) return BRANDS[explicit as BrandKey];
  let host = "";
  let path = "";
  try {
    const u = new URL(String(ctaUrl ?? ""));
    host = u.hostname;
    path = u.pathname;
  } catch {
    return BRANDS.group;
  }
  if (host === "booking.20fit.id") return path.startsWith("/clinic") ? BRANDS.clinic : BRANDS.arena;
  if (host === "clinic.20fit.id") return BRANDS.clinic;
  if (host === "arena.20fit.id") return BRANDS.arena;
  if (host === "ticket.20fit.id") return BRANDS.event;
  if (host === "photo.20fit.id") return BRANDS.photo;
  if (host === "shop.20fit.id") return BRANDS.shop;
  if (host === "media.20fit.id") return BRANDS.media;
  if (["my.20fit.id", "medicalscanner.20fit.id", "calorietracker.20fit.id", "recipe.20fit.id", "workout.20fit.id"].includes(host)) return BRANDS.app;
  if (host.startsWith("academy")) return BRANDS.academy;
  return BRANDS.group;
}
