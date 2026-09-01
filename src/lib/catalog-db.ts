import { mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { compactCatalog, compactTitle } from "@/lib/catalog-storage";
import {
  combineTitles,
  mergeCatalog,
  mergeTitles,
  nextHistoryCursor,
  nextPostCount,
  titleResourceKey,
} from "@/lib/catalog";
import { resourceKey } from "@/lib/parser";
import { hasCloudOrMagnetLink, titlePosterUrl } from "@/lib/labels";
import type {
  CatalogPatch,
  CatalogState,
  ChannelRecord,
  ChannelSource,
  Edition,
  LinkKind,
  SourceLink,
  SyncResult,
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
  resource_key TEXT,
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
CREATE INDEX IF NOT EXISTS idx_titles_last_seen ON titles(last_seen_at);
CREATE INDEX IF NOT EXISTS idx_editions_title ON editions(title_id);
CREATE INDEX IF NOT EXISTS idx_editions_channel ON editions(channel);
CREATE INDEX IF NOT EXISTS idx_links_edition ON links(edition_id);
CREATE INDEX IF NOT EXISTS idx_links_kind ON links(kind);
`;

const dbs = new Map<string, SqliteDb>();

function tableColumns(db: SqliteDb, table: string): Set<string> {
  const rows = db.prepare(`PRAGMA table_info(${table})`).all() as {
    name: string;
  }[];
  return new Set(rows.map((row) => row.name));
}

function migrateCatalogSchema(db: SqliteDb) {
  const titleCols = tableColumns(db, "titles");
  if (!titleCols.has("resource_key")) {
    db.exec("ALTER TABLE titles ADD COLUMN resource_key TEXT");
  }
  backfillResourceKeys(db);
  db.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_titles_resource_key
      ON titles(resource_key) WHERE resource_key IS NOT NULL AND resource_key != ''
  `);
  db.exec(
    "CREATE INDEX IF NOT EXISTS idx_titles_last_seen ON titles(last_seen_at)",
  );
}

function asResourceType(value: unknown): TitleRecord["type"] {
  return value === "series" ||
    value === "anime" ||
    value === "documentary" ||
    value === "other"
    ? value
    : "movie";
}

function backfillResourceKeys(db: SqliteDb) {
  const rows = db
    .prepare(
      `
      SELECT t.id, t.title, t.year, t.type, t.resource_key,
        (
          SELECT e.season FROM editions e
          WHERE e.title_id = t.id
          ORDER BY e.position ASC, e.message_id ASC
          LIMIT 1
        ) AS season
      FROM titles t
    `,
    )
    .all() as Array<{
    id: unknown;
    title: unknown;
    year: unknown;
    type: unknown;
    resource_key: unknown;
    season: unknown;
  }>;
  const keptByKey = new Map<string, string>();
  const updateKey = db.prepare("UPDATE titles SET resource_key = ? WHERE id = ?");
  const moveEdition = db.prepare(
    "UPDATE editions SET title_id = ? WHERE title_id = ? AND id NOT IN (SELECT id FROM editions WHERE title_id = ?)",
  );
  const deleteTitle = db.prepare("DELETE FROM titles WHERE id = ?");

  for (const row of rows) {
    const id = String(row.id ?? "");
    if (!id) continue;
    const key = resourceKey({
      title: String(row.title ?? ""),
      year: int(row.year),
      type: asResourceType(row.type),
      season: text(row.season),
    });
    const kept = keptByKey.get(key);
    if (!kept) {
      keptByKey.set(key, id);
      if (String(row.resource_key ?? "") !== key) {
        updateKey.run(key, id);
      }
      continue;
    }
    moveEdition.run(kept, id, kept);
    db.prepare("DELETE FROM editions WHERE title_id = ?").run(id);
    deleteTitle.run(id);
  }
}

export function defaultCatalogDbPath() {
  return process.env.YINGQU_DB_PATH?.trim()
    ? path.resolve(process.env.YINGQU_DB_PATH)
    : path.join(process.cwd(), "data", "yingqu.sqlite");
}

