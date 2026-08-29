import * as XLSX from "xlsx";
import { LINK_LABELS, TYPE_LABELS } from "@/lib/labels";
import type { Edition, TitleRecord } from "@/lib/types";

export type CellValue = string | number;

export const TITLE_COLUMNS = [
  { key: "title", label: "片名" },
  { key: "originalTitle", label: "原名" },
  { key: "year", label: "年份" },
  { key: "type", label: "类型" },
  { key: "genres", label: "类型标签" },
  { key: "director", label: "导演" },
  { key: "cast", label: "主演" },
  { key: "douban", label: "豆瓣" },
  { key: "imdb", label: "IMDb" },
  { key: "overview", label: "简介" },
  { key: "posterUrl", label: "海报" },
  { key: "editionCount", label: "版本数" },
  { key: "seasons", label: "季" },
  { key: "episodes", label: "集数" },
  { key: "qualities", label: "画质" },
  { key: "resolutions", label: "分辨率" },
  { key: "sizes", label: "体积" },
  { key: "sourceKinds", label: "来源类型" },
  { key: "links", label: "资源链接" },
  { key: "channels", label: "频道" },
  { key: "channelUsernames", label: "频道用户名" },
  { key: "postUrls", label: "帖子链接" },
  { key: "firstSeenAt", label: "首次出现" },
  { key: "lastSeenAt", label: "最近出现" },
  { key: "rawText", label: "原文" },
] as const;

export type TitleColumnKey = (typeof TITLE_COLUMNS)[number]["key"];

export type TitleFlat = Record<TitleColumnKey, CellValue>;

export const EDITION_COLUMNS = [
  { key: "title", label: "片名" },
  { key: "originalTitle", label: "原名" },
  { key: "year", label: "年份" },
  { key: "type", label: "类型" },
  { key: "douban", label: "豆瓣" },
  { key: "imdb", label: "IMDb" },
  { key: "channelTitle", label: "频道" },
  { key: "channel", label: "频道用户名" },
  { key: "messageId", label: "消息 ID" },
  { key: "postUrl", label: "帖子链接" },
  { key: "postedAt", label: "发布时间" },
  { key: "quality", label: "画质" },
  { key: "resolution", label: "分辨率" },
  { key: "sizeLabel", label: "体积" },
  { key: "season", label: "季" },
  { key: "episodes", label: "集数" },
  { key: "sourceKinds", label: "来源类型" },
  { key: "links", label: "资源链接" },
  { key: "photoUrl", label: "海报" },
  { key: "rawText", label: "原文" },
] as const;

export type EditionColumnKey = (typeof EDITION_COLUMNS)[number]["key"];

export type EditionFlat = Record<EditionColumnKey, CellValue>;

function uniqueJoin(
  values: Array<string | undefined | null>,
  sep = " / ",
): string {
  return [
    ...new Set(
      values
        .map((value) => value?.trim())
        .filter((value): value is string => Boolean(value)),
    ),
  ].join(sep);
}

function formatLink(kind: string, url: string): string {
  const label = LINK_LABELS[kind as keyof typeof LINK_LABELS] ?? kind;
  return `${label}: ${url}`;
}

export function flattenTitle(title: TitleRecord): TitleFlat {
  const editions = title.editions;
  return {
    title: title.title,
    originalTitle: title.originalTitle ?? "",
    year: title.year ?? "",
    type: TYPE_LABELS[title.type] ?? title.type,
    genres: uniqueJoin(title.genres),
    director: title.director ?? "",
    cast: uniqueJoin(title.cast),
    douban: title.douban ?? "",
    imdb: title.imdb ?? "",
    overview: title.overview ?? "",
    posterUrl:
      title.posterUrl ?? editions.find((e) => e.photoUrl)?.photoUrl ?? "",
    editionCount: editions.length,
    seasons: uniqueJoin(editions.map((e) => e.season)),
    episodes: uniqueJoin(editions.map((e) => e.episodes)),
    qualities: uniqueJoin(editions.map((e) => e.quality)),
    resolutions: uniqueJoin(editions.map((e) => e.resolution)),
    sizes: uniqueJoin(editions.map((e) => e.sizeLabel)),
    sourceKinds: uniqueJoin(
      editions.flatMap((e) =>
        e.links.map((link) => LINK_LABELS[link.kind] ?? link.kind),
      ),
    ),
    links: editions
      .flatMap((edition) =>
        edition.links.map((link) => formatLink(link.kind, link.url)),
      )
      .join("\n"),
    channels: uniqueJoin(editions.map((e) => e.channelTitle || e.channel)),
    channelUsernames: uniqueJoin(editions.map((e) => e.channel)),
    postUrls: uniqueJoin(editions.map((e) => e.postUrl), "\n"),
    firstSeenAt: title.firstSeenAt,
    lastSeenAt: title.lastSeenAt,
    rawText: uniqueJoin(
      editions.map((e) => e.rawText.replace(/\s+/g, " ").trim()),
      "\n\n",
    ),
  };
}

