"use client";

import { useEffect, useState } from "react";
import { Search, SlidersHorizontal } from "lucide-react";
import { useCatalog } from "@/components/catalog-provider";
import { InfiniteSentinel } from "@/components/infinite-sentinel";
import { ResourceCard } from "@/components/resource-card";
import { ResourceDetail } from "@/components/resource-detail";
import { useTitleList } from "@/components/use-title-list";
import { XianyuListingDialog } from "@/components/xianyu-listing-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { TITLE_PAGE_SIZE } from "@/lib/catalog-list-params";
import { LINK_LABELS, QUALITY_OPTIONS, TYPE_LABELS } from "@/lib/labels";
import type { TitleRecord, TitleSortKey } from "@/lib/types";

const EAGER_POSTERS = 8;

export function CatalogView() {
  const {
    ready,
    state,
    catalogRevision,
    setSelectedId,
    selectedId,
    selectedTitle,
    rememberTitles,
  } = useCatalog();
  const [query, setQuery] = useState("");
  const [type, setType] = useState("all");
  const [year, setYear] = useState("all");
  const [quality, setQuality] = useState("all");
  const [source, setSource] = useState("all");
  const [channel, setChannel] = useState("all");
  const [sort, setSort] = useState<TitleSortKey>("recent");
  const [listingTitle, setListingTitle] = useState<TitleRecord | null>(null);
  const list = useTitleList(
    { q: query, type, year, quality, source, channel, sort },
    catalogRevision,
    { pageSize: TITLE_PAGE_SIZE },
  );

  useEffect(() => {
    rememberTitles(list.titles);
  }, [list.titles, rememberTitles]);

  if (!ready) {
    return <CatalogSkeleton />;
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="font-heading text-2xl font-semibold tracking-wide">
            片库
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            已汇总 {list.shareableTotal} 部有网盘或磁力的影片，筛选出 {list.total} 部
            {list.titles.length < list.total
              ? `，已显示 ${list.titles.length} 部`
              : ""}
            。海报滑到附近再加载。按页从本机 SQLite 读取，不把整库塞进浏览器。
          </p>
        </div>
        <div className="relative w-full md:max-w-sm">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="搜片名、导演、频道…"
            className="h-9 pl-8"
            aria-label="搜索片库"
          />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <SlidersHorizontal className="size-3.5 text-muted-foreground" />
        <FilterSelect
          value={type}
          onChange={setType}
          label="类型"
          items={[
            { value: "all", label: "全部类型" },
            ...Object.entries(TYPE_LABELS).map(([value, label]) => ({
              value,
              label,
            })),
          ]}
        />
        <FilterSelect
          value={year}
          onChange={setYear}
          label="年份"
          items={[
            { value: "all", label: "全部年份" },
            ...list.years.map((y) => ({ value: String(y), label: String(y) })),
          ]}
        />
        <FilterSelect
          value={quality}
          onChange={setQuality}
          label="画质"
          items={[
            { value: "all", label: "全部画质" },
            ...QUALITY_OPTIONS.map((value) => ({ value, label: value })),
          ]}
        />
        <FilterSelect
          value={source}
          onChange={setSource}
          label="来源"
          items={[
            { value: "all", label: "全部来源" },
            ...Object.entries(LINK_LABELS).map(([value, label]) => ({
              value,
              label,
            })),
          ]}
        />
        <FilterSelect
          value={channel}
          onChange={setChannel}
          label="频道"
          items={[
            { value: "all", label: "全部频道" },
            ...state.channels.map((c) => ({
              value: c.username,
              label: c.title,
            })),
          ]}
        />
        <FilterSelect
          value={sort}
          onChange={(v) => setSort(v as TitleSortKey)}
          label="排序"
          items={[
            { value: "recent", label: "最近出现" },
            { value: "year", label: "年份" },
            { value: "douban", label: "豆瓣" },
            { value: "title", label: "片名" },
          ]}
        />
        {(query ||
          type !== "all" ||
          year !== "all" ||
          quality !== "all" ||
          source !== "all" ||
          channel !== "all") && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setQuery("");
              setType("all");
              setYear("all");
              setQuality("all");
              setSource("all");
              setChannel("all");
            }}
          >
            清除筛选
          </Button>
        )}
      </div>

      {list.loading ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {Array.from({ length: 10 }).map((_, i) => (
            <div
              key={i}
              className="overflow-hidden rounded-xl bg-card ring-1 ring-foreground/10"
            >
              <div className="aspect-[3/4] bg-muted" />
              <div className="space-y-2 p-3">
                <div className="h-4 w-3/4 rounded bg-muted" />
                <div className="h-3 w-1/2 rounded bg-muted" />
              </div>
            </div>
          ))}
        </div>
      ) : list.error ? (
        <div className="rounded-xl border border-dashed px-6 py-16 text-center">
          <p className="font-heading text-lg">片库读取失败</p>
          <p className="mt-2 text-sm text-muted-foreground">{list.error}</p>
        </div>
      ) : list.total === 0 ? (
        <EmptyCatalog hasData={list.shareableTotal > 0} />
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {list.titles.map((title, index) => (
            <ResourceCard
              key={title.id}
              title={title}
              eagerPoster={index < EAGER_POSTERS}
              onOpen={() => setSelectedId(title.id)}
              onList={() => setListingTitle(title)}
            />
          ))}
          <InfiniteSentinel remaining={list.remaining} onVisible={list.loadMore} />
        </div>
      )}

      <ResourceDetail
        title={selectedTitle}
        open={Boolean(selectedId)}
        onOpenChange={(open) => {
          if (!open) setSelectedId(null);
        }}
      />
      <XianyuListingDialog
        titles={listingTitle ? [listingTitle] : []}
        open={Boolean(listingTitle)}
        onOpenChange={(open) => {
          if (!open) setListingTitle(null);
        }}
      />
    </div>
  );
}

