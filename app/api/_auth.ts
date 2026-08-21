export function isAuthenticated(request: Request): boolean {
  return request.headers.get("cookie")?.split(";").some((part) => part.trim() === "ca_session=admin") || false;
}

export function unauthorized(): Response { return Response.json({ error: "Требуется вход в сервис." }, { status: 401 }); }
