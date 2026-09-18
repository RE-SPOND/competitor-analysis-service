import { isAuthenticated, unauthorized } from "../_auth";
import { refreshServicesInResult, type AnalysisResult, type AnalysisRow, type MarketSummary } from "../../../lib/analysis";

export const maxDuration = 300;

export async function POST(request: Request) {
  if (!isAuthenticated(request)) return unauthorized();
  const body = await request.json().catch(() => ({})) as { rows?: AnalysisRow[]; columns?: string[]; sources?: string[]; summary?: MarketSummary; description?: string };
  if (!Array.isArray(body.rows) || !Array.isArray(body.columns)) {
    return Response.json({ error: "Передайте строки и столбцы анализа." }, { status: 400 });
  }
  const result: AnalysisResult = {
    rows: body.rows,
    columns: body.columns,
    sources: Array.isArray(body.sources) ? body.sources : [],
    summary: body.summary || { serviceCatalogVersion: 0, leaders: [], services: [], serviceCatalog: [], coverage: [], price: { transparent: 0, total: 0, note: "" }, gaps: [], recommendations: [], risks: [], methodology: "" },
    queries: [],
    generatedAt: new Date().toISOString(),
    topicDescription: String(body.description || "").trim(),
  };
  return Response.json({ result: await refreshServicesInResult(result, String(body.description || "")) });
}
