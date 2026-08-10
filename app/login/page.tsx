import type { Metadata } from "next";
import { BrandLogo } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { signIn } from "./actions";

export const metadata: Metadata = { title: "Masuk" };

const ERRORS: Record<string, string> = {
  invalid: "Email atau kata sandi salah.",
  missing: "Email dan kata sandi wajib diisi.",
  unavailable:
    "Tidak dapat terhubung ke server autentikasi. Coba lagi sebentar lagi, atau hubungi admin bila berlanjut.",
};

export default function LoginPage({
  searchParams,
}: {
  searchParams: { error?: string; redirectedFrom?: string };
}) {
  const errorMsg = searchParams?.error
    ? (ERRORS[searchParams.error] ?? "Tidak dapat masuk. Coba lagi.")
    : null;
  const redirectedFrom =
    typeof searchParams?.redirectedFrom === "string" ? searchParams.redirectedFrom : "/";

  return (
    // Login uses the dark theme with the white lockup (PRD §18.8).
    <div
      data-theme="dark"
      className="flex min-h-[100dvh] w-full items-center justify-center bg-[linear-gradient(150deg,var(--bg-from)_0%,var(--bg-to)_100%)] px-4 py-10"
    >
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center gap-6 text-center">
          <BrandLogo variant="white" height={40} priority />
          <div>
            <h1 className="font-display text-[32px] font-black uppercase leading-none text-ink">
              Masuk
            </h1>
            <p className="mt-2 font-body text-[14px] text-ink-soft">
              Audience Data &amp; CRM · alat internal 20FIT
            </p>
          </div>
        </div>

        <div className="glass-strong p-6 shadow-glass-lg">
          <form action={signIn} className="flex flex-col gap-4">
            <input type="hidden" name="redirectedFrom" value={redirectedFrom} />

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                required
                placeholder="nama@20fit.id"
                className="font-mono"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="password">Kata sandi</Label>
              <Input id="password" name="password" type="password" autoComplete="current-password" required />
            </div>

            {errorMsg && (
              <p role="alert" className="font-body text-[13px] text-red">
                {errorMsg}
              </p>
            )}

            <Button type="submit" size="lg" className="mt-1 w-full">
              Masuk
            </Button>
          </form>
        </div>

        <p className="mt-6 text-center font-body text-[12px] leading-relaxed text-ink-faint">
          Akun dibuat oleh admin. Tidak ada registrasi mandiri.
        </p>
      </div>
    </div>
  );
}
