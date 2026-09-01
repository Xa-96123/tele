"use client";

import { useEffect, useState } from "react";
import { Copy, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { useCatalog } from "@/components/catalog-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { fetchTitleList } from "@/lib/catalog-remote";
import { formatDateTime, posterStyle } from "@/lib/format";
import { LINK_LABELS, TYPE_LABELS } from "@/lib/labels";
import type { SourceLink, TitleRecord } from "@/lib/types";

function shortenLink(link: SourceLink): string {
  if (link.kind === "magnet") {
    const hash = link.url.match(/btih:([a-z0-9]+)/i)?.[1] ?? "";
    return `magnet …${hash.slice(-8)}`;
  }
  try {
    return decodeURIComponent(link.url).slice(0, 72);
  } catch {
    return link.url.slice(0, 72);
  }
}

async function copyText(value: string, label: string) {
  try {
    await navigator.clipboard.writeText(value);
    toast.success(`已复制${label}`);
  } catch {
    toast.error("复制失败，请手动选择文本");
  }
}

const TYPE_ITEMS = Object.entries(TYPE_LABELS).map(([value, label]) => ({
  value,
  label,
}));

export function ResourceDetail({
  title,
  open,
  onOpenChange,
}: {
  title: TitleRecord | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { editTitle, mergeTitleInto, removeTitle } = useCatalog();
  const [editing, setEditing] = useState(false);
  const [merging, setMerging] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState("");
  const [original, setOriginal] = useState("");
  const [year, setYear] = useState("");
  const [type, setType] = useState<TitleRecord["type"]>("movie");
  const [mergeQuery, setMergeQuery] = useState("");
  const [mergeHits, setMergeHits] = useState<TitleRecord[]>([]);
  const [mergePick, setMergePick] = useState<TitleRecord | null>(null);

  useEffect(() => {
    if (!title) return;
    setEditing(false);
    setMerging(false);
    setConfirmRemove(false);
    setBusy(false);
    setName(title.title);
    setOriginal(title.originalTitle ?? "");
    setYear(title.year ? String(title.year) : "");
    setType(title.type);
    setMergeQuery("");
    setMergeHits([]);
    setMergePick(null);
  }, [title?.id]);

  useEffect(() => {
    if (!merging || !title) return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      void fetchTitleList(
        { q: mergeQuery, offset: 0, limit: 8, sort: "recent" },
        { signal: controller.signal },
      ).then((result) => {
        if (!result.ok) return;
        setMergeHits(result.titles.filter((item) => item.id !== title.id));
      });
    }, mergeQuery ? 200 : 0);
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [mergeQuery, merging, title]);

  if (!title) return null;
  const current = title;

  async function onSave() {
    const trimmed = name.trim();
    if (!trimmed) {
      toast.error("片名不能为空");
      return;
    }
    const parsedYear = year.trim() ? Number(year) : null;
    if (year.trim() && (!Number.isFinite(parsedYear) || (parsedYear ?? 0) < 1870 || (parsedYear ?? 0) > 2100)) {
      toast.error("年份不正确");
      return;
    }
    setBusy(true);
    const ok = await editTitle(current.id, {
      title: trimmed,
      originalTitle: original.trim() || null,
      year: parsedYear,
      type,
    });
    setBusy(false);
    if (ok) setEditing(false);
  }

  async function onMerge() {
    if (!mergePick) return;
    setBusy(true);
    const ok = await mergeTitleInto(mergePick.id, current.id);
    setBusy(false);
    if (ok) {
      setMerging(false);
      setMergePick(null);
    }
  }

  async function onRemove() {
    setBusy(true);
    const ok = await removeTitle(current.id);
    setBusy(false);
    if (ok) onOpenChange(false);
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full gap-0 overflow-y-auto sm:max-w-lg"
      >
        <div
          className="relative h-40 shrink-0"
          style={title.posterUrl ? undefined : posterStyle(title.id)}
        >
          {title.posterUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={title.posterUrl}
              alt=""
              className="size-full object-cover"
            />
          ) : null}
          <div className="absolute inset-0 bg-gradient-to-t from-popover to-transparent" />
        </div>
        <SheetHeader className="border-b">
          <SheetTitle className="font-heading text-xl">
            {title.title}
            {title.year ? (
              <span className="ml-2 text-base font-normal text-muted-foreground">
                {title.year}
              </span>
            ) : null}
          </SheetTitle>
          <SheetDescription>
            {title.originalTitle || TYPE_LABELS[title.type]}
          </SheetDescription>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <Badge>{TYPE_LABELS[title.type]}</Badge>
            {title.douban ? (
              <Badge variant="secondary">豆瓣 {title.douban}</Badge>
            ) : null}
            {title.imdb ? (
              <Badge variant="secondary">IMDb {title.imdb}</Badge>
            ) : null}
            {title.genres.map((g) => (
              <Badge key={g} variant="outline">
                {g}
              </Badge>
            ))}
          </div>
        </SheetHeader>

        <div className="space-y-5 p-4">
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              variant={editing ? "secondary" : "outline"}
              disabled={busy || merging || confirmRemove}
              onClick={() => {
                setEditing((current) => !current);
                setMerging(false);
                setConfirmRemove(false);
              }}
            >
              {editing ? "取消编辑" : "改名"}
            </Button>
            <Button
              type="button"
              size="sm"
              variant={merging ? "secondary" : "outline"}
              disabled={busy || editing || confirmRemove}
              onClick={() => {
                setMerging((current) => !current);
                setEditing(false);
                setConfirmRemove(false);
                setMergePick(null);
              }}
            >
              {merging ? "取消合并" : "与另一部合并"}
            </Button>
            {confirmRemove ? (
              <>
                <Button
                  type="button"
                  size="sm"
                  variant="destructive"
                  disabled={busy}
                  onClick={() => void onRemove()}
                >
                  确认丢掉
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  disabled={busy}
                  onClick={() => setConfirmRemove(false)}
                >
                  取消
                </Button>
              </>
            ) : (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                disabled={busy || editing || merging}
                onClick={() => setConfirmRemove(true)}
              >
                丢掉这部
              </Button>
            )}
          </div>
          {confirmRemove ? (
            <p className="text-xs text-muted-foreground">
              会从片库去掉这部的卡片和链接，频道还留着。同步时如果帖子还在，可能会再进来。
            </p>
          ) : null}

          {editing ? (
            <div className="space-y-3 rounded-xl bg-muted/40 p-3 ring-1 ring-foreground/8">
              <div className="space-y-1.5">
                <Label htmlFor="title-name">片名</Label>
                <Input
                  id="title-name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="title-original">外文名</Label>
                <Input
                  id="title-original"
                  value={original}
                  onChange={(event) => setOriginal(event.target.value)}
                  placeholder="没有可留空"
                />
              </div>
              <div className="flex flex-wrap gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="title-year">年份</Label>
                  <Input
                    id="title-year"
                    inputMode="numeric"
                    className="w-28"
                    value={year}
                    onChange={(event) => setYear(event.target.value)}
                    placeholder="例如 2024"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>类型</Label>
                  <Select
                    value={type}
                    items={TYPE_ITEMS}
                    onValueChange={(next) => {
                      if (typeof next === "string") {
                        setType(next as TitleRecord["type"]);
                      }
                    }}
                  >
                    <SelectTrigger size="sm" className="min-w-28" aria-label="类型">
                      <SelectValue>
                        {(selected: string | null) =>
                          TYPE_LABELS[(selected as TitleRecord["type"]) || type]
                        }
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent alignItemWithTrigger={false}>
                      {TYPE_ITEMS.map((item) => (
                        <SelectItem key={item.value} value={item.value}>
                          {item.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                改成与另一张卡相同的「片名 + 年份 + 类型」时，会自动并到这一张上。沙丘和沙丘2仍然是两部，除非你主动改名或合并。
              </p>
              <Button type="button" size="sm" disabled={busy} onClick={() => void onSave()}>
                保存
              </Button>
            </div>
          ) : null}

          {merging ? (
            <div className="space-y-3 rounded-xl bg-muted/40 p-3 ring-1 ring-foreground/8">
              <div className="space-y-1.5">
                <Label htmlFor="merge-query">搜要并进来的那一部</Label>
                <Input
                  id="merge-query"
                  value={mergeQuery}
                  onChange={(event) => {
                    setMergeQuery(event.target.value);
                    setMergePick(null);
                  }}
                  placeholder="片名，例如 沙丘"
                />
              </div>
              {mergeHits.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  {mergeQuery.trim() ? "没有找到其他影片。" : "最近的其他影片会出现在这里。"}
                </p>
              ) : (
                <ul className="space-y-1">
                  {mergeHits.map((hit) => (
                    <li key={hit.id}>
                      <button
                        type="button"
                        className={`w-full rounded-lg px-2.5 py-2 text-left text-sm ${
                          mergePick?.id === hit.id
                            ? "bg-primary/15 text-foreground"
                            : "bg-background/70 hover:bg-background"
                        }`}
                        onClick={() => setMergePick(hit)}
                      >
                        <span className="font-medium">{hit.title}</span>
                        {hit.year ? (
                          <span className="ml-1.5 text-muted-foreground">
                            {hit.year}
                          </span>
                        ) : null}
                        <span className="mt-0.5 block text-xs text-muted-foreground">
                          {TYPE_LABELS[hit.type]} · {hit.editions.length} 个版本
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {mergePick ? (
                <div className="space-y-2">
                  <p className="text-xs text-muted-foreground">
                    把《{mergePick.title}》的版本并入《{title.title}》。留下的是现在这张卡的片名。
                  </p>
                  <Button
                    type="button"
                    size="sm"
                    disabled={busy}
                    onClick={() => void onMerge()}
                  >
                    确认合并
                  </Button>
                </div>
              ) : null}
            </div>
          ) : null}

          {title.overview ? (
            <p className="text-sm leading-relaxed text-muted-foreground">
              {title.overview}
            </p>
          ) : null}
          {(title.director || title.cast.length > 0) && (
            <div className="space-y-1 text-sm">
              {title.director ? (
                <p>
                  <span className="text-muted-foreground">导演 </span>
                  {title.director}
                </p>
              ) : null}
              {title.cast.length ? (
                <p>
                  <span className="text-muted-foreground">主演 </span>
                  {title.cast.join(" / ")}
                </p>
              ) : null}
            </div>
          )}

          <Separator />

          <div>
            <h3 className="mb-3 text-sm font-medium">
              {title.editions.length} 个来源版本
            </h3>
            <div className="space-y-3">
              {title.editions.map((edition) => (
                <article
                  key={edition.id}
                  className="rounded-xl bg-muted/40 p-3 ring-1 ring-foreground/8"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-sm font-medium">
                        {edition.channelTitle}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        @{edition.channel} · {formatDateTime(edition.postedAt)}
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      nativeButton={false}
                      render={
                        <a
                          href={edition.postUrl}
                          target="_blank"
                          rel="noreferrer"
                        />
                      }
                    >
                      <ExternalLink />
                    </Button>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1">
                    {edition.quality ? (
                      <Badge variant="outline">{edition.quality}</Badge>
                    ) : null}
                    {edition.sizeLabel ? (
                      <Badge variant="secondary">{edition.sizeLabel}</Badge>
                    ) : null}
                    {edition.season ? (
                      <Badge variant="secondary">{edition.season}</Badge>
                    ) : null}
                    {edition.episodes ? (
                      <Badge variant="secondary">{edition.episodes}</Badge>
                    ) : null}
                  </div>
                  {edition.links.length ? (
                    <ul className="mt-3 space-y-1.5">
                      {edition.links.map((link) => (
                        <li
                          key={link.url}
                          className="flex items-center gap-2 rounded-lg bg-background/60 px-2 py-1.5"
                        >
                          <span className="w-16 shrink-0 text-xs text-muted-foreground">
                            {LINK_LABELS[link.kind]}
                          </span>
                          <span className="min-w-0 flex-1 truncate font-mono text-[11px]">
                            {shortenLink(link)}
                          </span>
                          <Button
                            variant="ghost"
                            size="icon-xs"
                            onClick={() =>
                              copyText(link.url, LINK_LABELS[link.kind])
                            }
                          >
                            <Copy />
                          </Button>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="mt-2 text-xs text-muted-foreground">
                      这条帖子没有识别到网盘或磁力链接。
                    </p>
                  )}
                  <details className="mt-2">
                    <summary className="cursor-pointer text-xs text-muted-foreground">
                      原文
                    </summary>
                    <pre className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap font-sans text-xs leading-relaxed text-muted-foreground">
                      {edition.rawText}
                    </pre>
                  </details>
                </article>
              ))}
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