function FilterSelect({
  value,
  onChange,
  items,
  label,
}: {
  value: string;
  onChange: (value: string) => void;
  items: Array<{ value: string; label: string }>;
  label: string;
}) {
  const selectedLabel =
    items.find((item) => item.value === value)?.label ?? label;

  return (
    <Select
      value={value}
      items={items}
      onValueChange={(next) => {
        if (typeof next === "string") onChange(next);
      }}
    >
      <SelectTrigger size="sm" className="min-w-28" aria-label={label}>
        <SelectValue placeholder={label}>
          {(selected: string | null) =>
            items.find((item) => item.value === selected)?.label ?? selectedLabel
          }
        </SelectValue>
      </SelectTrigger>
      <SelectContent alignItemWithTrigger={false}>
        {items.map((item) => (
          <SelectItem key={item.value} value={item.value}>
            {item.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function EmptyCatalog({ hasData }: { hasData: boolean }) {
  return (
    <div className="rounded-xl border border-dashed border-border px-6 py-16 text-center">
      <p className="font-heading text-lg">
        {hasData ? "没有符合筛选的影片" : "片库还是空的"}
      </p>
      <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
        {hasData
          ? "试试清除筛选，或换一组关键词。"
          : "到「频道」页添加公开 Telegram 频道，或粘贴帖子原文导入。没有网盘或磁力的帖子不会进入片库。"}
      </p>
    </div>
  );
}

function CatalogSkeleton() {
  return (
    <div className="space-y-5">
      <div className="h-10 w-40 rounded-md bg-muted" />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
        {Array.from({ length: 10 }).map((_, i) => (
          <div key={i} className="overflow-hidden rounded-xl bg-card ring-1 ring-foreground/10">
            <div className="aspect-[3/4] bg-muted" />
            <div className="space-y-2 p-3">
              <div className="h-4 w-3/4 rounded bg-muted" />
              <div className="h-3 w-1/2 rounded bg-muted" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
