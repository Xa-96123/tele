"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Copy, Download, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
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
import { posterStyle } from "@/lib/format";
import { titlePosterUrl } from "@/lib/labels";
import type { TitleRecord } from "@/lib/types";
import {
  buildXianyuDraft,
  extensionForPoster,
  formatXianyuBatchText,
  formatXianyuClipboard,
  posterFileStem,
  readStoredXianyuPrice,
  writeStoredXianyuPrice,
  XIANYU_PUBLISH_URL,
  XIANYU_TITLE_MAX,
  type XianyuDraft,
} from "@/lib/xianyu";

async function copyText(value: string, label: string) {
  try {
    await navigator.clipboard.writeText(value);
    toast.success(`已复制${label}`);
  } catch {
    toast.error("复制失败，请手动选择文本");
  }
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

async function downloadPoster(url: string, title: string) {
  const stem = posterFileStem(title);
  if (url.startsWith("data:")) {
    const res = await fetch(url);
    const blob = await res.blob();
    triggerDownload(blob, `${stem}${extensionForPoster(url, blob.type)}`);
    return;
  }
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error("download failed");
    const blob = await res.blob();
    triggerDownload(blob, `${stem}${extensionForPoster(url, blob.type)}`);
  } catch {
    window.open(url, "_blank", "noopener,noreferrer");
    throw new Error("海报受跨域限制，已在新标签打开，请右键另存。");
  }
}

export function XianyuListingDialog({
  titles,
  open,
  onOpenChange,
}: {
  titles: TitleRecord[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [index, setIndex] = useState(0);
  const [listingTitle, setListingTitle] = useState("");
  const [price, setPrice] = useState(() => readStoredXianyuPrice());
  const [description, setDescription] = useState("");

  const current = titles[index] ?? null;
  const drafts = useMemo(
    () => titles.map((title) => buildXianyuDraft(title, price)),
    [price, titles],
  );

  useEffect(() => {
    if (!open) return;
    setIndex(0);
    setPrice(readStoredXianyuPrice());
  }, [open, titles]);

  useEffect(() => {
    if (!current) return;
    const draft = buildXianyuDraft(current, price);
    setListingTitle(draft.listingTitle);
    setDescription(draft.description);
  }, [current, price]);

  const draft: XianyuDraft | null = current
    ? {
        titleId: current.id,
        listingTitle,
        description,
        price,
        posterUrl: titlePosterUrl(current),
      }
    : null;

  async function publishCurrent() {
    if (!current || !draft) return;
    writeStoredXianyuPrice(price);
    await copyText(formatXianyuClipboard(draft), "描述");
    if (draft.posterUrl) {
      try {
        await downloadPoster(draft.posterUrl, current.title);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "海报下载失败");
      }
    }
    window.open(XIANYU_PUBLISH_URL, "_blank", "noopener,noreferrer");
    toast.message("已打开闲鱼发布页", {
      description: "描述已复制。标题和价格请单独填写或点「复制标题」。再上传海报。",
    });
    if (index < titles.length - 1) setIndex((value) => value + 1);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-xl" showCloseButton>
        <DialogHeader>
          <DialogTitle>上架闲鱼</DialogTitle>
          <DialogDescription>
            闲鱼没有开放个人自动发布接口。这里会生成标题、价格和简介，复制后打开官方发布页粘贴。不含网盘链接。
            {titles.length > 1 ? ` 当前 ${index + 1} / ${titles.length} 部。` : ""}
          </DialogDescription>
        </DialogHeader>
        {current && draft ? (
          <div className="grid gap-3">
            <div className="flex items-start gap-3">
              <PosterPreview title={current} />
              <div className="min-w-0 flex-1 space-y-3">
                <div className="space-y-1.5">
                  <Label htmlFor="xianyu-title">
                    商品标题
                    <span className="ml-2 font-normal text-muted-foreground">
                      {[...listingTitle].length}/{XIANYU_TITLE_MAX}
                    </span>
                  </Label>
                  <Input
                    id="xianyu-title"
                    value={listingTitle}
                    maxLength={XIANYU_TITLE_MAX}
                    onChange={(event) => setListingTitle(event.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="xianyu-price">价格（元）</Label>
                  <Input
                    id="xianyu-price"
                    value={price}
                    inputMode="decimal"
                    onChange={(event) => setPrice(event.target.value)}
                  />
                </div>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="xianyu-desc">商品描述（片名和简介）</Label>
              <Textarea
                id="xianyu-desc"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                className="min-h-36"
              />
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">没有可上架的影片。</p>
        )}
        <DialogFooter className="gap-2 sm:justify-between">
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={!draft}
              onClick={() => draft && void copyText(draft.listingTitle, "标题")}
            >
              <Copy data-icon="inline-start" />
              复制标题
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={!draft}
              onClick={() => draft && void copyText(draft.description, "描述")}
            >
              <Copy data-icon="inline-start" />
              复制描述
            </Button>
            {titles.length > 1 ? (
              <Button
                type="button"
                variant="outline"
                onClick={() =>
                  void copyText(formatXianyuBatchText(drafts), "全部上架文案")
                }
              >
                复制全部
              </Button>
            ) : null}
          </div>
          <div className="flex flex-wrap gap-2">
            {titles.length > 1 ? (
              <>
                <Button
                  type="button"
                  variant="ghost"
                  disabled={index <= 0}
                  onClick={() => setIndex((value) => value - 1)}
                >
                  <ChevronLeft data-icon="inline-start" />
                  上一部
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  disabled={index >= titles.length - 1}
                  onClick={() => setIndex((value) => value + 1)}
                >
                  下一部
                  <ChevronRight data-icon="inline-end" />
                </Button>
              </>
            ) : null}
            <Button type="button" disabled={!draft} onClick={() => void publishCurrent()}>
              <ExternalLink data-icon="inline-start" />
              上架闲鱼
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PosterPreview({ title }: { title: TitleRecord }) {
  const src = titlePosterUrl(title);
  return (
    <div className="space-y-2">
      <div
        className="relative h-28 w-20 overflow-hidden rounded-md bg-muted ring-1 ring-foreground/10"
        style={src ? undefined : posterStyle(title.id)}
      >
        {src ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={src} alt={`${title.title} 海报`} className="size-full object-cover" />
        ) : (
          <span className="absolute inset-0 flex items-end p-1.5 font-heading text-xl text-white/85">
            {title.title.slice(0, 1)}
          </span>
        )}
      </div>
      <Button
        type="button"
        size="xs"
        variant="outline"
        className="w-20"
        disabled={!src}
        onClick={() => {
          if (!src) return;
          void downloadPoster(src, title.title)
            .then(() => toast.success("已下载海报"))
            .catch((error) =>
              toast.error(error instanceof Error ? error.message : "海报下载失败"),
            );
        }}
      >
        <Download data-icon="inline-start" />
        海报
      </Button>
    </div>
  );
}
