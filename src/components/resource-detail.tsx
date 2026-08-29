"use client";

import { Copy, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
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

export function ResourceDetail({
  title,
  open,
  onOpenChange,
}: {
  title: TitleRecord | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  if (!title) return null;

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
