import { isAuthenticated, unauthorized } from "../_auth";
import { listAnalyses } from "../../../lib/storage";

export async function GET(request: Request) {
  if (!isAuthenticated(request)) return unauthorized();
  const items = await listAnalyses();
  return Response.json({ items: items.map((item) => ({ id: item.id, projectUrl: item.input.projectUrl, region: item.input.region, createdAt: item.created_at, rows: item.result.rows, columns: item.result.columns, sources: item.result.sources, summary: item.result.summary })) });
}
