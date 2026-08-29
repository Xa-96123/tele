"use client";

import { useMemo, useState, type ReactNode } from "react";
import { FileSpreadsheet, Search } from "lucide-react";
import { toast } from "sonner";
import { useCatalog } from "@/components/catalog-provider";
import { ResourceDetail } from "@/components/resource-detail";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { summarizeCatalog } from "@/lib/catalog";
import {
  catalogExcelFilename,
  flattenTitle,
  TITLE_COLUMNS,
  type TitleColumnKey,
  type TitleFlat,
} from "@/lib/export";
import { LINK_LABELS, TYPE_LABELS } from "@/lib/labels";
import type { ResourceType, TitleRecord } from "@/lib/types";

const WRAP_COLUMNS = new Set<TitleColumnKey>([
  "overview",
  "cast",
  "links",
  "postUrls",
  "rawText",
  "genres",
]);

function matchesQuery(title: TitleRecord, query: string): boolean {
  if (!query) return true;
  const hay = [
    title.title,
    title.originalTitle,
    title.overview,
    title.director,
    title.cast.join(" "),
    title.genres.join(" "),
    title.imdb,
    title.douban,
    title.year,
    ...title.editions.flatMap((edition) => [
      edition.channelTitle,
      edition.channel,
      edition.quality,
      edition.resolution,
      edition.sizeLabel,
      edition.season,
      edition.episodes,
      edition.rawText,
      ...edition.links.map((link) => link.url),
    ]),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return hay.includes(query);
}

export function StatsView() {
  const { ready, state, selectedId, setSelectedId, selectedTitle, loadDemo } =
    useCatalog();
  const [query, setQuery] = useState("");
  const stats = useMemo(
    () => summarizeCatalog(state.titles, state.channels),
    [state.channels, state.titles],
  );
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return state.titles.filter((title) => matchesQuery(title, q));
  }, [query, state.titles]);

  if (!ready) {
    return <div className="h-40 rounded-xl bg-muted" />;
  }

  const kpis = [
    { label: "去重后影片", value: stats.titleCount },
    { label: "来源版本", value: stats.editionCount },
    { label: "频道", value: stats.channelCount },
    { label: "识别到的链接", value: stats.linkCount },
  ];

  async function exportExcel() {
    if (filtered.length === 0) {
      toast.error("没有可导出的影片");
      return;
    }
    try {
      const { downloadCatalogExcel } = await import("@/lib/export-xlsx");
      downloadCatalogExcel(filtered, catalogExcelFilename(filtered.length));
      toast.success(
        `已导出 ${filtered.length} 部影片（含版本明细工作表）`,
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "导出失败");
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="font-heading text-2xl font-semibold tracking-wide">
            汇总
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            列表展示全部影片字段，可导出为 Excel（影片汇总 + 版本明细）。
          </p>
        </div>
        <div className="flex w-full flex-col gap-2 sm:flex-row sm:items-center lg:w-auto">
          <div className="relative w-full sm:w-72">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="搜索片名、导演、链接、频道…"
              className="h-9 pl-8"
              aria-label="搜索汇总列表"
            />
          </div>
          <Button onClick={exportExcel} disabled={filtered.length === 0}>
            <FileSpreadsheet data-icon="inline-start" />
            导出 Excel（{filtered.length} 部）
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {kpis.map((item) => (
          <Card key={item.label} size="sm">
            <CardHeader>
              <CardDescriptionStat>{item.label}</CardDescriptionStat>
              <CardTitle className="font-heading text-3xl tabular-nums">
                {item.value}
              </CardTitle>
            </CardHeader>
          </Card>
        ))}
      </div>

      <Card className="gap-0 overflow-hidden pb-0">
        <CardHeader className="border-b py-4">
          <CardTitle className="text-base">
            影片列表
            <span className="ml-2 text-sm font-normal text-muted-foreground">
              当前 {filtered.length} / {state.titles.length} 部，点击一行查看详情
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="px-0">
          {filtered.length === 0 ? (
            <div className="px-6 py-16 text-center">
              <p className="font-heading text-lg">
                {state.titles.length === 0
                  ? "片库还是空的"
                  : "没有符合搜索的影片"}
              </p>
              <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
                {state.titles.length === 0
                  ? "到「频道」页添加 Telegram 频道或导入桌面导出，汇总会出现在这里。"
                  : "试试清除关键词，或换一组片名、导演、网盘链接。"}
              </p>
              {state.titles.length === 0 ? (
                <Button className="mt-4" variant="secondary" onClick={loadDemo}>
                  载入演示片库
                </Button>
              ) : null}
            </div>
          ) : (
            <TitleTable
              titles={filtered}
              onOpen={(id) => setSelectedId(id)}
            />
          )}
        </CardContent>
      </Card>

      <div className="grid gap-3 lg:grid-cols-2">
        <StatList
          title="按类型"
          rows={Object.entries(stats.byType).map(([key, count]) => ({
            label: TYPE_LABELS[key as ResourceType] ?? key,
            count,
          }))}
        />
        <StatList
          title="按画质"
          rows={stats.byResolution.map((r) => ({
            label: r.label,
            count: r.count,
          }))}
        />
        <StatList
          title="按来源"
          rows={stats.bySource.map((r) => ({
            label: LINK_LABELS[r.kind as keyof typeof LINK_LABELS] ?? r.kind,
            count: r.count,
          }))}
        />
        <StatList
          title="按频道"
          rows={stats.byChannel.map((r) => ({
            label: r.title,
            count: r.count,
          }))}
        />
      </div>

      <StatList
        title="按年份"
        rows={stats.byYear.map((r) => ({ label: r.year, count: r.count }))}
      />

      <ResourceDetail
        title={selectedTitle}
        open={Boolean(selectedId)}
        onOpenChange={(open) => {
          if (!open) setSelectedId(null);
        }}
      />
    </div>
  );
}

