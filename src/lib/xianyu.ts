import { titlePosterUrl, TYPE_LABELS } from "@/lib/labels";
import type { TitleRecord } from "@/lib/types";

export const XIANYU_PUBLISH_URL = "https://www.goofish.com/publish";
export const XIANYU_TITLE_MAX = 30;
export const XIANYU_PRICE_KEY = "yingqu.xianyu.price.v1";
export const DEFAULT_XIANYU_PRICE = "9.9";

export type XianyuDraft = {
  titleId: string;
  listingTitle: string;
  description: string;
  price: string;
  posterUrl?: string;
};

export function clipXianyuTitle(input: string, max = XIANYU_TITLE_MAX): string {
  const text = input.replace(/\s+/g, " ").trim();
  if ([...text].length <= max) return text;
  return `${[...text].slice(0, max - 1).join("")}…`;
}

export function buildXianyuTitle(title: TitleRecord): string {
  const parts = [
    title.title,
    title.year ? String(title.year) : "",
    TYPE_LABELS[title.type] ?? "",
  ].filter(Boolean);
  return clipXianyuTitle(parts.join(" "));
}

export function buildXianyuDescription(title: TitleRecord): string {
  const overview = title.overview?.replace(/\s+/g, " ").trim();
  const lines = [
    title.title,
    title.year ? `年份：${title.year}` : "",
    title.originalTitle ? `原名：${title.originalTitle}` : "",
    "",
    "简介：",
    overview || "（暂无简介）",
  ].filter((line, index, all) => line !== "" || all[index - 1] !== "");
  return lines.join("\n").trim();
}

export function buildXianyuDraft(
  title: TitleRecord,
  price = DEFAULT_XIANYU_PRICE,
): XianyuDraft {
  return {
    titleId: title.id,
    listingTitle: buildXianyuTitle(title),
    description: buildXianyuDescription(title),
    price: price.trim() || DEFAULT_XIANYU_PRICE,
    posterUrl: titlePosterUrl(title),
  };
}

export function formatXianyuClipboard(draft: XianyuDraft): string {
  return draft.description;
}

export function formatXianyuBatchText(drafts: XianyuDraft[]): string {
  return drafts
    .map((draft, index) => `【第 ${index + 1} 条】\n${formatXianyuClipboard(draft)}`)
    .join("\n\n----------\n\n");
}

export function posterFileStem(title: string): string {
  const stem = title.replace(/[\\/:*?"<>|]+/g, "").trim() || "poster";
  return `${stem}-海报`;
}

export function extensionForPoster(url: string, mime?: string): string {
  if (mime?.includes("svg")) return ".svg";
  if (mime?.includes("png")) return ".png";
  if (mime?.includes("webp")) return ".webp";
  if (mime?.includes("jpeg") || mime?.includes("jpg")) return ".jpg";
  if (url.startsWith("data:image/svg")) return ".svg";
  if (url.startsWith("data:image/png")) return ".png";
  const path = url.split("?")[0] ?? url;
  const ext = path.match(/\.(jpe?g|png|webp|svg)$/i)?.[1];
  return ext ? `.${ext.toLowerCase()}` : ".jpg";
}

export function readStoredXianyuPrice(): string {
  if (typeof window === "undefined") return DEFAULT_XIANYU_PRICE;
  try {
    return localStorage.getItem(XIANYU_PRICE_KEY) || DEFAULT_XIANYU_PRICE;
  } catch {
    return DEFAULT_XIANYU_PRICE;
  }
}

export function writeStoredXianyuPrice(price: string) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(XIANYU_PRICE_KEY, price.trim() || DEFAULT_XIANYU_PRICE);
  } catch {
    // ignore quota / private mode
  }
}
