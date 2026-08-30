"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { toast } from "sonner";
import { mergeCatalog, recountChannel } from "@/lib/catalog";
import { buildDemoCatalog } from "@/lib/demo-data";
import { readAccountAuth, writeAccountAuth } from "@/lib/account-session";
import { readStoredProxy } from "@/lib/local-proxy";
import type {
  CatalogState,
  ChannelRecord,
  SyncResult,
  TitleRecord,
} from "@/lib/types";

const STORAGE_KEY = "yingqu.catalog.v1";

const SERVER_SNAPSHOT: CatalogState = {
  version: 1,
  initialized: false,
  noticeDismissed: false,
  channels: [],
  titles: [],
};

const emptyState = (): CatalogState => ({
  version: 1,
  initialized: false,
  noticeDismissed: false,
  channels: [],
  titles: [],
});

type CatalogContextValue = {
  ready: boolean;
  state: CatalogState;
  selectedId: string | null;
  setSelectedId: (id: string | null) => void;
  selectedTitle: TitleRecord | null;
  addAndSync: (username: string) => Promise<boolean>;
  syncOne: (username: string, more?: boolean) => Promise<boolean>;
  syncAll: () => Promise<void>;
  importText: (text: string) => Promise<boolean>;
  ingestSyncResult: (result: SyncResult, more?: boolean) => void;
  removeChannel: (username: string) => void;
  loadDemo: () => void;
  clearAll: () => void;
  dismissNotice: () => void;
};

const CatalogContext = createContext<CatalogContextValue | null>(null);

const listeners = new Set<() => void>();
let snapshot: CatalogState = SERVER_SNAPSHOT;
let hydrated = false;

function readStore(): CatalogState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return emptyState();
    const parsed = JSON.parse(raw) as CatalogState;
    if (parsed.version !== 1 || !Array.isArray(parsed.titles)) {
      return emptyState();
    }
    return parsed;
  } catch {
    return emptyState();
  }
}

function persist(next: CatalogState, notify = true) {
  snapshot = next;
  if (typeof window !== "undefined") {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  }
  if (notify) listeners.forEach((listener) => listener());
}

