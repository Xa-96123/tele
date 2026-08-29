import { LINK_LABELS, TYPE_LABELS } from "@/lib/labels";
import { uniqueLinkKinds, uniqueResolutions } from "@/lib/catalog";
import type { TitleRecord } from "@/lib/types";

export function catalogToCsv(titles: TitleRecord[]): string {
  const header = [
    "标题",
    "原名",
    "年份",
    "类型",
    "季",
    "豆瓣",
    "IMDb",
    "画质",
    "来源",
    "频道",
    "最近出现",
  ];
  const rows = titles.map((title) =>
    [
      title.title,
      title.originalTitle ?? "",
      title.year ?? "",
      TYPE_LABELS[title.type],
      title.editions[0]?.season ?? "",
      title.douban ?? "",
      title.imdb ?? "",
      uniqueResolutions(title).join(" / "),
      uniqueLinkKinds(title)
        .map((k) => LINK_LABELS[k as keyof typeof LINK_LABELS] ?? k)
        .join(" / "),
      [...new Set(title.editions.map((e) => e.channelTitle || e.channel))].join(
        " / ",
      ),
      title.lastSeenAt,
    ].map(csvCell),
  );
  return [header.join(","), ...rows.map((r) => r.join(","))].join("\n");
}

function csvCell(value: string | number): string {
  const text = String(value);
  if (/[",\n]/.test(text)) return `"${text.replaceAll('"', '""')}"`;
  return text;
}

export function downloadText(filename: string, content: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
