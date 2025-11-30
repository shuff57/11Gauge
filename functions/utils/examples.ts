interface ExampleEnv {
  USERS_DB?: D1Database;
}

export type ExampleImageLabel = 'good' | 'bad';

export interface ExampleImageRecord {
  id: string;
  user_id: number;
  label: ExampleImageLabel;
  title: string;
  description: string | null;
  original_name: string;
  mime_type: string;
  size_bytes: number;
  object_key: string;
  created_at: string;
}

const requireDb = (env: ExampleEnv): D1Database => {
  if (!env.USERS_DB) {
    throw new Error('USERS_DB binding is not configured.');
  }
  return env.USERS_DB;
};

const mapRow = (row?: any): ExampleImageRecord | null => {
  if (!row) return null;
  return {
    id: String(row.id),
    user_id: Number(row.user_id),
    label: row.label === 'good' ? 'good' : 'bad',
    title: String(row.title),
    description: row.description ?? null,
    original_name: String(row.original_name),
    mime_type: String(row.mime_type),
    size_bytes: Number(row.size_bytes),
    object_key: String(row.object_key),
    created_at: String(row.created_at)
  };
};

interface CreateExampleImageInput {
  id: string;
  userId: number;
  label: ExampleImageLabel;
  title: string;
  description?: string | null;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  objectKey: string;
  createdAt: string;
}

export const createExampleImageRecord = async (
  env: ExampleEnv,
  input: CreateExampleImageInput
): Promise<ExampleImageRecord> => {
  const db = requireDb(env);
  await db.prepare(
    `INSERT INTO example_images (
      id, user_id, label, title, description,
      original_name, mime_type, size_bytes,
      object_key, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    input.id,
    input.userId,
    input.label,
    input.title,
    input.description ?? null,
    input.originalName,
    input.mimeType,
    input.sizeBytes,
    input.objectKey,
    input.createdAt
  ).run();

  const record = await getExampleImageRecord(env, input.id);
  if (!record) {
    throw new Error('Failed to persist example image metadata.');
  }
  return record;
};

export const listExampleImageRecords = async (
  env: ExampleEnv,
  label?: ExampleImageLabel
): Promise<ExampleImageRecord[]> => {
  const db = requireDb(env);
  const base = `SELECT * FROM example_images`;
  const filter = label ? ' WHERE label = ?' : '';
  const order = ' ORDER BY datetime(created_at) DESC';
  const statement = base + filter + order;
  const rows = label
    ? await db.prepare(statement).bind(label).all<ExampleImageRecord>()
    : await db.prepare(statement).all<ExampleImageRecord>();

  return Array.isArray(rows.results)
    ? rows.results.map(mapRow).filter((record): record is ExampleImageRecord => Boolean(record))
    : [];
};

export const getExampleImageRecord = async (
  env: ExampleEnv,
  id: string
): Promise<ExampleImageRecord | null> => {
  const db = requireDb(env);
  const row = await db.prepare(
    `SELECT * FROM example_images WHERE id = ?`
  ).bind(id).first<ExampleImageRecord>();
  return mapRow(row || undefined);
};

export const deleteExampleImageRecord = async (
  env: ExampleEnv,
  id: string
): Promise<void> => {
  const db = requireDb(env);
  await db.prepare('DELETE FROM example_images WHERE id = ?').bind(id).run();
};

export interface ExampleImageSummaryPayload {
  id: string;
  label: ExampleImageLabel;
  title: string;
  description: string | null;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: string;
}

export const toExampleImageSummary = (
  record: ExampleImageRecord
): ExampleImageSummaryPayload => ({
  id: record.id,
  label: record.label,
  title: record.title,
  description: record.description,
  originalName: record.original_name,
  mimeType: record.mime_type,
  sizeBytes: record.size_bytes,
  createdAt: record.created_at,
});
