import { isCatalogState } from "@/lib/catalog-storage";
import type { CatalogState } from "@/lib/types";

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
