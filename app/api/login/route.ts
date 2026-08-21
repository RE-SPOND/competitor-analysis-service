export async function POST(request: Request) {
  const body = await request.json().catch(() => ({})) as { username?: string; password?: string };
  if (body.username !== "admin" || body.password !== "admin") return Response.json({ error: "Неверный логин или пароль." }, { status: 401 });
  return Response.json({ authenticated: true }, { headers: { "Set-Cookie": "ca_session=admin; Path=/; HttpOnly; SameSite=Lax; Max-Age=86400" } });
}