function TitleTable({
  titles,
  onOpen,
}: {
  titles: TitleRecord[];
  onOpen: (id: string) => void;
}) {
  return (
    <Table className="min-w-[96rem]">
      <TableHeader className="sticky top-0 z-20 bg-card">
        <TableRow>
          {TITLE_COLUMNS.map((column, index) => (
            <TableHead
              key={column.key}
              className={
                index === 0
                  ? "sticky left-0 z-30 bg-card shadow-[1px_0_0_0_var(--border)]"
                  : undefined
              }
            >
              {column.label}
            </TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {titles.map((title) => {
          const row = flattenTitle(title);
          return (
            <TableRow
              key={title.id}
              className="group cursor-pointer"
              onClick={() => onOpen(title.id)}
            >
              {TITLE_COLUMNS.map((column, index) => (
                <TableCell
                  key={column.key}
                  className={cellClass(column.key, index)}
                  title={String(row[column.key] || "")}
                >
                  {formatCell(column.key, row)}
                </TableCell>
              ))}
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}

function cellClass(key: TitleColumnKey, index: number): string {
  const sticky =
    index === 0
      ? "sticky left-0 z-10 bg-card font-medium group-hover:bg-muted/50 shadow-[1px_0_0_0_var(--border)]"
      : "";
  const wrap = WRAP_COLUMNS.has(key)
    ? "max-w-64 whitespace-pre-wrap break-words"
    : "";
  return [sticky, wrap].filter(Boolean).join(" ");
}

function formatCell(key: TitleColumnKey, row: TitleFlat): ReactNode {
  const value = row[key];
  if (value === "" || value === undefined) return "—";
  if (
    (key === "links" || key === "postUrls" || key === "posterUrl") &&
    typeof value === "string"
  ) {
    const first = value.split("\n")[0];
    if (first.startsWith("http")) {
      return (
        <span className="text-primary/90 underline-offset-2 group-hover:underline">
          {value}
        </span>
      );
    }
  }
  if (key === "rawText" && typeof value === "string" && value.length > 180) {
    return `${value.slice(0, 180)}…`;
  }
  return String(value);
}

function CardDescriptionStat({ children }: { children: ReactNode }) {
  return <p className="text-sm text-muted-foreground">{children}</p>;
}

function StatList({
  title,
  rows,
}: {
  title: string;
  rows: Array<{ label: string; count: number }>;
}) {
  const max = Math.max(1, ...rows.map((r) => r.count));
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2.5">
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">暂无数据</p>
        ) : (
          rows.map((row) => (
            <div key={row.label}>
              <div className="mb-1 flex items-center justify-between text-sm">
                <span className="truncate pr-3">{row.label}</span>
                <span className="tabular-nums text-muted-foreground">
                  {row.count}
                </span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-primary"
                  style={{ width: `${(row.count / max) * 100}%` }}
                />
              </div>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}
