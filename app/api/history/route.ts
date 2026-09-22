import { isAuthenticated, unauthorized } from "../_auth";
import type { AnalysisInput, AnalysisResult, AnalysisRow, MarketSummary } from "../../../lib/analysis";
import { inferTopicDescription } from "../../../lib/analysis";
import { isPersistentStorageConfigured, listAnalyses, persistentHistoryCount, upsertAnalysis } from "../../../lib/storage";

export const dynamic = "force-dynamic";
const noStoreHeaders = { "Cache-Control": "private, no-store, no-cache, must-revalidate, max-age=0" };

type ImportedAnalysis = {
  id?: unknown;
  title?: unknown;
  projectUrl?: unknown;
  description?: unknown;
  region?: unknown;
  createdAt?: unknown;
  rows?: unknown;
  columns?: unknown;
  sources?: unknown;
  summary?: unknown;
};

export async function GET(request: Request) {
  if (!isAuthenticated(request)) return unauthorized();
  const items = await listAnalyses();
  return Response.json({ persistent: isPersistentStorageConfigured(), persistentCount: await persistentHistoryCount(), items: items.map((item) => ({ id: item.id, title: item.input.title || item.input.projectUrl || "Анализ по описанию", projectUrl: item.input.projectUrl, description: item.input.description, region: item.input.region, createdAt: item.created_at, rows: item.result.rows, columns: item.result.columns, sources: item.result.sources, summary: item.result.summary })) }, { headers: noStoreHeaders });
}

export async function POST(request: Request) {
  if (!isAuthenticated(request)) return unauthorized();
  const body = await request.json().catch(() => ({})) as { items?: ImportedAnalysis[] };
  if (!Array.isArray(body.items)) return Response.json({ error: "Передайте массив анализов." }, { status: 400 });

  let imported = 0;
  for (const item of body.items.slice(0, 30)) {
    if (!Array.isArray(item.rows) || !Array.isArray(item.columns) || !item.id) continue;
    const rows = item.rows as AnalysisRow[];
    const columns = item.columns.map(String);
    const summary = item.summary as MarketSummary;
    if (!summary || typeof summary !== "object") continue;
    const result: AnalysisResult = {
      rows,
      columns,
      sources: Array.isArray(item.sources) ? item.sources.map(String) : [],
      summary,
      queries: [],
      generatedAt: String(item.createdAt || new Date().toISOString()),
    };
    const explicitDescription = String(item.description || "").trim();
    const description = explicitDescription || inferTopicDescription(result) || String(item.title || "").trim();
    result.topicDescription = description;
    const input: AnalysisInput = {
      title: String(item.title || item.projectUrl || "Анализ по описанию").trim(),
      projectUrl: String(item.projectUrl || "").trim(),
      description,
      region: String(item.region || "Россия").trim(),
    };
    await upsertAnalysis({ id: String(item.id), input, result, created_at: String(item.createdAt || new Date().toISOString()) });
    imported += 1;
  }
  return Response.json({ imported }, { headers: noStoreHeaders });
}
