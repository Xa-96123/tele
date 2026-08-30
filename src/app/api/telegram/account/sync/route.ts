import { NextRequest } from "next/server";
import { AccountError } from "@/lib/account";
import { ingestAccountChannelToSqlite } from "@/lib/catalog-ingest-server";
import { markChannelErrorInSqlite } from "@/lib/catalog-db";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(request: NextRequest) {
  let body: {
    session?: string;
    apiId?: number | string;
    apiHash?: string;
    username?: string;
    peerId?: string;
    offsetId?: number;
    more?: boolean;
    untilEnd?: boolean;
    maxRounds?: number;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return Response.json({ error: "请求体不是合法 JSON。" }, { status: 400 });
  }
  if (!body.session || !body.username) {
    return Response.json({ error: "缺少登录会话或频道。" }, { status: 400 });
  }
  try {
    const report = await ingestAccountChannelToSqlite({
      username: body.username,
      peerId: body.peerId,
      session: body.session,
      apiId: body.apiId,
      apiHash: body.apiHash,
      more: body.more ?? Boolean(body.offsetId),
      untilEnd: body.untilEnd,
      maxRounds: body.maxRounds,
    });
    return Response.json(report);
  } catch (error) {
    const patch = markChannelErrorInSqlite(
      body.username,
      error instanceof Error ? error.message : "同步频道失败。",
    );
    if (error instanceof AccountError) {
      return Response.json(
        { error: error.message, patch },
        { status: error.status },
      );
    }
    return Response.json({ error: "同步频道失败。", patch }, { status: 500 });
  }
}
