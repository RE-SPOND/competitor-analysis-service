declare module "cloudflare:workers" {
  export const env: any;
}

type Fetcher = { fetch(request: Request): Promise<Response> };
type D1Database = { prepare(sql: string): unknown };
