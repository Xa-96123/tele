import { NextRequest } from "next/server";
import { AccountError, syncAccountChannel } from "@/lib/account";

export const maxDuration = 60;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const result = await syncAccountChannel(body);
    return Response.json(result);
  } catch (error) {
    if (error instanceof AccountError) {
      return Response.json({ error: error.message }, { status: error.status });
    }
    return Response.json({ error: "同步频道失败。" }, { status: 500 });
  }
}
