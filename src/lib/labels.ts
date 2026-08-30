import type { LinkKind, ResourceType, SourceLink, TitleRecord } from "@/lib/types";

export const TYPE_LABELS: Record<ResourceType, string> = {
  movie: "电影",
  series: "剧集",
  anime: "动漫",
  documentary: "纪录",
  other: "其他",
};

export const LINK_LABELS: Record<LinkKind, string> = {
  magnet: "磁力",
  ed2k: "电驴",
  quark: "夸克",
  aliyun: "阿里云盘",
  baidu: "百度网盘",
  "115": "115",
  "123pan": "123 云盘",
  pikpak: "PikPak",
  mega: "MEGA",
  google: "Google Drive",
  telegram: "Telegram",
  other: "外链",
};

export const QUALITY_OPTIONS = ["2160p", "1080p", "720p", "480p", "8K"] as const;

export const CLOUD_LINK_KINDS = [
  "quark",
  "aliyun",
  "baidu",
  "115",
  "123pan",
  "pikpak",
  "mega",
  "google",
] as const satisfies readonly LinkKind[];

export type CloudLinkKind = (typeof CLOUD_LINK_KINDS)[number];

export function isCloudLinkKind(kind: LinkKind): kind is CloudLinkKind {
  return (CLOUD_LINK_KINDS as readonly LinkKind[]).includes(kind);
}

export function collectCloudLinks(title: TitleRecord): SourceLink[] {
  const seen = new Set<string>();
  const links: SourceLink[] = [];
  for (const edition of title.editions) {
    for (const link of edition.links) {
      if (!isCloudLinkKind(link.kind) || seen.has(link.url)) continue;
      seen.add(link.url);
      links.push(link);
    }
  }
  return links;
}

export function formatCloudLink(link: SourceLink): string {
  return `${LINK_LABELS[link.kind] ?? link.kind}: ${link.url}`;
}

export function formatCloudLinksText(title: TitleRecord): string {
  return collectCloudLinks(title).map(formatCloudLink).join("\n");
}
