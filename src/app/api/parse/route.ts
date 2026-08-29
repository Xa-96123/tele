import { NextRequest } from "next/server";
import { mergeTitles } from "@/lib/catalog";
import { parsePlainPosts } from "@/lib/parser";

export async function POST(request: NextRequest) {
  let body: { text?: string; channel?: string };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "请求体不是合法 JSON。" }, { status: 400 });
  }

  const text = body.text?.trim() ?? "";
  if (text.length < 6) {
    return Response.json(
      { error: "请粘贴至少一条完整的频道帖子。" },
      { status: 400 },
    );
  }

  const parsed = parsePlainPosts(
    text,
    body.channel || "imported",
    "手动导入",
  );

  return Response.json({
    titles: mergeTitles(parsed.titles),
    skipped: parsed.skipped,
    posts: parsed.posts,
  });
}
