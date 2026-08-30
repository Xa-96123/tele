import assert from "node:assert/strict";
import test from "node:test";
import { normalizeChannelUsername, parseChannelInput } from "./channel.ts";
import {
  classifyLink,
  extractLinks,
  looksLikeTelegramPreview,
  parsePlainPosts,
  parsePostToTitle,
  parsePreviewHtmlAsync,
} from "./parser.ts";
import { buildPreviewCandidates } from "./telegram.ts";
import { mergeTitles, summarizeCatalog } from "./catalog.ts";
import { buildDemoCatalog } from "./demo-data.ts";
import type { ChannelPost } from "./types.ts";

function makePost(text: string, hrefs: string[] = []): ChannelPost {
  return {
    channel: "cine_demo",
    messageId: 7,
    postUrl: "https://t.me/cine_demo/7",
    postedAt: "2024-06-01T00:00:00.000Z",
    text,
    hrefs,
  };
}

test("normalize telegram usernames", () => {
  assert.equal(normalizeChannelUsername("@Movie_Hub"), "Movie_Hub");
  assert.equal(
    normalizeChannelUsername("https://t.me/s/Movie_Hub/"),
    "Movie_Hub",
  );
  assert.equal(normalizeChannelUsername("https://t.me/Movie_Hub"), "Movie_Hub");
  assert.equal(
    normalizeChannelUsername("https://web.telegram.org/k/#@Movie_Hub"),
    "Movie_Hub",
  );
  assert.equal(
    normalizeChannelUsername("https://web.telegram.org/a/#@cine_4k"),
    "cine_4k",
  );
  assert.equal(
    normalizeChannelUsername(
      "https://web.telegram.org/k/#@Aliyun_4K_Movies",
    ),
    "Aliyun_4K_Movies",
  );
  assert.equal(
    normalizeChannelUsername(
      "https://web.telegram.org/k/#%40Aliyun_4K_Movies",
    ),
    "Aliyun_4K_Movies",
  );
  assert.equal(normalizeChannelUsername("tg://resolve?domain=Movie_Hub"), "Movie_Hub");
  assert.equal(normalizeChannelUsername("ab"), null);
  assert.deepEqual(parseChannelInput("https://web.telegram.org/k/#-100123"), {
    ok: false,
    reason: "private_web",
  });
  assert.deepEqual(parseChannelInput("https://t.me/c/1234567890/8"), {
    ok: false,
    reason: "private_web",
  });
});

test("preview fallbacks include a reader when t.me is blocked", () => {
  const urls = buildPreviewCandidates("Aliyun_4K_Movies").map((item) => item.url);
  assert.ok(urls.some((url) => url.includes("t.me/s/Aliyun_4K_Movies")));
  assert.ok(urls.some((url) => url.includes("r.jina.ai/https://t.me/s/Aliyun_4K_Movies")));
  assert.ok(looksLikeTelegramPreview('<div class="js-widget_message" data-post="a/1">'));
  assert.equal(looksLikeTelegramPreview("<html><body>blocked</body></html>"), false);
});

test("parses Aliyun_4K_Movies name/description posts", () => {
  const drama = parsePostToTitle(
    makePost(`名称：电视剧：金色 (2026)辛芷蕾 / 尹昉 / 陈坤 / 高伟光  更新至8集

描述：三十万两黄金突现大漠，传言寻金之人皆成厉鬼。

阿里：https://www.alipan.com/s/nLPex8xoT4S
夸克：https://pan.quark.cn/s/9cf9a5b3f2f0
百度：https://pan.baidu.com/s/12vTqLqJiW3GpoxVIpBgOpA?pwd=9pkb`),
  );
  assert.ok(drama);
  assert.equal(drama.title, "金色");
  assert.equal(drama.year, 2026);
  assert.equal(drama.type, "series");
  assert.equal(drama.editions[0].episodes, "更新至8集");
  assert.equal(drama.overview, "三十万两黄金突现大漠，传言寻金之人皆成厉鬼。");
  assert.deepEqual(
    drama.editions[0].links.map((link) => link.kind),
    ["aliyun", "quark", "baidu"],
  );

  const mixedParen = parsePostToTitle(
    makePost(`名称：蝉(2026） 4K 全集

描述：三个孤独的陌生人在硬核案件的刑事辩护中互相博弈。

阿里：https://www.alipan.com/s/J1Aa3fjP3KF`),
  );
  assert.ok(mixedParen);
  assert.equal(mixedParen.title, "蝉");
  assert.equal(mixedParen.year, 2026);
  assert.equal(mixedParen.editions[0].resolution, "2160p");
  assert.equal(mixedParen.editions[0].episodes, "全集");
});

