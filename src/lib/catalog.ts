import { hasCloudOrMagnetLink, titlePosterUrl } from "@/lib/labels";
import type { ChannelRecord, TitleRecord } from "@/lib/types";
import { resourceKey } from "@/lib/parser";

function laterIso(a?: string, b?: string): string {
  if (!a) return b ?? new Date().toISOString();
  if (!b) return a;
  return new Date(a) >= new Date(b) ? a : b;
}

function earlierIso(a?: string, b?: string): string {
  if (!a) return b ?? new Date().toISOString();
  if (!b) return a;
  return new Date(a) <= new Date(b) ? a : b;
}

function preferText(a?: string, b?: string): string | undefined {
  const left = a?.trim() ?? "";
  const right = b?.trim() ?? "";
  if (right.length > left.length) return right;
  return left || undefined;
}

export function titleResourceKey(title: TitleRecord): string {
  return resourceKey({
    title: title.title,
    year: title.year,
    type: title.type,
    season: title.editions[0]?.season,
  });
}

export function combineTitles(
  keeper: TitleRecord,
  extra: TitleRecord,
): TitleRecord {
  const editionIds = new Set(keeper.editions.map((edition) => edition.id));
  const editions = [...keeper.editions];
  for (const edition of extra.editions) {
    if (editionIds.has(edition.id)) continue;
    editions.push(edition);
    editionIds.add(edition.id);
  }

  return {
    ...keeper,
    editions,
    originalTitle: preferText(keeper.originalTitle, extra.originalTitle),
    overview: preferText(keeper.overview, extra.overview),
    director: preferText(keeper.director, extra.director),
    posterUrl: titlePosterUrl({
      ...keeper,
      editions,
      posterUrl: keeper.posterUrl || extra.posterUrl,
    }),
    year: keeper.year ?? extra.year,
    douban:
      Math.max(keeper.douban ?? 0, extra.douban ?? 0) ||
      keeper.douban ||
      extra.douban,
    imdb:
      Math.max(keeper.imdb ?? 0, extra.imdb ?? 0) || keeper.imdb || extra.imdb,
    genres: [...new Set([...keeper.genres, ...extra.genres])],
    cast: [...new Set([...keeper.cast, ...extra.cast])],
    firstSeenAt: earlierIso(keeper.firstSeenAt, extra.firstSeenAt),
    lastSeenAt: laterIso(keeper.lastSeenAt, extra.lastSeenAt),
  };
}

export function mergeTitles(existing: TitleRecord[]): TitleRecord[] {
  const map = new Map<string, TitleRecord>();

  for (const title of existing) {
    const key = titleResourceKey(title);
    const prev = map.get(key);
    if (!prev) {
      map.set(key, {
        ...title,
        editions: [...title.editions],
        genres: [...title.genres],
        cast: [...title.cast],
      });
      continue;
    }
    map.set(key, combineTitles(prev, title));
  }

  return [...map.values()]
    .filter(hasCloudOrMagnetLink)
    .sort((a, b) => b.lastSeenAt.localeCompare(a.lastSeenAt));
}

export function mergeCatalog(
  current: TitleRecord[],
  incoming: TitleRecord[],
): TitleRecord[] {
  return mergeTitles([...current, ...incoming]);
}

export function recountChannel(
  channel: ChannelRecord,
  titles: TitleRecord[],
  extras?: Partial<ChannelRecord>,
): ChannelRecord {
  const related = titles.filter((t) =>
    t.editions.some((e) => e.channel === channel.username),
  );
  const posts = new Set(
    related.flatMap((t) =>
      t.editions
        .filter((e) => e.channel === channel.username)
        .map((e) => e.id),
    ),
  );
  return {
    ...channel,
    ...extras,
    resourceCount: related.length,
    postCount: extras?.postCount ?? Math.max(channel.postCount, posts.size),
  };
}

export type CatalogStats = {
  titleCount: number;
  editionCount: number;
  channelCount: number;
  linkCount: number;
  byType: Record<string, number>;
  byYear: Array<{ year: string; count: number }>;
  byResolution: Array<{ label: string; count: number }>;
  bySource: Array<{ kind: string; count: number }>;
  byChannel: Array<{ username: string; title: string; count: number }>;
};

export function summarizeCatalog(
  titles: TitleRecord[],
  channels: ChannelRecord[],
): CatalogStats {
  const byType: Record<string, number> = {
    movie: 0,
    series: 0,
    anime: 0,
    documentary: 0,
    other: 0,
  };
  const yearMap = new Map<number, number>();
  const resolutionMap = new Map<string, number>();
  const sourceMap = new Map<string, number>();
  const channelMap = new Map<string, number>();
  let editionCount = 0;
  let linkCount = 0;

  for (const title of titles) {
    byType[title.type] = (byType[title.type] ?? 0) + 1;
    if (title.year) {
      yearMap.set(title.year, (yearMap.get(title.year) ?? 0) + 1);
    }
    editionCount += title.editions.length;
    for (const edition of title.editions) {
      const res = edition.resolution ?? "未知";
      resolutionMap.set(res, (resolutionMap.get(res) ?? 0) + 1);
      channelMap.set(
        edition.channel,
        (channelMap.get(edition.channel) ?? 0) + 1,
      );
      for (const link of edition.links) {
        linkCount += 1;
        sourceMap.set(link.kind, (sourceMap.get(link.kind) ?? 0) + 1);
      }
    }
  }

  const channelTitle = (username: string) =>
    channels.find((c) => c.username === username)?.title ?? username;

  return {
    titleCount: titles.length,
    editionCount,
    channelCount: channels.length,
    linkCount,
    byType,
    byYear: [...yearMap.entries()]
      .sort((a, b) => b[0] - a[0])
      .map(([year, count]) => ({ year: String(year), count })),
    byResolution: [...resolutionMap.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([label, count]) => ({ label, count })),
    bySource: [...sourceMap.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([kind, count]) => ({ kind, count })),
    byChannel: [...channelMap.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([username, count]) => ({
        username,
        title: channelTitle(username),
        count,
      })),
  };
}

export function uniqueResolutions(title: TitleRecord): string[] {
  return [
    ...new Set(
      title.editions
        .map((e) => e.resolution)
        .filter((v): v is string => Boolean(v)),
    ),
  ];
}

export function sameChannel(left: string, right: string) {
  return left.trim().toLowerCase() === right.trim().toLowerCase();
}

export function nextHistoryCursor(options: {
  more: boolean;
  previous?: string;
  incoming?: string;
}): string | undefined {
  if (options.more) return options.incoming;
  return options.previous ?? options.incoming;
}

export function nextPostCount(options: {
  more: boolean;
  previous: number;
  incoming: number;
}): number {
  if (options.more) return options.previous + options.incoming;
  return Math.max(options.previous, options.incoming);
}

export function historyFetchMore(options: {
  untilEnd: boolean;
  requestedMore: boolean;
  lastBefore?: string;
  passIndex: number;
}): boolean {
  if (!options.untilEnd) return options.requestedMore;
  if (options.passIndex > 0) return true;
  return Boolean(options.requestedMore || options.lastBefore);
}

export function uniqueLinkKinds(title: TitleRecord): string[] {
  return [
    ...new Set(title.editions.flatMap((e) => e.links.map((l) => l.kind))),
  ];
}
