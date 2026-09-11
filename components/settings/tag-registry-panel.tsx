"use client";

import { useCallback, useEffect, useState } from "react";
import { Plus, Pencil, Trash2, X, Check, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useI18n } from "@/components/i18n/lang-provider";
import { TAG_NAMESPACES, namespaceLabel, tagValueLabel } from "@/lib/crm/tags";

interface TagRow {
  id: number;
  slug: string;
  namespace: string;
  label: string | null;
  show_in_event_spread: boolean;
  created_at: string;
  updated_at: string;
}

const inputCls =
  "h-9 rounded-sm border border-glass-border bg-glass px-3 font-body text-[14px] text-ink focus:outline-none focus:ring-2 focus:ring-red";

export function TagRegistryPanel() {
  const { lang, t } = useI18n();
  const s = t.tagRegistryPage;
  const [tags, setTags] = useState<TagRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filterNs, setFilterNs] = useState<string>("all");
  const [search, setSearch] = useState("");

  const [adding, setAdding] = useState(false);
  const [newSlug, setNewSlug] = useState("");
  const [newLabel, setNewLabel] = useState("");
  const [newSpread, setNewSpread] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const [addBusy, setAddBusy] = useState(false);

  const [editId, setEditId] = useState<number | null>(null);
  const [editLabel, setEditLabel] = useState("");
  const [editSpread, setEditSpread] = useState(false);
  const [editBusy, setEditBusy] = useState(false);

  const fetchTags = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/tags");
      if (!res.ok) throw new Error(res.statusText);
      const json = await res.json();
      setTags(json.tags ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "unknown");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchTags(); }, [fetchTags]);

  const filtered = tags.filter((tag) => {
    if (filterNs !== "all" && tag.namespace !== filterNs) return false;
    if (search) {
      const q = search.toLowerCase();
      return tag.slug.includes(q) || (tag.label ?? "").toLowerCase().includes(q);
    }
    return true;
  });

  async function handleAdd() {
    setAddError(null);
    setAddBusy(true);
    try {
      const res = await fetch("/api/tags", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug: newSlug.trim().toLowerCase(), label: newLabel.trim() || undefined, show_in_event_spread: newSpread }),
      });
      const json = await res.json();
      if (!res.ok) {
        setAddError(json.error === "duplicate" ? s.errDuplicate : json.error === "invalid_slug" ? s.errInvalidSlug : json.error);
        return;
      }
      setTags((prev) => [...prev, json.tag].sort((a, b) => a.slug.localeCompare(b.slug)));
      setAdding(false);
      setNewSlug("");
      setNewLabel("");
      setNewSpread(false);
    } catch {
      setAddError(s.errNetwork);
    } finally {
      setAddBusy(false);
    }
  }

  function startEdit(tag: TagRow) {
    setEditId(tag.id);
    setEditLabel(tag.label ?? "");
    setEditSpread(tag.show_in_event_spread);
  }

  async function saveEdit() {
    if (editId === null) return;
    setEditBusy(true);
    try {
      const res = await fetch("/api/tags", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: editId, label: editLabel.trim() || null, show_in_event_spread: editSpread }),
      });
      if (!res.ok) return;
      const json = await res.json();
      setTags((prev) => prev.map((t) => (t.id === editId ? json.tag : t)));
      setEditId(null);
    } finally {
      setEditBusy(false);
    }
  }

  async function handleDelete(id: number) {
    const res = await fetch("/api/tags", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    if (res.ok) setTags((prev) => prev.filter((t) => t.id !== id));
  }

  const namespaceCounts = tags.reduce<Record<string, number>>((acc, t) => {
    acc[t.namespace] = (acc[t.namespace] ?? 0) + 1;
    return acc;
  }, {});

  if (loading) return <p className="font-body text-[14px] text-ink-soft">{s.loading}</p>;
  if (error) return (
    <div className="flex flex-col items-center gap-3 py-12">
      <p className="font-body text-[14px] text-red">{s.loadFailed}</p>
      <Button size="sm" onClick={fetchTags}>{s.retry}</Button>
    </div>
  );

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h2 className="font-display text-[14px] font-bold uppercase tracking-wide text-ink">{s.title}</h2>
        <p className="mt-1 max-w-2xl font-body text-[13px] leading-relaxed text-ink-soft">{s.intro}</p>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint" />
          <input
            type="text"
            placeholder={s.searchPlaceholder}
            className={`${inputCls} w-56 pl-9`}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <select
          className={`${inputCls} w-44`}
          value={filterNs}
          onChange={(e) => setFilterNs(e.target.value)}
        >
          <option value="all">{s.allNamespaces} ({tags.length})</option>
          {(TAG_NAMESPACES as readonly string[]).map((ns) => (
            <option key={ns} value={ns}>{namespaceLabel(ns, lang)} ({namespaceCounts[ns] ?? 0})</option>
          ))}
        </select>
        <Button size="sm" onClick={() => { setAdding(true); setAddError(null); }}>
          <Plus className="mr-1 h-4 w-4" /> {s.addTag}
        </Button>
      </div>

      {/* Add form */}
      {adding && (
        <div className="glass-strong flex flex-col gap-3 rounded-card p-4">
          <p className="font-display text-[12px] font-bold uppercase tracking-wide text-ink">{s.addTitle}</p>
          <div className="flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-1">
              <span className="font-body text-[12px] font-semibold text-ink">{s.slugLabel}</span>
              <input
                type="text"
                className={`${inputCls} w-64`}
                placeholder="event:my-event"
                value={newSlug}
                onChange={(e) => { setNewSlug(e.target.value); setAddError(null); }}
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="font-body text-[12px] font-semibold text-ink">{s.labelField}</span>
              <input
                type="text"
                className={`${inputCls} w-48`}
                placeholder={s.labelPlaceholder}
                value={newLabel}
                onChange={(e) => setNewLabel(e.target.value)}
              />
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={newSpread} onChange={(e) => setNewSpread(e.target.checked)} />
              <span className="font-body text-[12px] text-ink">{s.showInChart}</span>
            </label>
          </div>
          <p className="font-body text-[11px] text-ink-faint">{s.slugHint}</p>
          {addError && <p className="font-body text-[13px] text-red">{addError}</p>}
          <div className="flex gap-2">
            <Button size="sm" onClick={handleAdd} disabled={addBusy || !newSlug.trim()}>
              {addBusy ? s.saving : s.save}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setAdding(false)}>
              <X className="mr-1 h-3 w-3" /> {s.cancel}
            </Button>
          </div>
        </div>
      )}

      {/* Tag table */}
      <div className="overflow-x-auto">
        <table className="w-full text-left font-body text-[13px]">
          <thead>
            <tr className="border-b border-glass-border text-[11px] font-bold uppercase tracking-wide text-ink-faint">
              <th className="px-3 py-2">{s.colSlug}</th>
              <th className="px-3 py-2">{s.colNamespace}</th>
              <th className="px-3 py-2">{s.colLabel}</th>
              <th className="px-3 py-2">{s.colChart}</th>
              <th className="px-3 py-2">{s.colActions}</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr><td colSpan={5} className="px-3 py-8 text-center text-ink-faint">{s.empty}</td></tr>
            )}
            {filtered.map((tag) => (
              <tr key={tag.id} className="border-b border-glass-border/50 hover:bg-glass/30">
                {editId === tag.id ? (
                  <>
                    <td className="px-3 py-2 font-mono text-[12px]">{tag.slug}</td>
                    <td className="px-3 py-2">
                      <Badge tone="neutral">{namespaceLabel(tag.namespace, lang)}</Badge>
                    </td>
                    <td className="px-3 py-2">
                      <input
                        type="text"
                        className={`${inputCls} w-40`}
                        value={editLabel}
                        onChange={(e) => setEditLabel(e.target.value)}
                        placeholder={tagValueLabel(tag.slug, lang)}
                      />
                    </td>
                    <td className="px-3 py-2">
                      <input type="checkbox" checked={editSpread} onChange={(e) => setEditSpread(e.target.checked)} />
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex gap-1">
                        <button className="rounded p-1 hover:bg-glass" onClick={saveEdit} disabled={editBusy} title={s.save}>
                          <Check className="h-4 w-4 text-green" />
                        </button>
                        <button className="rounded p-1 hover:bg-glass" onClick={() => setEditId(null)} title={s.cancel}>
                          <X className="h-4 w-4 text-ink-faint" />
                        </button>
                      </div>
                    </td>
                  </>
                ) : (
                  <>
                    <td className="px-3 py-2 font-mono text-[12px]">{tag.slug}</td>
                    <td className="px-3 py-2">
                      <Badge tone="neutral">{namespaceLabel(tag.namespace, lang)}</Badge>
                    </td>
                    <td className="px-3 py-2 text-ink-soft">
                      {tag.label || <span className="text-ink-faint">{tagValueLabel(tag.slug, lang)}</span>}
                    </td>
                    <td className="px-3 py-2">
                      {tag.show_in_event_spread && <Badge tone="green">{s.chartBadge}</Badge>}
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex gap-1">
                        <button className="rounded p-1 hover:bg-glass" onClick={() => startEdit(tag)} title={s.edit}>
                          <Pencil className="h-3.5 w-3.5 text-ink-faint" />
                        </button>
                        <button className="rounded p-1 hover:bg-glass" onClick={() => handleDelete(tag.id)} title={s.delete}>
                          <Trash2 className="h-3.5 w-3.5 text-red" />
                        </button>
                      </div>
                    </td>
                  </>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="font-body text-[12px] leading-relaxed text-ink-faint">{s.footer}</p>
    </div>
  );
}
