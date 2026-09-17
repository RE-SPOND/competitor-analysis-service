import { isAuthenticated, unauthorized } from "../../../_auth";
import { getAnalysis } from "../../../../../lib/storage";
import { buildXlsx } from "../../../../../lib/xlsx";
import { COLUMNS } from "../../../../../lib/analysis";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!isAuthenticated(request)) return unauthorized();
  const id = (await params).id;
  const analysis = await getAnalysis(id);
  if (!analysis) return Response.json({ error: "Анализ не найден." }, { status: 404 });
  const file = buildXlsx(analysis.result.rows, analysis.result.columns || [...COLUMNS], analysis.result.summary);
  return new Response(file as unknown as BodyInit, { headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": `attachment; filename="competitor-analysis-${id}.xlsx"`, "Cache-Control": "no-store" } });
}
