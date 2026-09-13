"use client";

import { useState, useCallback, type FormEvent } from "react";
import { UserPlus } from "lucide-react";
import { useI18n } from "@/components/i18n/lang-provider";
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { TAG_NAMESPACES, TAG_NAMESPACE_LABELS } from "@/lib/crm/tags";

interface TagOption {
  slug: string;
  namespace: string;
  label: string | null;
}

export function AddContactDialog() {
  const { t, lang } = useI18n();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<"inserted" | "updated" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [gender, setGender] = useState("");
  const [city, setCity] = useState("");
  const [dob, setDob] = useState("");
  const [bloodType, setBloodType] = useState("");
  const [selectedTags, setSelectedTags] = useState<string[]>([]);

  const [tagOptions, setTagOptions] = useState<TagOption[]>([]);
  const [tagsLoaded, setTagsLoaded] = useState(false);

  const resetForm = useCallback(() => {
    setEmail("");
    setFullName("");
    setPhone("");
    setGender("");
    setCity("");
    setDob("");
    setBloodType("");
    setSelectedTags([]);
    setResult(null);
    setError(null);
  }, []);

  const loadTags = useCallback(async () => {
    if (tagsLoaded) return;
    try {
      const res = await fetch("/api/tags");
      if (res.ok) {
        const json = (await res.json()) as { tags: TagOption[] };
        setTagOptions(json.tags ?? []);
      }
    } catch {
      // tag load failure is not fatal — user can still add contact without tags
    }
    setTagsLoaded(true);
  }, [tagsLoaded]);

  const handleOpenChange = useCallback(
    (nextOpen: boolean) => {
      setOpen(nextOpen);
      if (nextOpen) {
        resetForm();
        loadTags();
      }
    },
    [resetForm, loadTags],
  );

  const toggleTag = useCallback((slug: string) => {
    setSelectedTags((prev) =>
      prev.includes(slug) ? prev.filter((t) => t !== slug) : [...prev, slug],
    );
  }, []);

  const handleSubmit = useCallback(
    async (e: FormEvent) => {
      e.preventDefault();
      setError(null);

      const trimEmail = email.trim();
      const trimName = fullName.trim();
      if (!trimEmail) {
        setError(t.audience.addContactEmailRequired);
        return;
      }
      if (!trimName) {
        setError(t.audience.addContactNameRequired);
        return;
      }

      setLoading(true);
      try {
        const res = await fetch("/api/audience/add-contact", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: trimEmail,
            fullName: trimName,
            phone: phone.trim() || undefined,
            gender: gender || undefined,
            city: city.trim() || undefined,
            dateOfBirth: dob || undefined,
            bloodType: bloodType || undefined,
            tags: selectedTags.length > 0 ? selectedTags : undefined,
          }),
        });
        if (!res.ok) {
          setError(t.audience.addContactFailed);
          return;
        }
        const json = (await res.json()) as { outcome: "inserted" | "updated" };
        setResult(json.outcome);
      } catch {
        setError(t.audience.addContactFailed);
      } finally {
        setLoading(false);
      }
    },
    [email, fullName, phone, gender, city, dob, bloodType, selectedTags, t],
  );

  const nsLabel = (ns: string) => {
    const entry = TAG_NAMESPACE_LABELS[ns as keyof typeof TAG_NAMESPACE_LABELS];
    return entry ? entry[lang as "id" | "en"] : ns;
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <button
          type="button"
          className="inline-flex items-center gap-1.5 rounded-sm border border-glass-border bg-glass px-3 py-1.5 font-body text-[13px] text-ink hover:border-red"
        >
          <UserPlus className="h-4 w-4" aria-hidden />
          {t.audience.addContact}
        </button>
      </DialogTrigger>

      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{t.audience.addContactTitle}</DialogTitle>
          <DialogDescription>{t.audience.addContactDesc}</DialogDescription>
        </DialogHeader>

        {result ? (
          <div className="flex flex-col items-center gap-4 py-6 text-center">
            <p className="font-body text-[14px] text-ink">
              {result === "inserted"
                ? t.audience.addContactInserted
                : t.audience.addContactUpdated}
            </p>
            <Button variant="secondary" onClick={() => setOpen(false)}>
              {t.consent.done}
            </Button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div className="grid gap-3">
              <div>
                <Label htmlFor="ac-email">{t.audience.fldEmail} *</Label>
                <Input
                  id="ac-email"
                  type="email"
                  required
                  placeholder={t.audience.acPhEmail}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>

              <div>
                <Label htmlFor="ac-name">{t.audience.fldName} *</Label>
                <Input
                  id="ac-name"
                  required
                  placeholder={t.audience.acPhName}
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                />
              </div>

              <div>
                <Label htmlFor="ac-phone">{t.audience.fldPhone}</Label>
                <Input
                  id="ac-phone"
                  placeholder={t.audience.acPhPhone}
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="ac-gender">{t.audience.fldGender}</Label>
                  <select
                    id="ac-gender"
                    className="flex h-10 w-full rounded-sm border border-glass-border bg-glass px-3 py-2 font-body text-[13px] text-ink focus:outline-none focus:ring-2 focus:ring-red"
                    value={gender}
                    onChange={(e) => setGender(e.target.value)}
                  >
                    <option value="">{t.audience.selectPlaceholder}</option>
                    <option value="L">{t.audience.genderL}</option>
                    <option value="P">{t.audience.genderP}</option>
                  </select>
                </div>

                <div>
                  <Label htmlFor="ac-blood">{t.audience.fldBloodType}</Label>
                  <select
                    id="ac-blood"
                    className="flex h-10 w-full rounded-sm border border-glass-border bg-glass px-3 py-2 font-body text-[13px] text-ink focus:outline-none focus:ring-2 focus:ring-red"
                    value={bloodType}
                    onChange={(e) => setBloodType(e.target.value)}
                  >
                    <option value="">{t.audience.selectPlaceholder}</option>
                    <option value="A">A</option>
                    <option value="B">B</option>
                    <option value="AB">AB</option>
                    <option value="O">O</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="ac-city">{t.audience.fldCity}</Label>
                  <Input
                    id="ac-city"
                    placeholder={t.audience.acPhCity}
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                  />
                </div>

                <div>
                  <Label htmlFor="ac-dob">{t.audience.fldDob}</Label>
                  <Input
                    id="ac-dob"
                    type="date"
                    value={dob}
                    onChange={(e) => setDob(e.target.value)}
                  />
                </div>
              </div>

              {tagOptions.length > 0 && (
                <div>
                  <Label>{t.audience.fldTags}</Label>
                  <div className="mt-1 max-h-48 space-y-2 overflow-y-auto rounded-sm border border-glass-border bg-glass p-2">
                    {TAG_NAMESPACES.map((ns) => {
                      const nsTags = tagOptions.filter((tg) => tg.namespace === ns);
                      if (nsTags.length === 0) return null;
                      return (
                        <div key={ns}>
                          <p className="font-display text-[11px] font-bold uppercase tracking-wider text-ink-faint">
                            {nsLabel(ns)}
                          </p>
                          <div className="mt-0.5 flex flex-wrap gap-1">
                            {nsTags.map((tg) => {
                              const active = selectedTags.includes(tg.slug);
                              return (
                                <button
                                  key={tg.slug}
                                  type="button"
                                  onClick={() => toggleTag(tg.slug)}
                                  className={`rounded-full border px-2 py-0.5 font-body text-[11px] transition-colors ${
                                    active
                                      ? "border-red bg-red/10 text-red"
                                      : "border-glass-border text-ink-soft hover:border-ink-faint"
                                  }`}
                                >
                                  {tg.label || tg.slug.slice(tg.slug.indexOf(":") + 1).replace(/-/g, " ")}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {error && (
              <p className="font-body text-[13px] text-red">{error}</p>
            )}

            <DialogFooter>
              <Button
                type="button"
                variant="ghost"
                onClick={() => setOpen(false)}
                disabled={loading}
              >
                {t.audience.addContactCancel}
              </Button>
              <Button type="submit" disabled={loading}>
                {loading ? t.audience.addContactSubmitting : t.audience.addContactSubmit}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
