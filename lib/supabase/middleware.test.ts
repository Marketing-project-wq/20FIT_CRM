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
  it("allows the scheduled-send cron executor (pg_cron POST, x-cron-secret header is the auth)", () => {
    // Before this, the gate redirected the cron POST to /login and scheduled sends never ran (T-40 #8).
    expect(isPublicPath("/api/campaigns/run-scheduled")).toBe(true);
  });
  it("allows the Agent Mail MCP endpoint (signed agent token in the Authorization header is the auth)", () => {
    expect(isPublicPath("/api/mcp")).toBe(true);
    expect(isPublicPath("/api/mcp/am1.abc.def")).toBe(true); // token-in-URL twin (claude.ai connector)
    expect(isPublicPath("/api/mcp/a/b")).toBe(false);
    expect(isPublicPath("/api/mcpx")).toBe(false);
    expect(isPublicPath("/api/partnership/webhooks/waha")).toBe(true); // secret header checked in the route
    expect(isPublicPath("/api/partnership/webhooks/waha/x")).toBe(false);
    expect(isPublicPath("/api/partnership/google/callback")).toBe(false); // needs the signed-in user
    expect(isPublicPath("/partnership")).toBe(false);
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
