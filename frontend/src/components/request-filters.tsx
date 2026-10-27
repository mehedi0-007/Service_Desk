"use client";

import { Search, X } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CATEGORY_LABELS, PRIORITY_LABELS, STATUS_LABELS } from "@/lib/format";
import {
  REQUEST_CATEGORIES,
  REQUEST_PRIORITIES,
  REQUEST_STATUSES,
  type RequestListQuery,
  type RequestStatus,
} from "@/lib/types";

const SORTS = {
  newest: { label: "Newest", sortBy: "createdAt", sortOrder: "desc" },
  oldest: { label: "Oldest", sortBy: "createdAt", sortOrder: "asc" },
  priority: { label: "Priority", sortBy: "priority", sortOrder: "desc" },
  updated: { label: "Recently updated", sortBy: "updatedAt", sortOrder: "desc" },
} as const;
type SortKey = keyof typeof SORTS;

const ALL = "all";
const PAGE_SIZE = 20;

const pick = <T extends string>(allowed: readonly T[], value: string | null) =>
  allowed.includes(value as T) ? (value as T) : undefined;

/**
 * Filters live in the URL query string, so they survive a refresh and can be shared.
 * Returns the API query built from the URL and a function to change it.
 */
export function useRequestFilters() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const statuses = (params.get("status") ?? "")
    .split(",")
    .filter((s): s is RequestStatus => REQUEST_STATUSES.includes(s as RequestStatus));
  const sortKey = pick(Object.keys(SORTS) as SortKey[], params.get("sort")) ?? "newest";
  const { sortBy, sortOrder } = SORTS[sortKey];

  const query: RequestListQuery = {
    q: params.get("q")?.trim() || undefined,
    status: statuses.length ? statuses : undefined,
    priority: (() => {
      const priority = pick(REQUEST_PRIORITIES, params.get("priority"));
      return priority ? [priority] : undefined;
    })(),
    category: pick(REQUEST_CATEGORIES, params.get("category")),
    sortBy,
    sortOrder,
    page: Math.max(1, Number(params.get("page")) || 1),
    pageSize: PAGE_SIZE,
  };

  /** Applies changes; any change other than the page goes back to page 1. */
  const update = (changes: Record<string, string | undefined>) => {
    const next = new URLSearchParams(params.toString());
    for (const [key, value] of Object.entries(changes)) {
      if (value) next.set(key, value);
      else next.delete(key);
    }
    if (!("page" in changes)) next.delete("page");
    const search = next.toString();
    router.replace(search ? `${pathname}?${search}` : pathname, { scroll: false });
  };

  const clear = () => router.replace(pathname, { scroll: false });

  return { query, sortKey, rawQ: params.get("q") ?? "", update, clear };
}

export function RequestFilters({
  filters,
}: {
  filters: ReturnType<typeof useRequestFilters>;
}) {
  const { query, sortKey, rawQ, update, clear } = filters;
  const [search, setSearch] = useState(rawQ);

  // Debounce typing so every keystroke doesn't hit the API.
  useEffect(() => {
    if (search === rawQ) return;
    // Keep the raw text (trailing spaces included) so the box doesn't change while typing;
    // the API query is trimmed.
    const timer = setTimeout(() => update({ q: search || undefined }), 400);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only react to typing
  }, [search]);

  // Keep the box in sync when the URL changes elsewhere (Clear, back button).
  useEffect(() => setSearch(rawQ), [rawQ]);

  const toggleStatus = (status: RequestStatus, checked: boolean) => {
    const current = query.status ?? [];
    const next = checked ? [...current, status] : current.filter((s) => s !== status);
    update({ status: next.join(",") || undefined });
  };

  const hasFilters =
    !!rawQ || !!query.status || !!query.priority || !!query.category || sortKey !== "newest";

  return (
    <div className="space-y-4 rounded-xl border bg-background p-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="relative sm:col-span-2 lg:col-span-1">
          <Label htmlFor="search" className="sr-only">
            Search
          </Label>
          <Search
            className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            id="search"
            type="search"
            placeholder="Search title, description or SR-…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            maxLength={100}
            className="pl-8"
          />
        </div>
        <FilterSelect
          label="Priority"
          allLabel="All priorities"
          value={query.priority?.[0]}
          options={REQUEST_PRIORITIES.map((p) => ({ value: p, label: PRIORITY_LABELS[p] }))}
          onChange={(priority) => update({ priority })}
        />
        <FilterSelect
          label="Category"
          allLabel="All categories"
          value={query.category}
          options={REQUEST_CATEGORIES.map((c) => ({ value: c, label: CATEGORY_LABELS[c] }))}
          onChange={(category) => update({ category })}
        />
        <Select
          value={sortKey}
          onValueChange={(sort) => update({ sort: sort === "newest" ? undefined : sort })}
        >
          <SelectTrigger aria-label="Sort" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(SORTS).map(([key, sort]) => (
              <SelectItem key={key} value={key}>
                Sort: {sort.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <fieldset className="flex flex-wrap gap-x-4 gap-y-2">
          <legend className="sr-only">Status</legend>
          {REQUEST_STATUSES.map((status) => (
            <div key={status} className="flex items-center gap-2">
              <Checkbox
                id={`status-${status}`}
                checked={query.status?.includes(status) ?? false}
                onCheckedChange={(checked) => toggleStatus(status, checked === true)}
              />
              <Label htmlFor={`status-${status}`} className="font-normal">
                {STATUS_LABELS[status]}
              </Label>
            </div>
          ))}
        </fieldset>
        {hasFilters && (
          <Button variant="ghost" size="sm" onClick={clear}>
            <X aria-hidden />
            Clear
          </Button>
        )}
      </div>
    </div>
  );
}

function FilterSelect<T extends string>({
  label,
  allLabel,
  value,
  options,
  onChange,
}: {
  label: string;
  allLabel: string;
  value: T | undefined;
  options: { value: T; label: string }[];
  onChange: (value: T | undefined) => void;
}) {
  return (
    <Select
      value={value ?? ALL}
      onValueChange={(next) => onChange(next === ALL ? undefined : (next as T))}
    >
      <SelectTrigger aria-label={label} className="w-full">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ALL}>{allLabel}</SelectItem>
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
