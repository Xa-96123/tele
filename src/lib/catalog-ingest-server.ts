import {
  applySyncResult,
  markChannelErrorInState,
  summarizeSync,
} from "@/lib/catalog-apply";
import { sameChannel } from "@/lib/catalog";
import { applyAndSave, readCatalogState } from "@/lib/catalog-db";
import { syncAccountChannel } from "@/lib/account";
import { syncPublicChannel } from "@/lib/telegram";
import type { CatalogState } from "@/lib/types";

export type IngestReport = {
  state: CatalogState;
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
  applyAndSave((prev) => markChannelErrorInState(prev, username, message));
}

function cursorDidNotAdvance(
  more: boolean,
  previous: string | undefined,
  incoming: string | undefined,
) {
  return Boolean(more && previous && incoming && incoming === previous);
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
    const existing = readCatalogState().channels.find((channel) =>
      sameChannel(channel.username, username),
    );
    more = Boolean(existing?.lastBefore);
  }

  let rounds = 0;
  let posts = 0;
  let usable = 0;
  let skipped = 0;
  let dropped = 0;
  let nextBefore: string | undefined;
  let channelTitle: string | undefined;
  let exhausted = false;
  let state = readCatalogState();

  try {
    while (rounds < maxRounds) {
      const current = state.channels.find((channel) =>
        sameChannel(channel.username, username),
      );
      const result = await syncPublicChannel({
        username,
        before: more ? current?.lastBefore : undefined,
        pages: options.pages ?? (more ? 2 : 3),
        proxy: options.proxy,
      });
      state = applyAndSave((prev) =>
        applySyncResult(prev, username, result, more),
      );
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
        cursorDidNotAdvance(more, current?.lastBefore, result.nextBefore)
      ) {
        exhausted = true;
        break;
      }
      if (!untilEnd) break;
      more = true;
    }
    return {
      state,
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
    const existing = readCatalogState().channels.find((channel) =>
      sameChannel(channel.username, username),
    );
    more = Boolean(existing?.lastBefore);
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
  let state = readCatalogState();

  try {
    while (rounds < maxRounds) {
      const current = state.channels.find((channel) =>
        sameChannel(channel.username, username),
      );
      const synced = await syncAccountChannel({
        session,
        apiId: options.apiId,
        apiHash: options.apiHash,
        username: current?.username ?? username,
        peerId: options.peerId ?? current?.peerId,
        offsetId:
          more && current?.lastBefore ? Number(current.lastBefore) : undefined,
        limit: more ? 60 : 80,
      });
      session = synced.session;
      const result = synced.result;
      state = applyAndSave((prev) =>
        applySyncResult(prev, username, result, more),
      );
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
        cursorDidNotAdvance(more, current?.lastBefore, result.nextBefore)
      ) {
        exhausted = true;
        break;
      }
      if (!untilEnd) break;
      more = true;
    }
    return {
      state,
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
