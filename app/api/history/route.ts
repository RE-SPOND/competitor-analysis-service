import { isAuthenticated, unauthorized } from "../_auth";
import { listAnalyses } from "../../../lib/storage";

export async function GET(request: Request) {
  if (!isAuthenticated(request)) return unauthorized();
  const items = await listAnalyses();
  return Response.json({ items: items.map((item) => ({ id: item.id, title: item.input.title || item.input.projectUrl || "Анализ по описанию", projectUrl: item.input.projectUrl, description: item.input.description, region: item.input.region, createdAt: item.created_at, rows: item.result.rows, columns: item.result.columns, sources: item.result.sources, summary: item.result.summary })) });
}
