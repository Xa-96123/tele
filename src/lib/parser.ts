import * as cheerio from "cheerio";
import type {
  ChannelInfo,
  ChannelPost,
  Edition,
  LinkKind,
  ResourceType,
  SourceLink,
  TitleRecord,
} from "@/lib/types";
import { postUrl } from "@/lib/channel";

const META_LINE_RE =
  /^(年份|年代|上映|类型|题材|主演|演员|导演|编剧|简介|剧情|豆瓣|IMDb?|画质|分辨率|大小|体积|链接|磁力|磁链|网盘|分享|简介|片长|国家|地区|语言|字幕|来源|发布|文件|格式|编码)[:：]/i;

const SKIP_RE =
  /广告合作|欢迎订阅|欢迎新朋友|求片请|只接受求片|进群交流|置顶公告|频道规则/;

const GENRE_HINTS = [
  "剧情",
  "喜剧",
  "动作",
  "爱情",
  "科幻",
  "悬疑",
  "犯罪",
  "惊悚",
  "恐怖",
  "战争",
  "历史",
  "传记",
  "动画",
  "奇幻",
  "冒险",
  "家庭",
  "音乐",
  "歌舞",
  "西部",
  "武侠",
  "纪录片",
  "同性",
  "运动",
];

const CN_NUM: Record<string, string> = {
  一: "1",
  二: "2",
  三: "3",
  四: "4",
  五: "5",
  六: "6",
  七: "7",
  八: "8",
  九: "9",
  十: "10",
};

export function hashId(input: string): string {
  let h = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36);
}

export function normalizeTitleKey(title: string): string {
  return title
    .toLowerCase()
    .replace(/第[一二三四五六七八九十\d]+季/g, "")
    .replace(/s(?:eason)?\s*\d{1,2}/gi, "")
    .replace(/中字|简繁|内封|特效|字幕|完整版|收藏版|导演剪辑版/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, "")
    .trim();
}

export function resourceKey(input: {
  title: string;
  year?: number;
  type: ResourceType;
  season?: string;
}): string {
  return [
    normalizeTitleKey(input.title),
    input.year ?? "",
    input.type,
    input.season ?? "",
  ].join("|");
}

