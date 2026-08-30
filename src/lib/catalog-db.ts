import { mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { compactCatalog } from "@/lib/catalog-storage";
import type {
  CatalogState,
  ChannelRecord,
  ChannelSource,
  Edition,
  LinkKind,
  SourceLink,
  TitleRecord,
} from "@/lib/types";

const require = createRequire(import.meta.url);
const { DatabaseSync } = require("node:sqlite") as {
  DatabaseSync: new (
    filename: string,
    options?: { enableForeignKeyConstraints?: boolean },
  ) => SqliteDb;
};

type SqliteDb = {
  close(): void;
  exec(sql: string): void;
  prepare(sql: string): {
    run(...params: unknown[]): unknown;
    get(...params: unknown[]): unknown;
    all(...params: unknown[]): unknown[];
  };
};

const SCHEMA_SQL = `
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS channels (
  username TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  avatar_url TEXT,
  subscribers TEXT,
  is_demo INTEGER NOT NULL DEFAULT 0,
  source TEXT,
  peer_id TEXT,
  is_private INTEGER,
  added_at TEXT NOT NULL,
  last_synced_at TEXT,
  last_before TEXT,
  post_count INTEGER NOT NULL DEFAULT 0,
  resource_count INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'idle',
  last_error TEXT,
  position INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS titles (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  original_title TEXT,
  year INTEGER,
  type TEXT NOT NULL,
  genres_json TEXT NOT NULL DEFAULT '[]',
  douban REAL,
  imdb REAL,
  overview TEXT,
  director TEXT,
  cast_json TEXT NOT NULL DEFAULT '[]',
  poster_url TEXT,
  first_seen_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  position INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS editions (
  id TEXT PRIMARY KEY,
  title_id TEXT NOT NULL REFERENCES titles(id) ON DELETE CASCADE,
  channel TEXT NOT NULL,
  channel_title TEXT NOT NULL,
  message_id INTEGER NOT NULL,
  post_url TEXT NOT NULL,
  posted_at TEXT,
  quality TEXT,
  resolution TEXT,
  size_label TEXT,
  size_bytes INTEGER,
  episodes TEXT,
  season TEXT,
  raw_text TEXT NOT NULL DEFAULT '',
  photo_url TEXT,
  position INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS links (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  edition_id TEXT NOT NULL REFERENCES editions(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  url TEXT NOT NULL,
  label TEXT,
  position INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_titles_name ON titles(title);
CREATE INDEX IF NOT EXISTS idx_titles_year ON titles(year);
CREATE INDEX IF NOT EXISTS idx_editions_title ON editions(title_id);
CREATE INDEX IF NOT EXISTS idx_editions_channel ON editions(channel);
CREATE INDEX IF NOT EXISTS idx_links_edition ON links(edition_id);
CREATE INDEX IF NOT EXISTS idx_links_kind ON links(kind);
`;

const dbs = new Map<string, SqliteDb>();

export function defaultCatalogDbPath() {
  return process.env.YINGQU_DB_PATH?.trim()
    ? path.resolve(process.env.YINGQU_DB_PATH)
    : path.join(process.cwd(), "data", "yingqu.sqlite");
}

export function getCatalogDb(filePath = defaultCatalogDbPath()): SqliteDb {
  const existing = dbs.get(filePath);
  if (existing) return existing;
  mkdirSync(path.dirname(filePath), { recursive: true });
  const db = new DatabaseSync(filePath, { enableForeignKeyConstraints: true });
  db.exec(SCHEMA_SQL);
  dbs.set(filePath, db);
  return db;
}

export function closeCatalogDb(filePath?: string) {
  if (filePath) {
    const db = dbs.get(filePath);
    if (!db) return;
    db.close();
    dbs.delete(filePath);
    return;
  }
  for (const [key, db] of dbs) {
    db.close();
    dbs.delete(key);
  }
}

function text(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function int(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "bigint") return Number(value);
  return undefined;
}

function parseStringArray(raw: unknown): string[] {
  if (typeof raw !== "string") return [];
  try {
    const value = JSON.parse(raw) as unknown;
    return Array.isArray(value)
      ? value.filter((item): item is string => typeof item === "string")
      : [];
  } catch {
    return [];
  }
}

function asChannelSource(value: unknown): ChannelSource | undefined {
  return value === "preview" ||
    value === "account" ||
    value === "export" ||
    value === "demo"
    ? value
    : undefined;
}

function asLinkKind(value: unknown): LinkKind {
  const kinds: LinkKind[] = [
    "magnet",
    "ed2k",
    "quark",
    "aliyun",
    "baidu",
    "115",
    "123pan",
    "pikpak",
    "mega",
    "google",
    "telegram",
    "other",
  ];
  return kinds.includes(value as LinkKind) ? (value as LinkKind) : "other";
}

function asChannelStatus(value: unknown): ChannelRecord["status"] {
  return value === "error" || value === "syncing" || value === "idle"
    ? value === "syncing"
      ? "idle"
      : value
    : "idle";
}

type MetaRow = { key: string; value: string };
type ChannelRow = Record<string, unknown>;
type TitleRow = Record<string, unknown>;
type EditionRow = Record<string, unknown>;
type LinkRow = Record<string, unknown>;

export function emptyCatalogState(): CatalogState {
  return {
    version: 1,
    initialized: false,
    noticeDismissed: false,
    channels: [],
    titles: [],
  };
}

export function readCatalogState(filePath?: string): CatalogState {
  const db = getCatalogDb(filePath);
  const meta = new Map(
    (db.prepare("SELECT key, value FROM meta").all() as MetaRow[]).map(
      (row) => [row.key, row.value],
    ),
  );
  const initialized = meta.get("initialized") === "1";
  const noticeDismissed = meta.get("notice_dismissed") === "1";

  const channelRows = db
    .prepare("SELECT * FROM channels ORDER BY position ASC, username ASC")
    .all() as ChannelRow[];
  const titleRows = db
    .prepare("SELECT * FROM titles ORDER BY position ASC, last_seen_at DESC")
    .all() as TitleRow[];
  const editionRows = db
    .prepare("SELECT * FROM editions ORDER BY position ASC, message_id ASC")
    .all() as EditionRow[];
  const linkRows = db
    .prepare("SELECT * FROM links ORDER BY position ASC, id ASC")
    .all() as LinkRow[];

  const linksByEdition = new Map<string, SourceLink[]>();
  for (const row of linkRows) {
    const editionId = String(row.edition_id ?? "");
    const list = linksByEdition.get(editionId) ?? [];
    list.push({
      kind: asLinkKind(row.kind),
      url: String(row.url ?? ""),
      label: text(row.label),
    });
    linksByEdition.set(editionId, list);
  }

  const editionsByTitle = new Map<string, Edition[]>();
  for (const row of editionRows) {
    const titleId = String(row.title_id ?? "");
    const list = editionsByTitle.get(titleId) ?? [];
    list.push({
      id: String(row.id ?? ""),
      channel: String(row.channel ?? ""),
      channelTitle: String(row.channel_title ?? ""),
      messageId: int(row.message_id) ?? 0,
      postUrl: String(row.post_url ?? ""),
      postedAt: text(row.posted_at),
      quality: text(row.quality),
      resolution: text(row.resolution),
      sizeLabel: text(row.size_label),
      sizeBytes: int(row.size_bytes),
      episodes: text(row.episodes),
      season: text(row.season),
      links: linksByEdition.get(String(row.id ?? "")) ?? [],
      rawText: String(row.raw_text ?? ""),
      photoUrl: text(row.photo_url),
    });
    editionsByTitle.set(titleId, list);
  }

  const titles: TitleRecord[] = titleRows.map((row) => ({
    id: String(row.id ?? ""),
    title: String(row.title ?? ""),
    originalTitle: text(row.original_title),
    year: int(row.year),
    type:
      row.type === "series" ||
      row.type === "anime" ||
      row.type === "documentary" ||
      row.type === "other"
        ? row.type
        : "movie",
    genres: parseStringArray(row.genres_json),
    douban: typeof row.douban === "number" ? row.douban : undefined,
    imdb: typeof row.imdb === "number" ? row.imdb : undefined,
    overview: text(row.overview),
    director: text(row.director),
    cast: parseStringArray(row.cast_json),
    posterUrl: text(row.poster_url),
    editions: editionsByTitle.get(String(row.id ?? "")) ?? [],
    firstSeenAt: String(row.first_seen_at ?? new Date().toISOString()),
    lastSeenAt: String(row.last_seen_at ?? new Date().toISOString()),
  }));

  const channels: ChannelRecord[] = channelRows.map((row) => ({
    username: String(row.username ?? ""),
    title: String(row.title ?? ""),
    description: String(row.description ?? ""),
    avatarUrl: text(row.avatar_url),
    subscribers: text(row.subscribers),
    isDemo: Number(row.is_demo) === 1,
    source: asChannelSource(row.source),
    peerId: text(row.peer_id),
    isPrivate:
      row.is_private === null || row.is_private === undefined
        ? undefined
        : Number(row.is_private) === 1,
    addedAt: String(row.added_at ?? new Date().toISOString()),
    lastSyncedAt: text(row.last_synced_at),
    lastBefore: text(row.last_before),
    postCount: int(row.post_count) ?? 0,
    resourceCount: int(row.resource_count) ?? 0,
    status: asChannelStatus(row.status),
    lastError: text(row.last_error),
  }));

  return {
    version: 1,
    initialized,
    noticeDismissed,
    channels,
    titles,
  };
}

export function replaceCatalogState(state: CatalogState, filePath?: string) {
  const compact = compactCatalog(state);
  const db = getCatalogDb(filePath);

  db.exec("BEGIN IMMEDIATE");
  try {
    db.exec("DELETE FROM links");
    db.exec("DELETE FROM editions");
    db.exec("DELETE FROM titles");
    db.exec("DELETE FROM channels");
    db.exec("DELETE FROM meta");

    const putMeta = db.prepare(
      "INSERT INTO meta (key, value) VALUES (?, ?)",
    );
    putMeta.run("schema_version", "1");
    putMeta.run("initialized", compact.initialized ? "1" : "0");
    putMeta.run("notice_dismissed", compact.noticeDismissed ? "1" : "0");

    const putChannel = db.prepare(`
      INSERT INTO channels (
        username, title, description, avatar_url, subscribers, is_demo, source,
        peer_id, is_private, added_at, last_synced_at, last_before, post_count,
        resource_count, status, last_error, position
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    compact.channels.forEach((channel, position) => {
      putChannel.run(
        channel.username,
        channel.title,
        channel.description ?? "",
        channel.avatarUrl ?? null,
        channel.subscribers ?? null,
        channel.isDemo ? 1 : 0,
        channel.source ?? null,
        channel.peerId ?? null,
        channel.isPrivate === undefined ? null : channel.isPrivate ? 1 : 0,
        channel.addedAt,
        channel.lastSyncedAt ?? null,
        channel.lastBefore ?? null,
        channel.postCount,
        channel.resourceCount,
        channel.status === "syncing" ? "idle" : channel.status,
        channel.lastError ?? null,
        position,
      );
    });

    const putTitle = db.prepare(`
      INSERT INTO titles (
        id, title, original_title, year, type, genres_json, douban, imdb,
        overview, director, cast_json, poster_url, first_seen_at, last_seen_at,
        position
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const putEdition = db.prepare(`
      INSERT INTO editions (
        id, title_id, channel, channel_title, message_id, post_url, posted_at,
        quality, resolution, size_label, size_bytes, episodes, season, raw_text,
        photo_url, position
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const putLink = db.prepare(`
      INSERT INTO links (edition_id, kind, url, label, position)
      VALUES (?, ?, ?, ?, ?)
    `);

    compact.titles.forEach((title, titlePosition) => {
      putTitle.run(
        title.id,
        title.title,
        title.originalTitle ?? null,
        title.year ?? null,
        title.type,
        JSON.stringify(title.genres),
        title.douban ?? null,
        title.imdb ?? null,
        title.overview ?? null,
        title.director ?? null,
        JSON.stringify(title.cast),
        title.posterUrl ?? null,
        title.firstSeenAt,
        title.lastSeenAt,
        titlePosition,
      );
      title.editions.forEach((edition, editionPosition) => {
        putEdition.run(
          edition.id,
          title.id,
          edition.channel,
          edition.channelTitle,
          edition.messageId,
          edition.postUrl,
          edition.postedAt ?? null,
          edition.quality ?? null,
          edition.resolution ?? null,
          edition.sizeLabel ?? null,
          edition.sizeBytes ?? null,
          edition.episodes ?? null,
          edition.season ?? null,
          edition.rawText ?? "",
          edition.photoUrl ?? null,
          editionPosition,
        );
        edition.links.forEach((link, linkPosition) => {
          putLink.run(
            edition.id,
            link.kind,
            link.url,
            link.label ?? null,
            linkPosition,
          );
        });
      });
    });

    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

export function catalogTableCounts(filePath?: string) {
  const db = getCatalogDb(filePath);
  const count = (table: string) => {
    const row = db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as {
      n: number;
    };
    return Number(row.n);
  };
  return {
    channels: count("channels"),
    titles: count("titles"),
    editions: count("editions"),
    links: count("links"),
  };
}
