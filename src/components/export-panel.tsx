"use client";

import { useState } from "react";
import { FileUp, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useCatalog } from "@/components/catalog-provider";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { parseTelegramExportJson } from "@/lib/desktop-export";
import type { SyncResult } from "@/lib/types";

export function ExportPanel() {
  const { ingestSyncResult } = useCatalog();
  const [busy, setBusy] = useState(false);

  async function onFiles(files: FileList | null) {
    if (!files?.length) return;
    setBusy(true);
    let imported = 0;
    try {
      for (const file of Array.from(files)) {
        const text = await file.text();
        let result: SyncResult;
        if (
          file.name.toLowerCase().endsWith(".json") ||
          text.trim().startsWith("{")
        ) {
          result = parseTelegramExportJson(text, file.name);
        } else {
          const res = await fetch("/api/parse/export", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ html: text, filename: file.name }),
          });
          const data = (await res.json()) as SyncResult & { error?: string };
          if (!res.ok) throw new Error(data.error || `${file.name} 解析失败`);
          result = data;
        }
        const ok = await ingestSyncResult(result);
        if (!ok) throw new Error(`${file.name} 写入片库失败`);
        imported += 1;
      }
      if (imported > 1) {
        toast.success(`已导入 ${imported} 个导出文件`);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "导入失败");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>从 Telegram 桌面版导出</CardTitle>
        <CardDescription>
          不需要在 my.telegram.org 创建应用程序，也不需要 api_id。官方导出只包含你勾选的聊天。
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <ol className="list-decimal space-y-1.5 pl-5 text-sm text-muted-foreground">
          <li>打开 Mac 上已经登录的 Telegram。</li>
          <li>左下角齿轮 → 设置 → 高级 → 导出 Telegram 数据。</li>
          <li>
            格式选 <span className="text-foreground">JSON</span>
            ，照片和视频不用勾，只勾选要汇总的电影频道。
          </li>
          <li>
            导出完成后，打开那个文件夹，把每个频道里的{" "}
            <code className="text-foreground">result.json</code>{" "}
            （或 messages.html）拖到下面。
          </li>
        </ol>
        <label
          className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border border-dashed px-4 py-10 text-sm hover:bg-muted/40"
          onDragOver={(event) => event.preventDefault()}
          onDrop={(event) => {
            event.preventDefault();
            void onFiles(event.dataTransfer.files);
          }}
        >
          {busy ? (
            <Loader2 className="size-5 animate-spin" />
          ) : (
            <FileUp className="size-5" />
          )}
          <span>选择或拖入 result.json / messages.html</span>
          <input
            type="file"
            accept=".json,.html,.htm,application/json,text/html"
            multiple
            className="sr-only"
            disabled={busy}
            onChange={(e) => {
              void onFiles(e.target.files);
              e.target.value = "";
            }}
          />
        </label>
      </CardContent>
    </Card>
  );
}