export function flattenEdition(
  title: TitleRecord,
  edition: Edition,
): EditionFlat {
  return {
    title: title.title,
    originalTitle: title.originalTitle ?? "",
    year: title.year ?? "",
    type: TYPE_LABELS[title.type] ?? title.type,
    douban: title.douban ?? "",
    imdb: title.imdb ?? "",
    channelTitle: edition.channelTitle || edition.channel,
    channel: edition.channel,
    messageId: edition.messageId,
    postUrl: edition.postUrl,
    postedAt: edition.postedAt ?? "",
    quality: edition.quality ?? "",
    resolution: edition.resolution ?? "",
    sizeLabel: edition.sizeLabel ?? "",
    season: edition.season ?? "",
    episodes: edition.episodes ?? "",
    sourceKinds: uniqueJoin(
      edition.links.map((link) => LINK_LABELS[link.kind] ?? link.kind),
    ),
    links: edition.links
      .map((link) => formatLink(link.kind, link.url))
      .join("\n"),
    photoUrl: edition.photoUrl ?? title.posterUrl ?? "",
    rawText: edition.rawText,
  };
}

function titleValues(row: TitleFlat): CellValue[] {
  return TITLE_COLUMNS.map((column) => row[column.key]);
}

function editionValues(row: EditionFlat): CellValue[] {
  return EDITION_COLUMNS.map((column) => row[column.key]);
}

export function catalogToCsv(titles: TitleRecord[]): string {
  const header = TITLE_COLUMNS.map((column) => column.label);
  const rows = titles.map((title) =>
    titleValues(flattenTitle(title)).map(csvCell),
  );
  return `\uFEFF${[header.join(","), ...rows.map((row) => row.join(","))].join("\n")}`;
}

function csvCell(value: CellValue): string {
  const text = String(value);
  if (/[",\n]/.test(text)) return `"${text.replaceAll('"', '""')}"`;
  return text;
}

function sheetFromRows(
  headers: string[],
  rows: CellValue[][],
  widths: number[],
): XLSX.WorkSheet {
  const sheet = XLSX.utils.aoa_to_sheet([headers, ...rows]);
  sheet["!cols"] = widths.map((wch) => ({ wch }));
  return sheet;
}

export function catalogToWorkbook(titles: TitleRecord[]): XLSX.WorkBook {
  const workbook = XLSX.utils.book_new();
  const titleRows = titles.map((title) => titleValues(flattenTitle(title)));
  const editionRows = titles.flatMap((title) =>
    title.editions.map((edition) =>
      editionValues(flattenEdition(title, edition)),
    ),
  );

  XLSX.utils.book_append_sheet(
    workbook,
    sheetFromRows(
      TITLE_COLUMNS.map((column) => column.label),
      titleRows,
      [
        22, 22, 8, 8, 16, 14, 22, 8, 8, 40, 28, 8, 10, 12, 16, 12, 12, 16, 48,
        18, 16, 36, 22, 22, 48,
      ],
    ),
    "影片汇总",
  );
  XLSX.utils.book_append_sheet(
    workbook,
    sheetFromRows(
      EDITION_COLUMNS.map((column) => column.label),
      editionRows,
      [
        22, 22, 8, 8, 8, 8, 18, 16, 10, 36, 22, 16, 12, 12, 8, 12, 16, 48, 28,
        48,
      ],
    ),
    "版本明细",
  );
  return workbook;
}

export function catalogToXlsxArrayBuffer(titles: TitleRecord[]): ArrayBuffer {
  const workbook = catalogToWorkbook(titles);
  return XLSX.write(workbook, {
    bookType: "xlsx",
    type: "array",
  }) as ArrayBuffer;
}

export function downloadCatalogExcel(
  titles: TitleRecord[],
  filename = "yingqu-catalog.xlsx",
) {
  const buffer = catalogToXlsxArrayBuffer(titles);
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
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

export function catalogExcelFilename(count: number, now = new Date()): string {
  const date = now.toISOString().slice(0, 10);
  return `yingqu-汇总-${date}-${count}部.xlsx`;
}
