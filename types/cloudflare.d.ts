declare module "cloudflare:workers" {
  export const env: Record<string, unknown>;
}

type Fetcher = { fetch(request: Request): Promise<Response> };
type D1Database = { prepare(sql: string): unknown };
