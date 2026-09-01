import assert from "node:assert/strict";
import test from "node:test";
import {
  combineTitles,
  historyFetchMore,
  mergeTitles,
  nextHistoryCursor,
  nextPostCount,
  recountChannel,
  sameChannel,
} from "./catalog.ts";
import { hasCloudOrMagnetLink } from "./labels.ts";
import type { Edition, TitleRecord } from "./types.ts";

function titleWithLinks(
  name: string,
    kinds: Array<"quark" | "aliyun" | "magnet" | "telegram" | "other">,
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
            : kind === "aliyun"
              ? `https://www.alipan.com/s/${name}`
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

test("sameChannel ignores case and surrounding spaces", () => {
  assert.equal(sameChannel("Aliyun_4K_Movies", "aliyun_4k_movies"), true);
  assert.equal(sameChannel(" demo ", "demo"), true);
  assert.equal(sameChannel("a", "b"), false);
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

test("historyFetchMore continues from lastBefore when flipping to the end", () => {
  assert.equal(
    historyFetchMore({
      untilEnd: false,
      requestedMore: false,
      lastBefore: "80",
      passIndex: 0,
    }),
    false,
  );
  assert.equal(
    historyFetchMore({
      untilEnd: true,
      requestedMore: false,
      lastBefore: "80",
      passIndex: 0,
    }),
    true,
  );
  assert.equal(
    historyFetchMore({
      untilEnd: true,
      requestedMore: false,
      passIndex: 0,
    }),
    false,
  );
  assert.equal(
    historyFetchMore({
      untilEnd: true,
      requestedMore: false,
      passIndex: 1,
    }),
    true,
  );
});

test("recountChannel keeps explicit postCount from extras", () => {
  const counted = recountChannel(
    {
      username: "demo",
      title: "demo",
      description: "",
      addedAt: "2026-01-01T00:00:00.000Z",
      postCount: 0,
      resourceCount: 0,
      status: "idle",
    },
    [titleWithLinks("夸克", ["quark"])],
    { postCount: 3 },
  );
  assert.equal(counted.resourceCount, 1);
  assert.equal(counted.postCount, 3);
});

test("combineTitles keeps keeper identity and appends editions", () => {
  const dune2 = titleWithLinks("沙丘2", ["quark"]);
  dune2.year = 2024;
  const dune = titleWithLinks("沙丘", ["aliyun"]);
  dune.year = 2021;
  dune.originalTitle = "Dune";
  dune.editions[0]!.id = "沙丘-other";
  dune.editions[0]!.channel = "other";
  const combined = combineTitles(dune2, dune);
  assert.equal(combined.id, dune2.id);
  assert.equal(combined.title, "沙丘2");
  assert.equal(combined.year, 2024);
  assert.equal(combined.editions.length, 2);
  assert.equal(combined.originalTitle, "Dune");
});
