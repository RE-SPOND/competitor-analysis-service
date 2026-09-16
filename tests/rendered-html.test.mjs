import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const projectRoot = new URL("../", import.meta.url);

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: app } = await import(workerUrl.href);
  return app(new Request("http://localhost/", { headers: { accept: "text/html" } }));
}

test("server-renders the competitor analysis login screen", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);
  const html = await response.text();
  assert.match(html, /Конкурентный анализ/);
  assert.match(html, /Тестовый доступ к сервису автоматизации полного регламента/);
  assert.match(html, /Тестовый доступ: admin \/ admin/);
  assert.match(html, /name="description" content="Автоматизированный конкурентный анализ/);
});

test("uses open web search and keeps the final Excel columns", async () => {
  const analysis = await readFile(new URL("lib/analysis.ts", projectRoot), "utf8");
  const xlsx = await readFile(new URL("lib/xlsx.ts", projectRoot), "utf8");
  assert.match(analysis, /searchapi\.api\.cloud\.yandex\.net\/v2\/web\/search/);
  assert.match(analysis, /YANDEX_SEARCH_API_KEY/);
  assert.match(analysis, /responseFormat:\s*"FORMAT_XML"/);
  assert.match(analysis, /groupsOnPage:\s*50/);
  assert.match(analysis, /MIN_COMPETITOR_RELEVANCE = 6/);
  assert.match(analysis, /const relevantCandidates = candidates\.filter/);
  assert.match(analysis, /const relevanceContext = input\.description\.trim\(\) \|\| projectContext\.text/);
  assert.match(analysis, /const expansionBase = basePhrase/);
  assert.match(analysis, /primaryCategoryMatches === 0/);
  assert.match(analysis, /retailOrManufacturing\.test\(primary\)/);
  assert.match(analysis, /cbr\.ru\/banking_sector\/credit\/cowebsites\//);
  assert.match(analysis, /bankRegistryCandidates/);
  assert.match(analysis, /verifiedIndustryDomains/);
  assert.match(analysis, /transliterateDomainToken/);
  assert.match(analysis, /industryRegistryCandidates\.length > 0 && !verifiedIndustryDomains\.has\(base\)/);
  assert.match(analysis, /Юрстатус подтверждён реестром Банка России/);
  assert.doesNotMatch(analysis, /Math\.max\(3, primaryMatches/);
  assert.match(analysis, /search\.brave\.com/);
  assert.match(analysis, /html\.duckduckgo\.com/);
  assert.match(analysis, /www\.bing\.com/);
  assert.match(analysis, /searx\.space\/data\/instances\.json/);
  assert.match(analysis, /searchWebRescue/);
  assert.match(analysis, /checko\.ru\/search\?query=/);
  assert.doesNotMatch(analysis, /clientDomain === "cfd-spb\.ru"/);
  assert.match(xlsx, /sheet name="Анализ"/);
  assert.match(xlsx, /autoFilter ref="A1:\$\{columnName\(columns\.length - 1\)\}/);
});

test("allows research to start with description only", async () => {
  const page = await readFile(new URL("app/page.tsx", projectRoot), "utf8");
  const route = await readFile(new URL("app/api/analyze/route.ts", projectRoot), "utf8");
  const analysis = await readFile(new URL("lib/analysis.ts", projectRoot), "utf8");

  assert.match(page, /Ссылка на сайт компании/);
  assert.match(page, /\(необязательно\)/);
  assert.match(page, /description: "", region: "Россия"/);
  assert.doesNotMatch(page, /<input required type="url"/);
  assert.match(route, /if \(!input\.description\)/);
  assert.match(route, /body\.region \|\| "Россия"/);
  assert.match(analysis, /function descriptionOnlyClient/);
  assert.match(analysis, /Исследуемый проект \(клиент\)/);
  assert.match(analysis, /Сайт не указан/);
  assert.match(analysis, /clientDomain\s*\?\s*analyzeDomain/);
  assert.match(analysis, /region: input\.region\.trim\(\) \|\| "Россия"/);
});
