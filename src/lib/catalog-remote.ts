import { isCatalogState } from "@/lib/catalog-storage";
import { isCatalogPatch } from "@/lib/catalog-patch";
import { titleListSearchParams } from "@/lib/catalog-list-params";
import type {
  CatalogPatch,
  CatalogState,
  TitleListQuery,
  TitleListResult,
  TitleRecord,
} from "@/lib/types";

export async function fetchCatalogFromServer(options?: {
  full?: boolean;
}): Promise<{
  ok: boolean;
  state?: CatalogState;
  titleCount?: number;
  counts?: {
    channels: number;
    titles: number;
    editions: number;
    links: number;
  };
  error?: string;
}> {
  const url = options?.full ? "/api/catalog?full=1" : "/api/catalog";
  const res = await fetch(url, { cache: "no-store" });
  const data = (await res.json()) as {
    ok?: boolean;
    state?: unknown;
    titleCount?: number;
    counts?: {
      channels: number;
      titles: number;
      editions: number;
      links: number;
    };
    error?: string;
  };
  if (!res.ok) {
    return { ok: false, error: data.error || "读取本机片库失败" };
  }
  if (data.state && isCatalogState(data.state)) {
    return {
      ok: true,
      state: data.state,
      titleCount: data.titleCount,
      counts: data.counts,
    };
  }
  return { ok: true, titleCount: data.titleCount, counts: data.counts };
}

export async function fetchTitleList(
  query: TitleListQuery,
  options?: { purpose?: "export"; signal?: AbortSignal },
): Promise<{ ok: true } & TitleListResult | { ok: false; error: string }> {
  const params = titleListSearchParams(query);
  if (options?.purpose === "export") params.set("purpose", "export");
  try {
    const res = await fetch(`/api/catalog/titles?${params.toString()}`, {
      cache: "no-store",
      signal: options?.signal,
    });
    const data = (await res.json().catch(() => ({}))) as Partial<TitleListResult> & {
      ok?: boolean;
      error?: string;
    };
    if (!res.ok || !Array.isArray(data.titles)) {
      return { ok: false, error: data.error || "读取片库分页失败" };
    }
    return {
      ok: true,
      titles: data.titles,
      total: data.total ?? data.titles.length,
      shareableTotal: data.shareableTotal ?? data.total ?? data.titles.length,
      offset: data.offset ?? query.offset ?? 0,
      limit: data.limit ?? data.titles.length,
      years: data.years ?? [],
      kinds: data.kinds ?? [],
    };
  } catch (error) {
    if (options?.signal?.aborted) {
      return { ok: false, error: "aborted" };
    }
    return {
      ok: false,
      error: error instanceof Error ? error.message : "读取片库分页失败",
    };
  }
}

export async function fetchTitleById(
  id: string,
): Promise<{ ok: true; title: TitleRecord } | { ok: false; error: string }> {
  try {
    const res = await fetch(`/api/catalog/titles/${encodeURIComponent(id)}`, {
      cache: "no-store",
    });
    const data = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      title?: TitleRecord;
      error?: string;
    };
    if (!res.ok || !data.title) {
      return { ok: false, error: data.error || "找不到这部影片。" };
    }
    return { ok: true, title: data.title };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "读取影片失败",
    };
  }
}

export async function postCatalogApply(body: unknown): Promise<{
  ok: boolean;
  patch?: CatalogPatch;
  state?: CatalogState;
  error?: string;
  skipped?: number;
  posts?: number;
  usable?: number;
  dropped?: number;
}> {
  try {
    const res = await fetch("/api/catalog/apply", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      patch?: unknown;
      state?: unknown;
      error?: string;
      skipped?: number;
      posts?: number;
      usable?: number;
      dropped?: number;
    };
    if (!res.ok) {
      return { ok: false, error: data.error || "写入本机片库失败" };
    }
    const extras = {
      skipped: data.skipped,
      posts: data.posts,
      usable: data.usable,
      dropped: data.dropped,
    };
    if (data.patch && isCatalogPatch(data.patch)) {
      return { ok: true, patch: data.patch, ...extras };
    }
    if (data.state && isCatalogState(data.state)) {
      return { ok: true, state: data.state, ...extras };
    }
    return { ok: false, error: data.error || "片库返回不完整" };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "写入本机片库失败",
    };
  }
}

export async function putCatalogToServer(
  state: CatalogState,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch("/api/catalog", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ state }),
    });
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) {
      return { ok: false, error: data.error || "写入本机 SQLite 失败" };
    }
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "写入本机 SQLite 失败",
    };
  }
}
