import { isAuthenticated } from "../_auth";

export async function GET(request: Request) { return Response.json({ authenticated: isAuthenticated(request) }); }
