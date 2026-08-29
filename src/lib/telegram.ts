import { channelUrl, normalizeChannelUsername } from "@/lib/channel";
import { parsePostToTitle, parsePreviewHtmlAsync } from "@/lib/parser";
import { mergeTitles } from "@/lib/catalog";
import type { ChannelPost, SyncResult } from "@/lib/types";

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

export class ChannelFetchError extends Error {
  constructor(
    message: string,
    readonly status = 400,
  ) {
    super(message);
    this.name = "ChannelFetchError";
  }
}

async function fetchPreviewPage(username: string, before?: string) {
  const url = new URL(channelUrl(username));
  if (before) url.searchParams.set("before", before);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);

  try {
    const res = await fetch(url.toString(), {
      headers: {
        "User-Agent": UA,
        Accept: "text/html,application/xhtml+xml",
        "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
      },
      signal: controller.signal,
      cache: "no-store",
      redirect: "follow",
    });
    if (!res.ok) {
      throw new ChannelFetchError(
        `Telegram 返回 ${res.status}，频道可能不存在或暂不可用。`,
        res.status,
      );
    }
    return await res.text();
  } catch (error) {
    if (error instanceof ChannelFetchError) throw error;
    if (error instanceof Error && error.name === "AbortError") {
      throw new ChannelFetchError("读取频道预览超时，请稍后重试。", 504);
    }
    throw new ChannelFetchError(
      "无法访问 t.me 公开预览。可改用粘贴帖子导入。",
      502,
    );
  } finally {
    clearTimeout(timer);
  }
}

export async function syncPublicChannel(options: {
  username: string;
  before?: string;
  pages?: number;
}): Promise<SyncResult> {
  const username = normalizeChannelUsername(options.username);
  if (!username) {
    throw new ChannelFetchError("频道用户名无效。请填写 @channel 或 t.me 链接。");
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
