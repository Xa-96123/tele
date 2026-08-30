import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import {
  applyAndSave,
  catalogTableCounts,
  closeCatalogDb,
  emptyCatalogState,
  readCatalogState,
  replaceCatalogState,
} from "./catalog-db.ts";
import type { CatalogState, Edition, TitleRecord } from "./types.ts";

function tempDb() {
  const dir = mkdtempSync(path.join(tmpdir(), "yingqu-db-"));
  return {
    file: path.join(dir, "yingqu.sqlite"),
    dir,
  };
}

const edition: Edition = {
  id: "e1",
  channel: "aliyun_4k",
  channelTitle: "阿里云盘高清",
  messageId: 88,
  postUrl: "https://t.me/aliyun_4k/88",
  postedAt: "2026-03-01T00:00:00.000Z",
  quality: "蓝光",
  resolution: "2160p",
  sizeLabel: "40GB",
  links: [
    { kind: "aliyun", url: "https://www.aliyundrive.com/s/abc" },
    { kind: "quark", url: "https://pan.quark.cn/s/def", label: "夸克" },
  ],
  rawText: "很长的原文".repeat(200),
  photoUrl: "data:image/svg+xml;utf8,x",
};

const title: TitleRecord = {
  id: "t1",
  title: "沙丘2",
  originalTitle: "Dune: Part Two",
  year: 2024,
  type: "movie",
  genres: ["科幻"],
  douban: 8.2,
  imdb: 8.5,
  overview: "简介".repeat(400),
  director: "丹尼斯·维伦纽夫",
  cast: ["提莫西·查拉梅"],
  posterUrl: "data:image/svg+xml;utf8,x",
  editions: [edition],
  firstSeenAt: "2026-03-01T00:00:00.000Z",
  lastSeenAt: "2026-03-02T00:00:00.000Z",
};

const catalog: CatalogState = {
  version: 1,
  initialized: true,
  noticeDismissed: true,
  channels: [
    {
      username: "aliyun_4k",
      title: "阿里云盘高清",
      description: "4K 资源",
      addedAt: "2026-03-01T00:00:00.000Z",
      lastSyncedAt: "2026-03-02T00:00:00.000Z",
      lastBefore: "80",
      postCount: 12,
      resourceCount: 1,
      status: "idle",
      source: "preview",
    },
  ],
  titles: [title],
};

test("empty sqlite catalog is uninitialized", () => {
  const { file, dir } = tempDb();
  try {
    const state = readCatalogState(file);
    assert.deepEqual(state, emptyCatalogState());
    assert.deepEqual(catalogTableCounts(file), {
      channels: 0,
      titles: 0,
      editions: 0,
      links: 0,
    });
  } finally {
    closeCatalogDb(file);
    rmSync(dir, { recursive: true, force: true });
  }
});

test("replaceCatalogState writes normalized tables and reads back", () => {
  const { file, dir } = tempDb();
  try {
    replaceCatalogState(catalog, file);
    const counts = catalogTableCounts(file);
    assert.equal(counts.channels, 1);
    assert.equal(counts.titles, 1);
    assert.equal(counts.editions, 1);
    assert.equal(counts.links, 2);

    const loaded = readCatalogState(file);
    assert.equal(loaded.initialized, true);
    assert.equal(loaded.noticeDismissed, true);
    assert.equal(loaded.channels[0]?.username, "aliyun_4k");
    assert.equal(loaded.channels[0]?.lastBefore, "80");
    assert.equal(loaded.titles[0]?.title, "沙丘2");
    assert.equal(loaded.titles[0]?.year, 2024);
    assert.deepEqual(loaded.titles[0]?.genres, ["科幻"]);
    assert.equal(loaded.titles[0]?.editions[0]?.links.length, 2);
    assert.equal(loaded.titles[0]?.editions[0]?.links[1]?.kind, "quark");
    assert.equal(loaded.titles[0]?.posterUrl, undefined);
    assert.equal(loaded.titles[0]?.editions[0]?.photoUrl, undefined);
    assert.ok((loaded.titles[0]?.editions[0]?.rawText.length ?? 0) < edition.rawText.length);
  } finally {
    closeCatalogDb(file);
    rmSync(dir, { recursive: true, force: true });
  }
});

test("applyAndSave reads, mutates, and writes sqlite tables", () => {
  const { file, dir } = tempDb();
  try {
    replaceCatalogState(catalog, file);
    const next = applyAndSave(
      (state) => ({
        ...state,
        channels: state.channels.map((channel) => ({
          ...channel,
          lastBefore: "40",
          postCount: channel.postCount + 3,
        })),
      }),
      file,
    );
    assert.equal(next.channels[0]?.lastBefore, "40");
    assert.equal(next.channels[0]?.postCount, 15);
    assert.equal(readCatalogState(file).channels[0]?.lastBefore, "40");
    assert.deepEqual(catalogTableCounts(file), {
      channels: 1,
      titles: 1,
      editions: 1,
      links: 2,
    });
  } finally {
    closeCatalogDb(file);
    rmSync(dir, { recursive: true, force: true });
  }
});

test("replaceCatalogState overwrites previous rows", () => {
  const { file, dir } = tempDb();
  try {
    replaceCatalogState(catalog, file);
    replaceCatalogState(
      {
        version: 1,
        initialized: true,
        noticeDismissed: true,
        channels: [],
        titles: [],
      },
      file,
    );
    assert.deepEqual(catalogTableCounts(file), {
      channels: 0,
      titles: 0,
      editions: 0,
      links: 0,
    });
    assert.equal(readCatalogState(file).titles.length, 0);
  } finally {
    closeCatalogDb(file);
    rmSync(dir, { recursive: true, force: true });
  }
});
