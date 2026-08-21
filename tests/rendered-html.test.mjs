import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const projectRoot = new URL("../", import.meta.url);

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);
  return worker.fetch(
    new Request("http://localhost/", { headers: { accept: "text/html" } }),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );
}

test("server-renders the CFD analysis login screen", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);
  const html = await response.text();
  assert.match(html, /Конкурентный анализ/);
  assert.match(html, /Тестовый доступ к сервису автоматизации полного регламента/);
  assert.match(html, /Тестовый доступ: admin \/ admin/);
  assert.match(html, /name="description" content="Автоматизированный конкурентный анализ/);
});

test("keeps the agreed CFD competitor list and final Excel columns", async () => {
  const reference = await readFile(new URL("lib/reference-data.ts", projectRoot), "utf8");
  const analysis = await readFile(new URL("lib/analysis.ts", projectRoot), "utf8");
  const xlsx = await readFile(new URL("lib/xlsx.ts", projectRoot), "utf8");
  for (const name of ["CFD", "Ваш Фасад", "Dekor-RP / РОКПАЙП", "Главный Фасад", "TTK Система"]) {
    assert.match(reference, new RegExp(name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
  assert.match(analysis, /clientDomain === "cfd-spb\.ru"/);
  assert.match(xlsx, /sheet name="Анализ"/);
  assert.match(xlsx, /autoFilter ref="A1:P/);
});
