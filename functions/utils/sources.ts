interface SourceEnv {
  USERS_DB?: D1Database;
}

export interface PrimarySourceRecord {
  id: string;
  user_id: number;
  title: string;
  original_name: string;
  summary: string | null;
  page_count: number;
  chunk_count: number;
  pdf_object_key: string;
  manifest_object_key: string;
  digest: string | null;
  created_at: string;
}

interface CreatePrimarySourceInput {
  id: string;
  userId: number;
  title: string;
  originalName: string;
  summary?: string | null;
  pageCount: number;
  chunkCount: number;
  pdfKey: string;
  manifestKey: string;
  digest?: string | null;
  createdAt: string;
}

const mapRow = (row?: any): PrimarySourceRecord | null => {
  if (!row) return null;
  return {
    id: String(row.id),
    user_id: Number(row.user_id),
    title: String(row.title),
    original_name: String(row.original_name),
    summary: row.summary ?? null,
    page_count: Number(row.page_count),
    chunk_count: Number(row.chunk_count),
    pdf_object_key: String(row.pdf_object_key),
    manifest_object_key: String(row.manifest_object_key),
    digest: row.digest ?? null,
    created_at: String(row.created_at),
  };
};

const requireDb = (env: SourceEnv): D1Database => {
  if (!env.USERS_DB) {
    throw new Error('USERS_DB binding is not configured.');
  }
  return env.USERS_DB;
};

export const createPrimarySourceRecord = async (
  env: SourceEnv,
  input: CreatePrimarySourceInput
): Promise<PrimarySourceRecord> => {
  const db = requireDb(env);
  await db.prepare(
    `INSERT INTO primary_sources (
      id, user_id, title, original_name, summary,
      page_count, chunk_count, pdf_object_key,
      manifest_object_key, digest, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    input.id,
    input.userId,
    input.title,
    input.originalName,
    input.summary ?? null,
    input.pageCount,
    input.chunkCount,
    input.pdfKey,
    input.manifestKey,
    input.digest ?? null,
    input.createdAt
  ).run();

  const record = await getPrimarySourceRecord(env, input.userId, input.id);
  if (!record) {
    throw new Error('Failed to persist primary source metadata.');
  }
  return record;
};

export const listPrimarySourceRecords = async (
  env: SourceEnv,
  userId: number
): Promise<PrimarySourceRecord[]> => {
  const db = requireDb(env);
  const rows = await db.prepare(
    `SELECT * FROM primary_sources
     WHERE user_id = ?
     ORDER BY datetime(created_at) DESC`
  ).bind(userId).all<PrimarySourceRecord>();
  return Array.isArray(rows.results)
    ? rows.results.map(mapRow).filter((record): record is PrimarySourceRecord => Boolean(record))
    : [];
};

export const getPrimarySourceRecord = async (
  env: SourceEnv,
  userId: number,
  sourceId: string
): Promise<PrimarySourceRecord | null> => {
  const db = requireDb(env);
  const row = await db.prepare(
    `SELECT * FROM primary_sources WHERE id = ? AND user_id = ?`
  ).bind(sourceId, userId).first<PrimarySourceRecord>();
  return mapRow(row || undefined);
};

export const getPrimarySourceRecordById = async (
  env: SourceEnv,
  sourceId: string
): Promise<PrimarySourceRecord | null> => {
  const db = requireDb(env);
  const row = await db.prepare(
    `SELECT * FROM primary_sources WHERE id = ?`
  ).bind(sourceId).first<PrimarySourceRecord>();
  return mapRow(row || undefined);
};

export const deletePrimarySourceRecord = async (
  env: SourceEnv,
  sourceId: string
): Promise<void> => {
  const db = requireDb(env);
  await db.prepare('DELETE FROM primary_sources WHERE id = ?').bind(sourceId).run();
};

export interface PrimarySourceSummaryPayload {
  id: string;
  title: string;
  originalName: string;
  summary: string | null;
  pageCount: number;
  chunkCount: number;
  createdAt: string;
}

export const toPrimarySourceSummary = (
  record: PrimarySourceRecord
): PrimarySourceSummaryPayload => ({
  id: record.id,
  title: record.title,
  originalName: record.original_name,
  summary: record.summary,
  pageCount: record.page_count,
  chunkCount: record.chunk_count,
  createdAt: record.created_at,
});