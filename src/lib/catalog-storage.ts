import type { CatalogState, Edition, TitleRecord } from "@/lib/types";

export const CATALOG_STORAGE_KEY = "yingqu.catalog.v1";
export const RAW_TEXT_MAX = 280;
export const OVERVIEW_MAX = 800;

const DB_NAME = "yingqu";
const DB_STORE = "kv";
const DB_KEY = "catalog";
type StorageBackend = "idb" | "sqlite";

function storageMarker(backend: StorageBackend) {
  return { version: 1 as const, backend };
}

export type PersistCatalogResult =
  | { ok: true; backend: "sqlite" | "idb" | "local" }
  | { ok: false; error: "quota" | "unavailable" };

export type LoadCatalogResult =
  | { status: "ready"; state: CatalogState; source: "idb" | "local" }
  | { status: "empty" }
  | { status: "idb-unavailable" };

export function isQuotaError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const name = "name" in error ? String(error.name) : "";
  const code = "code" in error ? Number(error.code) : undefined;
  return (
    name === "QuotaExceededError" ||
    name === "NS_ERROR_DOM_QUOTA_REACHED" ||
    code === 22
  );
}

export function compactUrl(url?: string): string | undefined {
  if (!url || url.startsWith("data:")) return undefined;
  return url;
}

export function compactText(value: string, max: number): string {
  const text = value.replace(/\s+/g, " ").trim();
  if ([...text].length <= max) return text;
  return `${[...text].slice(0, max).join("")}…`;
}

export function compactEdition(edition: Edition): Edition {
  return {
    ...edition,
    rawText: compactText(edition.rawText ?? "", RAW_TEXT_MAX),
    photoUrl: compactUrl(edition.photoUrl),
  };
}

export function compactTitle(title: TitleRecord): TitleRecord {
  return {
    ...title,
    overview: title.overview
      ? compactText(title.overview, OVERVIEW_MAX)
      : undefined,
    posterUrl: compactUrl(title.posterUrl),
    editions: title.editions.map(compactEdition),
  };
}

export function compactCatalog(state: CatalogState): CatalogState {
  return {
    ...state,
    titles: state.titles.map(compactTitle),
  };
}

export function isCatalogState(value: unknown): value is CatalogState {
  if (!value || typeof value !== "object") return false;
  const record = value as CatalogState;
  return record.version === 1 && Array.isArray(record.titles);
}

export function isIdbMarker(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  const record = value as { version?: unknown; backend?: unknown };
  return record.version === 1 && record.backend === "idb";
}

export function isSqliteMarker(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  const record = value as { version?: unknown; backend?: unknown };
  return record.version === 1 && record.backend === "sqlite";
}

function openCatalogDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(DB_STORE)) {
        db.createObjectStore(DB_STORE);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(request.error ?? new Error("打开片库数据库失败"));
  });
}

async function withCatalogDb<T>(
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T> | void,
): Promise<T | undefined> {
  const db = await openCatalogDb();
  try {
    return await new Promise<T | undefined>((resolve, reject) => {
      const tx = db.transaction(DB_STORE, mode);
      const store = tx.objectStore(DB_STORE);
      let result: T | undefined;
      const request = run(store);
      if (request) {
        request.onsuccess = () => {
          result = request.result;
        };
        request.onerror = () =>
          reject(request.error ?? new Error("片库数据库操作失败"));
      }
      tx.oncomplete = () => resolve(result);
      tx.onerror = () => reject(tx.error ?? new Error("片库数据库操作失败"));
    });
  } finally {
    db.close();
  }
}

export async function readCatalogIdb(): Promise<CatalogState | undefined> {
  if (typeof indexedDB === "undefined") return undefined;
  const value = await withCatalogDb("readonly", (store) => store.get(DB_KEY));
  return isCatalogState(value) ? value : undefined;
}

export async function writeCatalogIdb(state: CatalogState): Promise<void> {
  if (typeof indexedDB === "undefined") {
    throw new Error("IndexedDB 不可用");
  }
  await withCatalogDb("readwrite", (store) => store.put(state, DB_KEY));
}

export function readCatalogLocal(): CatalogState | undefined {
  if (typeof window === "undefined") return undefined;
  try {
    const raw = localStorage.getItem(CATALOG_STORAGE_KEY);
    if (!raw) return undefined;
    const parsed = JSON.parse(raw) as unknown;
    if (isIdbMarker(parsed) || isSqliteMarker(parsed) || !isCatalogState(parsed)) {
      return undefined;
    }
    return parsed;
  } catch {
    return undefined;
  }
}

export function hasIdbMarker(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const raw = localStorage.getItem(CATALOG_STORAGE_KEY);
    if (!raw) return false;
    return isIdbMarker(JSON.parse(raw));
  } catch {
    return false;
  }
}

export function writeCatalogLocalMarker(backend: StorageBackend = "idb") {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(CATALOG_STORAGE_KEY);
  } catch {
    // quota may already be full; still try the tiny marker
  }
  try {
    localStorage.setItem(
      CATALOG_STORAGE_KEY,
      JSON.stringify(storageMarker(backend)),
    );
  } catch {
    try {
      localStorage.removeItem(CATALOG_STORAGE_KEY);
    } catch {
      // ignore
    }
  }
}

export async function deleteBrowserCatalog() {
  if (typeof window !== "undefined") {
    try {
      localStorage.removeItem(CATALOG_STORAGE_KEY);
    } catch {
      // ignore
    }
    writeCatalogLocalMarker("sqlite");
  }
  if (typeof indexedDB === "undefined") return;
  await new Promise<void>((resolve) => {
    const request = indexedDB.deleteDatabase(DB_NAME);
    request.onsuccess = () => resolve();
    request.onerror = () => resolve();
    request.onblocked = () => resolve();
  });
}

/** @deprecated Use deleteBrowserCatalog. Opening IDB just to clear it recreates the database. */
export async function clearBrowserCatalog() {
  await deleteBrowserCatalog();
}

function writeCatalogLocalFull(state: CatalogState): PersistCatalogResult {
  if (typeof window === "undefined") {
    return { ok: false, error: "unavailable" };
  }
  try {
    localStorage.removeItem(CATALOG_STORAGE_KEY);
    localStorage.setItem(CATALOG_STORAGE_KEY, JSON.stringify(state));
    return { ok: true, backend: "local" };
  } catch (error) {
    writeCatalogLocalMarker();
    return { ok: false, error: isQuotaError(error) ? "quota" : "unavailable" };
  }
}

export async function persistCatalog(
  state: CatalogState,
): Promise<PersistCatalogResult> {
  const compact = compactCatalog(state);
  if (typeof indexedDB !== "undefined") {
    try {
      await writeCatalogIdb(compact);
      writeCatalogLocalMarker();
      return { ok: true, backend: "idb" };
    } catch {
      // private mode / missing IDB: try a compacted localStorage copy
    }
  }
  return writeCatalogLocalFull(compact);
}

export async function loadCatalog(): Promise<LoadCatalogResult> {
  let idbFailed = false;
  if (typeof indexedDB !== "undefined") {
    try {
      const idb = await readCatalogIdb();
      if (idb) {
        return { status: "ready", state: compactCatalog(idb), source: "idb" };
      }
    } catch {
      idbFailed = true;
    }
  } else {
    idbFailed = true;
  }

  const local = readCatalogLocal();
  if (local) {
    return { status: "ready", state: compactCatalog(local), source: "local" };
  }

  if (idbFailed && hasIdbMarker()) {
    return { status: "idb-unavailable" };
  }

  return { status: "empty" };
}
