import type { AnalysisInput, AnalysisResult } from "./analysis";

export type StoredAnalysis = { id: string; input: AnalysisInput; result: AnalysisResult; created_at: string };
type UpstashResponse<T> = { result?: T; error?: string };

const memory: StoredAnalysis[] = [];
const historyIndex = "competitor-analysis:history";
const analysisKey = (id: string) => `competitor-analysis:analysis:${id}`;

function upstashConfig() {
  const url = process.env.UPSTASH_REDIS_REST_URL?.replace(/\/$/, "");
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  return url && token ? { url, token } : null;
}

export function isPersistentStorageConfigured(): boolean {
  return Boolean(upstashConfig());
}

async function redis<T>(command: Array<string | number>): Promise<T> {
  const config = upstashConfig();
  if (!config) throw new Error("Upstash is not configured.");
  const response = await fetch(config.url, { method: "POST", headers: { Authorization: `Bearer ${config.token}`, "Content-Type": "application/json" }, body: JSON.stringify(command), cache: "no-store" });
  const payload = await response.json().catch(() => ({})) as UpstashResponse<T>;
  if (!response.ok || payload.error) throw new Error(payload.error || "Upstash request failed.");
  return payload.result as T;
}

async function redisPipeline(commands: Array<Array<string | number>>): Promise<void> {
  const config = upstashConfig();
  if (!config) throw new Error("Upstash is not configured.");
  const response = await fetch(`${config.url}/pipeline`, { method: "POST", headers: { Authorization: `Bearer ${config.token}`, "Content-Type": "application/json" }, body: JSON.stringify(commands), cache: "no-store" });
  const payload = await response.json().catch(() => []) as Array<UpstashResponse<unknown>>;
  if (!response.ok || !Array.isArray(payload) || payload.some((item) => item.error)) throw new Error(payload.find((item) => item.error)?.error || "Upstash request failed.");
}

function makeStoredAnalysis(input: AnalysisInput, result: AnalysisResult): StoredAnalysis {
  return { id: crypto.randomUUID(), input, result, created_at: new Date().toISOString() };
}

export async function saveAnalysis(input: AnalysisInput, result: AnalysisResult): Promise<string> {
  const stored = makeStoredAnalysis(input, result);
  if (!upstashConfig()) { memory.push(stored); return stored.id; }
  await redisPipeline([["SET", analysisKey(stored.id), JSON.stringify(stored)], ["ZADD", historyIndex, Date.now(), stored.id]]);
  return stored.id;
}

export async function upsertAnalysis(stored: StoredAnalysis): Promise<void> {
  if (!upstashConfig()) {
    const index = memory.findIndex((item) => item.id === stored.id);
    if (index >= 0) memory[index] = stored;
    else memory.push(stored);
    return;
  }
  const score = Date.parse(stored.created_at);
  await redisPipeline([
    ["SET", analysisKey(stored.id), JSON.stringify(stored)],
    ["ZADD", historyIndex, Number.isFinite(score) ? score : Date.now(), stored.id],
  ]);
}

export async function listAnalyses(): Promise<StoredAnalysis[]> {
  if (!upstashConfig()) return memory.slice(-30).reverse();
  const ids = await redis<string[]>(["ZREVRANGE", historyIndex, 0, 29]);
  if (!ids.length) return [];
  const values = await redis<Array<string | null>>(["MGET", ...ids]);
  return values.flatMap((value) => {
    if (!value) return [];
    try { return [JSON.parse(value) as StoredAnalysis]; } catch { return []; }
  });
}

export async function listAllAnalyses(): Promise<StoredAnalysis[]> {
  if (!upstashConfig()) return memory.slice().reverse();
  const ids = await redis<string[]>(["ZREVRANGE", historyIndex, 0, -1]);
  const items: StoredAnalysis[] = [];
  for (let offset = 0; offset < ids.length; offset += 100) {
    const values = await redis<Array<string | null>>(["MGET", ...ids.slice(offset, offset + 100)]);
    for (const value of values) {
      if (!value) continue;
      try { items.push(JSON.parse(value) as StoredAnalysis); } catch { /* Ignore malformed archived records. */ }
    }
  }
  return items;
}

export async function getAnalysis(id: string): Promise<StoredAnalysis | null> {
  if (!upstashConfig()) return memory.find((item) => item.id === id) || null;
  const value = await redis<string | null>(["GET", analysisKey(id)]);
  if (!value) return null;
  try { return JSON.parse(value) as StoredAnalysis; } catch { return null; }
}

export async function renameAnalysis(id: string, title: string): Promise<StoredAnalysis | null> {
  const analysis = await getAnalysis(id);
  if (!analysis) return null;
  const updated = { ...analysis, input: { ...analysis.input, title } };
  if (!upstashConfig()) {
    const index = memory.findIndex((item) => item.id === id);
    if (index >= 0) memory[index] = updated;
    return updated;
  }
  await redisPipeline([["SET", analysisKey(id), JSON.stringify(updated)]]);
  return updated;
}

export async function updateAnalysisResult(id: string, result: AnalysisResult): Promise<StoredAnalysis | null> {
  const analysis = await getAnalysis(id);
  if (!analysis) return null;
  const updated = { ...analysis, result };
  if (!upstashConfig()) {
    const index = memory.findIndex((item) => item.id === id);
    if (index >= 0) memory[index] = updated;
    return updated;
  }
  await redisPipeline([["SET", analysisKey(id), JSON.stringify(updated)]]);
  return updated;
}

export async function latestAnalysis(): Promise<StoredAnalysis | null> {
  return (await listAnalyses())[0] || null;
}
