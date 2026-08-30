export type ResourceType =
  | "movie"
  | "series"
  | "anime"
  | "documentary"
  | "other";

export type LinkKind =
  | "magnet"
  | "ed2k"
  | "quark"
  | "aliyun"
  | "baidu"
  | "115"
  | "123pan"
  | "pikpak"
  | "mega"
  | "google"
  | "telegram"
  | "other";

export type SourceLink = {
  kind: LinkKind;
  url: string;
  label?: string;
};

export type ChannelSource = "preview" | "account" | "export" | "demo";

export type ChannelInfo = {
  username: string;
  title: string;
  description: string;
  avatarUrl?: string;
  subscribers?: string;
  isDemo?: boolean;
  source?: ChannelSource;
  peerId?: string;
  isPrivate?: boolean;
};

export type ChannelRecord = ChannelInfo & {
  addedAt: string;
  lastSyncedAt?: string;
  lastBefore?: string;
  postCount: number;
  resourceCount: number;
  status: "idle" | "syncing" | "error";
  lastError?: string;
};

export type ChannelPost = {
  channel: string;
  messageId: number;
  postUrl: string;
  postedAt?: string;
  text: string;
  photoUrl?: string;
  hrefs: string[];
};

export type Edition = {
  id: string;
  channel: string;
  channelTitle: string;
  messageId: number;
  postUrl: string;
  postedAt?: string;
  quality?: string;
  resolution?: string;
  sizeLabel?: string;
  sizeBytes?: number;
  episodes?: string;
  season?: string;
  links: SourceLink[];
  rawText: string;
  photoUrl?: string;
};

export type TitleRecord = {
  id: string;
  title: string;
  originalTitle?: string;
  year?: number;
  type: ResourceType;
  genres: string[];
  douban?: number;
  imdb?: number;
  overview?: string;
  director?: string;
  cast: string[];
  posterUrl?: string;
  editions: Edition[];
  firstSeenAt: string;
  lastSeenAt: string;
};

export type CatalogState = {
  version: 1;
  initialized: boolean;
  noticeDismissed: boolean;
  channels: ChannelRecord[];
  titles: TitleRecord[];
};

export type CatalogPatch = {
  initialized?: boolean;
  noticeDismissed?: boolean;
  channels?: ChannelRecord[];
  titles?: TitleRecord[];
  removedChannel?: string;
  removedTitleIds?: string[];
};

export type SyncResult = {
  channel: ChannelInfo;
  posts: ChannelPost[];
  titles: TitleRecord[];
  skipped: number;
  nextBefore?: string;
  fetchedPages: number;
};

export type AccountChannel = {
  id: string;
  username: string;
  title: string;
  isPrivate: boolean;
  kind: "channel" | "group";
  peerId: string;
  subscribers?: string;
};
