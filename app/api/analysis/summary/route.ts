import { isAuthenticated, unauthorized } from "../../_auth";
import { buildMarketSummary, type AnalysisRow } from "../../../../lib/analysis";

export async function POST(request: Request) {
  if (!isAuthenticated(request)) return unauthorized();
  const body = await request.json().catch(() => ({})) as { rows?: AnalysisRow[]; columns?: string[] };
  if (!Array.isArray(body.rows) || !Array.isArray(body.columns)) {
    return Response.json({ error: "Передайте строки и столбцы анализа." }, { status: 400 });
  }
  return Response.json({ summary: buildMarketSummary(body.rows, body.columns) });
}
