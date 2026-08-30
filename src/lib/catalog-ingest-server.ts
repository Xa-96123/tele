import { summarizeSync } from "@/lib/catalog-apply";
import { applyCatalogPatch } from "@/lib/catalog-patch";
import {
  applySyncToSqlite,
  markChannelErrorInSqlite,
  readChannelRecord,
} from "@/lib/catalog-db";
import { syncAccountChannel } from "@/lib/account";
import { syncPublicChannel } from "@/lib/telegram";
import type { CatalogPatch } from "@/lib/types";

export type IngestReport = {
  patch: CatalogPatch;
  exhausted: boolean;
  rounds: number;
  posts: number;
  usable: number;
  skipped: number;
  dropped: number;
  nextBefore?: string;
  channelTitle?: string;
  session?: string;
};

function recordSyncError(username: string, error: unknown) {
  const message = error instanceof Error ? error.message : "同步失败";
  markChannelErrorInSqlite(username, message);
}

function cursorDidNotAdvance(
  more: boolean,
  previous: string | undefined,
  incoming: string | undefined,
) {
  return Boolean(more && previous && incoming && incoming === previous);
}

function accumulatePatch(current: CatalogPatch, next: CatalogPatch): CatalogPatch {
  const merged = applyCatalogPatch(
    {
      version: 1,
      initialized: true,
      noticeDismissed: false,
      channels: current.channels ?? [],
      titles: current.titles ?? [],
    },
    next,
  );
  return {
    initialized: true,
    channels: merged.channels,
    titles: merged.titles,
  };
}

export async function ingestPublicChannelToSqlite(options: {
  username: string;
  more?: boolean;
  untilEnd?: boolean;
  maxRounds?: number;
  pages?: number;
  proxy?: string;
}): Promise<IngestReport> {
  const username = options.username;
  const untilEnd = Boolean(options.untilEnd);
  const maxRounds = untilEnd
    ? Math.min(Math.max(options.maxRounds ?? 6, 1), 12)
    : 1;
  let more = Boolean(options.more);
  if (untilEnd && !more) {
    more = Boolean(readChannelRecord(username)?.lastBefore);
  }

  let rounds = 0;
  let posts = 0;
  let usable = 0;
  let skipped = 0;
  let dropped = 0;
  let nextBefore: string | undefined;
  let channelTitle: string | undefined;
  let exhausted = false;
  let patch: CatalogPatch = { initialized: true, channels: [], titles: [] };
  let channel = readChannelRecord(username);

  try {
    while (rounds < maxRounds) {
      const previousCursor = more ? channel?.lastBefore : undefined;
      const result = await syncPublicChannel({
        username,
        before: previousCursor,
        pages: options.pages ?? (more ? 2 : 3),
        proxy: options.proxy,
      });
      const roundPatch = applySyncToSqlite(username, result, more);
      patch = accumulatePatch(patch, roundPatch);
      channel = roundPatch.channels?.[0] ?? readChannelRecord(username);
      const summary = summarizeSync(result);
      rounds += 1;
      posts += summary.posts;
      usable += summary.usable;
      skipped += summary.skipped;
      dropped += summary.dropped;
      nextBefore = result.nextBefore;
      channelTitle = result.channel.title;
      if (
        !result.nextBefore ||
        cursorDidNotAdvance(more, previousCursor, result.nextBefore)
      ) {
        exhausted = true;
        break;
      }
      if (!untilEnd) break;
      more = true;
    }
    return {
      patch,
      exhausted,
      rounds,
      posts,
      usable,
      skipped,
      dropped,
      nextBefore,
      channelTitle,
    };
  } catch (error) {
    recordSyncError(username, error);
    throw error;
  }
}

export async function ingestAccountChannelToSqlite(options: {
  username: string;
  peerId?: string;
  session: string;
  apiId?: number | string;
  apiHash?: string;
  more?: boolean;
  untilEnd?: boolean;
  maxRounds?: number;
}): Promise<IngestReport> {
  const username = options.username;
  const untilEnd = Boolean(options.untilEnd);
  const maxRounds = untilEnd
    ? Math.min(Math.max(options.maxRounds ?? 6, 1), 10)
    : 1;
  let more = Boolean(options.more);
  if (untilEnd && !more) {
    more = Boolean(readChannelRecord(username)?.lastBefore);
  }

  let rounds = 0;
  let posts = 0;
  let usable = 0;
  let skipped = 0;
  let dropped = 0;
  let nextBefore: string | undefined;
  let channelTitle: string | undefined;
  let exhausted = false;
  let session = options.session;
  let patch: CatalogPatch = { initialized: true, channels: [], titles: [] };
  let channel = readChannelRecord(username);

  try {
    while (rounds < maxRounds) {
      const previousCursor = more ? channel?.lastBefore : undefined;
      const synced = await syncAccountChannel({
        session,
        apiId: options.apiId,
        apiHash: options.apiHash,
        username: channel?.username ?? username,
        peerId: options.peerId ?? channel?.peerId,
        offsetId: previousCursor ? Number(previousCursor) : undefined,
        limit: more ? 60 : 80,
      });
      session = synced.session;
      const result = synced.result;
      const roundPatch = applySyncToSqlite(username, result, more);
      patch = accumulatePatch(patch, roundPatch);
      channel = roundPatch.channels?.[0] ?? readChannelRecord(username);
      const summary = summarizeSync(result);
      rounds += 1;
      posts += summary.posts;
      usable += summary.usable;
      skipped += summary.skipped;
      dropped += summary.dropped;
      nextBefore = result.nextBefore;
      channelTitle = result.channel.title;
      if (
        !result.nextBefore ||
        cursorDidNotAdvance(more, previousCursor, result.nextBefore)
      ) {
        exhausted = true;
        break;
      }
      if (!untilEnd) break;
      more = true;
    }
    return {
      patch,
      exhausted,
      rounds,
      posts,
      usable,
      skipped,
      dropped,
      nextBefore,
      channelTitle,
      session,
    };
  } catch (error) {
    recordSyncError(username, error);
    throw error;
  }
}
