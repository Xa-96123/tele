import assert from "node:assert/strict";
import test from "node:test";
import { flattenExportText, parseTelegramExportJson } from "./desktop-export.ts";

test("flattens telegram export text entities", () => {
  const flat = flattenExportText(
    [
      { type: "plain", text: "《沙丘2》(2024)\n" },
      { type: "text_link", text: "夸克", href: "https://pan.quark.cn/s/abc" },
    ],
    [],
  );
  assert.match(flat.text, /沙丘2/);
  assert.ok(flat.hrefs.includes("https://pan.quark.cn/s/abc"));
});

test("parses telegram desktop result.json", () => {
  const json = JSON.stringify({
    name: "高清电影频道",
    type: "public_channel",
    id: 12345,
    messages: [
      {
        id: 9,
        type: "message",
        date_unixtime: "1700000000",
        text: [
          { type: "plain", text: "《寄生虫》(2019)\n1080p BluRay\n" },
          { type: "link", text: "https://pan.quark.cn/s/p" },
        ],
      },
      { id: 8, type: "service", text: "joined" },
    ],
  });
  const result = parseTelegramExportJson(json);
  assert.equal(result.channel.title, "高清电影频道");
  assert.equal(result.channel.source, "export");
  assert.equal(result.titles.length, 1);
  assert.equal(result.titles[0].title, "寄生虫");
  assert.equal(result.skipped, 0);
});
