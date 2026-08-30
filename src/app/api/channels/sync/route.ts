import { NextRequest } from "next/server";
import { ChannelFetchError } from "@/lib/telegram";
import { ingestPublicChannelToSqlite } from "@/lib/catalog-ingest-server";
import { markChannelErrorInSqlite } from "@/lib/catalog-db";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(request: NextRequest) {
  let body: {
    username?: string;
    before?: string;
    pages?: number;
    proxy?: string;
    more?: boolean;
    untilEnd?: boolean;
    maxRounds?: number;
  };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "请求体不是合法 JSON。" }, { status: 400 });
  }

  if (!body.username?.trim()) {
    return Response.json({ error: "请填写频道用户名。" }, { status: 400 });
  }

  try {
    const report = await ingestPublicChannelToSqlite({
      username: body.username ?? "",
      more: body.more ?? Boolean(body.before),
      untilEnd: body.untilEnd,
      maxRounds: body.maxRounds,
      pages: body.pages,
      proxy: body.proxy,
    });
    return Response.json(report);
  } catch (error) {
    const patch = markChannelErrorInSqlite(
      body.username ?? "",
      error instanceof Error ? error.message : "同步失败",
    );
    if (error instanceof ChannelFetchError) {
      return Response.json(
        { error: error.message, code: error.code, patch },
        { status: error.status },
      );
    }
    return Response.json(
      { error: "同步失败，请稍后重试。", patch },
      { status: 500 },
    );
  }
}
