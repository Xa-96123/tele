"use client";

import { useMemo, useState } from "react";
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
import { catalogExcelFilename } from "@/lib/export";
import {
  collectCloudLinks,
  formatCloudLink,
  LINK_LABELS,
} from "@/lib/labels";
import type { SourceLink, TitleRecord } from "@/lib/types";

function matchesQuery(title: TitleRecord, query: string): boolean {
  if (!query) return true;
  const hay = [
    title.title,
    ...collectCloudLinks(title).flatMap((link) => [
      link.url,
      LINK_LABELS[link.kind] ?? link.kind,
    ]),
  ]
    .join(" ")
    .toLowerCase();
  return hay.includes(query);
}

export function StatsView() {
  const { ready, state, selectedId, setSelectedId, selectedTitle, loadDemo } =
    useCatalog();
  const [query, setQuery] = useState("");
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return state.titles.filter((title) => matchesQuery(title, q));
  }, [query, state.titles]);

  if (!ready) {
    return <div className="h-40 rounded-xl bg-muted" />;
  }

  async function exportExcel() {
    if (filtered.length === 0) {
      toast.error("没有可导出的影片");
      return;
    }
    try {
      const { downloadSummaryExcel } = await import("@/lib/export-xlsx");
      downloadSummaryExcel(filtered, catalogExcelFilename(filtered.length));
      toast.success(`已导出 ${filtered.length} 部影片（片名 + 网盘链接）`);
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
            只列出片名和网盘链接，可导出为同样两列的 Excel。
          </p>
        </div>
        <div className="flex w-full flex-col gap-2 sm:flex-row sm:items-center lg:w-auto">
          <div className="relative w-full sm:w-72">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="搜索片名、网盘链接…"
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

      <Card className="gap-0 overflow-hidden pb-0">
        <CardHeader className="border-b py-4">
          <CardTitle className="text-base">
            影片列表
            <span className="ml-2 text-sm font-normal text-muted-foreground">
              当前 {filtered.length} / {state.titles.length} 部
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
                  : "试试清除关键词，或换一组片名、网盘链接。"}
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
    <Table>
      <TableHeader className="sticky top-0 z-20 bg-card">
        <TableRow>
          <TableHead className="w-[38%] min-w-40 pl-6">片名</TableHead>
          <TableHead className="pr-6">网盘链接</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {titles.map((title) => {
          const links = collectCloudLinks(title);
          return (
            <TableRow
              key={title.id}
              className="cursor-pointer"
              onClick={() => onOpen(title.id)}
            >
              <TableCell className="align-top pl-6 font-medium whitespace-normal">
                {title.title}
              </TableCell>
              <TableCell className="align-top pr-6 whitespace-normal">
                {links.length === 0 ? (
                  <span className="text-muted-foreground">—</span>
                ) : (
                  <CloudLinkList links={links} />
                )}
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}

function CloudLinkList({ links }: { links: SourceLink[] }) {
  return (
    <ul className="space-y-1.5">
      {links.map((link) => (
        <li key={link.url}>
          <a
            href={link.url}
            target="_blank"
            rel="noreferrer"
            className="break-all text-primary underline-offset-2 hover:underline"
            onClick={(event) => event.stopPropagation()}
          >
            {formatCloudLink(link)}
          </a>
        </li>
      ))}
    </ul>
  );
}
