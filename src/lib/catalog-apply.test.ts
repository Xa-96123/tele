import assert from "node:assert/strict";
import test from "node:test";
import {
  applyImport,
  applySyncResult,
  markChannelErrorInState,
  removeChannelFromState,
  summarizeSync,
} from "./catalog-apply.ts";
import type { CatalogState, SyncResult, TitleRecord } from "./types.ts";

function title(
  id: string,
  name: string,
  channel: string,
  url: string,
): TitleRecord {
  return {
    id,
    title: name,
    type: "movie",
    genres: [],
    cast: [],
    editions: [
      {
        id: `${id}-e`,
        channel,
        channelTitle: channel,
        messageId: 1,
        postUrl: `https://t.me/${channel}/1`,
        links: [{ kind: "quark", url }],
        rawText: name,
      },
    ],
    firstSeenAt: "2026-01-01T00:00:00.000Z",
    lastSeenAt: "2026-01-01T00:00:00.000Z",
  };
}

const empty: CatalogState = {
  version: 1,
  initialized: false,
  noticeDismissed: false,
  channels: [],
  titles: [],
};

test("applySyncResult writes channel cursor and keeps older lastBefore on latest", () => {
  const first: SyncResult = {
    channel: { username: "DemoChan", title: "演示", description: "" },
    posts: [{ channel: "DemoChan", messageId: 10, postUrl: "https://t.me/DemoChan/10", text: "a", hrefs: [] }],
    titles: [title("t1", "沙丘2", "DemoChan", "https://pan.quark.cn/s/a")],
    skipped: 0,
    nextBefore: "80",
    fetchedPages: 1,
  };
  const afterLatest = applySyncResult(empty, "DemoChan", first, false);
  const stored = applySyncResult(afterLatest, "demochan", first, false);
  assert.equal(stored.initialized, true);
  assert.equal(stored.channels[0]?.username, "DemoChan");
  assert.equal(stored.channels[0]?.lastBefore, "80");

  const older: SyncResult = {
    ...first,
    nextBefore: "40",
    titles: [title("t2", "三体", "DemoChan", "https://pan.quark.cn/s/b")],
  };
  const afterMore = applySyncResult(stored, "DemoChan", older, true);
  assert.equal(afterMore.channels[0]?.lastBefore, "40");
  assert.equal(afterMore.titles.length, 2);
});

test("applyImport and removeChannelFromState keep sqlite-shaped catalog", () => {
  const imported = applyImport(
    empty,
    [title("t1", "沙丘2", "imported", "https://pan.quark.cn/s/a")],
    3,
  );
  assert.equal(imported.channels[0]?.username, "imported");
  assert.equal(imported.channels[0]?.postCount, 3);
  const removed = removeChannelFromState(imported, "imported");
  assert.equal(removed.channels.length, 0);
  assert.equal(removed.titles.length, 0);
});

test("markChannelErrorInState does not drop titles", () => {
  const synced = applySyncResult(
    empty,
    "demo",
    {
      channel: { username: "demo", title: "demo", description: "" },
      posts: [],
      titles: [title("t1", "沙丘2", "demo", "https://pan.quark.cn/s/a")],
      skipped: 0,
      fetchedPages: 1,
    },
    false,
  );
  const errored = markChannelErrorInState(synced, "demo", "预览被挡");
  assert.equal(errored.channels[0]?.status, "error");
  assert.equal(errored.titles.length, 1);
  assert.equal(summarizeSync({
    channel: synced.channels[0]!,
    posts: [{ channel: "demo", messageId: 1, postUrl: "https://t.me/demo/1", text: "x", hrefs: [] }],
    titles: synced.titles,
    skipped: 2,
    fetchedPages: 1,
  }).skipped, 2);
});
