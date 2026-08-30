import { NextRequest } from "next/server";
import { AccountError } from "@/lib/account";
import { ingestAccountChannelToSqlite } from "@/lib/catalog-ingest-server";
import { readCatalogState } from "@/lib/catalog-db";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
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
    if (!body.session || !body.username) {
      return Response.json({ error: "缺少登录会话或频道。" }, { status: 400 });
    }
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
    const state = readCatalogState();
    if (error instanceof AccountError) {
      return Response.json(
        { error: error.message, state },
        { status: error.status },
      );
    }
    return Response.json({ error: "同步频道失败。", state }, { status: 500 });
  }
}