export function getCatalogDb(filePath = defaultCatalogDbPath()): SqliteDb {
  const existing = dbs.get(filePath);
  if (existing) {
    migrateCatalogSchema(existing);
    return existing;
  }
  mkdirSync(path.dirname(filePath), { recursive: true });
  const db = new DatabaseSync(filePath, { enableForeignKeyConstraints: true });
  db.exec(SCHEMA_SQL);
  migrateCatalogSchema(db);
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

function mapChannelRow(row: ChannelRow): ChannelRecord {
  return {
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
  };
}

function assembleTitles(
  titleRows: TitleRow[],
  editionRows: EditionRow[],
  linkRows: LinkRow[],
): TitleRecord[] {
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

  return titleRows.map((row) => {
    const editions = editionsByTitle.get(String(row.id ?? "")) ?? [];
    const record: TitleRecord = {
      id: String(row.id ?? ""),
      title: String(row.title ?? ""),
      originalTitle: text(row.original_title),
      year: int(row.year),
      type: asResourceType(row.type),
      genres: parseStringArray(row.genres_json),
      douban: typeof row.douban === "number" ? row.douban : undefined,
      imdb: typeof row.imdb === "number" ? row.imdb : undefined,
      overview: text(row.overview),
      director: text(row.director),
      cast: parseStringArray(row.cast_json),
      posterUrl: text(row.poster_url),
      editions,
      firstSeenAt: String(row.first_seen_at ?? new Date().toISOString()),
      lastSeenAt: String(row.last_seen_at ?? new Date().toISOString()),
    };
    return { ...record, posterUrl: titlePosterUrl(record) };
  });
}

function inPlaceholders(count: number) {
  return Array.from({ length: count }, () => "?").join(", ");
}

function hydrateTitlesFromRows(
  db: SqliteDb,
  titleRows: TitleRow[],
): TitleRecord[] {
  if (!titleRows.length) return [];
  const ids = titleRows.map((row) => String(row.id ?? "")).filter(Boolean);
  if (!ids.length) return [];
  const editionRows = db
    .prepare(
      `SELECT * FROM editions WHERE title_id IN (${inPlaceholders(ids.length)})
       ORDER BY position ASC, message_id ASC`,
    )
    .all(...ids) as EditionRow[];
  const editionIds = editionRows.map((row) => String(row.id ?? "")).filter(Boolean);
  const linkRows = editionIds.length
    ? (db
        .prepare(
          `SELECT * FROM links WHERE edition_id IN (${inPlaceholders(editionIds.length)})
           ORDER BY position ASC, id ASC`,
        )
        .all(...editionIds) as LinkRow[])
    : [];
  return assembleTitles(titleRows, editionRows, linkRows);
}

function upsertMeta(db: SqliteDb, key: string, value: string) {
  db.prepare(
    `
    INSERT INTO meta (key, value) VALUES (?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value
  `,
  ).run(key, value);
}

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

  return {
    version: 1,
    initialized: meta.get("initialized") === "1",
    noticeDismissed: meta.get("notice_dismissed") === "1",
    channels: channelRows.map(mapChannelRow),
    titles: assembleTitles(titleRows, editionRows, linkRows),
  };
}

export function readChannelRecord(
  username: string,
  filePath?: string,
): ChannelRecord | undefined {
  const db = getCatalogDb(filePath);
  const row = db
    .prepare("SELECT * FROM channels WHERE lower(username) = lower(?)")
    .get(username) as ChannelRow | undefined;
  return row ? mapChannelRow(row) : undefined;
}

