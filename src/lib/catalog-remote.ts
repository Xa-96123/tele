import { isCatalogState } from "@/lib/catalog-storage";
import { isCatalogPatch } from "@/lib/catalog-patch";
import type { CatalogPatch, CatalogState } from "@/lib/types";

export async function fetchCatalogFromServer(): Promise<{
  ok: boolean;
  state?: CatalogState;
  error?: string;
}> {
  const res = await fetch("/api/catalog", { cache: "no-store" });
  const data = (await res.json()) as {
    ok?: boolean;
    state?: unknown;
    error?: string;
  };
  if (!res.ok) {
    return { ok: false, error: data.error || "读取本机片库失败" };
  }
  if (data.state && isCatalogState(data.state)) {
    return { ok: true, state: data.state };
  }
  return { ok: true };
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
