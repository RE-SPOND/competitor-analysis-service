import type { AnalysisInput, AnalysisResult } from "./analysis";

type StatementResult = { results?: Record<string, unknown>[]; meta?: { last_row_id?: number } };
type Database = { prepare(sql: string): { bind(...values: unknown[]): { all<T = Record<string, unknown>>(): Promise<{ results: T[] }>; first<T = Record<string, unknown>>(): Promise<T | null>; run(): Promise<StatementResult> }; all<T = Record<string, unknown>>(): Promise<{ results: T[] }>; first<T = Record<string, unknown>>(): Promise<T | null>; run(): Promise<StatementResult> } };
type StoredAnalysis = { id: number; input: AnalysisInput; result: AnalysisResult; created_at: string };

const memory: StoredAnalysis[] = [];
let schemaReady: Promise<void> | null = null;

async function database(): Promise<Database | null> {
  try {
    const runtime = await import("cloudflare:workers");
    return ((runtime.env as unknown as { DB?: Database }).DB) || null;
  } catch { return null; }
}

async function ensureSchema(): Promise<void> {
  const db = await database();
  if (!db) return;
  if (!schemaReady) {
    schemaReady = db.prepare(`CREATE TABLE IF NOT EXISTS analyses (id INTEGER PRIMARY KEY AUTOINCREMENT, project_url TEXT NOT NULL, description TEXT NOT NULL, region TEXT NOT NULL, result_json TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`).run().then(() => undefined);
  }
  await schemaReady;
}

export async function saveAnalysis(input: AnalysisInput, result: AnalysisResult): Promise<number> {
  const createdAt = new Date().toISOString();
  const db = await database();
  if (!db) {
    const id = (memory.at(-1)?.id || 0) + 1;
    memory.push({ id, input, result, created_at: createdAt });
    return id;
  }
  await ensureSchema();
  const inserted = await db.prepare("INSERT INTO analyses (project_url, description, region, result_json, created_at) VALUES (?, ?, ?, ?, ?)").bind(input.projectUrl, input.description, input.region, JSON.stringify(result), createdAt).run();
  return Number(inserted.meta?.last_row_id || 0);
}

export async function listAnalyses(): Promise<Array<{ id: number; project_url: string; region: string; created_at: string; competitor_count: number }>> {
  const db = await database();
  if (!db) return memory.slice().reverse().map((item) => ({ id: item.id, project_url: item.input.projectUrl, region: item.input.region, created_at: item.created_at, competitor_count: item.result.rows.length }));
  await ensureSchema();
  const result = await db.prepare("SELECT id, project_url, region, created_at, result_json FROM analyses ORDER BY id DESC LIMIT 30").all<{ id: number; project_url: string; region: string; created_at: string; result_json: string }>();
  return result.results.map((item) => ({ id: item.id, project_url: item.project_url, region: item.region, created_at: item.created_at, competitor_count: JSON.parse(item.result_json).rows?.length || 0 }));
}

export async function getAnalysis(id: number): Promise<StoredAnalysis | null> {
  const db = await database();
  if (!db) return memory.find((item) => item.id === id) || null;
  await ensureSchema();
  const item = await db.prepare("SELECT id, project_url, description, region, result_json, created_at FROM analyses WHERE id = ?").bind(id).first<{ id: number; project_url: string; description: string; region: string; result_json: string; created_at: string }>();
  if (!item) return null;
  return { id: item.id, input: { projectUrl: item.project_url, description: item.description, region: item.region }, result: JSON.parse(item.result_json) as AnalysisResult, created_at: item.created_at };
}

export async function latestAnalysis(): Promise<StoredAnalysis | null> {
  const items = await listAnalyses();
  return items[0] ? getAnalysis(items[0].id) : null;
}
