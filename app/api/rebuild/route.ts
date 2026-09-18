import { isAuthenticated, unauthorized } from "../_auth";
import { buildMarketSummary } from "../../../lib/analysis";
import { listAllAnalyses, updateAnalysisResult } from "../../../lib/storage";

export const maxDuration = 120;

export async function POST(request: Request) {
  if (!isAuthenticated(request)) return unauthorized();
  const analyses = await listAllAnalyses();
  let updated = 0;
  for (const analysis of analyses) {
    const summary = buildMarketSummary(analysis.result.rows, analysis.result.columns);
    await updateAnalysisResult(analysis.id, { ...analysis.result, summary });
    updated += 1;
  }
  return Response.json({ updated, message: `Пересчитано анализов: ${updated}` });
}
