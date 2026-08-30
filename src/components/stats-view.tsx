"use client";

import { useMemo, useState } from "react";
import { FileSpreadsheet, Search, Store } from "lucide-react";
import { toast } from "sonner";
import { useCatalog } from "@/components/catalog-provider";
import { ResourceDetail } from "@/components/resource-detail";
import { XianyuListingDialog } from "@/components/xianyu-listing-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
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
import { posterStyle } from "@/lib/format";
import {
  cloudKindsInTitles,
  collectCloudLinks,
  groupCloudLinks,
  LINK_LABELS,
  titlePosterUrl,
  type CloudLinkKind,
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
  const [picked, setPicked] = useState<Set<string>>(() => new Set());
  const [listingIds, setListingIds] = useState<string[]>([]);
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return state.titles.filter((title) => matchesQuery(title, q));
  }, [query, state.titles]);
  const linkKinds = useMemo(() => cloudKindsInTitles(filtered), [filtered]);
  const visibleSelected = filtered.filter((title) => picked.has(title.id));
  const allVisibleSelected =
    filtered.length > 0 && visibleSelected.length === filtered.length;
  const listingTitles = useMemo(
    () =>
      listingIds
        .map((id) => state.titles.find((title) => title.id === id))
        .filter((title): title is TitleRecord => Boolean(title)),
    [listingIds, state.titles],
  );

  if (!ready) {
    return <div className="h-40 rounded-xl bg-muted" />;
  }

  function toggleOne(id: string, next: boolean) {
    setPicked((current) => {
      const copy = new Set(current);
      if (next) copy.add(id);
      else copy.delete(id);
      return copy;
    });
  }

  function toggleAll(next: boolean) {
    setPicked((current) => {
      const copy = new Set(current);
      for (const title of filtered) {
        if (next) copy.add(title.id);
        else copy.delete(title.id);
      }
      return copy;
    });
  }

  function openListing(ids: string[]) {
    if (ids.length === 0) {
      toast.error("请先勾选要上架的影片");
      return;
    }
    setListingIds(ids);
  }

  async function exportExcel() {
    const rows = visibleSelected.length > 0 ? visibleSelected : filtered;
    if (rows.length === 0) {
      toast.error("没有可导出的影片");
      return;
    }
    try {
      const { downloadSummaryExcel } = await import("@/lib/export-xlsx");
      downloadSummaryExcel(rows, catalogExcelFilename(rows.length));
      toast.success(
        `已导出 ${rows.length} 部影片${visibleSelected.length > 0 ? "（已选）" : ""}`,
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
            勾选后可一键整理闲鱼上架文案。表格含海报、片名和分列网盘，不含简介。
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
          <Button
            onClick={() => openListing(visibleSelected.map((title) => title.id))}
            disabled={visibleSelected.length === 0}
          >
            <Store data-icon="inline-start" />
            一键上架闲鱼
            {visibleSelected.length > 0 ? `（${visibleSelected.length}）` : ""}
          </Button>
          <Button
            variant="outline"
            onClick={exportExcel}
            disabled={filtered.length === 0}
          >
            <FileSpreadsheet data-icon="inline-start" />
            导出 Excel
            {visibleSelected.length > 0
              ? `（${visibleSelected.length}）`
              : `（${filtered.length}）`}
          </Button>
        </div>
      </div>

      <Card className="gap-0 overflow-hidden pb-0">
        <CardHeader className="border-b py-4">
          <CardTitle className="text-base">
            影片列表
            <span className="ml-2 text-sm font-normal text-muted-foreground">
              当前 {filtered.length} / {state.titles.length} 部
              {visibleSelected.length > 0
                ? `，已选 ${visibleSelected.length} 部`
                : ""}
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
              linkKinds={linkKinds}
              picked={picked}
              allSelected={allVisibleSelected}
              onToggleAll={toggleAll}
              onToggleOne={toggleOne}
              onOpen={(id) => setSelectedId(id)}
              onList={(id) => openListing([id])}
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
      <XianyuListingDialog
        titles={listingTitles}
        open={listingTitles.length > 0}
        onOpenChange={(open) => {
          if (!open) setListingIds([]);
        }}
      />
    </div>
  );
}

function TitleTable({
  titles,
  linkKinds,
  picked,
  allSelected,
  onToggleAll,
  onToggleOne,
  onOpen,
  onList,
}: {
  titles: TitleRecord[];
  linkKinds: CloudLinkKind[];
  picked: Set<string>;
  allSelected: boolean;
  onToggleAll: (next: boolean) => void;
  onToggleOne: (id: string, next: boolean) => void;
  onOpen: (id: string) => void;
  onList: (id: string) => void;
}) {
  return (
    <Table>
      <TableHeader className="sticky top-0 z-20 bg-card">
        <TableRow>
          <TableHead className="w-10 pl-4">
            <Checkbox
              checked={allSelected}
              aria-label="全选当前列表"
              onCheckedChange={(value) => onToggleAll(value === true)}
            />
          </TableHead>
          <TableHead className="w-16">海报</TableHead>
          <TableHead className="min-w-36">片名</TableHead>
          {linkKinds.map((kind) => (
            <TableHead key={kind} className="min-w-40">
              {LINK_LABELS[kind]}
            </TableHead>
          ))}
          <TableHead className="w-28 pr-4 text-right">操作</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {titles.map((title) => {
          const grouped = groupCloudLinks(title);
          const checked = picked.has(title.id);
          return (
            <TableRow
              key={title.id}
              data-state={checked ? "selected" : undefined}
              className="cursor-pointer"
              onClick={() => onOpen(title.id)}
            >
              <TableCell
                className="pl-4"
                onClick={(event) => event.stopPropagation()}
              >
                <Checkbox
                  checked={checked}
                  aria-label={`选择 ${title.title}`}
                  onCheckedChange={(value) =>
                    onToggleOne(title.id, value === true)
                  }
                />
              </TableCell>
              <TableCell>
                <PosterThumb title={title} />
              </TableCell>
              <TableCell className="font-medium whitespace-normal">
                {title.title}
              </TableCell>
              {linkKinds.map((kind) => (
                <TableCell key={kind} className="whitespace-normal">
                  <CloudLinkCell links={grouped.get(kind) ?? []} />
                </TableCell>
              ))}
              <TableCell
                className="pr-4 text-right"
                onClick={(event) => event.stopPropagation()}
              >
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  onClick={() => onList(title.id)}
                >
                  <Store data-icon="inline-start" />
                  上架闲鱼
                </Button>
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}

function PosterThumb({ title }: { title: TitleRecord }) {
  const src = titlePosterUrl(title);
  return (
    <div
      className="relative h-[4.5rem] w-12 overflow-hidden rounded-md bg-muted ring-1 ring-foreground/10"
      style={src ? undefined : posterStyle(title.id)}
    >
      {src ? (
        // Telegram CDN / demo posters; skip next/image host allowlisting.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt={`${title.title} 海报`}
          className="size-full object-cover"
        />
      ) : (
        <span className="absolute inset-0 flex items-end p-1 font-heading text-lg text-white/85">
          {title.title.slice(0, 1)}
        </span>
      )}
    </div>
  );
}

function CloudLinkCell({ links }: { links: SourceLink[] }) {
  if (links.length === 0) {
    return <span className="text-muted-foreground">—</span>;
  }
  return (
    <ul className="space-y-1">
      {links.map((link) => (
        <li key={link.url}>
          <a
            href={link.url}
            target="_blank"
            rel="noreferrer"
            className="break-all text-primary underline-offset-2 hover:underline"
            onClick={(event) => event.stopPropagation()}
          >
            {link.url}
          </a>
        </li>
      ))}
    </ul>
  );
}
