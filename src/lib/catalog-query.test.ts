import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import {
  closeCatalogDb,
  readCatalogShell,
  replaceCatalogState,
  setNoticeDismissedInSqlite,
} from "./catalog-db.ts";
import { parseTitleListQuery, queryTitleList } from "./catalog-query.ts";
import type { CatalogState, Edition, TitleRecord } from "./types.ts";

function tempDb() {
  const dir = mkdtempSync(path.join(tmpdir(), "yingqu-query-"));
  return {
    file: path.join(dir, "yingqu.sqlite"),
    dir,
  };
}

function edition(
  id: string,
  channel: string,
  extras: Partial<Edition> & Pick<Edition, "links">,
): Edition {
  return {
    id,
    channel,
    channelTitle: extras.channelTitle ?? channel,
    messageId: extras.messageId ?? 1,
    postUrl: extras.postUrl ?? `https://t.me/${channel}/1`,
    postedAt: extras.postedAt,
    quality: extras.quality,
    resolution: extras.resolution,
    sizeLabel: extras.sizeLabel,
    links: extras.links,
    rawText: extras.rawText ?? id,
    photoUrl: extras.photoUrl,
  };
}

function title(record: Partial<TitleRecord> & Pick<TitleRecord, "id" | "title" | "editions">): TitleRecord {
  return {
    originalTitle: record.originalTitle,
    year: record.year,
    type: record.type ?? "movie",
    genres: record.genres ?? [],
    douban: record.douban,
    imdb: record.imdb,
    overview: record.overview,
    director: record.director,
    cast: record.cast ?? [],
    posterUrl: record.posterUrl,
    firstSeenAt: record.firstSeenAt ?? "2026-03-01T00:00:00.000Z",
    lastSeenAt: record.lastSeenAt ?? "2026-03-02T00:00:00.000Z",
    ...record,
  };
}

const catalog: CatalogState = {
  version: 1,
  initialized: true,
  noticeDismissed: false,
  channels: [
    {
      username: "aliyun_4k",
      title: "阿里云盘高清",
      description: "",
      addedAt: "2026-03-01T00:00:00.000Z",
      postCount: 2,
      resourceCount: 2,
      status: "idle",
    },
    {
      username: "magnet_house",
      title: "磁力仓库",
      description: "",
      addedAt: "2026-03-01T00:00:00.000Z",
      postCount: 1,
      resourceCount: 1,
      status: "idle",
    },
  ],
  titles: [
    title({
      id: "t1",
      title: "沙丘2",
      originalTitle: "Dune: Part Two",
      year: 2024,
      type: "movie",
      director: "丹尼斯·维伦纽夫",
      douban: 8.2,
      lastSeenAt: "2026-03-03T00:00:00.000Z",
      editions: [
        edition("e1", "aliyun_4k", {
          resolution: "2160p",
          links: [{ kind: "aliyun", url: "https://www.aliyundrive.com/s/abc" }],
        }),
      ],
    }),
    title({
      id: "t2",
      title: "漫长的季节",
      year: 2023,
      type: "series",
      lastSeenAt: "2026-03-01T00:00:00.000Z",
      editions: [
        edition("e2", "magnet_house", {
          resolution: "1080p",
          links: [{ kind: "magnet", url: "magnet:?xt=urn:btih:abcd" }],
        }),
      ],
    }),
    title({
      id: "t3",
      title: "只有外链的预告",
      year: 2020,
      lastSeenAt: "2026-03-04T00:00:00.000Z",
      editions: [
        edition("e3", "aliyun_4k", {
          links: [{ kind: "other", url: "https://example.com/trailer" }],
        }),
      ],
    }),
  ],
};

test("queryTitleList pages shareable titles and skips titles without 网盘 or 磁力", () => {
  const { file, dir } = tempDb();
  try {
    replaceCatalogState(catalog, file);
    const first = queryTitleList({ limit: 1, offset: 0, sort: "recent" }, file);
    assert.equal(first.shareableTotal, 2);
    assert.equal(first.total, 2);
    assert.equal(first.titles.length, 1);
    assert.equal(first.titles[0]?.title, "沙丘2");
    assert.deepEqual(first.years, [2024, 2023]);
    assert.ok(first.kinds.includes("aliyun"));
    assert.ok(first.kinds.includes("magnet"));
    assert.equal(first.titles.some((item) => item.title.includes("预告")), false);

    const second = queryTitleList({ limit: 1, offset: 1, sort: "recent" }, file);
    assert.equal(second.titles[0]?.title, "漫长的季节");
  } finally {
    closeCatalogDb(file);
    rmSync(dir, { recursive: true, force: true });
  }
});

test("queryTitleList filters by year, type, channel, quality, source and search", () => {
  const { file, dir } = tempDb();
  try {
    replaceCatalogState(catalog, file);
    assert.equal(queryTitleList({ year: "2023" }, file).titles[0]?.title, "漫长的季节");
    assert.equal(queryTitleList({ type: "movie" }, file).total, 1);
    assert.equal(
      queryTitleList({ channel: "magnet_house" }, file).titles[0]?.title,
      "漫长的季节",
    );
    assert.equal(queryTitleList({ quality: "2160p" }, file).titles[0]?.title, "沙丘2");
    assert.equal(queryTitleList({ source: "magnet" }, file).total, 1);
    assert.equal(queryTitleList({ q: "dune" }, file).titles[0]?.title, "沙丘2");
    assert.equal(queryTitleList({ q: "urn:btih" }, file).titles[0]?.title, "漫长的季节");
    assert.equal(queryTitleList({ q: "没有这部" }, file).total, 0);
  } finally {
    closeCatalogDb(file);
    rmSync(dir, { recursive: true, force: true });
  }
});

test("readCatalogShell omits titles and counts only shareable rows", () => {
  const { file, dir } = tempDb();
  try {
    replaceCatalogState(catalog, file);
    const shell = readCatalogShell(file);
    assert.equal(shell.titles.length, 0);
    assert.equal(shell.titleCount, 2);
    assert.equal(shell.channels.length, 2);
    assert.equal(shell.initialized, true);
    assert.equal(shell.noticeDismissed, false);

    const patch = setNoticeDismissedInSqlite(true, file);
    assert.equal(patch.noticeDismissed, true);
    assert.equal(readCatalogShell(file).noticeDismissed, true);
  } finally {
    closeCatalogDb(file);
    rmSync(dir, { recursive: true, force: true });
  }
});

test("parseTitleListQuery clamps page size unless exporting", () => {
  const page = parseTitleListQuery(
    new URLSearchParams("limit=999&offset=-3&sort=year&q=沙丘"),
  );
  assert.equal(page.limit, 48);
  assert.equal(page.offset, 0);
  assert.equal(page.sort, "year");
  assert.equal(page.q, "沙丘");

  const exported = parseTitleListQuery(
    new URLSearchParams("limit=9999"),
    { forExport: true },
  );
  assert.equal(exported.limit, 5000);
});
