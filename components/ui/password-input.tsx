"use client";

import * as React from "react";
import { Eye, EyeOff } from "lucide-react";
import { Input } from "./input";
import { cn } from "@/lib/utils";

/**
 * Password field with a show/hide toggle (eye icon inside the field, right side).
 *
 * - Default HIDDEN, and visibility is NEVER persisted — a password left visible across sessions is
 *   a shoulder-surf risk. State is local to this instance, so two fields toggle independently.
 * - `showLabel`/`hideLabel` are passed IN (already translated), so this component works both on a
 *   server page (login, no LangProvider) and inside a client form (reset, has one) — it never
 *   reaches for a hook it might not have.
 * - `type` is owned here (password ↔ text). Everything else — `name`, `id`, `autoComplete`, `value`,
 *   `onChange`, `placeholder`, `required` — passes straight through to the inner <input> so password
 *   managers keep matching the field.
 */
export function PasswordInput({
  showLabel,
  hideLabel,
  className,
  ...props
}: Omit<React.InputHTMLAttributes<HTMLInputElement>, "type"> & {
  showLabel: string;
  hideLabel: string;
}) {
  const [visible, setVisible] = React.useState(false);
  return (
    <div className="relative">
      <Input
        {...props}
        type={visible ? "text" : "password"}
        className={cn("pr-10", className)}
      />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? hideLabel : showLabel}
        aria-pressed={visible}
        className="absolute inset-y-0 right-0 flex items-center rounded-sm pr-3 text-ink-faint transition-colors hover:text-ink focus-visible:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red"
      >
        {visible ? <EyeOff className="h-4 w-4" aria-hidden /> : <Eye className="h-4 w-4" aria-hidden />}
      </button>
    </div>
  );
}
