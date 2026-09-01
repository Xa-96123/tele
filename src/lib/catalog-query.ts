import { CLOUD_LINK_KINDS } from "@/lib/labels";
import { getCatalogDb, readTitlesByIds } from "@/lib/catalog-db";
import {
  clampTitleLimit,
  clampTitleOffset,
  TITLE_EXPORT_MAX,
  TITLE_PAGE_SIZE,
} from "@/lib/catalog-list-params";
import type {
  LinkKind,
  TitleListQuery,
  TitleListResult,
  TitleSortKey,
} from "@/lib/types";

export {
  parseTitleListQuery,
  TITLE_EXPORT_MAX,
  TITLE_PAGE_MAX,
  TITLE_PAGE_SIZE,
} from "@/lib/catalog-list-params";

const SHAREABLE_KINDS: LinkKind[] = ["magnet", ...CLOUD_LINK_KINDS];

function escapeLike(value: string) {
  return value.replaceAll("\\", "\\\\").replaceAll("%", "\\%").replaceAll("_", "\\_");
}

function isAll(value?: string) {
  return !value || value === "all";
}

function titleListWhere(query: TitleListQuery) {
  const parts: string[] = [
    `t.id IN (
      SELECT e.title_id FROM editions e
      INNER JOIN links l ON l.edition_id = e.id
      WHERE l.kind IN (${SHAREABLE_KINDS.map(() => "?").join(", ")})
    )`,
  ];
  const params: unknown[] = [...SHAREABLE_KINDS];

  if (!isAll(query.type)) {
    parts.push("t.type = ?");
    params.push(query.type);
  }
  if (!isAll(query.year)) {
    parts.push("t.year = ?");
    params.push(Number(query.year));
  }
  if (!isAll(query.quality)) {
    parts.push(
      `EXISTS (
        SELECT 1 FROM editions eq
        WHERE eq.title_id = t.id AND eq.resolution = ?
      )`,
    );
    params.push(query.quality);
  }
  if (!isAll(query.source)) {
    parts.push(
      `EXISTS (
        SELECT 1 FROM editions es
        INNER JOIN links ls ON ls.edition_id = es.id
        WHERE es.title_id = t.id AND ls.kind = ?
      )`,
    );
    params.push(query.source);
  }
  if (!isAll(query.channel)) {
    parts.push(
      `EXISTS (
        SELECT 1 FROM editions ec
        WHERE ec.title_id = t.id AND lower(ec.channel) = lower(?)
      )`,
    );
    params.push(query.channel);
  }

  const needle = query.q?.trim();
  if (needle) {
    const like = `%${escapeLike(needle)}%`;
    parts.push(`(
      t.title LIKE ? ESCAPE '\\'
      OR IFNULL(t.original_title, '') LIKE ? ESCAPE '\\'
      OR IFNULL(t.overview, '') LIKE ? ESCAPE '\\'
      OR IFNULL(t.director, '') LIKE ? ESCAPE '\\'
      OR t.cast_json LIKE ? ESCAPE '\\'
      OR t.genres_json LIKE ? ESCAPE '\\'
      OR EXISTS (
        SELECT 1 FROM editions esh
        WHERE esh.title_id = t.id AND (
          esh.channel_title LIKE ? ESCAPE '\\'
          OR esh.channel LIKE ? ESCAPE '\\'
        )
      )
      OR EXISTS (
        SELECT 1 FROM editions el
        INNER JOIN links ll ON ll.edition_id = el.id
        WHERE el.title_id = t.id AND (
          ll.url LIKE ? ESCAPE '\\'
          OR IFNULL(ll.label, '') LIKE ? ESCAPE '\\'
        )
      )
    )`);
    params.push(like, like, like, like, like, like, like, like, like, like);
  }

  return { sql: parts.join(" AND "), params };
}

function orderSql(sort: TitleSortKey | undefined) {
  if (sort === "year") return "t.year DESC, t.last_seen_at DESC, t.id DESC";
  if (sort === "title") return "t.title COLLATE NOCASE ASC, t.id ASC";
  if (sort === "douban") return "t.douban DESC, t.last_seen_at DESC, t.id DESC";
  return "t.last_seen_at DESC, t.id DESC";
}

export function queryTitleList(
  query: TitleListQuery = {},
  filePath?: string,
): TitleListResult {
  const db = getCatalogDb(filePath);
  const offset = clampTitleOffset(query.offset);
  const limit = clampTitleLimit(query.limit, TITLE_EXPORT_MAX, TITLE_PAGE_SIZE);
  const where = titleListWhere(query);
  const shareableWhere = titleListWhere({});

  const totalRow = db
    .prepare(`SELECT COUNT(*) AS n FROM titles t WHERE ${where.sql}`)
    .get(...where.params) as { n: number };
  const shareableRow = db
    .prepare(`SELECT COUNT(*) AS n FROM titles t WHERE ${shareableWhere.sql}`)
    .get(...shareableWhere.params) as { n: number };
  const yearRows = db
    .prepare(
      `
      SELECT DISTINCT t.year AS year FROM titles t
      WHERE ${shareableWhere.sql} AND t.year IS NOT NULL
      ORDER BY t.year DESC
    `,
    )
    .all(...shareableWhere.params) as Array<{ year: number }>;
  const kindRows = db
    .prepare(
      `
      SELECT DISTINCT l.kind AS kind FROM links l
      INNER JOIN editions e ON e.id = l.edition_id
      INNER JOIN titles t ON t.id = e.title_id
      WHERE ${where.sql}
        AND l.kind IN (${SHAREABLE_KINDS.map(() => "?").join(", ")})
    `,
    )
    .all(...where.params, ...SHAREABLE_KINDS) as Array<{ kind: string }>;
  const idRows = db
    .prepare(
      `
      SELECT t.id AS id FROM titles t
      WHERE ${where.sql}
      ORDER BY ${orderSql(query.sort)}
      LIMIT ? OFFSET ?
    `,
    )
    .all(...where.params, limit, offset) as Array<{ id: string }>;

  const ids = idRows.map((row) => String(row.id ?? "")).filter(Boolean);
  const kinds = SHAREABLE_KINDS.filter((kind) =>
    kindRows.some((row) => row.kind === kind),
  );

  return {
    titles: readTitlesByIds(ids, filePath),
    total: Number(totalRow.n) || 0,
    shareableTotal: Number(shareableRow.n) || 0,
    offset,
    limit,
    years: yearRows
      .map((row) => Number(row.year))
      .filter((year) => Number.isFinite(year)),
    kinds,
  };
}
