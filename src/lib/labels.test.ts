import assert from "node:assert/strict";
import test from "node:test";
import { titlePosterUrl } from "./labels.ts";
import type { Edition, TitleRecord } from "./types.ts";

function edition(id: string, photoUrl?: string): Edition {
  return {
    id,
    channel: "demo",
    channelTitle: "demo",
    messageId: 1,
    postUrl: `https://t.me/demo/${id}`,
    links: [{ kind: "quark", url: `https://pan.quark.cn/s/${id}` }],
    rawText: id,
    photoUrl,
  };
}

function title(editions: Edition[], posterUrl?: string): TitleRecord {
  return {
    id: "t",
    title: "沙丘2",
    type: "movie",
    genres: [],
    cast: [],
    posterUrl,
    editions,
    firstSeenAt: "2026-01-01T00:00:00.000Z",
    lastSeenAt: "2026-01-01T00:00:00.000Z",
  };
}

test("titlePosterUrl uses the last edition photo instead of a stale title poster", () => {
  const record = title(
    [
      edition("old", "https://cdn.example/old.jpg"),
      edition("mid"),
      edition("new", "https://cdn.example/new.jpg"),
    ],
    "https://cdn.example/old.jpg",
  );
  assert.equal(titlePosterUrl(record), "https://cdn.example/new.jpg");
});

test("titlePosterUrl skips a last edition without a photo", () => {
  const record = title(
    [edition("old", "https://cdn.example/old.jpg"), edition("empty")],
    "https://cdn.example/stale.jpg",
  );
  assert.equal(titlePosterUrl(record), "https://cdn.example/old.jpg");
});

test("titlePosterUrl falls back to title.posterUrl when editions have no photos", () => {
  const record = title([edition("a"), edition("b")], "https://cdn.example/only.jpg");
  assert.equal(titlePosterUrl(record), "https://cdn.example/only.jpg");
});
