import assert from "node:assert/strict";
import test from "node:test";
import { applyCatalogPatch, isCatalogPatch } from "./catalog-patch.ts";
import type { CatalogState, TitleRecord } from "./types.ts";

function title(id: string, name: string, channel: string): TitleRecord {
  return {
    id,
    title: name,
    type: "movie",
    genres: [],
    cast: [],
    editions: [
      {
        id: `${channel}-${id}`,
        channel,
        channelTitle: channel,
        messageId: 1,
        postUrl: `https://t.me/${channel}/1`,
        links: [{ kind: "quark", url: `https://pan.quark.cn/s/${id}` }],
        rawText: name,
      },
    ],
    firstSeenAt: "2026-01-01T00:00:00.000Z",
    lastSeenAt: "2026-01-02T00:00:00.000Z",
  };
}

const base: CatalogState = {
  version: 1,
  initialized: true,
  noticeDismissed: false,
  channels: [
    {
      username: "keep",
      title: "保留",
      description: "",
      addedAt: "2026-01-01T00:00:00.000Z",
      postCount: 2,
      resourceCount: 1,
      status: "idle",
    },
  ],
  titles: [title("t1", "沙丘2", "keep")],
};

test("isCatalogPatch accepts incremental payloads", () => {
  assert.equal(isCatalogPatch({ titles: [] }), true);
  assert.equal(isCatalogPatch({ removedChannel: "keep" }), true);
  assert.equal(isCatalogPatch({ version: 1 }), false);
  assert.equal(isCatalogPatch(null), false);
});

test("applyCatalogPatch upserts titles without dropping others", () => {
  const next = applyCatalogPatch(base, {
    titles: [title("t2", "三体", "other")],
    channels: [
      {
        username: "other",
        title: "其他",
        description: "",
        addedAt: "2026-01-03T00:00:00.000Z",
        postCount: 1,
        resourceCount: 1,
        status: "idle",
      },
    ],
  });
  assert.equal(next.titles.length, 2);
  assert.equal(next.channels.length, 2);
  assert.equal(next.titles.some((item) => item.title === "沙丘2"), true);
});

test("applyCatalogPatch removes a channel and orphan titles", () => {
  const withBoth = applyCatalogPatch(base, {
    titles: [title("t2", "三体", "other")],
    channels: [
      {
        username: "other",
        title: "其他",
        description: "",
        addedAt: "2026-01-03T00:00:00.000Z",
        postCount: 1,
        resourceCount: 1,
        status: "idle",
      },
    ],
  });
  const removed = applyCatalogPatch(withBoth, { removedChannel: "other" });
  assert.equal(removed.channels.length, 1);
  assert.equal(removed.titles.length, 1);
  assert.equal(removed.titles[0]?.title, "沙丘2");
});
