import { isAuthenticated, unauthorized } from "../../../_auth";
import { latestAnalysis } from "../../../../../lib/storage";
import { buildXlsx } from "../../../../../lib/xlsx";
import { COLUMNS } from "../../../../../lib/analysis";

export async function GET(request: Request) {
  if (!isAuthenticated(request)) return unauthorized();
  const analysis = await latestAnalysis();
  if (!analysis) return Response.json({ error: "Сначала запустите анализ." }, { status: 404 });
  const file = buildXlsx(analysis.result.rows, analysis.result.columns || [...COLUMNS], analysis.result.summary);
  return new Response(file as unknown as BodyInit, { headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": `attachment; filename="competitor-analysis-${analysis.id}.xlsx"`, "Cache-Control": "no-store" } });
}