function readTitlesByResourceKeys(
  db: SqliteDb,
  keys: string[],
): TitleRecord[] {
  const unique = [...new Set(keys.filter(Boolean))];
  if (!unique.length) return [];
  const titleRows = db
    .prepare(
      `SELECT * FROM titles WHERE resource_key IN (${inPlaceholders(unique.length)})`,
    )
    .all(...unique) as TitleRow[];
  return hydrateTitlesFromRows(db, titleRows);
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
        id, title, original_title, year, type, resource_key, genres_json, douban, imdb,
        overview, director, cast_json, poster_url, first_seen_at, last_seen_at,
        position
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
        titleResourceKey(title),
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

function countChannelResources(db: SqliteDb, username: string) {
  const row = db
    .prepare(
      "SELECT COUNT(DISTINCT title_id) AS n FROM editions WHERE lower(channel) = lower(?)",
    )
    .get(username) as { n: number };
  return Number(row.n);
}

function nextChannelPosition(db: SqliteDb) {
  const row = db
    .prepare("SELECT COALESCE(MAX(position), -1) AS n FROM channels")
    .get() as { n: number };
  return Number(row.n) + 1;
}

function upsertChannelRow(db: SqliteDb, channel: ChannelRecord) {
  const stored =
    (
      db
        .prepare("SELECT username, position FROM channels WHERE lower(username) = lower(?)")
        .get(channel.username) as { username: string; position: number } | undefined
    ) ?? null;
  const username = stored?.username ?? channel.username;
  const position = stored?.position ?? nextChannelPosition(db);
  db.prepare(
    `
    INSERT INTO channels (
      username, title, description, avatar_url, subscribers, is_demo, source,
      peer_id, is_private, added_at, last_synced_at, last_before, post_count,
      resource_count, status, last_error, position
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(username) DO UPDATE SET
      title = excluded.title,
      description = excluded.description,
      avatar_url = excluded.avatar_url,
      subscribers = excluded.subscribers,
      is_demo = excluded.is_demo,
      source = COALESCE(excluded.source, channels.source),
      peer_id = COALESCE(excluded.peer_id, channels.peer_id),
      is_private = excluded.is_private,
      last_synced_at = excluded.last_synced_at,
      last_before = excluded.last_before,
      post_count = excluded.post_count,
      resource_count = excluded.resource_count,
      status = excluded.status,
      last_error = excluded.last_error
  `,
  ).run(
    username,
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
  return username;
}

function resolveStoredTitleId(db: SqliteDb, title: TitleRecord) {
  const key = titleResourceKey(title);
  const byKey = db
    .prepare("SELECT id FROM titles WHERE resource_key = ?")
    .get(key) as { id: string } | undefined;
  if (byKey?.id) return byKey.id;
  return title.id;
}

function upsertTitleRow(db: SqliteDb, incoming: TitleRecord) {
  const compact = compactTitle(incoming);
  const id = resolveStoredTitleId(db, compact);
  const title = { ...compact, id };
  const key = titleResourceKey(title);
  db.prepare(
    `
    INSERT INTO titles (
      id, title, original_title, year, type, resource_key, genres_json, douban, imdb,
      overview, director, cast_json, poster_url, first_seen_at, last_seen_at, position
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
    ON CONFLICT(id) DO UPDATE SET
      title = excluded.title,
      original_title = excluded.original_title,
      year = excluded.year,
      type = excluded.type,
      resource_key = excluded.resource_key,
      genres_json = excluded.genres_json,
      douban = excluded.douban,
      imdb = excluded.imdb,
      overview = excluded.overview,
      director = excluded.director,
      cast_json = excluded.cast_json,
      poster_url = excluded.poster_url,
      last_seen_at = excluded.last_seen_at
  `,
  ).run(
    title.id,
    title.title,
    title.originalTitle ?? null,
    title.year ?? null,
    title.type,
    key,
    JSON.stringify(title.genres),
    title.douban ?? null,
    title.imdb ?? null,
    title.overview ?? null,
    title.director ?? null,
    JSON.stringify(title.cast),
    title.posterUrl ?? null,
    title.firstSeenAt,
    title.lastSeenAt,
  );

  const existingEditionIds = new Set(
    (
      db.prepare("SELECT id FROM editions WHERE title_id = ?").all(title.id) as {
        id: string;
      }[]
    ).map((row) => row.id),
  );
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

  title.editions.forEach((edition, editionPosition) => {
    let editionId = edition.id;
    if (existingEditionIds.has(editionId)) return;
    const occupied = db
      .prepare("SELECT title_id FROM editions WHERE id = ?")
      .get(editionId) as { title_id: string } | undefined;
    if (occupied?.title_id === title.id) return;
    if (occupied) {
      editionId = `${edition.id}~${title.id}`;
      if (existingEditionIds.has(editionId)) return;
    }
    putEdition.run(
      editionId,
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
        editionId,
        link.kind,
        link.url,
        link.label ?? null,
        linkPosition,
      );
    });
    existingEditionIds.add(editionId);
  });
  return title;
}

