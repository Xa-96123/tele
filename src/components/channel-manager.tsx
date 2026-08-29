"use client";

import { useState, type FormEvent } from "react";
import {
  Download,
  FileUp,
  Loader2,
  Plus,
  RefreshCw,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { useCatalog } from "@/components/catalog-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { normalizeChannelUsername } from "@/lib/channel";
import { DEMO_IMPORT_SAMPLE } from "@/lib/demo-data";
import { catalogToCsv, downloadText } from "@/lib/export";
import { formatRelativeTime } from "@/lib/format";

export function ChannelManager() {
  const {
    ready,
    state,
    addAndSync,
    syncOne,
    syncAll,
    importText,
    removeChannel,
    loadDemo,
    clearAll,
  } = useCatalog();
  const [username, setUsername] = useState("");
  const [adding, setAdding] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [importValue, setImportValue] = useState("");
  const [importing, setImporting] = useState(false);
  const [syncingAll, setSyncingAll] = useState(false);

  async function onAdd(e: FormEvent) {
    e.preventDefault();
    const normalized = normalizeChannelUsername(username);
    if (!normalized) {
      toast.error("请输入公开频道用户名，例如 moviehub 或 https://t.me/s/moviehub");
      return;
    }
    setAdding(true);
    const ok = await addAndSync(normalized);
    setAdding(false);
    if (ok) setUsername("");
  }

  async function onImport() {
    setImporting(true);
    const ok = await importText(importValue);
    setImporting(false);
    if (ok) {
      setImportOpen(false);
      setImportValue("");
    }
  }

  async function onSyncAll() {
    setSyncingAll(true);
    await syncAll();
    setSyncingAll(false);
  }

  if (!ready) {
    return <div className="h-40 rounded-xl bg-muted" />;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="font-heading text-2xl font-semibold tracking-wide">
            频道
          </h1>
          <p className="mt-1 max-w-xl text-sm text-muted-foreground">
            添加公开频道后，影渠会读取 t.me/s 网页预览、解析片名并与已有片库去重合并。不需要 Bot Token。
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => setImportOpen(true)}>
            <FileUp data-icon="inline-start" />
            粘贴导入
          </Button>
          <Button variant="outline" onClick={onSyncAll} disabled={syncingAll}>
            {syncingAll ? (
              <Loader2 data-icon="inline-start" className="animate-spin" />
            ) : (
              <RefreshCw data-icon="inline-start" />
            )}
            全部同步
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>添加公开频道</CardTitle>
          <CardDescription>
            支持 @username、https://t.me/username 或 https://t.me/s/username。私密频道无法通过网页预览读取。
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={onAdd} className="flex flex-col gap-2 sm:flex-row">
            <Input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="@moviehub 或 t.me/s/moviehub"
              className="h-9"
              aria-label="频道用户名"
            />
            <Button type="submit" disabled={adding} className="sm:w-36">
              {adding ? (
                <Loader2 data-icon="inline-start" className="animate-spin" />
              ) : (
                <Plus data-icon="inline-start" />
              )}
              提取并汇总
            </Button>
          </form>
        </CardContent>
      </Card>

      <div className="grid gap-3">
        {state.channels.length === 0 ? (
          <div className="rounded-xl border border-dashed px-6 py-14 text-center">
            <p className="font-heading text-lg">还没有频道</p>
            <p className="mt-2 text-sm text-muted-foreground">
              添加一个公开电影频道，或载入演示片库看看效果。
            </p>
            <Button className="mt-4" variant="secondary" onClick={loadDemo}>
              载入演示片库
            </Button>
          </div>
        ) : (
          state.channels.map((channel) => (
            <Card key={channel.username} className="py-4">
              <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex min-w-0 items-start gap-3">
                  <div className="flex size-11 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-muted text-sm font-semibold">
                    {channel.avatarUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={channel.avatarUrl}
                        alt=""
                        className="size-full object-cover"
                      />
                    ) : (
                      channel.title.slice(0, 1)
                    )}
                  </div>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="truncate font-medium">{channel.title}</h2>
                      <Badge variant="outline">@{channel.username}</Badge>
                      {channel.isDemo ? (
                        <Badge variant="secondary">演示</Badge>
                      ) : null}
                      {channel.status === "syncing" ? (
                        <Badge>同步中</Badge>
                      ) : null}
                      {channel.status === "error" ? (
                        <Badge variant="destructive">失败</Badge>
                      ) : null}
                    </div>
                    <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                      {channel.description || "暂无简介"}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {channel.resourceCount} 部影片 · 已读 {channel.postCount}{" "}
                      条帖子
                      {channel.lastSyncedAt
                        ? ` · ${formatRelativeTime(channel.lastSyncedAt)}同步`
                        : ""}
                      {channel.subscribers ? ` · ${channel.subscribers} 订阅` : ""}
                    </p>
                    {channel.lastError ? (
                      <p className="mt-1 text-xs text-destructive">
                        {channel.lastError}
                      </p>
                    ) : null}
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={channel.status === "syncing" || channel.isDemo}
                    onClick={() => syncOne(channel.username)}
                  >
                    同步最新
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={
                      channel.status === "syncing" ||
                      channel.isDemo ||
                      !channel.lastBefore
                    }
                    onClick={() => syncOne(channel.username, true)}
                  >
                    再往前翻
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => removeChannel(channel.username)}
                  >
                    <Trash2 data-icon="inline-start" />
                    移除
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>片库数据</CardTitle>
          <CardDescription>
            数据保存在本机浏览器中，刷新不会丢失。导出后可带到另一台电脑。
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            onClick={() =>
              downloadText(
                "yingqu-catalog.json",
                JSON.stringify(state, null, 2),
                "application/json",
              )
            }
          >
            <Download data-icon="inline-start" />
            导出 JSON
          </Button>
          <Button
            variant="outline"
            onClick={() =>
              downloadText(
                "yingqu-catalog.csv",
                catalogToCsv(state.titles),
                "text/csv;charset=utf-8",
              )
            }
          >
            <Download data-icon="inline-start" />
            导出 CSV
          </Button>
          <Button variant="secondary" onClick={loadDemo}>
            重置为演示
          </Button>
          <Button variant="destructive" onClick={clearAll}>
            清空片库
          </Button>
        </CardContent>
      </Card>

      <Dialog open={importOpen} onOpenChange={setImportOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>粘贴频道帖子</DialogTitle>
            <DialogDescription>
              把 Telegram 里复制的影片介绍贴进来。多条帖子用空行或 --- 分隔。
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="import-text">帖子原文</Label>
            <Textarea
              id="import-text"
              value={importValue}
              onChange={(e) => setImportValue(e.target.value)}
              placeholder={DEMO_IMPORT_SAMPLE}
              className="min-h-48 font-mono text-xs"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setImportOpen(false)}>
              取消
            </Button>
            <Button onClick={onImport} disabled={importing}>
              {importing ? (
                <Loader2 data-icon="inline-start" className="animate-spin" />
              ) : null}
              解析并汇总
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
