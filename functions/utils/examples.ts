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
  material_type?: string | null;
  weld_process?: string | null;
  material_thickness?: string | null;
  joint_type?: string | null;
  weld_position?: string | null;
  structured_analysis?: string | null;
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
    created_at: String(row.created_at),
    material_type: row.material_type ?? null,
    weld_process: row.weld_process ?? null,
    material_thickness: row.material_thickness ?? null,
    joint_type: row.joint_type ?? null,
    weld_position: row.weld_position ?? null,
    structured_analysis: row.structured_analysis ?? null
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
  materialType?: string | null;
  weldProcess?: string | null;
  materialThickness?: string | null;
  jointType?: string | null;
  weldPosition?: string | null;
  structuredAnalysis?: string | null;
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
      object_key, created_at,
      material_type, weld_process, material_thickness,
      joint_type, weld_position, structured_analysis
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
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
    input.createdAt,
    input.materialType ?? null,
    input.weldProcess ?? null,
    input.materialThickness ?? null,
    input.jointType ?? null,
    input.weldPosition ?? null,
    input.structuredAnalysis ?? null
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

export const createExampleImageChunk = async (
  env: ExampleEnv,
  imageId: string,
  textContent: string,
  embedding: number[]
): Promise<void> => {
  const db = requireDb(env);
  const id = crypto.randomUUID();
  const createdAt = new Date().toISOString();
  const embeddingJson = JSON.stringify(embedding);

  await db.prepare(
    `INSERT INTO example_image_chunks (id, image_id, text_content, embedding_json, created_at)
     VALUES (?, ?, ?, ?, ?)`
  ).bind(id, imageId, textContent, embeddingJson, createdAt).run();
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
  materialType?: string | null;
  weldProcess?: string | null;
  materialThickness?: string | null;
  jointType?: string | null;
  weldPosition?: string | null;
  structuredAnalysis?: any;
}

export const toExampleImageSummary = (
  record: ExampleImageRecord
): ExampleImageSummaryPayload => {
  let structuredAnalysis = null;
  if (record.structured_analysis) {
    try {
      structuredAnalysis = JSON.parse(record.structured_analysis);
    } catch (e) {
      // ignore parse error
    }
  }
  return {
    id: record.id,
    label: record.label,
    title: record.title,
    description: record.description,
    originalName: record.original_name,
    mimeType: record.mime_type,
    sizeBytes: record.size_bytes,
    createdAt: record.created_at,
    materialType: record.material_type,
    weldProcess: record.weld_process,
    materialThickness: record.material_thickness,
    jointType: record.joint_type,
    weldPosition: record.weld_position,
    structuredAnalysis
  };
};