function buildSyncedChannel(
  username: string,
  result: SyncResult,
  more: boolean,
  existing: ChannelRecord | undefined,
  resourceCount: number,
): ChannelRecord {
  const base: ChannelRecord = existing ?? {
    ...result.channel,
    username: result.channel.username || username,
    addedAt: new Date().toISOString(),
    postCount: 0,
    resourceCount: 0,
    status: "idle",
  };
  const fromResult = result.channel.username || username;
  const storedUsername = existing?.username ?? fromResult;
  return {
    ...base,
    ...result.channel,
    username: storedUsername,
    addedAt: base.addedAt,
    lastSyncedAt: new Date().toISOString(),
    lastBefore: nextHistoryCursor({
      more,
      previous: existing?.lastBefore ?? base.lastBefore,
      incoming: result.nextBefore,
    }),
    lastError: undefined,
    status: "idle",
    source: result.channel.source ?? existing?.source ?? base.source,
    peerId: result.channel.peerId ?? existing?.peerId ?? base.peerId,
    isPrivate: result.channel.isPrivate ?? existing?.isPrivate,
    postCount: nextPostCount({
      more,
      previous: base.postCount,
      incoming: result.posts.length,
    }),
    resourceCount,
  };
}

function writeMergedTitles(
  db: SqliteDb,
  incoming: TitleRecord[],
): TitleRecord[] {
  const usable = mergeTitles(incoming.filter(hasCloudOrMagnetLink));
  const existing = readTitlesByResourceKeys(
    db,
    usable.map((title) => titleResourceKey(title)),
  );
  const merged = mergeCatalog(existing, usable);
  return merged.map((title) => upsertTitleRow(db, title));
}

