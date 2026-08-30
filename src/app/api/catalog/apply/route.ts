import { NextRequest } from "next/server";
import {
  applyImport,
  applySyncResult,
  markChannelErrorInState,
  removeChannelFromState,
} from "@/lib/catalog-apply";
import { applyAndSave } from "@/lib/catalog-db";
import { isCatalogState } from "@/lib/catalog-storage";
import { hasCloudOrMagnetLink } from "@/lib/labels";
import { parsePlainPosts } from "@/lib/parser";
import type { CatalogState, SyncResult } from "@/lib/types";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  let body: {
    type?: string;
    username?: string;
    more?: boolean;
    result?: SyncResult;
    text?: string;
    message?: string;
    state?: unknown;
  };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "请求体不是合法 JSON。" }, { status: 400 });
  }

  try {
    if (body.type === "sync") {
      if (!body.result || !body.username) {
        return Response.json({ error: "缺少同步结果。" }, { status: 400 });
      }
      const state = applyAndSave((current) =>
        applySyncResult(current, body.username ?? "", body.result!, Boolean(body.more)),
      );
      return Response.json({ ok: true, state });
    }

    if (body.type === "import") {
      const text = body.text?.trim() ?? "";
      if (text.length < 6) {
        return Response.json(
          { error: "请粘贴至少一条完整的频道帖子。" },
          { status: 400 },
        );
      }
      const parsed = parsePlainPosts(text, "imported", "手动导入");
      const usable = parsed.titles.filter(hasCloudOrMagnetLink).length;
      const state = applyAndSave((current) =>
        applyImport(current, parsed.titles, parsed.posts.length),
      );
      return Response.json({
        ok: true,
        state,
        skipped: parsed.skipped,
        posts: parsed.posts.length,
        usable,
        dropped: parsed.titles.length - usable,
      });
    }

    if (body.type === "remove") {
      if (!body.username) {
        return Response.json({ error: "缺少频道。" }, { status: 400 });
      }
      const state = applyAndSave((current) =>
        removeChannelFromState(current, body.username ?? ""),
      );
      return Response.json({ ok: true, state });
    }

    if (body.type === "channel-error") {
      if (!body.username) {
        return Response.json({ error: "缺少频道。" }, { status: 400 });
      }
      const state = applyAndSave((current) =>
        markChannelErrorInState(
          current,
          body.username ?? "",
          body.message || "同步失败",
        ),
      );
      return Response.json({ ok: true, state });
    }

    if (body.type === "replace") {
      if (!isCatalogState(body.state)) {
        return Response.json({ error: "片库数据不完整。" }, { status: 400 });
      }
      const incoming = body.state as CatalogState;
      const state = applyAndSave(() => incoming);
      return Response.json({ ok: true, state });
    }

    return Response.json({ error: "未知的片库操作。" }, { status: 400 });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "写入本机片库失败。";
    return Response.json({ error: message }, { status: 500 });
  }
}
