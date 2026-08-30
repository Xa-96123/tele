import assert from "node:assert/strict";
import test from "node:test";
import { buildDemoCatalog } from "./demo-data.ts";
import {
  buildXianyuDescription,
  buildXianyuDraft,
  buildXianyuTitle,
  clipXianyuTitle,
  extensionForPoster,
  formatXianyuBatchText,
  formatXianyuClipboard,
  posterFileStem,
  XIANYU_TITLE_MAX,
} from "./xianyu.ts";

test("xianyu title stays within limit and names cloud types", () => {
  const { titles } = buildDemoCatalog();
  const dune = titles.find((title) => title.title.includes("沙丘"));
  assert.ok(dune);
  const listing = buildXianyuTitle(dune);
  assert.ok(listing.includes("沙丘"));
  assert.ok(listing.includes("夸克") || listing.includes("阿里"));
  assert.ok([...listing].length <= XIANYU_TITLE_MAX);
  assert.equal(clipXianyuTitle("一二三四五六七八九十".repeat(5)).length <= XIANYU_TITLE_MAX + 1, true);
});

test("xianyu description lists cloud links and omits overview", () => {
  const { titles } = buildDemoCatalog();
  const dune = titles.find((title) => title.title.includes("沙丘"));
  assert.ok(dune);
  const description = buildXianyuDescription(dune);
  assert.match(description, /片名：/);
  assert.match(description, /夸克/);
  assert.match(description, /阿里云盘/);
  assert.match(description, /pan\.quark\.cn/);
  assert.doesNotMatch(description, /保罗|简介|预言/);

  const draft = buildXianyuDraft(dune, "12");
  assert.equal(draft.price, "12");
  assert.ok(draft.posterUrl);
  const clip = formatXianyuClipboard(draft);
  assert.match(clip, /标题：/);
  assert.match(clip, /价格：12/);
  assert.doesNotMatch(clip, /简介/);

  const batch = formatXianyuBatchText([draft]);
  assert.match(batch, /第 1 条/);
  assert.equal(posterFileStem("沙丘2"), "沙丘2-海报");
  assert.equal(extensionForPoster("data:image/svg+xml;utf8,x"), ".svg");
});
