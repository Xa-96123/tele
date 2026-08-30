"use client";

import { Store } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { uniqueLinkKinds, uniqueResolutions } from "@/lib/catalog";
import { posterStyle } from "@/lib/format";
import { LINK_LABELS, TYPE_LABELS } from "@/lib/labels";
import type { TitleRecord } from "@/lib/types";
import { cn } from "@/lib/utils";

export function ResourceCard({
  title,
  onOpen,
  onList,
}: {
  title: TitleRecord;
  onOpen: () => void;
  onList: () => void;
}) {
  const resolutions = uniqueResolutions(title);
  const links = uniqueLinkKinds(title);
  const channels = [
    ...new Set(title.editions.map((e) => e.channelTitle || e.channel)),
  ];

  return (
    <article className="group flex flex-col overflow-hidden rounded-xl bg-card ring-1 ring-foreground/10 transition hover:-translate-y-0.5 hover:ring-primary/50">
      <button
        type="button"
        onClick={onOpen}
        className="flex flex-1 flex-col text-left"
      >
        <div
          className="relative aspect-[3/4] overflow-hidden"
          style={title.posterUrl ? undefined : posterStyle(title.id)}
        >
          {title.posterUrl ? (
            // Telegram CDN posters; skip next/image host allowlisting.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={title.posterUrl}
              alt=""
              className="size-full object-cover transition duration-500 group-hover:scale-[1.03]"
            />
          ) : (
            <div className="absolute inset-0 flex items-end p-3">
              <span className="font-heading text-3xl font-semibold text-white/85">
                {title.title.slice(0, 1)}
              </span>
            </div>
          )}
          <div className="absolute inset-x-0 top-0 flex items-start justify-between p-2">
            <Badge className="bg-black/55 text-white">
              {TYPE_LABELS[title.type]}
            </Badge>
            {title.year ? (
              <Badge variant="secondary" className="bg-black/55 text-white">
                {title.year}
              </Badge>
            ) : null}
          </div>
        </div>
        <div className="flex flex-1 flex-col gap-2 p-3 pb-2">
          <div>
            <h3 className="line-clamp-2 font-heading text-[15px] font-medium leading-snug">
              {title.title}
            </h3>
            {title.originalTitle ? (
              <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">
                {title.originalTitle}
              </p>
            ) : null}
          </div>
          <div className="mt-auto flex flex-wrap gap-1">
            {resolutions.map((res) => (
              <Badge key={res} variant="outline">
                {res}
              </Badge>
            ))}
            {links.slice(0, 3).map((kind) => (
              <Badge key={kind} variant="secondary">
                {LINK_LABELS[kind as keyof typeof LINK_LABELS] ?? kind}
              </Badge>
            ))}
          </div>
          <p className={cn("text-[11px] text-muted-foreground")}>
            {channels.slice(0, 2).join(" · ")}
            {channels.length > 2 ? ` 等 ${channels.length} 个频道` : ""}
          </p>
        </div>
      </button>
      <div className="px-3 pb-3">
        <Button
          type="button"
          size="sm"
          variant="secondary"
          className="w-full"
          onClick={(event) => {
            event.stopPropagation();
            onList();
          }}
        >
          <Store data-icon="inline-start" />
          上架闲鱼
        </Button>
      </div>
    </article>
  );
}
