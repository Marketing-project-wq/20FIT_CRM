import { describe, it, expect } from "vitest";
import { isPublicPath, bouncesAuthenticated } from "./middleware";

describe("isPublicPath — the no-session allowlist (Sprint 3T)", () => {
  it("allows login + the password-recovery pages without a session", () => {
    for (const p of ["/login", "/login/callback", "/forgot-password", "/reset-password"]) {
      expect(isPublicPath(p)).toBe(true);
    }
  });
  it("allows the public self-service unsubscribe page + its API (link recipients have no session)", () => {
    expect(isPublicPath("/unsubscribe")).toBe(true);
    expect(isPublicPath("/api/unsubscribe")).toBe(true);
    expect(isPublicPath("/api/mailtrap/webhook")).toBe(true);
  });
  it("does NOT make protected pages public", () => {
    for (const p of ["/", "/audience", "/quality", "/settings", "/segments", "/consent"]) {
      expect(isPublicPath(p)).toBe(false);
    }
  });
});

describe("bouncesAuthenticated — signed-in users off request pages, NOT off the reset landing", () => {
  it("bounces /login and /forgot-password", () => {
    expect(bouncesAuthenticated("/login")).toBe(true);
    expect(bouncesAuthenticated("/forgot-password")).toBe(true);
  });
  it("does NOT bounce /unsubscribe (a signed-in staffer may open a link; must not be redirected)", () => {
    expect(bouncesAuthenticated("/unsubscribe")).toBe(false);
  });
  it("does NOT bounce /reset-password (verifyOtp creates a temp session)", () => {
    // Bouncing it would break the reset itself — the single easiest trap in this flow.
    expect(bouncesAuthenticated("/reset-password")).toBe(false);
  });
  it("does not bounce protected pages", () => {
    expect(bouncesAuthenticated("/audience")).toBe(false);
  });
});
