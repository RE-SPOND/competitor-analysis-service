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
  assert.match(page, /необязательно/);
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

test("builds a topic-filtered H1 service list and can rebuild saved analyses", async () => {
  const analysis = await readFile(new URL("lib/analysis.ts", projectRoot), "utf8");
  const page = await readFile(new URL("app/page.tsx", projectRoot), "utf8");
  const xlsx = await readFile(new URL("lib/xlsx.ts", projectRoot), "utf8");
  const rebuild = await readFile(new URL("app/api/rebuild/route.ts", projectRoot), "utf8");

  assert.match(analysis, /export type ServiceCatalogItem/);
  assert.match(analysis, /function buildServiceCatalog/);
  assert.match(analysis, /competitorsList/);
  assert.match(analysis, /const htmlHeading = content\.match/);
  assert.match(analysis, /filterServicesByTopic/);
  assert.match(analysis, /function looksLikeServiceOffering/);
  assert.match(analysis, /serviceAction\.test\(label\)/);
  assert.match(analysis, /Верни только ID подходящих записей/);
  assert.doesNotMatch(analysis, /suggestedPage/);
  assert.doesNotMatch(analysis, /serviceClusters/);
  assert.match(page, /Список услуг по теме/);
  assert.match(page, /Без товаров, кластеров и придуманных URL/);
  assert.match(page, /summary\.serviceCatalog\.slice\(0, 5\)/);
  assert.match(page, /Свернуть до 5 услуг/);
  assert.match(page, /Показать ещё \$\{summary\.serviceCatalog\.length - 5\} услуг/);
  assert.match(analysis, /competitor\.row\["Услуги"\] = serviceDiscovery\.services\.length/);
  assert.match(analysis, /по H1 отдельных страниц услуг конкурентов/);
  assert.match(analysis, /serviceCatalogVersion: 12/);
  assert.match(xlsx, /sheet name="Услуги"/);
  assert.match(xlsx, /serviceCatalog \|\| \[\]/);
  assert.match(rebuild, /listAllAnalyses/);
  assert.match(rebuild, /updateAnalysisResult/);
});

test("proposes competitor-driven USPs and includes them in saved analyses and Excel", async () => {
  const analysis = await readFile(new URL("lib/analysis.ts", projectRoot), "utf8");
  const page = await readFile(new URL("app/page.tsx", projectRoot), "utf8");
  const xlsx = await readFile(new URL("lib/xlsx.ts", projectRoot), "utf8");
  const summaryRoute = await readFile(new URL("app/api/summary/route.ts", projectRoot), "utf8");

  assert.match(analysis, /export type ProposedUsp/);
  assert.match(analysis, /buildMarketSummaryWithUsps/);
  assert.match(analysis, /предложи 5 сильных УТП/);
  assert.match(analysis, /Не придумывай факты, гарантии, сроки, цены/);
  assert.match(page, /Предложенные УТП/);
  assert.match(page, /summary\.proposedUsps/);
  assert.match(xlsx, /"Раздел": "Предложенные УТП"/);
  assert.match(summaryRoute, /serviceCatalogVersion \|\| 0\) >= 12/);
  assert.match(summaryRoute, /refilterServicesInResult/);
  assert.match(summaryRoute, /buildMarketSummaryWithUsps/);
});

test("migrates local history with inferred topics and persists it in Upstash", async () => {
  const page = await readFile(new URL("app/page.tsx", projectRoot), "utf8");
  const historyRoute = await readFile(new URL("app/api/history/route.ts", projectRoot), "utf8");
  const storage = await readFile(new URL("lib/storage.ts", projectRoot), "utf8");

  assert.match(page, /function savedAnalysisTopic/);
  assert.match(page, /description = savedAnalysisTopic\(item\)/);
  assert.match(page, /fetch\("\/api\/history", \{ method: "POST"/);
  assert.match(historyRoute, /export async function POST/);
  assert.match(historyRoute, /inferTopicDescription\(result\)/);
  assert.match(storage, /export async function upsertAnalysis/);
});
