import { isAuthenticated, unauthorized } from "../../_auth";
import { renameAnalysis } from "../../../../lib/storage";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!isAuthenticated(request)) return unauthorized();
  const body = await request.json().catch(() => ({})) as { title?: unknown };
  const title = String(body.title || "").trim();
  if (!title) return Response.json({ error: "Введите название анализа." }, { status: 400 });
  const analysis = await renameAnalysis((await params).id, title);
  if (!analysis) return Response.json({ error: "Анализ не найден." }, { status: 404 });
  return Response.json({ id: analysis.id, title: analysis.input.title });
}
