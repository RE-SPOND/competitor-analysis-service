import { isAuthenticated, unauthorized } from "../_auth";
import { analyzeProject, type AnalysisInput } from "../../../lib/analysis";
import { saveAnalysis } from "../../../lib/storage";

export const maxDuration = 120;

export async function POST(request: Request) {
  if (!isAuthenticated(request)) return unauthorized();
  const body = await request.json().catch(() => ({})) as Partial<AnalysisInput>;
  const input: AnalysisInput = {
    projectUrl: String(body.projectUrl || "").trim(),
    description: String(body.description || "").trim(),
    region: String(body.region || "Россия").trim() || "Россия",
  };
  if (!input.description) return Response.json({ error: "Заполните описание компании или продукта." }, { status: 400 });
  try {
    const result = await analyzeProject(input);
    const id = await saveAnalysis(input, result);
    return Response.json({ id, ...result });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Не удалось выполнить анализ." }, { status: 502 });
  }
}
