import type { LinkKind, ResourceType } from "@/lib/types";

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
