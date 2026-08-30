import { channelUrl, normalizeChannelUsername } from "@/lib/channel";
import {
  looksLikeTelegramPreview,
  parsePostToTitle,
  parsePreviewHtmlAsync,
} from "@/lib/parser";
import { mergeTitles } from "@/lib/catalog";
import type { ChannelPost, SyncResult } from "@/lib/types";

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

export class ChannelFetchError extends Error {
  constructor(
    message: string,
    readonly status = 400,
    readonly code?: "preview_blocked",
  ) {
    super(message);
    this.name = "ChannelFetchError";
  }
}

type PreviewCandidate = {
  url: string;
  headers?: Record<string, string>;
};

export function buildPreviewCandidates(
  username: string,
  before?: string,
): PreviewCandidate[] {
  const direct = [channelUrl(username), `https://telegram.me/s/${username}`].map(
    (href) => {
      const url = new URL(href);
      if (before) url.searchParams.set("before", before);
      return url.toString();
    },
  );

  const htmlHeaders = {
    "X-Return-Format": "html",
    Accept: "text/html,application/xhtml+xml,text/plain;q=0.8",
  };

  return [
    ...direct.map((url) => ({ url })),
    ...direct.map((url) => ({
      url: `https://r.jina.ai/${url}`,
      headers: htmlHeaders,
    })),
  ];
}

async function fetchOne(candidate: PreviewCandidate): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);
  try {
    const res = await fetch(candidate.url, {
      headers: {
        "User-Agent": UA,
        Accept: "text/html,application/xhtml+xml",
        "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
        ...candidate.headers,
      },
      signal: controller.signal,
      cache: "no-store",
      redirect: "follow",
    });
    if (!res.ok) {
      throw new ChannelFetchError(
        `读取预览失败（${res.status}）。`,
        res.status,
      );
    }
    const html = await res.text();
    if (!looksLikeTelegramPreview(html)) {
      throw new ChannelFetchError("返回的页面里没有公开帖子。", 422);
    }
    return html;
  } finally {
    clearTimeout(timer);
  }
}

async function fetchPreviewPage(username: string, before?: string) {
  const candidates = buildPreviewCandidates(username, before);
  let lastError: unknown;

  for (const candidate of candidates) {
    try {
      return await fetchOne(candidate);
    } catch (error) {
      lastError = error;
    }
  }

  if (lastError instanceof ChannelFetchError && lastError.status === 422) {
    throw lastError;
  }
  if (lastError instanceof Error && lastError.name === "AbortError") {
    throw new ChannelFetchError("读取频道预览超时，请稍后重试。", 504);
  }
  throw new ChannelFetchError(
    "当前网络访问不了 t.me 公开预览。请在 web.telegram.org 打开频道，复制影片帖子后再点「粘贴导入」。",
    502,
    "preview_blocked",
  );
}

export async function syncPublicChannel(options: {
  username: string;
  before?: string;
  pages?: number;
}): Promise<SyncResult> {
  const username = normalizeChannelUsername(options.username);
  if (!username) {
    throw new ChannelFetchError(
      "频道用户名无效。请填写 @channel、t.me 链接，或 web.telegram.org/k/#@频道名。",
    );
  }

  const pages = Math.min(Math.max(options.pages ?? 3, 1), 8);
  let before = options.before;
  let nextBefore: string | undefined;
  let channel = {
    username,
    title: username,
    description: "",
  };
  const allPosts: ChannelPost[] = [];

  for (let i = 0; i < pages; i += 1) {
    const html = await fetchPreviewPage(username, before);
    const parsed = await parsePreviewHtmlAsync(html, username);
    if (i === 0) channel = parsed.channel;
    if (!parsed.posts.length && i === 0) {
      throw new ChannelFetchError(
        "没有读到公开帖子。频道可能是私密的、不存在，或未开启网页预览。",
        422,
      );
    }
    allPosts.push(...parsed.posts);
    nextBefore = parsed.nextBefore;
    if (!parsed.nextBefore) break;
    before = parsed.nextBefore;
  }

  const parsedTitles = allPosts
    .map((post) => parsePostToTitle(post, channel.title))
    .filter((t): t is NonNullable<typeof t> => Boolean(t));

  return {
    channel,
    posts: allPosts,
    titles: mergeTitles(parsedTitles),
    skipped: allPosts.length - parsedTitles.length,
    nextBefore,
    fetchedPages: pages,
  };
}
