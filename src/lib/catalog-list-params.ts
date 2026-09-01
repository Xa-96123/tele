import type { TitleListQuery, TitleSortKey } from "@/lib/types";

export const TITLE_PAGE_SIZE = 24;
export const TITLE_PAGE_MAX = 48;
export const TITLE_EXPORT_MAX = 5000;

function isAll(value?: string) {
  return !value || value === "all";
}

export function clampTitleLimit(
  limit: number | undefined,
  max: number,
  fallback: number,
) {
  if (!Number.isFinite(limit) || (limit ?? 0) <= 0) return fallback;
  return Math.min(Math.max(Math.trunc(limit ?? fallback), 1), max);
}

export function clampTitleOffset(offset: number | undefined) {
  if (!Number.isFinite(offset) || (offset ?? 0) < 0) return 0;
  return Math.trunc(offset ?? 0);
}

export function parseTitleListQuery(
  params: URLSearchParams,
  options?: { forExport?: boolean },
): TitleListQuery {
  const sort = params.get("sort");
  const parsedSort: TitleSortKey | undefined =
    sort === "year" || sort === "title" || sort === "douban" || sort === "recent"
      ? sort
      : undefined;
  const max = options?.forExport ? TITLE_EXPORT_MAX : TITLE_PAGE_MAX;
  const fallback = options?.forExport ? TITLE_EXPORT_MAX : TITLE_PAGE_SIZE;
  return {
    q: params.get("q") ?? undefined,
    type: params.get("type") ?? undefined,
    year: params.get("year") ?? undefined,
    quality: params.get("quality") ?? undefined,
    source: params.get("source") ?? undefined,
    channel: params.get("channel") ?? undefined,
    sort: parsedSort,
    offset: clampTitleOffset(Number(params.get("offset"))),
    limit: clampTitleLimit(Number(params.get("limit")), max, fallback),
  };
}

export function titleListSearchParams(query: TitleListQuery) {
  const params = new URLSearchParams();
  if (query.q?.trim()) params.set("q", query.q.trim());
  if (!isAll(query.type)) params.set("type", query.type!);
  if (!isAll(query.year)) params.set("year", query.year!);
  if (!isAll(query.quality)) params.set("quality", query.quality!);
  if (!isAll(query.source)) params.set("source", query.source!);
  if (!isAll(query.channel)) params.set("channel", query.channel!);
  if (query.sort && query.sort !== "recent") params.set("sort", query.sort);
  if (query.offset) params.set("offset", String(query.offset));
  if (query.limit) params.set("limit", String(query.limit));
  return params;
}
