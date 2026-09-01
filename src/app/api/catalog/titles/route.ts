import { NextRequest } from "next/server";
import { parseTitleListQuery } from "@/lib/catalog-list-params";
import { queryTitleList } from "@/lib/catalog-query";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const forExport = request.nextUrl.searchParams.get("purpose") === "export";
  try {
    const query = parseTitleListQuery(request.nextUrl.searchParams, {
      forExport,
    });
    const result = queryTitleList(query);
    return Response.json({ ok: true, ...result });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "读取片库分页失败。";
    return Response.json({ ok: false, error: message }, { status: 500 });
  }
}
