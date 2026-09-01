"use client";

import { useEffect, useMemo, useState } from "react";
import { FileSpreadsheet, Search, Store } from "lucide-react";
import { toast } from "sonner";
import { useCatalog } from "@/components/catalog-provider";
import { InfiniteSentinel } from "@/components/infinite-sentinel";
import { ResourceDetail } from "@/components/resource-detail";
import { useTitleList } from "@/components/use-title-list";
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
import { LazyPoster } from "@/components/lazy-poster";
import { catalogExcelFilename } from "@/lib/export";
import { fetchTitleList } from "@/lib/catalog-remote";
import {
  CLOUD_LINK_KINDS,
  collectMagnetLinks,
  groupCloudLinks,
  LINK_LABELS,
  titlePosterUrl,
  type CloudLinkKind,
} from "@/lib/labels";
import type { SourceLink, TitleRecord } from "@/lib/types";

const STATS_PAGE_SIZE = 40;

export function StatsView() {
  const {
    ready,
    state,
    catalogRevision,
    selectedId,
    setSelectedId,
    selectedTitle,
    rememberTitles,
  } = useCatalog();
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState<Set<string>>(() => new Set());
  const [listingIds, setListingIds] = useState<string[]>([]);
  const list = useTitleList({ q: query }, catalogRevision, {
    pageSize: STATS_PAGE_SIZE,
  });

  useEffect(() => {
    rememberTitles(list.titles);
  }, [list.titles, rememberTitles]);

  const linkKinds = CLOUD_LINK_KINDS.filter((kind) =>
    list.kinds.includes(kind),
  );
  const showMagnet = list.kinds.includes("magnet");
  const visibleSelected = list.titles.filter((title) => picked.has(title.id));
  const allVisibleSelected =
    list.titles.length > 0 && visibleSelected.length === list.titles.length;
  const listingTitles = useMemo(
    () =>
      listingIds
        .map(
          (id) =>
            state.titles.find((title) => title.id === id) ??
            list.titles.find((title) => title.id === id),
        )
        .filter((title): title is TitleRecord => Boolean(title)),
    [list.titles, listingIds, state.titles],
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
      for (const title of list.titles) {
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
    try {
      let rows: TitleRecord[] = [];
      if (visibleSelected.length > 0) {
        rows = visibleSelected;
      } else {
        const exported = await fetchTitleList(
          { q: query, offset: 0, limit: 5000 },
          { purpose: "export" },
        );
        if (!exported.ok) {
          toast.error(exported.error);
          return;
        }
        rows = exported.titles;
      }
      if (rows.length === 0) {
        toast.error("没有可导出的影片");
        return;
      }
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
            只列出有网盘或磁力的影片，按页从 SQLite 读取。勾选本页后可上架闲鱼。表格含海报、片名和分列链接，不含简介。
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
            onClick={() => void exportExcel()}
            disabled={list.total === 0 && visibleSelected.length === 0}
          >
            <FileSpreadsheet data-icon="inline-start" />
            导出 Excel
            {visibleSelected.length > 0
              ? `（${visibleSelected.length}）`
              : list.total > 0
                ? `（${list.total}）`
                : ""}
          </Button>
        </div>
      </div>

      <Card className="gap-0 overflow-hidden pb-0">
        <CardHeader className="border-b py-4">
          <CardTitle className="text-base">
            影片列表
            <span className="ml-2 text-sm font-normal text-muted-foreground">
              当前 {list.total} / {list.shareableTotal} 部
              {list.titles.length < list.total
                ? `，已显示 ${list.titles.length} 部`
                : ""}
              {visibleSelected.length > 0
                ? `，已选 ${visibleSelected.length} 部`
                : ""}
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="px-0">
          {list.loading ? (
            <div className="h-40 bg-muted" />
          ) : list.error ? (
            <div className="px-6 py-16 text-center">
              <p className="font-heading text-lg">汇总读取失败</p>
              <p className="mt-2 text-sm text-muted-foreground">{list.error}</p>
            </div>
          ) : list.total === 0 ? (
            <div className="px-6 py-16 text-center">
              <p className="font-heading text-lg">
                {list.shareableTotal === 0
                  ? "片库还是空的"
                  : "没有符合搜索的影片"}
              </p>
              <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
                {list.shareableTotal === 0
                  ? "到「频道」页添加 Telegram 频道或导入桌面导出。没有网盘或磁力的不会出现在这里。"
                  : "试试清除关键词，或换一组片名、网盘或磁力链接。"}
              </p>
            </div>
          ) : (
            <>
              <TitleTable
                titles={list.titles}
                linkKinds={linkKinds}
                showMagnet={showMagnet}
                picked={picked}
                allSelected={allVisibleSelected}
                onToggleAll={toggleAll}
                onToggleOne={toggleOne}
                onOpen={(id) => setSelectedId(id)}
                onList={(id) => openListing([id])}
              />
              <InfiniteSentinel
                remaining={list.remaining}
                onVisible={list.loadMore}
              />
            </>
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
  showMagnet,
  picked,
  allSelected,
  onToggleAll,
  onToggleOne,
  onOpen,
  onList,
}: {
  titles: TitleRecord[];
  linkKinds: CloudLinkKind[];
  showMagnet: boolean;
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
              aria-label="全选本页"
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
          {showMagnet ? (
            <TableHead className="min-w-40">{LINK_LABELS.magnet}</TableHead>
          ) : null}
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
              {showMagnet ? (
                <TableCell className="whitespace-normal">
                  <CloudLinkCell links={collectMagnetLinks(title)} />
                </TableCell>
              ) : null}
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
  return (
    <LazyPoster
      src={titlePosterUrl(title)}
      alt={`${title.title} 海报`}
      fallbackId={title.id}
      letter={title.title.slice(0, 1)}
      className="h-[4.5rem] w-12 rounded-md bg-muted ring-1 ring-foreground/10"
      letterClassName="p-1 text-lg"
    />
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
