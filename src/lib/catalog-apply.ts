import {
  mergeCatalog,
  nextHistoryCursor,
  nextPostCount,
  recountChannel,
  sameChannel,
} from "@/lib/catalog";
import { hasCloudOrMagnetLink } from "@/lib/labels";
import type { CatalogState, ChannelRecord, SyncResult, TitleRecord } from "@/lib/types";

export function emptyInitializedCatalog(): CatalogState {
  return {
    version: 1,
    initialized: true,
    noticeDismissed: false,
    channels: [],
    titles: [],
  };
}

export function applySyncResult(
  prev: CatalogState,
  username: string,
  result: SyncResult,
  more = false,
): CatalogState {
  const baseState = prev.initialized ? prev : { ...prev, initialized: true };
  const titles = mergeCatalog(baseState.titles, result.titles);
  const existing = baseState.channels.find((channel) =>
    sameChannel(channel.username, username),
  );
  const base: ChannelRecord = existing ?? {
    ...result.channel,
    username: result.channel.username || username,
    addedAt: new Date().toISOString(),
    postCount: 0,
    resourceCount: 0,
    status: "idle",
  };
  const storedUsername =
    existing?.username ?? result.channel.username ?? username;
  const nextChannel = recountChannel(base, titles, {
    ...result.channel,
    username: storedUsername,
    lastSyncedAt: new Date().toISOString(),
    lastBefore: nextHistoryCursor({
      more,
      previous: existing?.lastBefore ?? base.lastBefore,
      incoming: result.nextBefore,
    }),
    lastError: undefined,
    status: "idle",
    source: result.channel.source ?? existing?.source ?? base.source,
    peerId: result.channel.peerId ?? existing?.peerId ?? base.peerId,
    isPrivate: result.channel.isPrivate ?? existing?.isPrivate,
    postCount: nextPostCount({
      more,
      previous: base.postCount,
      incoming: result.posts.length,
    }),
  });
  const channels = existing
    ? baseState.channels.map((channel) =>
        sameChannel(channel.username, username)
          ? { ...nextChannel, username: storedUsername }
          : channel,
      )
    : [...baseState.channels, { ...nextChannel, username: storedUsername }];
  return { ...baseState, initialized: true, titles, channels };
}

export function applyImport(
  prev: CatalogState,
  incoming: TitleRecord[],
  postCount = 0,
): CatalogState {
  const baseState = prev.initialized ? prev : { ...prev, initialized: true };
  const titles = mergeCatalog(baseState.titles, incoming.filter(hasCloudOrMagnetLink));
  const imported =
    baseState.channels.find((channel) => channel.username === "imported") ??
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
    postCount: imported.postCount + postCount,
    status: "idle",
  });
  const channels = baseState.channels.some((item) => item.username === "imported")
    ? baseState.channels.map((item) =>
        item.username === "imported" ? channel : item,
      )
    : [...baseState.channels, channel];
  return { ...baseState, initialized: true, titles, channels };
}

export function removeChannelFromState(
  prev: CatalogState,
  username: string,
): CatalogState {
  const titles = prev.titles
    .map((title) => ({
      ...title,
      editions: title.editions.filter(
        (edition) => !sameChannel(edition.channel, username),
      ),
    }))
    .filter((title) => title.editions.length > 0);
  return {
    ...prev,
    titles,
    channels: prev.channels.filter(
      (channel) => !sameChannel(channel.username, username),
    ),
  };
}

export function markChannelErrorInState(
  prev: CatalogState,
  username: string,
  message: string,
): CatalogState {
  return {
    ...prev,
    channels: prev.channels.map((channel) =>
      sameChannel(channel.username, username)
        ? { ...channel, status: "error", lastError: message }
        : channel,
    ),
  };
}

export function summarizeSync(result: SyncResult) {
  const usable = result.titles.filter(hasCloudOrMagnetLink).length;
  return {
    posts: result.posts.length,
    usable,
    skipped: result.skipped,
    dropped: result.titles.length - usable,
  };
}
