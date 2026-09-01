"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { toast } from "sonner";
import { historyFetchMore, recountChannel, sameChannel } from "@/lib/catalog";
import { applyCatalogPatch } from "@/lib/catalog-patch";
import {
  compactCatalog,
  deleteBrowserCatalog,
  loadCatalog,
} from "@/lib/catalog-storage";
import {
  fetchCatalogFromServer,
  fetchTitleById,
  postCatalogApply,
  putCatalogToServer,
} from "@/lib/catalog-remote";
import { hasCloudOrMagnetLink } from "@/lib/labels";
import { readAccountAuth, writeAccountAuth } from "@/lib/account-session";
import { readStoredProxy } from "@/lib/local-proxy";
import type {
  CatalogPatch,
  CatalogState,
  ChannelRecord,
  SyncResult,
  TitleRecord,
} from "@/lib/types";

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

export type HistoryProgress = {
  running: boolean;
  untilEnd: boolean;
  rounds: number;
  posts: number;
  usable: number;
  skipped: number;
  dropped: number;
  exhausted: boolean;
  canContinue: boolean;
};

type CatalogContextValue = {
  ready: boolean;
  state: CatalogState;
  historyProgress: Record<string, HistoryProgress>;
  catalogRevision: number;
  selectedId: string | null;
  setSelectedId: (id: string | null) => void;
  selectedTitle: TitleRecord | null;
  rememberTitles: (titles: TitleRecord[]) => void;
  addAndSync: (username: string) => Promise<boolean>;
  addAccountAndSync: (username: string, peerId?: string) => Promise<boolean>;
  syncOne: (
    username: string,
    more?: boolean,
    untilEnd?: boolean,
  ) => Promise<boolean>;
  syncAll: () => Promise<void>;
  importText: (text: string) => Promise<boolean>;
  ingestSyncResult: (result: SyncResult, more?: boolean) => Promise<boolean>;
  removeChannel: (username: string) => Promise<void>;
  editTitle: (
    id: string,
    edits: {
      title: string;
      originalTitle?: string | null;
      year?: number | null;
      type: TitleRecord["type"];
    },
  ) => Promise<boolean>;
  mergeTitleInto: (fromId: string, intoId: string) => Promise<boolean>;
  removeTitle: (id: string) => Promise<boolean>;
  dismissNotice: () => void;
};

type SyncReport = {
  error?: string;
  code?: string;
  patch?: CatalogPatch;
  state?: CatalogState;
  posts?: number;
  usable?: number;
  skipped?: number;
  dropped?: number;
  exhausted?: boolean;
  rounds?: number;
  nextBefore?: string;
  session?: string;
  channelTitle?: string;
};

const CatalogContext = createContext<CatalogContextValue | null>(null);

const listeners = new Set<() => void>();
const syncingUsernames = new Set<string>();
const EMPTY_PROGRESS: Record<string, HistoryProgress> = {};
let publishedProgress: Record<string, HistoryProgress> = EMPTY_PROGRESS;
let snapshot: CatalogState = SERVER_SNAPSHOT;
let published: CatalogState = SERVER_SNAPSHOT;
let clientReady = false;
let dirtyDuringHydrate = false;
let persistFailedToastShown = false;
let hydratePromise: Promise<void> | null = null;
let persistChain: Promise<void> = Promise.resolve();
let catalogRevision = 0;

function channelKey(username: string) {
  return username.trim().toLowerCase();
}

function pruneUnshareable(state: CatalogState): CatalogState {
  const titles = state.titles.filter(hasCloudOrMagnetLink);
  if (titles.length === state.titles.length) return state;
  return {
    ...state,
    titles,
    channels: state.channels.map((channel) => recountChannel(channel, titles)),
  };
}

function notifyListeners() {
  listeners.forEach((listener) => listener());
}

function withLiveSyncStatus(state: CatalogState): CatalogState {
  let changed = false;
  const channels = state.channels.map((channel) => {
    const live = syncingUsernames.has(channelKey(channel.username));
    if (live && channel.status !== "syncing") {
      changed = true;
      return { ...channel, status: "syncing" as const };
    }
    if (!live && channel.status === "syncing") {
      changed = true;
      return { ...channel, status: "idle" as const };
    }
    return channel;
  });
  return changed ? { ...state, channels } : state;
}

function publish() {
  published = withLiveSyncStatus(snapshot);
  notifyListeners();
}