function hydrateFromBrowser() {
  if (hydrated || typeof window === "undefined") return;
  hydrated = true;
  try {
    const stored = readStore();
    if (!stored.initialized) {
      const demo = buildDemoCatalog();
      snapshot = {
        version: 1,
        initialized: true,
        noticeDismissed: false,
        channels: demo.channels,
        titles: demo.titles,
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
      return;
    }
    snapshot = stored;
  } catch {
    snapshot = emptyState();
  }
}

function subscribe(listener: () => void) {
  hydrateFromBrowser();
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot() {
  hydrateFromBrowser();
  return snapshot;
}

function getServerSnapshot() {
  return SERVER_SNAPSHOT;
}

function getClientReady() {
  return true;
}

function getServerReady() {
  return false;
}

function updateCatalog(updater: (prev: CatalogState) => CatalogState) {
  persist(updater(snapshot));
}

export function CatalogProvider({ children }: { children: ReactNode }) {
  const state = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const ready = useSyncExternalStore(subscribe, getClientReady, getServerReady);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const applySync = useCallback(
    (username: string, result: SyncResult, more: boolean) => {
      updateCatalog((prev) => {
        const titles = mergeCatalog(prev.titles, result.titles);
        const existing = prev.channels.find((c) => c.username === username);
        const base: ChannelRecord = existing ?? {
          ...result.channel,
          username: result.channel.username,
          addedAt: new Date().toISOString(),
          postCount: 0,
          resourceCount: 0,
          status: "idle",
        };
        const nextChannel = recountChannel(base, titles, {
          ...result.channel,
          lastSyncedAt: new Date().toISOString(),
          lastBefore: result.nextBefore,
          lastError: undefined,
          status: "idle",
          source: result.channel.source ?? existing?.source ?? base.source,
          peerId: result.channel.peerId ?? existing?.peerId ?? base.peerId,
          isPrivate: result.channel.isPrivate ?? existing?.isPrivate,
          postCount: (more ? base.postCount : 0) + result.posts.length,
        });
        const channels = existing
          ? prev.channels.map((c) =>
              c.username === username ? nextChannel : c,
            )
          : [...prev.channels, nextChannel];
        return { ...prev, titles, channels };
      });
    },
    [],
  );

  const syncOne = useCallback(
    async (username: string, more = false) => {
      const current = snapshot.channels.find((c) => c.username === username);
      if (current?.isDemo) {
        toast.message("演示频道没有线上帖子", {
          description: "请添加真实的公开频道，或重新载入演示片库。",
        });
        return false;
      }

      if (current?.source === "export") {
        toast.message("导出频道无法在线刷新", {
          description: "请重新导入 Telegram 桌面版的 result.json。",
        });
        return false;
      }

      updateCatalog((prev) => ({
        ...prev,
        channels: prev.channels.map((c) =>
          c.username === username
            ? { ...c, status: "syncing", lastError: undefined }
            : c,
        ),
      }));

      try {
        let data: SyncResult & { error?: string; code?: string };
        if (current?.source === "account") {
          const auth = readAccountAuth();
          if (!auth?.session) {
            throw new Error("请先在「已登录账号」里完成验证。");
          }
          const res = await fetch("/api/telegram/account/sync", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              session: auth.session,
              apiId: auth.apiId,
              apiHash: auth.apiHash,
              username: current.username,
              peerId: current.peerId,
              offsetId: more && current.lastBefore ? Number(current.lastBefore) : undefined,
              limit: more ? 60 : 80,
            }),
          });
          const payload = (await res.json()) as {
            result?: SyncResult;
            session?: string;
            error?: string;
          };
          if (!res.ok || !payload.result) {
            throw new Error(payload.error || "同步失败");
          }
          if (payload.session) {
            writeAccountAuth({ ...auth, session: payload.session });
          }
          data = payload.result;
        } else {
          const res = await fetch("/api/channels/sync", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              username,
              before: more ? current?.lastBefore : undefined,
              pages: more ? 2 : 3,
              proxy: readStoredProxy() || undefined,
            }),
          });
          data = (await res.json()) as SyncResult & {
            error?: string;
            code?: string;
          };
          if (!res.ok) {
            const err = new Error(data.error || "同步失败") as Error & {
              code?: string;
            };
            err.code = data.code;
            throw err;
          }
        }
        applySync(data.channel.username, data, more);
        toast.success(
          `读到 ${data.posts.length} 条帖子，识别出 ${data.titles.length} 部影片`,
          {
            description:
              data.skipped > 0
                ? `另有 ${data.skipped} 条不像影视资源，已跳过。`
                : data.channel.title,
          },
        );
        return true;
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "同步失败，请稍后重试。";
        updateCatalog((prev) => ({
          ...prev,
          channels: prev.channels.map((c) =>
            c.username === username
              ? { ...c, status: "error", lastError: message }
              : c,
          ),
        }));
        toast.error(message);
        if (
          typeof window !== "undefined" &&
          ((error as { code?: string }).code === "preview_blocked" ||
            message.includes("t.me") ||
            message.includes("粘贴导入"))
        ) {
          window.dispatchEvent(
            new CustomEvent("yingqu:paste-import", { detail: { username } }),
          );
        }
        return false;
      }
    },
    [applySync],
  );

  const addAndSync = useCallback(
    async (username: string) => {
      const exists = snapshot.channels.some(
        (c) => c.username.toLowerCase() === username.toLowerCase(),
      );
      if (exists) {
        return syncOne(username);
      }
      updateCatalog((prev) => ({
        ...prev,
        channels: [
          ...prev.channels,
          {
            username,
            title: username,
            description: "",
            addedAt: new Date().toISOString(),
            postCount: 0,
            resourceCount: 0,
            status: "syncing",
          },
        ],
      }));
      return syncOne(username);
    },
    [syncOne],
  );

  const syncAll = useCallback(async () => {
    const targets = snapshot.channels.filter(
      (c) => !c.isDemo && c.source !== "export",
    );
    if (!targets.length) {
      toast.message("没有可同步的公开频道");
      return;
    }
    for (const channel of targets) {
      await syncOne(channel.username);
    }
  }, [syncOne]);

  const ingestSyncResult = useCallback(
    (result: SyncResult, more = false) => {
      applySync(result.channel.username, result, more);
      toast.success(
        `读到 ${result.posts.length} 条帖子，识别出 ${result.titles.length} 部影片`,
        {
          description:
            result.skipped > 0
              ? `另有 ${result.skipped} 条不像影视资源，已跳过。`
              : result.channel.title,
        },
      );
    },
    [applySync],
  );

  const importText = useCallback(async (text: string) => {
    const res = await fetch("/api/parse", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });
    const data = (await res.json()) as {
      titles?: TitleRecord[];
      skipped?: number;
      posts?: number;
      error?: string;
    };
    if (!res.ok) {
      toast.error(data.error || "解析失败");
      return false;
    }
    const incoming = data.titles ?? [];
    updateCatalog((prev) => {
      const titles = mergeCatalog(prev.titles, incoming);
      const imported =
        prev.channels.find((c) => c.username === "imported") ??
        ({
          username: "imported",
          title: "手动导入",
          description: "从粘贴的频道帖子解析而来。",
          addedAt: new Date().toISOString(),
          postCount: 0,
          resourceCount: 0,
          status: "idle" as const,
        } satisfies ChannelRecord);
      const channel = recountChannel(imported, titles, {
        lastSyncedAt: new Date().toISOString(),
        postCount: imported.postCount + (data.posts ?? 0),
        status: "idle",
      });
      const channels = prev.channels.some((c) => c.username === "imported")
        ? prev.channels.map((c) => (c.username === "imported" ? channel : c))
        : [...prev.channels, channel];
      return { ...prev, titles, channels };
    });
    toast.success(`导入 ${incoming.length} 部影片`, {
      description:
        (data.skipped ?? 0) > 0
          ? `跳过 ${data.skipped} 条无法识别的文本。`
          : undefined,
    });
    return true;
  }, []);

  const removeChannel = useCallback((username: string) => {
    updateCatalog((prev) => {
      const titles = prev.titles
        .map((title) => ({
          ...title,
          editions: title.editions.filter((e) => e.channel !== username),
        }))
        .filter((title) => title.editions.length > 0);
      return {
        ...prev,
        titles,
        channels: prev.channels.filter((c) => c.username !== username),
      };
    });
    setSelectedId(null);
    toast.success("已移除频道及相关片源");
  }, []);

  const loadDemo = useCallback(() => {
    const demo = buildDemoCatalog();
    updateCatalog((prev) => ({
      ...prev,
      initialized: true,
      channels: demo.channels,
      titles: demo.titles,
    }));
    toast.success("已载入演示片库");
  }, []);

  const clearAll = useCallback(() => {
    persist({
      version: 1,
      initialized: true,
      noticeDismissed: true,
      channels: [],
      titles: [],
    });
    setSelectedId(null);
    toast.success("片库已清空");
  }, []);

  const dismissNotice = useCallback(() => {
    updateCatalog((prev) => ({ ...prev, noticeDismissed: true }));
  }, []);

  const selectedTitle = useMemo(
    () => state.titles.find((t) => t.id === selectedId) ?? null,
    [selectedId, state.titles],
  );

  const value = useMemo(
    () => ({
      ready,
      state,
      selectedId,
      setSelectedId,
      selectedTitle,
      addAndSync,
      syncOne,
      syncAll,
      importText,
      ingestSyncResult,
      removeChannel,
      loadDemo,
      clearAll,
      dismissNotice,
    }),
    [
      ready,
      state,
      selectedId,
      selectedTitle,
      addAndSync,
      syncOne,
      syncAll,
      importText,
      ingestSyncResult,
      removeChannel,
      loadDemo,
      clearAll,
      dismissNotice,
    ],
  );

  return (
    <CatalogContext.Provider value={value}>{children}</CatalogContext.Provider>
  );
}

export function useCatalog() {
  const ctx = useContext(CatalogContext);
  if (!ctx) {
    throw new Error("useCatalog 必须在 CatalogProvider 内使用");
  }
  return ctx;
}
