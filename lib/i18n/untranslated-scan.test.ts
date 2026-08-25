import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { BILINGUAL_SCREENS } from "./coverage";
import { SCREEN_FILES, scanIndonesian, type Violation } from "./untranslated-scan";

/**
 * GUARD: a screen in BILINGUAL_SCREENS must not render hard-coded Indonesian text. Its component
 * files are scanned for common Indonesian words; any hit fails. This makes the PENDING→BILINGUAL
 * flip provable instead of trusted (see untranslated-scan.ts header).
 */

const ROOT = process.cwd();

function scanScreen(screen: string): Violation[] {
  const files = SCREEN_FILES[screen as keyof typeof SCREEN_FILES] ?? [];
  const out: Violation[] = [];
  for (const f of files) {
    const abs = join(ROOT, f);
    if (!existsSync(abs)) continue;
    out.push(...scanIndonesian(readFileSync(abs, "utf8"), f));
  }
  return out;
}

describe("no untranslated Indonesian in bilingual screens", () => {
  it("every BILINGUAL screen has a (non-empty, existing) file list", () => {
    for (const screen of Array.from(BILINGUAL_SCREENS)) {
      const files = SCREEN_FILES[screen] ?? [];
      expect(files.length, `${screen}: add its component files to SCREEN_FILES`).toBeGreaterThan(0);
      for (const f of files) {
        expect(existsSync(join(ROOT, f)), `${screen}: missing file ${f}`).toBe(true);
      }
    }
  });

  for (const screen of Array.from(BILINGUAL_SCREENS)) {
    it(`${screen} renders no hard-coded Indonesian`, () => {
      const v = scanScreen(screen);
      expect(
        v,
        v.length
          ? `Untranslated Indonesian in ${screen} (route each through the dictionary):\n` +
              v.map((x) => `  ${x.file}:${x.line}  [${x.word}]  ${x.text}`).join("\n")
          : "",
      ).toEqual([]);
    });
  }

  // ── The guard BITES — proven on synthetic input (permanent proof it isn't inert). ──
  it("flags a hard-coded Indonesian string", () => {
    const bad = `export function X() { return <p>Profil tidak ditemukan</p>; }`;
    const v = scanIndonesian(bad, "x.tsx");
    expect(v.length).toBeGreaterThan(0);
    // First whole-word match on the line ("Profil"); both are Indonesian words.
    expect(["profil", "tidak", "ditemukan"]).toContain(v[0].word);
  });

  it("flags an Indonesian word even mid-sentence (e.g. a `belum ada` empty-state)", () => {
    expect(scanIndonesian(`return <span>belum terisi</span>;`, "x.tsx").length).toBeGreaterThan(0);
  });

  it("does NOT flag comment-only Indonesian (comments may be Indonesian by design)", () => {
    const ok = `// Profil tidak ditemukan — ini komentar\nexport const N = 1;`;
    expect(scanIndonesian(ok, "x.ts")).toEqual([]);
  });

  it("does NOT flag English code / classNames / column names", () => {
    const ok = `const x = "live_txn_ingest"; return <div className="text-ink-soft">{t.profile.notFound}</div>;`;
    expect(scanIndonesian(ok, "x.tsx")).toEqual([]);
  });
});