function setHistoryProgress(username: string, next: HistoryProgress | null) {
  const key = channelKey(username);
  const copy = { ...publishedProgress };
  if (next) copy[key] = next;
  else delete copy[key];
  publishedProgress = copy;
  publish();
}

function getProgressSnapshot() {
  return publishedProgress;
}

function getServerProgress() {
  return EMPTY_PROGRESS;
}

function getRevisionSnapshot() {
  return catalogRevision;
}

function getServerRevision() {
  return 0;
}

function bumpCatalogRevision() {
  catalogRevision += 1;
}

function rememberTitles(titles: TitleRecord[]) {
  if (!titles.length) return;
  snapshot = applyCatalogPatch(snapshot, { titles });
  publish();
}

function markSyncing(username: string, next: boolean) {
  const key = channelKey(username);
  const has = syncingUsernames.has(key);
  if (next) {
    syncingUsernames.add(key);
    snapshot = {
      ...snapshot,
      channels: snapshot.channels.map((channel) =>
        sameChannel(channel.username, username)
          ? { ...channel, lastError: undefined }
          : channel,
      ),
    };
  } else if (has) {
    syncingUsernames.delete(key);
  } else {
    return;
  }
  publish();
}

function schedulePersist() {
  persistChain = persistChain
    .catch(() => undefined)
    .then(async () => {
      const remote = await putCatalogToServer(compactCatalog(snapshot));
      if (remote.ok) {
        persistFailedToastShown = false;
        await deleteBrowserCatalog();
        return;
      }
      if (persistFailedToastShown) return;
      persistFailedToastShown = true;
      toast.error(remote.error || "未能写入本机 SQLite，片库只留在当前页。");
    })
    .catch(() => undefined);
}

function adoptServerState(state: CatalogState | undefined) {
  if (!state) return;
  try {
    snapshot = pruneUnshareable({
      ...state,
      titles: state.titles.length ? state.titles : snapshot.titles,
    });
  } catch {
    snapshot = state;
  }
  if (!clientReady) dirtyDuringHydrate = true;
  bumpCatalogRevision();
  publish();
  if (typeof window !== "undefined" && clientReady) {
    void deleteBrowserCatalog();
  }
}

function adoptServerPatch(patch: CatalogPatch | undefined) {
  if (!patch) return;
  const next = applyCatalogPatch(snapshot, patch);
  const shouldBump = Boolean(
    patch.titles?.length ||
      patch.channels?.length ||
      patch.removedChannel ||
      patch.removedTitleIds?.length,
  );
  try {
    snapshot = pruneUnshareable(next);
  } catch {
    snapshot = next;
  }
  if (!clientReady) dirtyDuringHydrate = true;
  if (shouldBump) bumpCatalogRevision();
  publish();
  if (typeof window !== "undefined" && clientReady) {
    void deleteBrowserCatalog();
  }
}

function adoptServerResult(data: {
  patch?: CatalogPatch;
  state?: CatalogState;
}) {
  if (data.patch) adoptServerPatch(data.patch);
  else if (data.state) adoptServerState(data.state);
}

function rememberChannelPlaceholder(
  username: string,
  extras?: Partial<ChannelRecord>,
) {
  const existing = snapshot.channels.find((channel) =>
    sameChannel(channel.username, username),
  );
  if (existing) {
    if (!extras) return;
    snapshot = {
      ...snapshot,
      initialized: true,
      channels: snapshot.channels.map((channel) =>
        sameChannel(channel.username, username)
          ? { ...channel, ...extras, lastError: extras.lastError }
          : channel,
      ),
    };
    publish();
    return;
  }
  snapshot = {
    ...snapshot,
    initialized: true,
    channels: [
      ...snapshot.channels,
      {
        username,
        title: extras?.title || username,
        description: extras?.description || "",
        addedAt: new Date().toISOString(),
        postCount: 0,
        resourceCount: 0,
        status: extras?.status ?? "idle",
        ...extras,
      },
    ],
  };
  publish();
}

