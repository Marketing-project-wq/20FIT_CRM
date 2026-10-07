"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Settings, Plus, Pencil, Trash2, Check, Search, CalendarDays, Users, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { useI18n } from "@/components/i18n/lang-provider";
import { formatCount } from "@/lib/i18n";

interface EventTagStat {
  slug: string;
  label: string;
  count: number;
  assignedEventId: string | null;
  assignedEventName: string | null;
}

interface RegistryEvent {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  eventDate: string | null;
  isActive: boolean;
  tags: string[];
  total: number;
}

interface RegistryView {
  events: RegistryEvent[];
  tags: EventTagStat[];
}

/** Match lib/crm/tags.ts slugifyTagValue so client preview = server result. */
function slugify(raw: string): string {
  return raw.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

type Te = ReturnType<typeof useI18n>["t"]["eventRegistry"];

interface FormState {
  mode: "create" | "edit";
  id?: string;
  name: string;
  slug: string;
  slugEdited: boolean;
  description: string;
  eventDate: string;
  selected: Set<string>;
}

export function EventRegistryManager({ onChanged }: { onChanged?: () => void }) {
  const { lang, t } = useI18n();
  const te = t.eventRegistry;

  const [open, setOpen] = useState(false);
  const [data, setData] = useState<RegistryView | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState<FormState | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<RegistryEvent | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/events/registry");
      if (!res.ok) throw new Error(res.statusText);
      setData(await res.json());
    } catch {
      setError(te.loadFailed);
    } finally {
      setLoading(false);
    }
  }, [te.loadFailed]);

  useEffect(() => {
    if (open && !data) load();
  }, [open, data, load]);

  const refresh = useCallback(() => {
    load();
    onChanged?.();
  }, [load, onChanged]);

  const unassigned = useMemo(
    () => (data?.tags ?? []).filter((tag) => !tag.assignedEventId),
    [data],
  );

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <Settings className="mr-1.5 h-4 w-4" aria-hidden />
        {te.manageButton}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[88vh] max-w-3xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{te.title}</DialogTitle>
            <DialogDescription>{te.subtitle}</DialogDescription>
          </DialogHeader>

          <div className="flex items-center justify-between">
            <Button
              size="sm"
              onClick={() =>
                setForm({
                  mode: "create",
                  name: "",
                  slug: "",
                  slugEdited: false,
                  description: "",
                  eventDate: "",
                  selected: new Set(),
                })
              }
            >
              <Plus className="mr-1 h-4 w-4" aria-hidden /> {te.createButton}
            </Button>
          </div>

          {loading && <p className="py-8 text-center font-body text-[14px] text-ink-soft">{te.loading}</p>}

          {error && (
            <div className="flex flex-col items-center gap-3 py-8">
              <p className="font-body text-[14px] text-red">{error}</p>
              <Button size="sm" variant="outline" onClick={load}>{te.retry}</Button>
            </div>
          )}

          {!loading && !error && data && (
            <div className="flex flex-col gap-4">
              {data.events.length === 0 ? (
                <p className="rounded-card border border-dashed border-surface-border px-4 py-8 text-center font-body text-[13px] text-ink-soft">
                  {te.empty}
                </p>
              ) : (
                data.events.map((ev) => (
                  <EventCard
                    key={ev.id}
                    ev={ev}
                    lang={lang}
                    te={te}
                    onEdit={() =>
                      setForm({
                        mode: "edit",
                        id: ev.id,
                        name: ev.name,
                        slug: ev.slug,
                        slugEdited: true,
                        description: ev.description ?? "",
                        eventDate: ev.eventDate ?? "",
                        selected: new Set(ev.tags),
                      })
                    }
                    onDelete={() => setDeleteTarget(ev)}
                  />
                ))
              )}

              {/* Unassigned tags */}
              <div className="mt-2">
                <h3 className="flex items-center gap-2 font-display text-[13px] font-bold uppercase tracking-wide text-ink-faint">
                  <span className="h-px flex-1 bg-surface-border" aria-hidden />
                  {te.unassignedTitle}
                  <span className="h-px flex-1 bg-surface-border" aria-hidden />
                </h3>
                <p className="mt-2 font-body text-[12px] text-ink-faint">{te.unassignedHint}</p>
                {unassigned.length === 0 ? (
                  <p className="mt-3 font-body text-[13px] text-ink-soft">{te.unassignedEmpty}</p>
                ) : (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {unassigned.map((tag) => (
                      <button
                        key={tag.slug}
                        type="button"
                        onClick={() =>
                          setForm({
                            mode: "create",
                            name: "",
                            slug: "",
                            slugEdited: false,
                            description: "",
                            eventDate: "",
                            selected: new Set([tag.slug]),
                          })
                        }
                        className="group flex items-center gap-2 rounded-full border border-glass-border bg-glass px-3 py-1.5 font-body text-[12px] text-ink transition-colors hover:border-green hover:text-green"
                        title={tag.slug}
                      >
                        <span className="font-mono text-[11px]">{tag.slug}</span>
                        <span className="text-ink-faint group-hover:text-green">
                          ({te.peopleCount.replace("{n}", formatCount(tag.count, lang))})
                        </span>
                        <Plus className="h-3 w-3 opacity-0 transition-opacity group-hover:opacity-100" aria-hidden />
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Create / edit form */}
      {form && data && (
        <EventForm
          form={form}
          setForm={setForm}
          tags={data.tags}
          lang={lang}
          te={te}
          onClose={() => setForm(null)}
          onSaved={() => {
            setForm(null);
            refresh();
          }}
        />
      )}

      {/* Delete confirm */}
      {deleteTarget && (
        <DeleteConfirm
          ev={deleteTarget}
          te={te}
          onClose={() => setDeleteTarget(null)}
          onDeleted={() => {
            setDeleteTarget(null);
            refresh();
          }}
        />
      )}
    </>
  );
}

function EventCard({
  ev,
  lang,
  te,
  onEdit,
  onDelete,
}: {
  ev: RegistryEvent;
  lang: "id" | "en";
  te: Te;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="card p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h4 className="font-display text-[15px] font-bold text-ink">{ev.name}</h4>
            {!ev.isActive && (
              <span className="rounded-full bg-ink-faint/15 px-2 py-0.5 font-body text-[10px] font-semibold text-ink-faint">
                {te.inactiveBadge}
              </span>
            )}
          </div>
          {ev.eventDate && (
            <p className="mt-0.5 flex items-center gap-1 font-body text-[12px] text-ink-soft">
              <CalendarDays className="h-3.5 w-3.5 text-ink-faint" aria-hidden />
              {ev.eventDate}
            </p>
          )}
        </div>
        <div className="flex shrink-0 gap-1">
          <button className="rounded p-1.5 hover:bg-glass" onClick={onEdit} title={te.editButton}>
            <Pencil className="h-4 w-4 text-ink-faint" />
          </button>
          <button className="rounded p-1.5 hover:bg-glass" onClick={onDelete} title={te.deleteButton}>
            <Trash2 className="h-4 w-4 text-red" />
          </button>
        </div>
      </div>

      {ev.description && <p className="mt-2 font-body text-[13px] text-ink-soft">{ev.description}</p>}

      <p className="mt-3 font-display text-[11px] font-semibold uppercase tracking-wide text-ink-faint">
        {te.tagsLabel} ({ev.tags.length})
      </p>
      {ev.tags.length > 0 ? (
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {ev.tags.map((tag) => (
            <span
              key={tag}
              className="rounded-full border border-glass-border bg-surface-2 px-2.5 py-1 font-mono text-[11px] text-ink-soft"
            >
              {tag}
            </span>
          ))}
        </div>
      ) : (
        <p className="mt-1.5 font-body text-[12px] text-ink-faint">—</p>
      )}

      <p className="mt-3 flex items-center gap-1.5 font-body text-[13px] text-ink-soft">
        <Users className="h-4 w-4 text-green" aria-hidden />
        {te.totalParticipants}{" "}
        <span className="font-display font-bold text-green">{formatCount(ev.total, lang)}</span>
      </p>
    </div>
  );
}

function EventForm({
  form,
  setForm,
  tags,
  lang,
  te,
  onClose,
  onSaved,
}: {
  form: FormState;
  setForm: (f: FormState) => void;
  tags: EventTagStat[];
  lang: "id" | "en";
  te: Te;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const displaySlug = form.slugEdited ? form.slug : slugify(form.name);

  const filteredTags = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return tags;
    return tags.filter((tag) => tag.slug.includes(q) || tag.label.toLowerCase().includes(q));
  }, [tags, search]);

  const toggleTag = (slug: string) => {
    const next = new Set(form.selected);
    if (next.has(slug)) next.delete(slug);
    else next.add(slug);
    setForm({ ...form, selected: next });
  };

  async function submit() {
    setErr(null);
    if (!form.name.trim()) {
      setErr(te.errName);
      return;
    }
    setBusy(true);
    try {
      const payload = {
        ...(form.mode === "edit" ? { id: form.id } : {}),
        name: form.name.trim(),
        slug: displaySlug,
        description: form.description.trim() || null,
        event_date: form.eventDate || null,
        tag_slugs: Array.from(form.selected),
      };
      const res = await fetch("/api/events/registry", {
        method: form.mode === "edit" ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        setErr(
          json.error === "duplicate_slug"
            ? te.errDuplicateSlug
            : json.error === "tag_assigned_elsewhere"
              ? te.errTagAssigned
              : json.error === "invalid_date"
                ? te.errDate
                : json.error === "missing_name"
                  ? te.errName
                  : te.errGeneric,
        );
        return;
      }
      onSaved();
    } catch {
      setErr(te.errNetwork);
    } finally {
      setBusy(false);
    }
  }

  const inputCls =
    "h-10 w-full rounded-sm border border-glass-border bg-glass px-3 font-body text-[14px] text-ink placeholder:text-ink-faint focus:border-green focus:outline-none";

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-h-[88vh] max-w-xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{form.mode === "edit" ? te.formEditTitle : te.formCreateTitle}</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <label className="flex flex-col gap-1">
            <span className="font-body text-[12px] font-semibold text-ink">{te.fieldName}</span>
            <input
              type="text"
              className={inputCls}
              placeholder={te.fieldNamePlaceholder}
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              autoFocus
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="font-body text-[12px] font-semibold text-ink">{te.fieldSlug}</span>
            <input
              type="text"
              className={`${inputCls} font-mono text-[13px]`}
              value={displaySlug}
              onChange={(e) => setForm({ ...form, slug: slugify(e.target.value), slugEdited: true })}
            />
            <span className="font-body text-[11px] text-ink-faint">{te.fieldSlugHint}</span>
          </label>

          <div className="flex flex-wrap gap-3">
            <label className="flex flex-1 flex-col gap-1">
              <span className="font-body text-[12px] font-semibold text-ink">{te.fieldDate}</span>
              <input
                type="date"
                className={inputCls}
                value={form.eventDate}
                onChange={(e) => setForm({ ...form, eventDate: e.target.value })}
              />
            </label>
          </div>

          <label className="flex flex-col gap-1">
            <span className="font-body text-[12px] font-semibold text-ink">{te.fieldDescription}</span>
            <textarea
              className={`${inputCls} h-auto py-2`}
              rows={2}
              placeholder={te.fieldDescriptionPlaceholder}
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
          </label>

          {/* Tag multi-select */}
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <span className="font-body text-[12px] font-semibold text-ink">{te.fieldTags}</span>
              <span className="font-body text-[11px] text-ink-faint">
                {te.selectedCount.replace("{n}", String(form.selected.size))}
              </span>
            </div>
            <span className="font-body text-[11px] text-ink-faint">{te.fieldTagsHint}</span>
            <div className="relative mt-1">
              <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-faint" aria-hidden />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={te.tagSearchPlaceholder}
                className={`${inputCls} h-9 pl-8`}
              />
            </div>
            <div className="mt-1 max-h-56 overflow-y-auto rounded-sm border border-glass-border">
              {filteredTags.length === 0 ? (
                <p className="px-3 py-4 text-center font-body text-[12px] text-ink-faint">{te.tagNoResults}</p>
              ) : (
                filteredTags.map((tag) => {
                  const checked = form.selected.has(tag.slug);
                  const lockedElsewhere = !!tag.assignedEventId && tag.assignedEventId !== form.id;
                  return (
                    <button
                      key={tag.slug}
                      type="button"
                      disabled={lockedElsewhere}
                      onClick={() => toggleTag(tag.slug)}
                      className={`flex w-full items-center gap-2 border-b border-glass-border/50 px-3 py-2 text-left font-body text-[13px] last:border-b-0 ${
                        lockedElsewhere ? "cursor-not-allowed opacity-50" : "hover:bg-glass"
                      }`}
                    >
                      <span
                        className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-sm border ${
                          checked ? "border-green bg-green text-white" : "border-glass-border"
                        }`}
                      >
                        {checked && <Check className="h-3 w-3" />}
                      </span>
                      <span className="flex-1 truncate">
                        <span className="font-mono text-[12px] text-ink">{tag.slug}</span>
                      </span>
                      <span className="shrink-0 font-mono text-[11px] text-ink-faint">
                        {te.peopleCount.replace("{n}", formatCount(tag.count, lang))}
                      </span>
                      {lockedElsewhere && (
                        <span className="shrink-0 font-body text-[10px] text-ink-faint">
                          {te.assignedToOther.replace("{event}", tag.assignedEventName ?? "")}
                        </span>
                      )}
                    </button>
                  );
                })
              )}
            </div>
          </div>

          {err && <p className="font-body text-[13px] text-red">{err}</p>}
        </div>

        <DialogFooter>
          <Button variant="ghost" size="sm" onClick={onClose} disabled={busy}>
            {te.cancel}
          </Button>
          <Button size="sm" onClick={submit} disabled={busy || !form.name.trim()}>
            {busy ? te.saving : te.save}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DeleteConfirm({
  ev,
  te,
  onClose,
  onDeleted,
}: {
  ev: RegistryEvent;
  te: Te;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function doDelete() {
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch("/api/events/registry", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: ev.id }),
      });
      if (!res.ok) {
        setErr(te.errGeneric);
        return;
      }
      onDeleted();
    } catch {
      setErr(te.errNetwork);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-red" aria-hidden />
            {te.deleteConfirmTitle}
          </DialogTitle>
          <DialogDescription>{te.deleteConfirmBody.replace("{name}", ev.name)}</DialogDescription>
        </DialogHeader>
        {err && <p className="font-body text-[13px] text-red">{err}</p>}
        <DialogFooter>
          <Button variant="ghost" size="sm" onClick={onClose} disabled={busy}>
            {te.cancel}
          </Button>
          <Button variant="primary" size="sm" onClick={doDelete} disabled={busy}>
            {busy ? te.deleting : te.deleteConfirmButton}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
