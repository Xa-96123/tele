"use client";

import { useEffect, useState } from "react";
import {
  Download,
  FileUp,
  History,
  Loader2,
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
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { DEMO_IMPORT_SAMPLE } from "@/lib/demo-data";
import { TelegramWebPanel } from "@/components/telegram-web-panel";
import {
  catalogExcelFilename,
  catalogToCsv,
  downloadText,
} from "@/lib/export";
import { formatRelativeTime } from "@/lib/format";
import { AccountPanel } from "@/components/account-panel";
import { ExportPanel } from "@/components/export-panel";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export function ChannelManager() {
  const {
    ready,
    state,
    syncOne,
    syncAll,
    importText,
    removeChannel,
  } = useCatalog();
  const [importOpen, setImportOpen] = useState(false);
  const [importValue, setImportValue] = useState("");
  const [importing, setImporting] = useState(false);
  const [syncingAll, setSyncingAll] = useState(false);
  const [sourceTab, setSourceTab] = useState("web");

  useEffect(() => {
    function onPasteImport() {
      setSourceTab("web");
      setImportOpen(true);
    }
    window.addEventListener("yingqu:paste-import", onPasteImport);
    return () => {
      window.removeEventListener("yingqu:paste-import", onPasteImport);
    };
  }, []);

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
            直接用 Telegram 网页版即可，不必创建应用程序。公开频道贴链接，私密频道复制帖子。同步结果写入本机 SQLite；「翻完历史」会按游标连续往前翻。
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

      <Tabs
        value={sourceTab}
        onValueChange={(next) => {
          if (next) setSourceTab(next);
        }}
      >
        <TabsList variant="line" className="w-full max-w-xl">
          <TabsTrigger value="web">网页版</TabsTrigger>
          <TabsTrigger value="export">桌面导出</TabsTrigger>
          <TabsTrigger value="account">已登录账号</TabsTrigger>
        </TabsList>
        <TabsContent value="web" className="mt-4">
          <TelegramWebPanel onPastePosts={() => setImportOpen(true)} />
        </TabsContent>
        <TabsContent value="account" className="mt-4">
          <AccountPanel
            onUseExport={() => setSourceTab("export")}
            onUseWeb={() => setSourceTab("web")}
          />
        </TabsContent>
        <TabsContent value="export" className="mt-4">
          <ExportPanel />
        </TabsContent>
      </Tabs>

      <div className="grid gap-3">
        {state.channels.length === 0 ? (
          <div className="rounded-xl border border-dashed px-6 py-14 text-center">
            <p className="font-heading text-lg">还没有频道</p>
            <p className="mt-2 text-sm text-muted-foreground">
              用 Telegram 网页版贴频道链接，或粘贴帖子导入。
            </p>
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
                      {channel.source === "account" ? (
                        <Badge variant="secondary">账号</Badge>
                      ) : null}
                      {channel.source === "export" ? (
                        <Badge variant="secondary">导出</Badge>
                      ) : null}
                      {channel.isPrivate ? (
                        <Badge variant="outline">私密</Badge>
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
                      {channel.lastBefore
                        ? " · 还可往前翻"
                        : channel.lastSyncedAt
                          ? " · 已到最早"
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
                    disabled={
                      channel.status === "syncing" ||
                      channel.isDemo ||
                      channel.source === "export" ||
                      channel.username === "imported"
                    }
                    onClick={() => void syncOne(channel.username)}
                  >
                    {channel.status === "error" ? "重试同步" : "同步最新"}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={
                      channel.status === "syncing" ||
                      channel.isDemo ||
                      channel.source === "export" ||
                      channel.username === "imported" ||
                      !channel.lastBefore
                    }
                    onClick={() => void syncOne(channel.username, true)}
                  >
                    再往前翻
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={
                      channel.status === "syncing" ||
                      channel.isDemo ||
                      channel.source === "export" ||
                      channel.username === "imported"
                    }
                    title="从当前进度连续向更早的消息翻页，直到没有更早的消息或达到本轮上限"
                    onClick={() => void syncOne(channel.username, false, true)}
                  >
                    {channel.status === "syncing" ? (
                      <Loader2 data-icon="inline-start" className="animate-spin" />
                    ) : (
                      <History data-icon="inline-start" />
                    )}
                    翻完历史
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => void removeChannel(channel.username)}
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
            片库存本机 data/yingqu.sqlite，不写浏览器 IndexedDB。导出后可带到另一台电脑。
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
          <Button
            variant="outline"
            onClick={() => {
              if (state.titles.length === 0) {
                toast.error("没有可导出的影片");
                return;
              }
              void import("@/lib/export-xlsx")
                .then(({ downloadCatalogExcel }) => {
                  downloadCatalogExcel(
                    state.titles,
                    catalogExcelFilename(state.titles.length),
                  );
                  toast.success(
                    `已导出 ${state.titles.length} 部影片到 Excel`,
                  );
                })
                .catch((error) => {
                  toast.error(
                    error instanceof Error ? error.message : "导出失败",
                  );
                });
            }}
          >
            <Download data-icon="inline-start" />
            导出 Excel
          </Button>
        </CardContent>
      </Card>

      <Dialog open={importOpen} onOpenChange={setImportOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>从网页版粘贴帖子</DialogTitle>
            <DialogDescription>
              本机打不开 t.me 时用这个。在 web.telegram.org 打开频道，选中影片介绍复制后贴进来。多条帖子用空行或 --- 分隔。
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
