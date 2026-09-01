import { NextRequest } from "next/server";
import { hasCloudOrMagnetLink } from "@/lib/labels";
import { isCatalogState } from "@/lib/catalog-storage";
import {
  catalogTableCounts,
  defaultCatalogDbPath,
  readCatalogShell,
  readCatalogState,
  replaceCatalogState,
} from "@/lib/catalog-db";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const full =
    request.nextUrl.searchParams.get("full") === "1" ||
    request.nextUrl.searchParams.get("full") === "true";
  try {
    if (full) {
      const state = readCatalogState();
      return Response.json({
        ok: true,
        store: "sqlite",
        file: defaultCatalogDbPath(),
        counts: catalogTableCounts(),
        titleCount: state.titles.filter(hasCloudOrMagnetLink).length,
        state,
      });
    }

    const shell = readCatalogShell();
    const { titleCount, ...state } = shell;
    return Response.json({
      ok: true,
      store: "sqlite",
      file: defaultCatalogDbPath(),
      counts: catalogTableCounts(),
      titleCount,
      state,
    });
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
    const incoming = state;
    const existing = catalogTableCounts();
    if (incoming.titles.length === 0 && existing.titles > 0) {
      return Response.json(
        { error: "拒绝用空片库覆盖本机已有影片。" },
        { status: 409 },
      );
    }
    replaceCatalogState(incoming);
    return Response.json({
      ok: true,
      store: "sqlite",
      file: defaultCatalogDbPath(),
      counts: catalogTableCounts(),
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "写入本地片库失败。";
    return Response.json({ ok: false, error: message }, { status: 500 });
  }
}
