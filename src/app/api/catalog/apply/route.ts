import { NextRequest } from "next/server";
import { isCatalogState } from "@/lib/catalog-storage";
import { hasCloudOrMagnetLink } from "@/lib/labels";
import { parsePlainPosts } from "@/lib/parser";
import {
  applyImportToSqlite,
  applySyncToSqlite,
  editTitleInSqlite,
  markChannelErrorInSqlite,
  mergeTitlesInSqlite,
  removeChannelFromSqlite,
  removeTitleFromSqlite,
  replaceCatalogState,
  setNoticeDismissedInSqlite,
} from "@/lib/catalog-db";
import type { CatalogState, SyncResult, TitleRecord } from "@/lib/types";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  let body: {
    type?: string;
    username?: string;
    more?: boolean;
    result?: SyncResult;
    text?: string;
    message?: string;
    dismissed?: boolean;
    id?: string;
    fromId?: string;
    intoId?: string;
    title?: string;
    originalTitle?: string | null;
    year?: number | null;
    titleType?: TitleRecord["type"];
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
      const patch = applySyncToSqlite(
        body.username,
        body.result,
        Boolean(body.more),
      );
      return Response.json({ ok: true, patch });
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
      const patch = applyImportToSqlite(parsed.titles, parsed.posts);
      return Response.json({
        ok: true,
        patch,
        skipped: parsed.skipped,
        posts: parsed.posts,
        usable,
        dropped: parsed.titles.length - usable,
      });
    }

    if (body.type === "remove") {
      if (!body.username) {
        return Response.json({ error: "缺少频道。" }, { status: 400 });
      }
      const patch = removeChannelFromSqlite(body.username);
      return Response.json({ ok: true, patch });
    }

    if (body.type === "channel-error") {
      if (!body.username) {
        return Response.json({ error: "缺少频道。" }, { status: 400 });
      }
      const patch = markChannelErrorInSqlite(
        body.username,
        body.message || "同步失败",
      );
      return Response.json({ ok: true, patch });
    }

    if (body.type === "notice") {
      const patch = setNoticeDismissedInSqlite(body.dismissed !== false);
      return Response.json({ ok: true, patch });
    }

    if (body.type === "edit-title") {
      if (!body.id) {
        return Response.json({ error: "缺少影片。" }, { status: 400 });
      }
      const patch = editTitleInSqlite(body.id, {
        title: body.title,
        originalTitle: body.originalTitle,
        year: body.year,
        type: body.titleType,
      });
      return Response.json({ ok: true, patch });
    }

    if (body.type === "merge-titles") {
      if (!body.fromId || !body.intoId) {
        return Response.json({ error: "请选择要合并的两部影片。" }, { status: 400 });
      }
      const patch = mergeTitlesInSqlite(body.fromId, body.intoId);
      return Response.json({ ok: true, patch });
    }

    if (body.type === "remove-title") {
      if (!body.id) {
        return Response.json({ error: "缺少影片。" }, { status: 400 });
      }
      const patch = removeTitleFromSqlite(body.id);
      return Response.json({ ok: true, patch });
    }

    if (body.type === "replace") {
      if (!isCatalogState(body.state)) {
        return Response.json({ error: "片库数据不完整。" }, { status: 400 });
      }
      const incoming = body.state as CatalogState;
      replaceCatalogState({ ...incoming, initialized: true });
      return Response.json({ ok: true, state: incoming });
    }

    return Response.json({ error: "未知的片库操作。" }, { status: 400 });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "写入本机片库失败。";
    return Response.json({ error: message }, { status: 500 });
  }
}