export function applySyncToSqlite(
  username: string,
  result: SyncResult,
  more = false,
  filePath?: string,
): CatalogPatch {
  const db = getCatalogDb(filePath);
  const existingChannel = readChannelRecord(username, filePath);
  db.exec("BEGIN IMMEDIATE");
  try {
    upsertMeta(db, "schema_version", "1");
    upsertMeta(db, "initialized", "1");
    const titles = writeMergedTitles(db, result.titles);
    const fromResult = result.channel.username || username;
    const storedUsername = existingChannel?.username ?? fromResult;
    const channel = buildSyncedChannel(
      username,
      result,
      more,
      existingChannel,
      countChannelResources(db, storedUsername),
    );
    upsertChannelRow(db, channel);
    db.exec("COMMIT");
    return {
      initialized: true,
      channels: [channel],
      titles,
    };
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

export function applyImportToSqlite(
  incoming: TitleRecord[],
  postCount = 0,
  filePath?: string,
): CatalogPatch {
  const db = getCatalogDb(filePath);
  const existing = readChannelRecord("imported", filePath);
  db.exec("BEGIN IMMEDIATE");
  try {
    upsertMeta(db, "schema_version", "1");
    upsertMeta(db, "initialized", "1");
    const titles = writeMergedTitles(db, incoming);
    const channel: ChannelRecord = {
      username: "imported",
      title: existing?.title ?? "手动导入",
      description:
        existing?.description ?? "从粘贴的频道帖子解析而来。",
      addedAt: existing?.addedAt ?? new Date().toISOString(),
      lastSyncedAt: new Date().toISOString(),
      postCount: (existing?.postCount ?? 0) + postCount,
      resourceCount: countChannelResources(db, "imported"),
      status: "idle",
    };
    upsertChannelRow(db, channel);
    db.exec("COMMIT");
    return { initialized: true, channels: [channel], titles };
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

export function removeChannelFromSqlite(
  username: string,
  filePath?: string,
): CatalogPatch {
  const db = getCatalogDb(filePath);
  db.exec("BEGIN IMMEDIATE");
  try {
    const affected = db
      .prepare(
        "SELECT DISTINCT title_id FROM editions WHERE lower(channel) = lower(?)",
      )
      .all(username) as { title_id: string }[];
    db.prepare("DELETE FROM editions WHERE lower(channel) = lower(?)").run(
      username,
    );
    const removedTitleIds: string[] = [];
    const remainingTitles: TitleRecord[] = [];
    for (const row of affected) {
      const left = db
        .prepare("SELECT COUNT(*) AS n FROM editions WHERE title_id = ?")
        .get(row.title_id) as { n: number };
      if (Number(left.n) === 0) {
        db.prepare("DELETE FROM titles WHERE id = ?").run(row.title_id);
        removedTitleIds.push(row.title_id);
      }
    }
    if (affected.length) {
      const keptIds = affected
        .map((row) => row.title_id)
        .filter((id) => !removedTitleIds.includes(id));
      if (keptIds.length) {
        remainingTitles.push(...hydrateTitlesFromRows(
          db,
          db
            .prepare(
              `SELECT * FROM titles WHERE id IN (${inPlaceholders(keptIds.length)})`,
            )
            .all(...keptIds) as TitleRow[],
        ));
      }
    }
    db.prepare("DELETE FROM channels WHERE lower(username) = lower(?)").run(
      username,
    );
    db.exec("COMMIT");
    return {
      initialized: true,
      removedChannel: username,
      removedTitleIds,
      titles: remainingTitles,
    };
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

export function markChannelErrorInSqlite(
  username: string,
  message: string,
  filePath?: string,
): CatalogPatch {
  const db = getCatalogDb(filePath);
  const existing = readChannelRecord(username, filePath);
  if (!existing) return { channels: [] };
  db.prepare(
    `
    UPDATE channels
    SET status = 'error', last_error = ?
    WHERE lower(username) = lower(?)
  `,
  ).run(message, username);
  return {
    channels: [{ ...existing, status: "error", lastError: message }],
  };
}

function channelNamesFromTitle(title: TitleRecord) {
  return title.editions.map((edition) => edition.channel);
}

function refreshChannelCounts(
  db: SqliteDb,
  usernames: string[],
  filePath?: string,
): ChannelRecord[] {
  const seen = new Set<string>();
  const channels: ChannelRecord[] = [];
  for (const username of usernames) {
    const key = username.trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    const existing = readChannelRecord(username, filePath);
    if (!existing) continue;
    const resourceCount = countChannelResources(db, existing.username);
    db.prepare(
      "UPDATE channels SET resource_count = ? WHERE lower(username) = lower(?)",
    ).run(resourceCount, existing.username);
    channels.push({ ...existing, resourceCount });
  }
  return channels;
}

function absorbTitleInto(
  db: SqliteDb,
  fromId: string,
  into: TitleRecord,
) {
  db.prepare("UPDATE editions SET title_id = ? WHERE title_id = ?").run(
    into.id,
    fromId,
  );
  db.prepare("DELETE FROM titles WHERE id = ?").run(fromId);
  upsertTitleRow(db, into);
}

export type TitleEdits = {
  title?: string;
  originalTitle?: string | null;
  year?: number | null;
  type?: TitleRecord["type"];
};

export function editTitleInSqlite(
  id: string,
  edits: TitleEdits,
  filePath?: string,
): CatalogPatch {
  const current = readTitleById(id, filePath);
  if (!current) {
    throw new Error("找不到这部影片。");
  }
  const nextTitle = edits.title?.trim() ?? current.title;
  if (!nextTitle) {
    throw new Error("片名不能为空。");
  }
  const nextType =
    edits.type !== undefined ? asResourceType(edits.type) : current.type;
  const nextYear =
    edits.year === undefined
      ? current.year
      : edits.year === null || !Number.isFinite(edits.year) || edits.year <= 0
        ? undefined
        : Math.trunc(edits.year);
  const nextOriginal =
    edits.originalTitle === undefined
      ? current.originalTitle
      : edits.originalTitle?.trim() || undefined;
  const edited: TitleRecord = {
    ...current,
    title: nextTitle,
    originalTitle: nextOriginal,
    year: nextYear,
    type: nextType,
    lastSeenAt: new Date().toISOString(),
  };
  const db = getCatalogDb(filePath);
  db.exec("BEGIN IMMEDIATE");
  try {
    upsertMeta(db, "initialized", "1");
    const key = titleResourceKey(edited);
    const collision = db
      .prepare(
        "SELECT id FROM titles WHERE resource_key = ? AND id != ?",
      )
      .get(key, id) as { id: string } | undefined;
    const removedTitleIds: string[] = [];
    let stored = edited;
    if (collision?.id) {
      const extra = readTitleById(collision.id, filePath);
      if (extra) {
        stored = combineTitles(edited, extra);
        absorbTitleInto(db, extra.id, stored);
        removedTitleIds.push(extra.id);
      } else {
        upsertTitleRow(db, stored);
      }
    } else {
      upsertTitleRow(db, stored);
    }
    const channels = refreshChannelCounts(
      db,
      [
        ...channelNamesFromTitle(current),
        ...channelNamesFromTitle(stored),
      ],
      filePath,
    );
    const titles = readTitlesByIds([stored.id], filePath);
    db.exec("COMMIT");
    return {
      initialized: true,
      titles,
      channels,
      removedTitleIds,
    };
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

export function mergeTitlesInSqlite(
  fromId: string,
  intoId: string,
  filePath?: string,
): CatalogPatch {
  if (fromId.trim() === intoId.trim()) {
    throw new Error("不能与自己合并。");
  }
  const into = readTitleById(intoId, filePath);
  const from = readTitleById(fromId, filePath);
  if (!into || !from) {
    throw new Error("找不到要合并的影片。");
  }
  const combined = combineTitles(into, from);
  const db = getCatalogDb(filePath);
  db.exec("BEGIN IMMEDIATE");
  try {
    upsertMeta(db, "initialized", "1");
    absorbTitleInto(db, from.id, combined);
    const channels = refreshChannelCounts(
      db,
      [...channelNamesFromTitle(into), ...channelNamesFromTitle(from)],
      filePath,
    );
    const titles = readTitlesByIds([combined.id], filePath);
    db.exec("COMMIT");
    return {
      initialized: true,
      titles,
      channels,
      removedTitleIds: [from.id],
    };
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

export function removeTitleFromSqlite(
  id: string,
  filePath?: string,
): CatalogPatch {
  const current = readTitleById(id, filePath);
  if (!current) {
    return { removedTitleIds: [id] };
  }
  const db = getCatalogDb(filePath);
  db.exec("BEGIN IMMEDIATE");
  try {
    upsertMeta(db, "initialized", "1");
    db.prepare("DELETE FROM titles WHERE id = ?").run(id);
    const channels = refreshChannelCounts(
      db,
      channelNamesFromTitle(current),
      filePath,
    );
    db.exec("COMMIT");
    return {
      initialized: true,
      removedTitleIds: [id],
      channels,
    };
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

export function applyAndSave(
  mutator: (state: CatalogState) => CatalogState,
  filePath?: string,
): CatalogState {
  const current = readCatalogState(filePath);
  const next = mutator(current);
  replaceCatalogState({ ...next, initialized: true }, filePath);
  return readCatalogState(filePath);
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

export function readTitlesByIds(ids: string[], filePath?: string): TitleRecord[] {
  const unique = [...new Set(ids.map((id) => id.trim()).filter(Boolean))];
  if (!unique.length) return [];
  const db = getCatalogDb(filePath);
  const titleRows = db
    .prepare(
      `SELECT * FROM titles WHERE id IN (${inPlaceholders(unique.length)})`,
    )
    .all(...unique) as TitleRow[];
  const assembled = hydrateTitlesFromRows(db, titleRows);
  const byId = new Map(assembled.map((title) => [title.id, title]));
  return ids
    .map((id) => byId.get(id))
    .filter((title): title is TitleRecord => Boolean(title));
}

export function readTitleById(
  id: string,
  filePath?: string,
): TitleRecord | undefined {
  return readTitlesByIds([id], filePath)[0];
}

export function readCatalogShell(filePath?: string): CatalogState & {
  titleCount: number;
} {
  const db = getCatalogDb(filePath);
  const meta = new Map(
    (db.prepare("SELECT key, value FROM meta").all() as MetaRow[]).map(
      (row) => [row.key, row.value],
    ),
  );
  const channelRows = db
    .prepare("SELECT * FROM channels ORDER BY position ASC, username ASC")
    .all() as ChannelRow[];
  const shareable = db
    .prepare(
      `
      SELECT COUNT(*) AS n FROM titles t
      WHERE t.id IN (
        SELECT e.title_id FROM editions e
        INNER JOIN links l ON l.edition_id = e.id
        WHERE l.kind IN ('magnet','quark','aliyun','baidu','115','123pan','pikpak','mega','google')
      )
    `,
    )
    .get() as { n: number };
  return {
    version: 1,
    initialized: meta.get("initialized") === "1",
    noticeDismissed: meta.get("notice_dismissed") === "1",
    channels: channelRows.map(mapChannelRow),
    titles: [],
    titleCount: Number(shareable.n) || 0,
  };
}

export function setNoticeDismissedInSqlite(
  dismissed: boolean,
  filePath?: string,
): CatalogPatch {
  const db = getCatalogDb(filePath);
  upsertMeta(db, "initialized", "1");
  upsertMeta(db, "notice_dismissed", dismissed ? "1" : "0");
  return {
    initialized: true,
    noticeDismissed: dismissed,
  };
}
