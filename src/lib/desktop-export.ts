import { syncFromPosts } from "@/lib/ingest";
import { extractLinks } from "@/lib/parser";
import type { ChannelPost, SyncResult } from "@/lib/types";

type ExportEntity = {
  type?: string;
  text?: string;
  href?: string;
};

type ExportMessage = {
  id?: number;
  type?: string;
  date?: string;
  date_unixtime?: string;
  text?: string | ExportEntity[];
  text_entities?: ExportEntity[];
  photo?: string;
};

type ExportFile = {
  name?: string;
  type?: string;
  id?: number | string;
  messages?: ExportMessage[];
};

function slug(input: string): string {
  const cleaned = input.replace(/[^\p{L}\p{N}]+/gu, "_").replace(/^_+|_+$/g, "");
  return cleaned.slice(0, 24) || "export";
}

export function flattenExportText(
  text: string | ExportEntity[] | undefined,
  entities: ExportEntity[] = [],
): { text: string; hrefs: string[] } {
  const hrefs: string[] = [];
  const parts: string[] = [];

  const consume = (item: string | ExportEntity) => {
    if (typeof item === "string") {
      parts.push(item);
      return;
    }
    const chunk = item.text ?? "";
    parts.push(chunk);
    if (item.href) hrefs.push(item.href);
    else if (
      (item.type === "link" || item.type === "text_link") &&
      /^https?:\/\//i.test(chunk)
    ) {
      hrefs.push(chunk);
    }
  };

  if (typeof text === "string") parts.push(text);
  else if (Array.isArray(text)) text.forEach(consume);
  entities.forEach(consume);

  const joined = parts.join("");
  for (const link of extractLinks(joined, hrefs)) {
    if (!hrefs.includes(link.url)) hrefs.push(link.url);
  }
  return { text: joined.trim(), hrefs };
}

export function parseTelegramExportJson(
  raw: string,
  filename = "result.json",
): SyncResult {
  let data: ExportFile;
  try {
    data = JSON.parse(raw) as ExportFile;
  } catch {
    throw new Error("这不是合法的 JSON。请选择 Telegram 桌面版导出的 result.json。");
  }
  if (!Array.isArray(data.messages)) {
    throw new Error("JSON 里没有 messages。请打开某个频道文件夹中的 result.json。");
  }

  const title = data.name?.trim() || filename.replace(/\.json$/i, "");
  const idPart = data.id != null ? String(data.id).replace(/^-100/, "") : slug(title);
  const username = `export_${idPart}`;
  const posts: ChannelPost[] = [];

  for (const message of data.messages) {
    if (message.type && message.type !== "message") continue;
    const messageId = Number(message.id);
    if (!Number.isFinite(messageId)) continue;
    const flat = flattenExportText(message.text, message.text_entities);
    if (!flat.text) continue;
    const unix = message.date_unixtime ? Number(message.date_unixtime) : NaN;
    posts.push({
      channel: username,
      messageId,
      postUrl: `https://t.me/${username}/${messageId}`,
      postedAt: Number.isFinite(unix)
        ? new Date(unix * 1000).toISOString()
        : message.date
          ? new Date(message.date).toISOString()
          : undefined,
      text: flat.text,
      hrefs: flat.hrefs,
    });
  }

  return syncFromPosts(
    {
      username,
      title,
      description: "从 Telegram 桌面版导出文件导入",
      source: "export",
    },
    posts,
  );
}
