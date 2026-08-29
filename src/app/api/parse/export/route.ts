import { NextRequest } from "next/server";
import * as cheerio from "cheerio";
import { syncFromPosts } from "@/lib/ingest";
import type { ChannelPost } from "@/lib/types";

export async function POST(request: NextRequest) {
  let body: { html?: string; filename?: string };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "请求体不是合法 JSON。" }, { status: 400 });
  }
  const html = body.html ?? "";
  if (!html.includes("message")) {
    return Response.json(
      { error: "这不像 Telegram 桌面版的 HTML 导出。" },
      { status: 400 },
    );
  }

  const $ = cheerio.load(html);
  const title =
    $("title").first().text().replace(/\s+–\s+Telegram.*$/, "").trim() ||
    (body.filename || "export").replace(/\.html?$/i, "");
  const username = `export_${title.replace(/[^\p{L}\p{N}]+/gu, "_").slice(0, 24) || "html"}`;
  const posts: ChannelPost[] = [];

  $(".message").each((_, el) => {
    const node = $(el);
    const idAttr = node.attr("id") || "";
    const messageId = Number(idAttr.replace(/\D+/g, ""));
    const textNode = node.find(".text").first();
    if (!textNode.length) return;
    const htmlText = (textNode.html() ?? "").replace(/<br\s*\/?>/gi, "\n");
    const text = cheerio.load(`<div>${htmlText}</div>`).text().trim();
    if (!text) return;
    const hrefs = textNode
      .find("a[href]")
      .map((__, a) => $(a).attr("href") || "")
      .get()
      .filter(Boolean);
    posts.push({
      channel: username,
      messageId: Number.isFinite(messageId) ? messageId : posts.length + 1,
      postUrl: `https://t.me/${username}/${messageId || posts.length + 1}`,
      text,
      hrefs,
    });
  });

  return Response.json(
    syncFromPosts(
      {
        username,
        title,
        description: "从 Telegram 桌面版 HTML 导出导入",
        source: "export",
      },
      posts,
    ),
  );
}
