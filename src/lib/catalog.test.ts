import assert from "node:assert/strict";
import test from "node:test";
import { mergeTitles, nextHistoryCursor, nextPostCount } from "./catalog.ts";
import { hasCloudOrMagnetLink } from "./labels.ts";
import type { Edition, TitleRecord } from "./types.ts";

function titleWithLinks(
  name: string,
  kinds: Array<"quark" | "magnet" | "telegram" | "other">,
): TitleRecord {
  const edition: Edition = {
    id: `${name}-1`,
    channel: "demo",
    channelTitle: "demo",
    messageId: 1,
    postUrl: "https://t.me/demo/1",
    links: kinds.map((kind, index) => ({
      kind,
      url:
        kind === "magnet"
          ? `magnet:?xt=urn:btih:${"a".repeat(40)}`
          : kind === "quark"
            ? `https://pan.quark.cn/s/${name}`
            : `https://t.me/demo/${index + 2}`,
    })),
    rawText: name,
  };
  return {
    id: name,
    title: name,
    type: "movie",
    genres: [],
    cast: [],
    editions: [edition],
    firstSeenAt: "2026-01-01T00:00:00.000Z",
    lastSeenAt: "2026-01-01T00:00:00.000Z",
  };
}

test("keeps titles that have cloud or magnet links", () => {
  const cloud = titleWithLinks("有网盘", ["quark"]);
  const magnet = titleWithLinks("有磁力", ["magnet"]);
  const both = titleWithLinks("都有", ["quark", "magnet"]);
  assert.equal(hasCloudOrMagnetLink(cloud), true);
  assert.equal(hasCloudOrMagnetLink(magnet), true);
  assert.equal(hasCloudOrMagnetLink(both), true);
});

test("drops titles that only have telegram or no shareable links", () => {
  const telegram = titleWithLinks("只有频道", ["telegram"]);
  const empty = titleWithLinks("没链接", []);
  assert.equal(hasCloudOrMagnetLink(telegram), false);
  assert.equal(hasCloudOrMagnetLink(empty), false);
  const merged = mergeTitles([telegram, empty, titleWithLinks("夸克", ["quark"])]);
  assert.equal(merged.length, 1);
  assert.equal(merged[0].title, "夸克");
});

test("sync latest keeps the older history cursor for 往前翻", () => {
  assert.equal(
    nextHistoryCursor({ more: false, previous: "800", incoming: "1200" }),
    "800",
  );
  assert.equal(
    nextHistoryCursor({ more: true, previous: "800", incoming: "600" }),
    "600",
  );
  assert.equal(
    nextHistoryCursor({ more: false, incoming: "1200" }),
    "1200",
  );
  assert.equal(
    nextHistoryCursor({ more: true, previous: "800" }),
    undefined,
  );
  assert.equal(nextPostCount({ more: true, previous: 80, incoming: 24 }), 104);
  assert.equal(nextPostCount({ more: false, previous: 80, incoming: 24 }), 80);
});
