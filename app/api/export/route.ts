import { isAuthenticated, unauthorized } from "../_auth";
import { COLUMNS, type AnalysisRow } from "../../../lib/analysis";
import { buildXlsx } from "../../../lib/xlsx";

export async function POST(request: Request) {
  if (!isAuthenticated(request)) return unauthorized();

  const body = await request.json().catch(() => null) as { rows?: unknown; columns?: unknown } | null;
  if (!Array.isArray(body?.rows) || body.rows.length === 0) {
    return Response.json({ error: "Нет данных для выгрузки." }, { status: 400 });
  }
  if (body.rows.length > 5_000) {
    return Response.json({ error: "Слишком много строк для выгрузки." }, { status: 400 });
  }

  const dynamicColumns = Array.isArray(body.columns)
    ? body.columns.map((column) => String(column).trim()).filter((column) => column && !COLUMNS.includes(column as typeof COLUMNS[number])).slice(0, 8)
    : [];
  const columns = [...COLUMNS, ...dynamicColumns];
  const rows: AnalysisRow[] = body.rows.map((row) => {
    const source = row && typeof row === "object" ? row as Record<string, unknown> : {};
    return Object.fromEntries(columns.map((column) => [column, String(source[column] ?? "")])) as AnalysisRow;
  });
  const file = buildXlsx(rows, columns);
  return new Response(file as unknown as BodyInit, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": 'attachment; filename="competitor-analysis.xlsx"',
      "Cache-Control": "no-store",
    },
  });
}
