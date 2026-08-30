import { sameChannel, titleResourceKey } from "@/lib/catalog";
import type { CatalogPatch, CatalogState, ChannelRecord, TitleRecord } from "@/lib/types";

export function isCatalogPatch(value: unknown): value is CatalogPatch {
  if (!value || typeof value !== "object") return false;
  const record = value as CatalogPatch;
  if (record.channels !== undefined && !Array.isArray(record.channels)) {
    return false;
  }
  if (record.titles !== undefined && !Array.isArray(record.titles)) {
    return false;
  }
  if (
    record.removedTitleIds !== undefined &&
    !Array.isArray(record.removedTitleIds)
  ) {
    return false;
  }
  return (
    record.channels !== undefined ||
    record.titles !== undefined ||
    record.removedChannel !== undefined ||
    record.removedTitleIds !== undefined ||
    record.initialized !== undefined ||
    record.noticeDismissed !== undefined
  );
}

export function applyCatalogPatch(
  state: CatalogState,
  patch: CatalogPatch,
): CatalogState {
  let channels = state.channels;
  let titles = state.titles;

  if (patch.removedChannel) {
    const username = patch.removedChannel;
    titles = titles
      .map((title) => ({
        ...title,
        editions: title.editions.filter(
          (edition) => !sameChannel(edition.channel, username),
        ),
      }))
      .filter((title) => title.editions.length > 0);
    channels = channels.filter(
      (channel) => !sameChannel(channel.username, username),
    );
  }

  if (patch.removedTitleIds?.length) {
    const drop = new Set(patch.removedTitleIds);
    titles = titles.filter((title) => !drop.has(title.id));
  }

  if (patch.titles?.length) {
    const byId = new Map<string, TitleRecord>();
    const byKey = new Map<string, string>();
    for (const title of titles) {
      byId.set(title.id, title);
      byKey.set(titleResourceKey(title), title.id);
    }
    for (const incoming of patch.titles) {
      const key = titleResourceKey(incoming);
      const previousId = byId.has(incoming.id)
        ? incoming.id
        : byKey.get(key);
      if (previousId && previousId !== incoming.id) {
        byId.delete(previousId);
      }
      byId.set(incoming.id, incoming);
      byKey.set(key, incoming.id);
    }
    titles = [...byId.values()].sort((left, right) =>
      right.lastSeenAt.localeCompare(left.lastSeenAt),
    );
  }

  if (patch.channels?.length) {
    for (const incoming of patch.channels) {
      channels = upsertChannelList(channels, incoming);
    }
  }

  return {
    ...state,
    initialized: patch.initialized ?? state.initialized,
    noticeDismissed: patch.noticeDismissed ?? state.noticeDismissed,
    channels,
    titles,
  };
}

function upsertChannelList(
  channels: ChannelRecord[],
  incoming: ChannelRecord,
): ChannelRecord[] {
  const index = channels.findIndex((channel) =>
    sameChannel(channel.username, incoming.username),
  );
  if (index < 0) return [...channels, incoming];
  return channels.map((channel, current) =>
    current === index ? incoming : channel,
  );
}
