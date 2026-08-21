import { isAuthenticated, unauthorized } from "../_auth";
import { listAnalyses } from "../../../lib/storage";

export async function GET(request: Request) {
  if (!isAuthenticated(request)) return unauthorized();
  return Response.json({ items: await listAnalyses() });
}