test("parses book-title movie posts", () => {
  const title = parsePostToTitle(
    makePost(`《沙丘2》 Dune: Part Two
年份：2024
类型：科幻/冒险
豆瓣：8.3
IMDb：8.6
画质：2160p BluRay HDR
大小：42.6 GB
夸克网盘：https://pan.quark.cn/s/abc
磁力：magnet:?xt=urn:btih:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa`),
  );
  assert.ok(title);
  assert.equal(title.title, "沙丘2");
  assert.equal(title.originalTitle, "Dune: Part Two");
  assert.equal(title.year, 2024);
  assert.equal(title.type, "movie");
  assert.equal(title.douban, 8.3);
  assert.equal(title.editions[0].resolution, "2160p");
  assert.ok(title.editions[0].links.some((l) => l.kind === "quark"));
  assert.ok(title.editions[0].links.some((l) => l.kind === "magnet"));
});

test("parses series with season and skips ads", () => {
  const series = parsePostToTitle(
    makePost(`【剧集】漫长的季节 第一季 (2023)
豆瓣 9.4
全12集
1080p WEB-DL
https://www.alipan.com/s/xyz`),
  );
  assert.ok(series);
  assert.equal(series.type, "series");
  assert.equal(series.editions[0].season, "S01");
  assert.equal(series.editions[0].episodes, "全12集");

  const ad = parsePostToTitle(
    makePost("欢迎订阅本频道，广告合作请私信。进群交流：https://t.me/demo"),
  );
  assert.equal(ad, null);
});

test("classifies cloud links and ignores channel invites", () => {
  assert.equal(classifyLink("https://pan.quark.cn/s/hi"), "quark");
  assert.equal(classifyLink("https://t.me/somechannel"), null);
  const links = extractLinks(
    "看这里 https://pan.baidu.com/s/hello",
    ["https://www.alipan.com/s/x"],
  );
  assert.deepEqual(
    links.map((l) => l.kind).sort(),
    ["aliyun", "baidu"],
  );
});

test("skips telegram news posts with only t.me links", () => {
  const news = parsePostToTitle(
    makePost(
      `For all the details on these new features, check out our blog:\nhttps://telegram.org/blog/hello`,
      ["https://t.me/telegram/445", "https://telegram.org/blog/hello"],
    ),
  );
  assert.equal(news, null);
});

test("merges duplicate titles from two channels", () => {
  const a = parsePostToTitle(
    makePost("《寄生虫》(2019)\n1080p BluRay\nhttps://pan.quark.cn/s/a"),
  );
  const b = parsePostToTitle({
    ...makePost("《寄生虫》 Parasite (2019)\n2160p HDR\nhttps://www.alipan.com/s/b"),
    channel: "other",
    messageId: 9,
    postUrl: "https://t.me/other/9",
  });
  assert.ok(a && b);
  const merged = mergeTitles([a, b]);
  assert.equal(merged.length, 1);
  assert.equal(merged[0].editions.length, 2);
  assert.equal(merged[0].originalTitle, "Parasite");
});

test("plain import splits posts and demo catalog is usable", () => {
  const parsed = parsePlainPosts(
    `《千与千寻》(2001)\n豆瓣 9.4\n1080p\nhttps://pan.quark.cn/s/x\n\n---\n\n欢迎订阅`,
  );
  assert.equal(parsed.posts, 2);
  assert.equal(parsed.titles.length, 1);
  assert.equal(parsed.skipped, 1);

  const demo = buildDemoCatalog();
  assert.ok(demo.titles.length >= 8);
  const stats = summarizeCatalog(demo.titles, demo.channels);
  assert.equal(stats.channelCount, 2);
  assert.ok(stats.byType.movie >= 1);
  assert.ok(stats.byType.series >= 1);
});

test("parses telegram preview html", async () => {
  const html = `
    <div class="tgme_channel_info">
      <div class="tgme_channel_info_header_title"><span>演示电影</span></div>
      <div class="tgme_channel_info_header_username"><a href="https://t.me/demo_cine">@demo_cine</a></div>
      <div class="tgme_channel_info_description">公开预览</div>
      <div class="tgme_channel_info_counters">
        <div class="tgme_channel_info_counter">
          <span class="counter_value">12.3K</span>
          <span class="counter_type">subscribers</span>
        </div>
      </div>
    </div>
    <div class="tgme_widget_message js-widget_message" data-post="demo_cine/88">
      <a class="tgme_widget_message_photo_wrap" style="background-image:url('https://cdn.example/p.jpg')"></a>
      <div class="js-message_text">《沙丘2》 (2024)<br/>2160p BluRay<br/><a href="https://pan.quark.cn/s/html">夸克</a></div>
      <time datetime="2024-06-01T12:00:00+00:00"></time>
    </div>
    <a class="tme_messages_more" data-before="80"></a>
  `;
  const parsed = await parsePreviewHtmlAsync(html, "demo_cine");
  assert.equal(parsed.channel.title, "演示电影");
  assert.equal(parsed.channel.subscribers, "12.3K");
  assert.equal(parsed.posts.length, 1);
  assert.equal(parsed.posts[0].text.includes("沙丘2"), true);
  assert.deepEqual(parsed.posts[0].hrefs, ["https://pan.quark.cn/s/html"]);
  assert.equal(parsed.nextBefore, "80");
  const title = parsePostToTitle(parsed.posts[0], parsed.channel.title);
  assert.ok(title);
  assert.equal(title.editions[0].links[0].kind, "quark");
});
