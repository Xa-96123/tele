import { NextRequest } from "next/server";
import { isCatalogState } from "@/lib/catalog-storage";
import { readCatalogState, replaceCatalogState } from "@/lib/catalog-db";

export const runtime = "nodejs";

export async function GET() {
  try {
    const state = readCatalogState();
    return Response.json({ ok: true, state });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "读取本地片库失败。";
    return Response.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  let body: { state?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "请求体不是合法 JSON。" }, { status: 400 });
  }

  const state = body.state ?? body;
  if (!isCatalogState(state)) {
    return Response.json({ error: "片库数据不完整。" }, { status: 400 });
  }

  try {
    replaceCatalogState(state);
    return Response.json({ ok: true });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "写入本地片库失败。";
    return Response.json({ ok: false, error: message }, { status: 500 });
  }
}