function hydrateFromBrowser() {
  if (typeof window === "undefined") return hydratePromise;
  if (hydratePromise) return hydratePromise;

  hydratePromise = (async () => {
    let writeSqlite = false;
    try {
      const remote = await fetchCatalogFromServer();
      if (!remote.ok) {
        throw new Error(remote.error || "读取本机片库失败");
      }
      const serverHasCatalog =
        Boolean(remote.state?.initialized) ||
        (remote.titleCount ?? 0) > 0 ||
        (remote.state?.channels.length ?? 0) > 0 ||
        (remote.counts?.titles ?? 0) > 0;
      if (dirtyDuringHydrate && snapshot.initialized && snapshot.titles.length > 0) {
        writeSqlite = true;
      } else if (serverHasCatalog) {
        snapshot = {
          ...(remote.state ?? emptyState()),
          initialized: true,
          titles: [],
        };
      } else {
        const browser = await loadCatalog();
        snapshot =
          browser.status === "ready"
            ? pruneUnshareable(browser.state)
            : { ...emptyState(), initialized: true };
        writeSqlite = true;
      }
    } catch {
      writeSqlite = false;
      try {
        const loaded = await loadCatalog();
        if (dirtyDuringHydrate && snapshot.initialized && snapshot.titles.length > 0) {
          writeSqlite = true;
        } else if (loaded.status === "ready") {
          snapshot = pruneUnshareable(loaded.state);
          writeSqlite = true;
        } else if (!snapshot.initialized) {
          snapshot = { ...emptyState(), initialized: true };
        }
        toast.error("读不到本机 SQLite，正在把浏览器里的旧片库迁过去。");
      } catch {
        if (!snapshot.initialized) {
          snapshot = { ...emptyState(), initialized: true };
        }
      }
    } finally {
      clientReady = true;
      publish();
      if (writeSqlite) schedulePersist();
      else void deleteBrowserCatalog();
    }
  })();

  return hydratePromise;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot() {
  return clientReady ? published : SERVER_SNAPSHOT;
}

function getServerSnapshot() {
  return SERVER_SNAPSHOT;
}

function getClientReady() {
  return clientReady;
}

function getServerReady() {
  return false;
}

export function CatalogProvider({ children }: { children: ReactNode }) {
  const state = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const ready = useSyncExternalStore(subscribe, getClientReady, getServerReady);
  const historyProgress = useSyncExternalStore(
    subscribe,
    getProgressSnapshot,
    getServerProgress,
  );
  const catalogRevision = useSyncExternalStore(
    subscribe,
    getRevisionSnapshot,
    getServerRevision,
  );
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    void hydrateFromBrowser();
  }, []);

  useEffect(() => {
    if (!selectedId) return;
    if (state.titles.some((title) => title.id === selectedId)) return;
    let cancelled = false;
    void fetchTitleById(selectedId).then((result) => {
      if (cancelled || !result.ok) return;
      rememberTitles([result.title]);
    });
    return () => {
      cancelled = true;
    };
  }, [selectedId, state.titles]);

  const syncOne = useCallback(
    async (username: string, more = false, untilEnd = false) => {
      const current = snapshot.channels.find((channel) =>
        sameChannel(channel.username, username),
      );
      if (current?.isDemo) {
        toast.message("演示频道没有线上帖子", {
          description: "请添加真实的公开频道。",
        });
        return false;
      }

      if (current?.source === "export") {
        toast.message("导出频道无法在线刷新", {
          description: "请重新导入 Telegram 桌面版的 result.json。",
        });
        return false;
      }

      if (sameChannel(username, "imported")) {
        toast.message("手动导入的帖子无法在线刷新", {
          description: "请再次粘贴帖子，或添加真实频道。",
        });
        return false;
      }

      markSyncing(username, true);

      const HISTORY_MAX_ROUNDS = 20;
      let posts = 0;
      let usable = 0;
      let skipped = 0;
      let dropped = 0;
      let exhausted = false;
      let nextBefore: string | undefined;
      let channelTitle: string | undefined;
      let rounds = 0;

      const reportProgress = (running: boolean) => {
        setHistoryProgress(username, {
          running,
          untilEnd,
          rounds,
          posts,
          usable,
          skipped,
          dropped,
          exhausted,
          canContinue: Boolean(nextBefore) && !exhausted,
        });
      };

      try {
        const maxPasses = untilEnd ? HISTORY_MAX_ROUNDS : 1;
        reportProgress(true);

        for (let pass = 0; pass < maxPasses; pass += 1) {
          const passMore = historyFetchMore({
            untilEnd,
            requestedMore: more,
            lastBefore:
              snapshot.channels.find((channel) =>
                sameChannel(channel.username, username),
              )?.lastBefore ?? current?.lastBefore,
            passIndex: pass,
          });
          const live = snapshot.channels.find((channel) =>
            sameChannel(channel.username, username),
          );
          const auth = readAccountAuth();
          const useAccount = live?.source === "account";
          if (useAccount && !auth?.session) {
            throw new Error("请先在「已登录账号」里完成验证。");
          }

          const endpoint = useAccount
            ? "/api/telegram/account/sync"
            : "/api/channels/sync";
          const res = await fetch(endpoint, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(
              useAccount
                ? {
                    session: auth?.session,
                    apiId: auth?.apiId,
                    apiHash: auth?.apiHash,
                    username: live?.username ?? username,
                    peerId: live?.peerId,
                    more: passMore,
                    untilEnd: false,
                    maxRounds: 1,
                  }
                : {
                    username,
                    more: passMore,
                    untilEnd: false,
                    maxRounds: 1,
                    proxy: readStoredProxy() || undefined,
                  },
            ),
          });
          const data = (await res.json()) as SyncReport;
          if (data.session && auth) {
            writeAccountAuth({ ...auth, session: data.session });
          }
          adoptServerResult(data);
          if (!res.ok) {
            const err = new Error(data.error || "同步失败") as Error & {
              code?: string;
            };
            err.code = data.code;
            throw err;
          }

          posts += data.posts ?? 0;
          usable += data.usable ?? 0;
          skipped += data.skipped ?? 0;
          dropped += data.dropped ?? 0;
          rounds += data.rounds ?? 1;
          exhausted = data.exhausted ?? !data.nextBefore;
          nextBefore = data.nextBefore;
          channelTitle = data.channelTitle ?? channelTitle;
          reportProgress(true);
          if (!untilEnd || exhausted || !nextBefore) break;
        }

        toast.success(
          `读到 ${posts} 条帖子，识别出 ${usable} 部有网盘或磁力的影片`,
          {
            description: [
              skipped > 0 ? `${skipped} 条不像影视资源` : "",
              dropped > 0 ? `${dropped} 部没有网盘或磁力` : "",
              untilEnd
                ? exhausted
                  ? "已翻到最早的消息"
                  : nextBefore
                    ? `已连续 ${rounds} 轮，还可往前翻。再点「翻完历史」继续。`
                    : ""
                : "",
              !untilEnd && nextBefore ? "还可往前翻" : "",
              channelTitle,
            ]
              .filter(Boolean)
              .join(" · "),
          },
        );
        return true;
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "同步失败，请稍后重试。";
        const local = snapshot.channels.find((channel) =>
          sameChannel(channel.username, username),
        );
        if (local?.lastError !== message) {
          const applied = await postCatalogApply({
            type: "channel-error",
            username,
            message,
          });
          adoptServerResult(applied);
          const after = snapshot.channels.find((channel) =>
            sameChannel(channel.username, username),
          );
          if (after?.lastError !== message) {
            rememberChannelPlaceholder(username, {
              ...(after ?? local),
              status: "error",
              lastError: message,
            });
          }
        }
        toast.error(message, {
          description:
            untilEnd && rounds > 0
              ? `已写入 ${rounds} 轮、识别 ${usable} 部。再点「翻完历史」从当前游标继续。`
              : undefined,
        });
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
      } finally {
        setHistoryProgress(username, null);
        markSyncing(username, false);
      }
    },
    [],
  );

  const addAndSync = useCallback(
    async (username: string) => {
      const exists = snapshot.channels.some((channel) =>
        sameChannel(channel.username, username),
      );
      if (!exists) {
        rememberChannelPlaceholder(username);
      }
      return syncOne(username);
    },
    [syncOne],
  );

  const addAccountAndSync = useCallback(
    async (username: string, peerId?: string) => {
      rememberChannelPlaceholder(username, {
        source: "account",
        peerId,
      });
      return syncOne(username);
    },
    [syncOne],
  );

  const syncAll = useCallback(async () => {
    const targets = snapshot.channels.filter(
      (channel) => !channel.isDemo && channel.source !== "export",
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
    async (result: SyncResult, more = false) => {
      const applied = await postCatalogApply({
        type: "sync",
        username: result.channel.username,
        result,
        more,
      });
      if (!applied.ok || (!applied.patch && !applied.state)) {
        toast.error(applied.error || "写入片库失败");
        return false;
      }
      adoptServerResult(applied);
      const usable = result.titles.filter(hasCloudOrMagnetLink).length;
      const dropped = result.titles.length - usable;
      toast.success(
        `读到 ${result.posts.length} 条帖子，识别出 ${usable} 部有网盘或磁力的影片`,
        {
          description:
            [
              result.skipped > 0 ? `${result.skipped} 条不像影视资源` : "",
              dropped > 0 ? `${dropped} 部没有网盘或磁力` : "",
            ]
              .filter(Boolean)
              .join("，") || result.channel.title,
        },
      );
      return true;
    },
    [],
  );

  const importText = useCallback(async (text: string) => {
    const applied = await postCatalogApply({ type: "import", text });
    if (!applied.ok || (!applied.patch && !applied.state)) {
      toast.error(applied.error || "解析失败");
      return false;
    }
    adoptServerResult(applied);
    toast.success(`导入 ${applied.usable ?? 0} 部有网盘或磁力的影片`, {
      description:
        [
          (applied.skipped ?? 0) > 0 ? `跳过 ${applied.skipped} 条无法识别` : "",
          (applied.dropped ?? 0) > 0 ? `${applied.dropped} 部没有网盘或磁力` : "",
        ]
          .filter(Boolean)
          .join("，") || undefined,
    });
    return true;
  }, []);

  const removeChannel = useCallback(async (username: string) => {
    const applied = await postCatalogApply({ type: "remove", username });
    if (!applied.ok || (!applied.patch && !applied.state)) {
      toast.error(applied.error || "移除频道失败");
      return;
    }
    adoptServerResult(applied);
    setSelectedId(null);
    toast.success("已移除频道及相关片源");
  }, []);

  const editTitle = useCallback(
    async (
      id: string,
      edits: {
        title: string;
        originalTitle?: string | null;
        year?: number | null;
        type: TitleRecord["type"];
      },
    ) => {
      const applied = await postCatalogApply({
        type: "edit-title",
        id,
        title: edits.title,
        originalTitle: edits.originalTitle,
        year: edits.year,
        titleType: edits.type,
      });
      if (!applied.ok || (!applied.patch && !applied.state)) {
        toast.error(applied.error || "保存失败");
        return false;
      }
      adoptServerResult(applied);
      const mergedCount = applied.patch?.removedTitleIds?.length ?? 0;
      toast.success(
        mergedCount > 0 ? "已保存，并与另一张同名卡片合并" : "已保存",
      );
      return true;
    },
    [],
  );

  const mergeTitleInto = useCallback(async (fromId: string, intoId: string) => {
    const applied = await postCatalogApply({
      type: "merge-titles",
      fromId,
      intoId,
    });
    if (!applied.ok || (!applied.patch && !applied.state)) {
      toast.error(applied.error || "合并失败");
      return false;
    }
    adoptServerResult(applied);
    setSelectedId(intoId);
    toast.success("已把另一部的版本并入这部");
    return true;
  }, []);

  const removeTitle = useCallback(async (id: string) => {
    const applied = await postCatalogApply({ type: "remove-title", id });
    if (!applied.ok || (!applied.patch && !applied.state)) {
      toast.error(applied.error || "未能丢掉这部");
      return false;
    }
    adoptServerResult(applied);
    setSelectedId(null);
    toast.success("已从片库丢掉这部，频道还在");
    return true;
  }, []);

  const dismissNotice = useCallback(() => {
    snapshot = { ...snapshot, noticeDismissed: true };
    publish();
    void postCatalogApply({ type: "notice", dismissed: true }).then(
      (applied) => {
        if (!applied.ok) {
          snapshot = { ...snapshot, noticeDismissed: false };
          publish();
          toast.error(applied.error || "未能保存说明关闭状态");
          return;
        }
        adoptServerResult(applied);
      },
    );
  }, []);

  const selectedTitle = useMemo(
    () => state.titles.find((title) => title.id === selectedId) ?? null,
    [selectedId, state.titles],
  );

  const value = useMemo(
    () => ({
      ready,
      state,
      historyProgress,
      catalogRevision,
      selectedId,
      setSelectedId,
      selectedTitle,
      rememberTitles,
      addAndSync,
      addAccountAndSync,
      syncOne,
      syncAll,
      importText,
      ingestSyncResult,
      removeChannel,
      editTitle,
      mergeTitleInto,
      removeTitle,
      dismissNotice,
    }),
    [
      ready,
      state,
      historyProgress,
      catalogRevision,
      selectedId,
      selectedTitle,
      addAndSync,
      addAccountAndSync,
      syncOne,
      syncAll,
      importText,
      ingestSyncResult,
      removeChannel,
      editTitle,
      mergeTitleInto,
      removeTitle,
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
