import { isAuthenticated, unauthorized } from "../_auth";
import { refreshServicesInResult } from "../../../lib/analysis";
import { listAllAnalyses, updateAnalysisResult } from "../../../lib/storage";

export const maxDuration = 120;

export async function POST(request: Request) {
  if (!isAuthenticated(request)) return unauthorized();
  const analyses = await listAllAnalyses();
  let updated = 0;
  for (const analysis of analyses) {
    const result = await refreshServicesInResult(analysis.result);
    await updateAnalysisResult(analysis.id, result);
    updated += 1;
  }
  return Response.json({ updated, message: `Пересчитано анализов: ${updated}` });
}
