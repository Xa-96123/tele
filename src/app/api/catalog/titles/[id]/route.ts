import { NextRequest } from "next/server";
import { readTitleById } from "@/lib/catalog-db";
import { hasCloudOrMagnetLink } from "@/lib/labels";

export const runtime = "nodejs";

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    const title = readTitleById(id);
    if (!title || !hasCloudOrMagnetLink(title)) {
      return Response.json({ ok: false, error: "找不到这部影片。" }, { status: 404 });
    }
    return Response.json({ ok: true, title });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "读取影片失败。";
    return Response.json({ ok: false, error: message }, { status: 500 });
  }
}
