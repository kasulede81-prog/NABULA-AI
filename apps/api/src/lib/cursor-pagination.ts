export interface DecodedCursor {
  createdAt: Date;
  id: string;
}

export interface ParsedCursorQuery {
  limit: number;
  cursor?: DecodedCursor;
}

export interface CursorPageResult<T> {
  items: T[];
  nextCursor: string | null;
}

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;

export function parseCursorQuery(query: {
  cursor?: string;
  limit?: string;
}): ParsedCursorQuery {
  const parsed = Number.parseInt(query.limit ?? "", 10);
  const limit = Math.min(
    Math.max(Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_LIMIT, 1),
    MAX_LIMIT
  );

  if (!query.cursor) {
    return { limit };
  }

  try {
    const raw = JSON.parse(
      Buffer.from(query.cursor, "base64url").toString("utf8")
    ) as { createdAt?: string; id?: string };
    if (!raw.createdAt || !raw.id) {
      return { limit };
    }
    const createdAt = new Date(raw.createdAt);
    if (Number.isNaN(createdAt.getTime())) {
      return { limit };
    }
    return { limit, cursor: { createdAt, id: raw.id } };
  } catch {
    return { limit };
  }
}

export function encodeCursor(createdAt: Date, id: string): string {
  return Buffer.from(
    JSON.stringify({ createdAt: createdAt.toISOString(), id })
  ).toString("base64url");
}

/** Descending createdAt pagination (projects). */
export function cursorWhereDesc(cursor: DecodedCursor) {
  return {
    OR: [
      { createdAt: { lt: cursor.createdAt } },
      { createdAt: cursor.createdAt, id: { lt: cursor.id } },
    ],
  };
}

/** Ascending createdAt pagination (messages). */
export function cursorWhereAsc(cursor: DecodedCursor) {
  return {
    OR: [
      { createdAt: { gt: cursor.createdAt } },
      { createdAt: cursor.createdAt, id: { gt: cursor.id } },
    ],
  };
}

export function buildCursorPage<T extends { createdAt: Date; id: string }>(
  rows: T[],
  limit: number
): CursorPageResult<T> {
  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  const last = items[items.length - 1];
  return {
    items,
    nextCursor:
      hasMore && last ? encodeCursor(last.createdAt, last.id) : null,
  };
}

export function encodePathCursor(path: string): string {
  return Buffer.from(JSON.stringify({ path })).toString("base64url");
}

export function decodePathCursor(cursor?: string): string | undefined {
  if (!cursor) return undefined;
  try {
    const raw = JSON.parse(
      Buffer.from(cursor, "base64url").toString("utf8")
    ) as { path?: string };
    return typeof raw.path === "string" ? raw.path : undefined;
  } catch {
    return undefined;
  }
}

export function buildPathCursorPage<T extends { path: string }>(
  rows: T[],
  limit: number
): CursorPageResult<T> {
  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  const last = items[items.length - 1];
  return {
    items,
    nextCursor: hasMore && last ? encodePathCursor(last.path) : null,
  };
}
