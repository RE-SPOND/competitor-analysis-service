import { isAuthenticated, unauthorized } from "../_auth";
import { deleteAnalysis, renameAnalysis } from "../../../lib/storage";

export async function PATCH(request: Request) {
  if (!isAuthenticated(request)) return unauthorized();
  const body = await request.json().catch(() => ({})) as { id?: unknown; title?: unknown };
  const id = String(body.id || "").trim();
  const title = String(body.title || "").trim();
  if (!id) return Response.json({ error: "Не указан анализ." }, { status: 400 });
  if (!title) return Response.json({ error: "Введите название анализа." }, { status: 400 });
  const analysis = await renameAnalysis(id, title);
  if (!analysis) return Response.json({ error: "Анализ не найден." }, { status: 404 });
  return Response.json({ id: analysis.id, title: analysis.input.title });
}

export async function DELETE(request: Request) {
  if (!isAuthenticated(request)) return unauthorized();
  const body = await request.json().catch(() => ({})) as { id?: unknown };
  const id = String(body.id || "").trim();
  if (!id) return Response.json({ error: "Не указан анализ." }, { status: 400 });
  const deleted = await deleteAnalysis(id);
  if (!deleted) return Response.json({ error: "Анализ не найден." }, { status: 404 });
  return Response.json({ deleted: true });
}
