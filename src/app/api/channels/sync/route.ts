import { NextRequest } from "next/server";
import { ChannelFetchError, syncPublicChannel } from "@/lib/telegram";

export async function POST(request: NextRequest) {
  let body: { username?: string; before?: string; pages?: number };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "请求体不是合法 JSON。" }, { status: 400 });
  }

  try {
    const result = await syncPublicChannel({
      username: body.username ?? "",
      before: body.before,
      pages: body.pages,
    });
    return Response.json(result);
  } catch (error) {
    if (error instanceof ChannelFetchError) {
      return Response.json(
        { error: error.message, code: error.code },
        { status: error.status },
      );
    }
    return Response.json({ error: "同步失败，请稍后重试。" }, { status: 500 });
  }
}
