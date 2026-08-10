# Brand assets — `/public/brand`

These files back the `BrandLogo` component (`components/brand/logo.tsx`) and the
app favicon (`app/icon.svg`).

## ⚠️ The logo files here are generated PLACEHOLDERS

The official raster lockups were **not supplied** with Sprint 1. What ships here
was generated so the build renders and the layout is correct — the wordmark uses
a fallback bold sans-serif, **not** Barlow Condensed, and the counter-dot red is
approximate.

### To install the official assets

Drop the design exports over these files, keeping the **exact same filenames** —
no code change needed:

| File | Surface | Source (per PRD §18.1) |
|------|---------|------------------------|
| `20fit-logo-white.png` | Dark: sidebar, login, dark email | `new-logo-20fit.png` (trimmed) |
| `20fit-logo-color.png` | Light: light-theme header, PDF/CSV letterhead, light email | `20FITcolor.png` (trimmed) |

If the official aspect ratio differs from the placeholder (840×264), update
`INTRINSIC` in `components/brand/logo.tsx`.

### Still "TO PRODUCE" by design (PRD §18.1) — not shipped here

- `favicon.ico` — 32×32 / 16×16 from the counter-dot. (`app/icon.svg` is a stand-in.)
- `apple-touch-icon.png` — 180×180, red dot on `#0B0B0D`.
- `og-image.png` — 1200×630 social/preview card. Low priority (internal tool).

## Usage rules (PRD §18.1)

- Never recolour the wordmark. Only the two approved lockups are valid.
- Clear space on all sides ≥ the height of the counter-dot.
- Minimum on-screen width **96px**.
- Never place the white lockup on mid-tone glass — the dark ring around the dot
  needs a genuinely dark backdrop to disappear cleanly.

## Known issue — logo red ≠ token red (PRD §18.1, flagged for design)

Pixel sampling of the official files gives `#C02626` (colour lockup) and
`#BF0000` (white lockup); the UI `--red` token is `#E4002B`. These are three
different reds. Until design confirms, the CRM uses `#E4002B` for **all UI
accent** and ships the logo files **as-is** — the PNGs are never recoloured in
code or via CSS filters.
