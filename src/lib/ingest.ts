import { mergeTitles } from "@/lib/catalog";
import { parsePostToTitle } from "@/lib/parser";
import type { ChannelInfo, ChannelPost, SyncResult, TitleRecord } from "@/lib/types";

export function syncFromPosts(
  channel: ChannelInfo,
  posts: ChannelPost[],
  extras?: Partial<SyncResult>,
): SyncResult {
  const titles = posts
    .map((post) => parsePostToTitle(post, channel.title))
    .filter((title): title is TitleRecord => Boolean(title));

  return {
    channel,
    posts,
    titles: mergeTitles(titles),
    skipped: posts.length - titles.length,
    fetchedPages: extras?.fetchedPages ?? 1,
    nextBefore: extras?.nextBefore,
  };
}