export function classifyLink(url: string): LinkKind | null {
  const raw = url.trim();
  if (!raw) return null;
  const u = raw.toLowerCase();

  if (u.startsWith("magnet:")) return "magnet";
  if (u.startsWith("ed2k:")) return "ed2k";
  if (u.includes("pan.quark.cn") || /quark\.cn\/s\//.test(u)) return "quark";
  if (u.includes("alipan.com") || u.includes("aliyundrive.com")) return "aliyun";
  if (u.includes("pan.baidu.com") || u.includes("yun.baidu.com")) return "baidu";
  if (u.includes("115.com") || u.includes("anxia.com")) return "115";
  if (
    u.includes("123pan.com") ||
    u.includes("123684.com") ||
    u.includes("123865.com") ||
    u.includes("123912.com")
  ) {
    return "123pan";
  }
  if (u.includes("mypikpak.com") || u.includes("pikpak.com")) return "pikpak";
  if (u.includes("mega.nz") || u.includes("mega.io")) return "mega";
  if (u.includes("drive.google.com")) return "google";

  if (
    u.includes("telegram.org") ||
    u.includes("t.me/s/") ||
    u.includes("t.me/joinchat") ||
    u.includes("t.me/+") ||
    /^https?:\/\/t\.me\/[a-z0-9_]+\/?$/i.test(raw)
  ) {
    return null;
  }

  if (/^https?:\/\/t\.me\/[a-z0-9_]+\/\d+/i.test(raw)) return "telegram";
  if (/^https?:\/\//i.test(raw)) return "other";
  return null;
}

export function extractLinks(text: string, hrefs: string[] = []): SourceLink[] {
  const found = new Map<string, SourceLink>();

  const consider = (url: string, label?: string) => {
    const kind = classifyLink(url);
    if (!kind) return;
    const key = url.trim();
    if (found.has(key)) return;
    found.set(key, { kind, url: key, label });
  };

  for (const href of hrefs) consider(href);

  const magnetRe = /magnet:\?xt=urn:btih:[a-z0-9]+[^\s<>"']*/gi;
  const ed2kRe = /ed2k:\/\/\|file\|[^\s<>"']+/gi;
  const httpRe = /https?:\/\/[^\s<>"']+/gi;

  for (const match of text.match(magnetRe) ?? []) consider(match);
  for (const match of text.match(ed2kRe) ?? []) consider(match);
  for (const match of text.match(httpRe) ?? []) consider(match);

  return [...found.values()];
}

function stripDecor(line: string): string {
  return line
    .replace(/\p{Extended_Pictographic}/gu, "")
    .replace(/\uFE0F/g, "")
    .replace(/【[^】]*】/g, " ")
    .replace(/\[[^\]]*\]/g, " ")
    .replace(/^[#*|➤●•·\-—~～\s]+/, "")
    .replace(/\s+/g, " ")
    .trim();
}

function isMetaLine(line: string): boolean {
  return META_LINE_RE.test(line);
}

function pickField(text: string, labels: string[]): string | undefined {
  const joined = labels.join("|");
  const re = new RegExp(`(?:${joined})\\s*[:：]\\s*(.+)`, "i");
  const match = text.match(re);
  const value = match?.[1]?.trim();
  if (!value) return undefined;
  return value.split(/\n/)[0]?.trim();
}

function extractYear(text: string): number | undefined {
  const match = text.match(/(?:年份|年代|上映)\s*[:：]\s*((?:19|20)\d{2})/);
  if (match) return Number(match[1]);
  const years = [...text.matchAll(/\(((?:19|20)\d{2})\)/g)].map((m) =>
    Number(m[1]),
  );
  if (years.length) return years[0];
  const loose = text.match(/(?:^|\s)((?:19|20)\d{2})(?:\s|$|\.)/);
  if (loose) return Number(loose[1]);
  return undefined;
}

function extractResolution(text: string): string | undefined {
  const upper = text.toUpperCase();
  if (/\b8K\b/.test(upper) || /\b4320P\b/.test(upper)) return "8K";
  if (/\b2160P\b/.test(upper) || /\b4K\b/.test(upper) || /超高清/.test(text)) {
    return "2160p";
  }
  if (/\b1080P\b/.test(upper) || /全高清/.test(text)) return "1080p";
  if (/\b720P\b/.test(upper)) return "720p";
  if (/\b480P\b/.test(upper)) return "480p";
  return undefined;
}

function extractQuality(text: string, resolution?: string): string | undefined {
  const tags: string[] = [];
  if (resolution) tags.push(resolution);
  const checks: Array<[RegExp, string]> = [
    [/REMUX/i, "REMUX"],
    [/BLURAY|蓝光/i, "BluRay"],
    [/WEB-?DL/i, "WEB-DL"],
    [/WEBRIP/i, "WEBRip"],
    [/HDR10\+/i, "HDR10+"],
    [/\bHDR\b/i, "HDR"],
    [/DOLBY\s*VISION|\bDOVI\b|\bDV\b|杜比视界/i, "杜比视界"],
    [/ATMOS/i, "Atmos"],
  ];
  for (const [re, label] of checks) {
    if (re.test(text) && !tags.includes(label)) tags.push(label);
  }
  return tags.length ? tags.join(" ") : undefined;
}

function parseSize(text: string): { label: string; bytes: number } | undefined {
  const match = text.match(
    /(\d+(?:\.\d+)?)\s*(TIB|GIB|MIB|KIB|TB|GB|MB|KB)/i,
  );
  if (!match) return undefined;
  const n = Number(match[1]);
  const unit = match[2].toUpperCase();
  const map: Record<string, number> = {
    KB: 1e3,
    KIB: 1024,
    MB: 1e6,
    MIB: 1024 ** 2,
    GB: 1e9,
    GIB: 1024 ** 3,
    TB: 1e12,
    TIB: 1024 ** 4,
  };
  const bytes = n * (map[unit] ?? 1);
  return { label: `${match[1]} ${match[2].toUpperCase()}`, bytes };
}

function extractSeason(text: string): string | undefined {
  const cn = text.match(/第([一二三四五六七八九十\d]+)季/);
  if (cn) {
    const n = CN_NUM[cn[1]] ?? cn[1];
    return `S${String(n).padStart(2, "0")}`;
  }
  const en = text.match(/\bS(?:eason)?\s*(\d{1,2})\b/i);
  if (en) return `S${en[1].padStart(2, "0")}`;
  return undefined;
}

function extractEpisodes(text: string): string | undefined {
  const full = text.match(/全\s*(\d+)\s*集/);
  if (full) return `全${full[1]}集`;
  const upto = text.match(/更新至\s*(\d+)\s*集?/);
  if (upto) return `更新至${upto[1]}集`;
  const range = text.match(/\bEP?(\d{1,3})\s*[-~至]\s*EP?(\d{1,3})\b/i);
  if (range) return `EP${range[1]}-${range[2]}`;
  return undefined;
}

function extractScore(text: string, labels: string[]): number | undefined {
  const joined = labels.join("|");
  const re = new RegExp(`(?:${joined})\\s*[:：]?\\s*(\\d(?:\\.\\d)?)`, "i");
  const match = text.match(re);
  if (!match) return undefined;
  const n = Number(match[1]);
  return Number.isFinite(n) ? n : undefined;
}

function detectType(text: string, title: string): ResourceType {
  if (/纪录片|纪录/.test(text) || /纪录/.test(title)) return "documentary";
  if (
    (/番剧|动漫/.test(text) || /番剧|动漫/.test(title)) &&
    !/动画电影/.test(text)
  ) {
    return "anime";
  }
  if (
    /剧集|电视剧|美剧|韩剧|日剧|英剧|全集|更新至|第[一二三四五六七八九十\d]+季|\bS\d{1,2}\b/i.test(
      `${text}\n${title}`,
    )
  ) {
    return "series";
  }
  if (/电影/.test(text) || /电影/.test(title)) return "movie";
  return "movie";
}

function extractGenres(text: string): string[] {
  const typed = pickField(text, ["类型", "题材"]);
  const chunk = typed ?? text;
  const found = GENRE_HINTS.filter((g) => chunk.includes(g));
  return [...new Set(found)];
}

function extractTitles(
  text: string,
): { title: string; originalTitle?: string } | null {
  const book = text.match(/《([^》]+)》/);
  const lines = text
    .split(/\n+/)
    .map((l) => stripDecor(l))
    .filter(Boolean);

  let title = book?.[1]?.trim();
  let originalTitle: string | undefined;

  const named = pickField(text, ["片名", "名称", "标题", "中文名"]);
  if (!title && named) title = stripDecor(named);

  const release = text.match(
    /([A-Za-z0-9]+(?:\.[A-Za-z0-9]+){2,})\.(?:19|20)\d{2}\./,
  );

  if (!title) {
    for (const line of lines) {
      if (isMetaLine(line)) continue;
      if (/^(豆瓣|IMDb?|磁力|magnet|http)/i.test(line)) continue;
      const cleaned = line
        .replace(/\(((?:19|20)\d{2})\)/g, "")
        .replace(/\b(?:19|20)\d{2}\b/g, "")
        .replace(/\b(?:2160p|1080p|720p|480p|4K|8K)\b/gi, "")
        .replace(/\b(?:BluRay|WEB-?DL|WEBRip|HDR|REMUX)\b/gi, "")
        .trim();
      if (cleaned.length >= 2) {
        title = cleaned;
        break;
      }
    }
  }

  if (!title && release) {
    title = release[1].replaceAll(".", " ").trim();
  }

  if (!title) return null;

  const en = text.match(
    /《[^》]+》\s*([A-Za-z][A-Za-z0-9:'&.\-\s]{2,80})/,
  );
  if (en) originalTitle = en[1].replace(/\s*\((?:19|20)\d{2}\)\s*$/, "").trim();

  if (!originalTitle) {
    const aka = pickField(text, ["英文名", "原名", "又名"]);
    if (aka) originalTitle = aka;
  }

  return { title, originalTitle };
}

function hasResourceSignal(input: {
  title: string;
  year?: number;
  quality?: string;
  links: SourceLink[];
  sizeLabel?: string;
  douban?: number;
}): boolean {
  const strong =
    Boolean(input.year) ||
    Boolean(input.quality) ||
    input.links.length > 0 ||
    Boolean(input.sizeLabel) ||
    Boolean(input.douban);
  return Boolean(input.title) && strong;
}

export function parsePostToTitle(
  post: ChannelPost,
  channelTitle = post.channel,
): TitleRecord | null {
  const text = post.text.replace(/\r/g, "").trim();
  if (text.length < 6) return null;
  if (SKIP_RE.test(text) && !/《/.test(text) && !/magnet:/i.test(text)) {
    return null;
  }

  const names = extractTitles(text);
  if (!names) return null;

  const links = extractLinks(text, post.hrefs);
  const year = extractYear(text);
  const resolution = extractResolution(text);
  const quality = extractQuality(text, resolution);
  const size = parseSize(text);
  const season = extractSeason(text);
  const episodes = extractEpisodes(text);
  const douban = extractScore(text, ["豆瓣", "豆瓣评分"]);
  const imdb = extractScore(text, ["IMDb", "IMDB", "Imdb"]);
  const type = detectType(text, names.title);
  const overview = pickField(text, ["简介", "剧情简介", "剧情"]);
  const director = pickField(text, ["导演"]);
  const castLine = pickField(text, ["主演", "演员"]);
  const genres = extractGenres(text);

  if (
    !hasResourceSignal({
      title: names.title,
      year,
      quality,
      links,
      sizeLabel: size?.label,
      douban,
    })
  ) {
    return null;
  }

  const postedAt = post.postedAt ?? new Date().toISOString();
  const edition: Edition = {
    id: `${post.channel}/${post.messageId}`,
    channel: post.channel,
    channelTitle,
    messageId: post.messageId,
    postUrl: post.postUrl || postUrl(post.channel, post.messageId),
    postedAt: post.postedAt,
    quality,
    resolution,
    sizeLabel: size?.label,
    sizeBytes: size?.bytes,
    episodes,
    season,
    links,
    rawText: text,
    photoUrl: post.photoUrl,
  };

  const id = hashId(
    resourceKey({ title: names.title, year, type, season }),
  );

  return {
    id,
    title: names.title,
    originalTitle: names.originalTitle,
    year,
    type,
    genres,
    douban,
    imdb,
    overview,
    director,
    cast: castLine ? castLine.split(/[,，、/]/).map((s) => s.trim()).filter(Boolean) : [],
    posterUrl: post.photoUrl,
    editions: [edition],
    firstSeenAt: postedAt,
    lastSeenAt: postedAt,
  };
}

export function parsePlainPosts(
  raw: string,
  channel = "imported",
  channelTitle = "手动导入",
): { titles: TitleRecord[]; skipped: number; posts: number } {
  const chunks = raw
    .split(/\n\s*-{3,}\s*\n|\n{3,}/)
    .map((c) => c.trim())
    .filter(Boolean);

  const titles: TitleRecord[] = [];
  let skipped = 0;

  chunks.forEach((text, index) => {
    const post: ChannelPost = {
      channel,
      messageId: index + 1,
      postUrl: `https://t.me/${channel}/${index + 1}`,
      postedAt: new Date().toISOString(),
      text,
      hrefs: [],
    };
    const parsed = parsePostToTitle(post, channelTitle);
    if (parsed) titles.push(parsed);
    else skipped += 1;
  });

  return { titles, skipped, posts: chunks.length };
}

export function parsePreviewHtml(html: string, fallbackUsername: string) {
  return parseTelegramPreview(html, fallbackUsername);
}

export async function parsePreviewHtmlAsync(
  html: string,
  fallbackUsername: string,
) {
  return parseTelegramPreview(html, fallbackUsername);
}

function parseTelegramPreview(html: string, fallbackUsername: string) {
  const $ = cheerio.load(html);

  const usernameText = $(".tgme_channel_info_header_username a")
    .first()
    .text()
    .replace(/^@/, "")
    .trim();
  const username = usernameText || fallbackUsername;

  const channel: ChannelInfo = {
    username,
    title:
      $(".tgme_channel_info_header_title").first().text().trim() || username,
    description: $(".tgme_channel_info_description").first().text().trim(),
    avatarUrl: $(".tgme_channel_info_header img").first().attr("src") || undefined,
    subscribers: $(".tgme_channel_info_counter")
      .filter((_, el) => $(el).find(".counter_type").text().includes("subscriber"))
      .first()
      .find(".counter_value")
      .text()
      .trim() || undefined,
  };

  const posts: ChannelPost[] = [];

  $(".js-widget_message[data-post]").each((_, el) => {
    const node = $(el);
    const dataPost = node.attr("data-post") || "";
    const [chan, idStr] = dataPost.split("/");
    const messageId = Number(idStr);
    if (!chan || !Number.isFinite(messageId)) return;

    const textNode = node.find(".js-message_text").first();
    const htmlText = textNode.html() ?? "";
    const withBreaks = htmlText.replace(/<br\s*\/?>/gi, "\n");
    const text = cheerio
      .load(`<div>${withBreaks}</div>`)
      .text()
      .replace(/\u00a0/g, " ")
      .trim();

    const hrefs = textNode
      .find("a[href]")
      .map((__, a) => $(a).attr("href") || "")
      .get()
      .filter(Boolean);

    const style = node.find(".tgme_widget_message_photo_wrap").attr("style") ?? "";
    const photo = style.match(/url\('([^']+)'\)/)?.[1];
    const time = node.find("time[datetime]").first().attr("datetime");

    posts.push({
      channel: chan,
      messageId,
      postUrl: postUrl(chan, messageId),
      postedAt: time ? new Date(time).toISOString() : undefined,
      text,
      photoUrl: photo,
      hrefs,
    });
  });

  const nextBefore = $(".tme_messages_more").attr("data-before") || undefined;

  return { channel, posts, nextBefore };
}
