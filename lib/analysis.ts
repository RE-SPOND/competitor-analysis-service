export const COLUMNS = [
  "Название", "Сайт", "Тип продукта", "Ассортимент", "УТП", "Ценовой сегмент", "География", "Производство",
  "Индивидуальные решения", "Каналы", "Кейсы", "Сильные стороны", "Слабые стороны", "Особенности", "ОКВЭД", "Оборотка",
] as const;

export type AnalysisInput = { projectUrl: string; description: string; region: string };
export type AnalysisRow = Record<(typeof COLUMNS)[number], string>;
export type AnalysisResult = { rows: AnalysisRow[]; sources: string[]; queries: string[]; generatedAt: string };

const USER_AGENT = "Mozilla/5.0 (compatible; Competitor-Analysis-Service/1.0)";
const blockedDomains = new Set([
  "yandex.ru", "ya.ru", "google.com", "bing.com", "duckduckgo.com", "brave.com", "jina.ai", "microsoft.com", "apple.com",
  "youtube.com", "vk.com", "ok.ru", "dzen.ru", "rutube.ru", "t.me", "telegram.me", "twitter.com", "max.ru",
  "linkedin.com", "instagram.com", "facebook.com",
  "2gis.ru", "checko.ru", "rusprofile.ru", "vc.ru", "t-j.ru", "wikipedia.org",
  "infoselection.ru", "habr.com", "dtf.ru", "medium.com", "reddit.com", "pikabu.ru", "mail.ru", "psymag.info",
  "rbc.ru", "rb.ru", "forbes.ru", "ria.ru", "smi2.ru", "sostav.ru", "cossa.ru", "adindex.ru",
  "irecommend.ru", "otzovik.com", "tobiz.net",
  "banki.ru", "brobank.ru", "bankiros.ru", "sravni.ru", "vyberu.ru", "rkobiz.ru",
]);

function isTechnicalDomain(domain: string): boolean {
  return [...blockedDomains].some((blocked) => domain === blocked || domain.endsWith(`.${blocked}`))
    || domain.endsWith(".yandex.ru")
    || domain.endsWith(".yandex.net")
    || domain === "yandex.cloud"
    || domain.endsWith(".yandex.cloud")
    || domain.includes(".cdn.")
    || domain.includes("captcha")
    || domain.includes("yastatic")
    || domain.includes("clck.")
    || domain.includes("yabs.")
    || domain.includes("ogp.me")
    || domain.includes("schema.org")
    || domain.includes("w3.org");
}

function normalizeDomain(value: string): string {
  return value.toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0].split("?")[0];
}

function pageText(html: string): string {
  return html.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
}

function titleFromHtml(html: string): string {
  const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return match ? pageText(match[1]).slice(0, 180) : "";
}

function siteNameFromHtml(html: string): string {
  const match = html.match(/<meta[^>]+property=["']og:site_name["'][^>]+content=["']([^"']+)["']/i)
    || html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:site_name["']/i);
  return match ? pageText(match[1]).slice(0, 100) : "";
}

function metaDescriptionFromHtml(html: string): string {
  const match = html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i)
    || html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+name=["']description["']/i)
    || html.match(/<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']/i);
  return match ? pageText(match[1]).slice(0, 320) : "";
}

function readerDescription(content: string): string {
  const markdown = content.split("Markdown Content:")[1] || "";
  return firstUsefulSentence(markdown.replace(/[#*_`()]/g, " ").replaceAll("[", " ").replaceAll("]", " ").replace(/\s+/g, " ").trim());
}

function firstUsefulSentence(value: string, fallback = ""): string {
  const sentence = value.split(/(?<=[.!?])\s+|\r?\n/).map((item) => item.trim()).find((item) => item.length >= 30);
  return (sentence || value.trim() || fallback).slice(0, 280);
}

function brandNameFromDomain(domain: string): string {
  const label = normalizeDomain(domain).split(".")[0].replace(/[-_]+/g, " ");
  return label ? `${label.charAt(0).toUpperCase()}${label.slice(1)}` : domain;
}

async function fetchText(url: string, timeoutMs = 15000): Promise<string> {
  const response = await fetch(url, { headers: { "User-Agent": USER_AGENT, "Accept-Language": "ru-RU,ru;q=0.9" }, signal: AbortSignal.timeout(timeoutMs) });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.text();
}

function domainsFromUrls(urls: string[]): string[] {
  const result: string[] = [];
  for (const candidate of urls) {
    let domain = "";
    try { domain = normalizeDomain(new URL(candidate).hostname); } catch { continue; }
    if (!domain || isTechnicalDomain(domain) || domain.includes("search")) continue;
    if (!result.includes(domain)) result.push(domain);
  }
  return result;
}

function domainsFromSearchHtml(html: string): string[] {
  const urls: string[] = [];
  for (const match of html.matchAll(/uddg=([^"&]+)/gi)) {
    try { urls.push(decodeURIComponent(match[1].replace(/&amp;/g, "&"))); } catch { /* Ignore malformed redirect links. */ }
  }
  for (const match of html.matchAll(/href=["']\/url\?q=([^"'&]+)/gi)) {
    try { urls.push(decodeURIComponent(match[1].replace(/&amp;/g, "&"))); } catch { /* Ignore malformed Google redirect links. */ }
  }
  for (const match of html.matchAll(/<li[^>]+class=["'][^"']*b_algo[^"']*["'][\s\S]*?<a[^>]+href=["']([^"']+)["']/gi)) urls.push(match[1]);
  for (const match of html.matchAll(/<a[^>]+href=["'](https?:\/\/[^"']+)["']/gi)) urls.push(match[1].replace(/&amp;/g, "&"));
  return domainsFromUrls(urls);
}

const searchStopWords = new Set([
  "который", "которая", "которые", "помогает", "предлагает", "ориентирован", "доступен", "доступны",
  "компания", "проект", "продукт", "сервис", "сервисы", "себя", "также", "разные", "форматы", "формат",
  "через", "среди", "после", "чтобы", "этого", "этот", "этой", "своих", "своей", "можно", "нужно",
  "личный", "основной", "является", "работает", "работают", "включает", "позволяет", "доступный", "клиент",
  "клиенты", "решение", "решения", "рынок", "сайт", "официальный", "главная", "россия", "москва",
]);

function searchWords(value: string): string[] {
  return value.toLowerCase().match(/[a-zа-яё0-9-]{4,}/giu)?.filter((word) => !searchStopWords.has(word)) || [];
}

function wordStem(word: string): string {
  return word.replace(/[^a-zа-яё0-9]/giu, "").slice(0, 7);
}

const organizationDescriptors = new Set([
  "банк", "банка", "сервис", "платформа", "компания", "магазин", "производитель", "производство", "агентство",
  "студия", "школа", "клиника", "центр", "завод", "салон", "приложение", "маркетплейс", "лаборатория",
]);

function compactSearchPhrase(value: string, excludedWords = new Set<string>()): string {
  const words = searchWords(value).filter((word) => !excludedWords.has(wordStem(word)));
  const grouped = new Map<string, { word: string; count: number; first: number }>();
  words.forEach((word, index) => {
    const stem = wordStem(word);
    const current = grouped.get(stem);
    if (current) current.count += 1;
    else grouped.set(stem, { word, count: 1, first: index });
  });
  const ranked = [...grouped.values()]
    .sort((a, b) => b.count - a.count || a.first - b.first)
    .map((item) => item.word);
  const audienceWords = words.filter((word) => /предприним|юридичес|бизнес|корпоратив|малого|среднего|b2b|b2c|дет|родител|студент|специалист|пациент|покупател|потребител/.test(word));
  return [...new Set([...ranked.slice(0, 5), ...audienceWords])].slice(0, 6).join(" ") || value.slice(0, 100);
}

function audiencePhrase(value: string): string {
  const patterns = [
    /для\s+(?:малого\s+и\s+среднего\s+)?бизнеса/iu,
    /для\s+предпринимателей/iu,
    /для\s+юридических\s+лиц/iu,
    /для\s+частных\s+клиентов/iu,
    /для\s+(?:детей|родителей|студентов|специалистов|пациентов|покупателей|потребителей)/iu,
    /\b(?:b2b|b2c)\b/iu,
  ];
  return patterns.map((pattern) => value.match(pattern)?.[0]).find(Boolean) || "";
}

async function projectSearchContext(input: AnalysisInput, clientDomain: string): Promise<{ text: string; brandStems: Set<string> }> {
  let html = "";
  try {
    html = await fetchText(`https://${clientDomain}/`, 8000);
  } catch {
    try { html = await fetchText(`https://r.jina.ai/https://${clientDomain}/`, 8000); } catch { /* The user's description remains the fallback. */ }
  }
  const title = titleFromHtml(html);
  const siteName = siteNameFromHtml(html);
  const siteContext = [title, metaDescriptionFromHtml(html), readerDescription(html)].filter(Boolean).join(" ");
  const identityFragments = [
    brandNameFromDomain(clientDomain),
    siteName,
    title.split(/[|–—-]/)[0],
    input.description.match(/^(.{2,60}?)\s+[—–-]\s+/u)?.[1] || "",
  ].filter((fragment) => fragment && searchWords(fragment).length <= 4);
  const brandStems = new Set(identityFragments.flatMap(searchWords)
    .filter((word) => !organizationDescriptors.has(word))
    .map(wordStem));
  const combinedText = `${input.description} ${siteContext}`.replace(/\s+/g, " ").trim().slice(0, 2500);
  const textWithoutBrand = combinedText.split(/\s+/)
    .filter((word) => !brandStems.has(wordStem(word.toLowerCase())))
    .join(" ");
  return {
    text: textWithoutBrand,
    brandStems,
  };
}

function makeQueries(input: AnalysisInput, clientDomain: string, context: string, brandStems: Set<string>): string[] {
  const region = input.region.trim();
  const base = compactSearchPhrase(context, brandStems);
  const categoryBase = base.split(" ").slice(0, 2).join(" ");
  const industryWord = base.split(" ")[0] || categoryBase;
  const brand = brandNameFromDomain(clientDomain);
  const audience = audiencePhrase(context);
  const isPhysicalProduct = /производ|издел|материал|оборудован|товар|магазин|доставк|монтаж|купить/i.test(context);
  const standard = [
    `${base} ${region}`,
    `${base} компании ${region}`,
    `${base} цены стоимость ${region}`,
    `${brand} конкуренты аналоги`,
    audience ? `${categoryBase} ${audience} ${region}` : `${categoryBase} предложения ${region}`,
    isPhysicalProduct ? `${base} производители поставщики купить заказать ${region}` : `${base} сервисы услуги платформы ${region}`,
    `${categoryBase} конкуренты список игроков ${region}`,
    `${industryWord} компании услуги сервисы производители ${region}`,
    `${categoryBase} адреса регионы Яндекс Карты 2ГИС ${region}`,
    `${categoryBase} кейсы проекты отзывы фото YouTube VK Telegram ${region}`,
  ];
  return [...new Set(standard.map((query) => query.replace(/\s+/g, " ").trim()))];
}

type SearchResponse = { domains: string[]; source: string; html: string; evidence: Record<string, string>; mapLeads: string[] };
type IndustryRegistryCandidate = { domain: string; name: string; source: string };

const BANK_REGISTRY_SOURCE = "https://www.cbr.ru/banking_sector/credit/cowebsites/";

function transliterateDomainToken(value: string): string {
  const characters: Record<string, string> = {
    а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "e", ж: "zh", з: "z", и: "i", й: "i",
    к: "k", л: "l", м: "m", н: "n", о: "o", п: "p", р: "r", с: "s", т: "t", у: "u", ф: "f",
    х: "h", ц: "c", ч: "ch", ш: "sh", щ: "sch", ъ: "", ы: "y", ь: "", э: "e", ю: "yu", я: "ya",
  };
  return [...value.toLowerCase()].map((character) => characters[character] ?? character).join("").replace(/[^a-z0-9]/g, "");
}

function organizationDomainScore(domain: string, name: string): number {
  const nameTokens = name.toLowerCase().match(/[a-zа-яё0-9]{2,}/giu) || [];
  const identityTokens = nameTokens
    .filter((word) => !/^(банк|пао|ао|ооо|кб|акб|каб|рнко|нко)$/iu.test(word))
    .flatMap((word) => {
      const transliterated = transliterateDomainToken(word);
      return [transliterated, transliterated.replace(/kom/g, "com")];
    })
    .filter((word) => word.length >= 3);
  const label = domain.split(".")[0];
  let score = domain.endsWith(".ru") ? 8 : 0;
  if (domain.split(".").length === 2) score += 10;
  if (/bank|банк/iu.test(domain)) score += 12;
  if (identityTokens.some((token) => label.includes(token) || token.includes(label))) score += 40;
  if (/^(?:app|lk|online|enter|chat|old|test|dev|research|events|card|credit|business)\./iu.test(domain)) score -= 20;
  return score - domain.length / 100;
}

function parseBankRegistry(html: string): IndustryRegistryCandidate[] {
  const candidates: IndustryRegistryCandidate[] = [];
  const seen = new Set<string>();
  const rows = [...html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/giu)].map((match) => match[1]);
  for (const row of rows) {
    const cells = [...row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/giu)].map((match) => match[1]);
    if (cells.length < 4) continue;
    const name = pageText(cells[2]);
    if (!/банк|(?:^|\s)(?:кб|акб|каб)(?:\s|$)/iu.test(name)) continue;
    const urls = [...cells[3].matchAll(/href=["'](https?:\/\/[^"']+)["']/giu)].map((match) => match[1]);
    const domains = [...new Set(domainsFromUrls(urls).map(registrableDomain))];
    const domain = domains.sort((a, b) => organizationDomainScore(b, name) - organizationDomainScore(a, name))[0];
    if (!domain || seen.has(domain)) continue;
    seen.add(domain);
    candidates.push({ domain, name, source: BANK_REGISTRY_SOURCE });
  }
  return candidates;
}

async function bankRegistryCandidates(): Promise<IndustryRegistryCandidate[]> {
  try { return parseBankRegistry(await fetchText(BANK_REGISTRY_SOURCE, 15000)); }
  catch { return []; }
}

type YandexSearchCredentials = { apiKey: string; folderId: string };
type YandexSearchPayload = { rawData?: string };

const YANDEX_SEARCH_ENDPOINT = "https://searchapi.api.cloud.yandex.net/v2/web/search";
let yandexSearchCredentialsCache: YandexSearchCredentials | null | undefined;

async function yandexSearchCredentials(): Promise<YandexSearchCredentials | null> {
  if (yandexSearchCredentialsCache !== undefined) return yandexSearchCredentialsCache;
  let runtimeEnv: Record<string, unknown> = {};
  try {
    const runtime = await import("cloudflare:workers");
    runtimeEnv = runtime.env as Record<string, unknown>;
  } catch { /* Local tests can use process environment variables. */ }
  const apiKey = String(runtimeEnv.YANDEX_SEARCH_API_KEY || process.env.YANDEX_SEARCH_API_KEY || "").trim();
  const folderId = String(runtimeEnv.YANDEX_SEARCH_FOLDER_ID || process.env.YANDEX_SEARCH_FOLDER_ID || "").trim();
  yandexSearchCredentialsCache = apiKey && folderId ? { apiKey, folderId } : null;
  return yandexSearchCredentialsCache;
}

function decodeBase64Utf8(value: string): string {
  const binary = atob(value);
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function decodeXmlText(value: string): string {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/<[^>]+>/g, " ")
    .replace(/&quot;/g, '"')
    .replace(/&apos;|&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

function xmlValues(xml: string, tag: string): string[] {
  return [...xml.matchAll(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`, "giu"))]
    .map((match) => decodeXmlText(match[1]))
    .filter(Boolean);
}

async function searchYandexApi(query: string, page: number): Promise<SearchResponse> {
  const credentials = await yandexSearchCredentials();
  if (!credentials) throw new Error("Yandex Search API не настроен.");
  const response = await fetch(YANDEX_SEARCH_ENDPOINT, {
    method: "POST",
    headers: {
      "Authorization": `Api-Key ${credentials.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      query: {
        searchType: "SEARCH_TYPE_RU",
        queryText: query,
        familyMode: "FAMILY_MODE_NONE",
        fixTypoMode: "FIX_TYPO_MODE_ON",
        page,
      },
      folderId: credentials.folderId,
      groupSpec: {
        groupMode: "GROUP_MODE_DEEP",
        groupsOnPage: 50,
        docsInGroup: 1,
      },
      l10n: "LOCALIZATION_RU",
      region: "225",
      responseFormat: "FORMAT_XML",
    }),
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw new Error(`Yandex Search API: HTTP ${response.status}`);
  const payload = await response.json() as YandexSearchPayload;
  if (!payload.rawData) throw new Error("Yandex Search API вернул пустой ответ.");
  const xml = decodeBase64Utf8(payload.rawData);
  const evidence: Record<string, string> = {};
  const mapLeads: string[] = [];
  const groups = [...xml.matchAll(/<group(?:\s[^>]*)?>([\s\S]*?)<\/group>/giu)].map((match) => match[1]);
  for (const group of groups) {
    const documentXml = group.match(/<doc(?:\s[^>]*)?>([\s\S]*?)<\/doc>/iu)?.[1] || group;
    const resultUrl = xmlValues(documentXml, "url")[0];
    if (!resultUrl) continue;
    let rawDomain = "";
    try { rawDomain = normalizeDomain(new URL(resultUrl).hostname); } catch { continue; }
    const title = xmlValues(documentXml, "title")[0] || "";
    if (rawDomain === "2gis.ru" || rawDomain.endsWith(".2gis.ru") || (rawDomain.endsWith("yandex.ru") && resultUrl.includes("/maps"))) {
      const lead = mapLeadName(title);
      if (lead.length >= 2 && !/^(2гис|яндекс карты|поиск|карта)$/iu.test(lead) && !mapLeads.includes(lead)) mapLeads.push(lead);
      continue;
    }
    const domain = domainsFromUrls([resultUrl])[0];
    if (!domain) continue;
    const passages = xmlValues(documentXml, "passage").join(" ");
    const headline = xmlValues(documentXml, "headline").join(" ");
    evidence[domain] = `${evidence[domain] || ""} ${title} ${headline} ${passages}`.replace(/\s+/g, " ").trim();
  }
  const domains = Object.keys(evidence);
  if (domains.length === 0 && mapLeads.length === 0) throw new Error("Yandex Search API не вернул сайты по запросу.");
  const source = `https://yandex.ru/search/?text=${encodeURIComponent(query)}&p=${page}`;
  return { domains, source, html: xml, evidence, mapLeads };
}

const FALLBACK_SEARX_INSTANCES = [
  "https://search.mectov.my.id/",
  "https://searx.perennialte.ch/",
  "https://searxng.gr/",
  "https://search.mdosch.de/",
  "https://etsi.me/",
];
let searxRegistryCache: { expiresAt: number; urls: string[] } | null = null;
let searxRegistryRequest: Promise<string[]> | null = null;

async function availableSearxInstances(): Promise<string[]> {
  if (searxRegistryCache && searxRegistryCache.expiresAt > Date.now()) return searxRegistryCache.urls;
  if (!searxRegistryRequest) {
    searxRegistryRequest = (async () => {
      let urls = [...FALLBACK_SEARX_INSTANCES];
      try {
        const registry = JSON.parse(await fetchText("https://searx.space/data/instances.json", 8000)) as {
          instances?: Record<string, {
            network_type?: string;
            http?: { status_code?: number };
            timing?: { search?: { success_percentage?: number; all?: { median?: number } } };
          }>;
        };
        const healthy = Object.entries(registry.instances || {})
          .filter(([url, details]) => url.startsWith("https://")
            && details.network_type === "normal"
            && details.http?.status_code === 200
            && (details.timing?.search?.success_percentage || 0) >= 90)
          .sort((a, b) => (a[1].timing?.search?.all?.median || 99) - (b[1].timing?.search?.all?.median || 99))
          .map(([url]) => url.endsWith("/") ? url : `${url}/`);
        urls = [...new Set([...FALLBACK_SEARX_INSTANCES, ...healthy])].slice(0, 16);
      } catch { /* Static fallbacks keep the service working if the registry is unavailable. */ }
      searxRegistryCache = { expiresAt: Date.now() + 30 * 60 * 1000, urls };
      return urls;
    })();
  }
  try { return await searxRegistryRequest; }
  finally { searxRegistryRequest = null; }
}

function stableHash(value: string): number {
  let hash = 0;
  for (const character of value) hash = ((hash * 31) + character.charCodeAt(0)) >>> 0;
  return hash;
}

function mapLeadName(title: string): string {
  return title.replace(/\s+(?:в|на)\s+(?:2ГИС|Яндекс Картах?).*$/iu, "")
    .replace(/\s*[|–—-]\s*(?:2ГИС|Яндекс Карты?).*$/iu, "")
    .split(",")[0].trim().slice(0, 80);
}

async function searchSearx(baseUrl: string, query: string, page: number): Promise<SearchResponse> {
  const source = `${baseUrl}search?q=${encodeURIComponent(query)}&format=json&language=ru&pageno=${page + 1}`;
  const payload = JSON.parse(await fetchText(source, 7000)) as { results?: Array<{ url?: string; title?: string; content?: string }> };
  const evidence: Record<string, string> = {};
  const mapLeads: string[] = [];
  for (const result of payload.results || []) {
    if (!result.url) continue;
    let rawDomain = "";
    try { rawDomain = normalizeDomain(new URL(result.url).hostname); } catch { continue; }
    if (rawDomain === "2gis.ru" || rawDomain.endsWith(".2gis.ru") || (rawDomain.endsWith("yandex.ru") && result.url.includes("/maps"))) {
      const lead = mapLeadName(result.title || "");
      if (lead.length >= 2 && !/^(2гис|яндекс карты|поиск|карта)$/iu.test(lead) && !mapLeads.includes(lead)) mapLeads.push(lead);
      continue;
    }
    const domain = domainsFromUrls([result.url])[0];
    if (!domain) continue;
    evidence[domain] = `${evidence[domain] || ""} ${result.title || ""} ${result.content || ""}`.trim();
  }
  const domains = Object.keys(evidence);
  if (domains.length === 0 && mapLeads.length === 0) throw new Error("Поисковая выдача не содержит сайтов.");
  return { domains, source, html: JSON.stringify(payload), evidence, mapLeads };
}

function directProviderSources(query: string, page: number): string[][] {
  const encoded = encodeURIComponent(query);
  const offset = page * 30;
  const bingFirst = page * 10 + 1;
  return [
    [`https://html.duckduckgo.com/html/?q=${encoded}&s=${offset}`, `https://lite.duckduckgo.com/lite/?q=${encoded}&s=${offset}`],
    [`https://www.bing.com/search?q=${encoded}&count=10&first=${bingFirst}`, `https://r.jina.ai/http://www.bing.com/search?q=${encoded}&count=10&first=${bingFirst}`],
    [`https://search.brave.com/search?q=${encoded}&source=web&offset=${page}`, `https://r.jina.ai/http://search.brave.com/search?q=${encoded}&source=web&offset=${page}`],
    [`https://www.google.com/search?q=${encoded}&start=${offset}`, `https://r.jina.ai/http://www.google.com/search?q=${encoded}&start=${offset}`],
    [`https://yandex.ru/search/?text=${encoded}&p=${page}`, `https://r.jina.ai/http://yandex.ru/search/?text=${encoded}&p=${page}`],
  ];
}

async function searchDirectSources(sources: string[]): Promise<SearchResponse> {
  let lastError: unknown;
  for (const source of sources) {
    try {
      const html = await fetchText(source, 7000);
      const domains = domainsFromSearchHtml(html);
      if (domains.length > 0) return { domains, source, html, evidence: {}, mapLeads: [] };
      lastError = new Error("Поисковая выдача не содержит сайтов.");
    } catch (error) { lastError = error; }
  }
  throw lastError instanceof Error ? lastError : new Error("Открытые поисковые источники недоступны.");
}

async function searchWeb(query: string, page = 0): Promise<SearchResponse> {
  let lastError: unknown;
  try { return await searchYandexApi(query, page); }
  catch (error) { lastError = error; }
  if (page < 2) {
    try {
      const instances = await availableSearxInstances();
      const selected = instances[stableHash(`${query}:${page}`) % Math.min(2, instances.length)];
      return await searchSearx(selected, query, page);
    } catch (error) { lastError = error; }
  }
  const providerGroups = directProviderSources(query, page);
  try { return await searchDirectSources(providerGroups[page % providerGroups.length]); }
  catch (error) { lastError = error; }
  throw lastError instanceof Error ? lastError : new Error("Открытые поисковые источники недоступны.");
}

async function searchWebRescue(query: string): Promise<SearchResponse> {
  let lastError: unknown;
  for (let page = 0; page < 3; page += 1) {
    try { return await searchYandexApi(query, page); }
    catch (error) { lastError = error; }
  }
  const instances = await availableSearxInstances();
  for (const instance of instances.slice(0, 12)) {
    try { return await searchSearx(instance, query, 0); }
    catch (error) { lastError = error; }
  }
  for (const sources of directProviderSources(query, 0)) {
    try { return await searchDirectSources(sources); }
    catch (error) { lastError = error; }
  }
  throw lastError instanceof Error ? lastError : new Error("Все поисковые источники временно недоступны.");
}

async function mapWithConcurrency<T, R>(items: T[], concurrency: number, task: (item: T) => Promise<R>): Promise<PromiseSettledResult<R>[]> {
  const results = new Array<PromiseSettledResult<R>>(items.length);
  let cursor = 0;
  async function worker() {
    while (cursor < items.length) {
      const index = cursor++;
      try { results[index] = { status: "fulfilled", value: await task(items[index]) }; }
      catch (reason) { results[index] = { status: "rejected", reason }; }
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));
  return results;
}

function regulationSourceLinks(base: string, region: string): string[] {
  const query = `${base} ${region}`.trim();
  const encoded = encodeURIComponent(query);
  return [
    `https://www.google.com/search?q=${encoded}`,
    `https://yandex.ru/search/?text=${encoded}`,
    `https://yandex.ru/maps/?text=${encoded}`,
    `https://2gis.ru/search/${encoded}`,
    `https://www.perplexity.ai/search?q=${encoded}`,
    `https://www.youtube.com/results?search_query=${encoded}`,
    `https://vk.com/search?c%5Bq%5D=${encoded}`,
    `https://t.me/s/${encodeURIComponent(base.split(" ").slice(0, 2).join("_"))}`,
    "https://checko.ru/",
    "https://www.rusprofile.ru/",
  ];
}

function capitalizeSentences(row: AnalysisRow): AnalysisRow {
  const normalized = { ...row };
  for (const column of COLUMNS) {
    if (column === "Название" || column === "Сайт") continue;
    normalized[column] = normalized[column].replace(/(^|[.!?]\s+)([a-zа-яё])/giu, (_match, prefix: string, letter: string) => `${prefix}${letter.toUpperCase()}`);
  }
  return normalized;
}

function findAny(text: string, words: string[]): boolean { const lower = text.toLowerCase(); return words.some((word) => lower.includes(word)); }
function listFound(text: string, mapping: Record<string, string>): string { const lower = text.toLowerCase(); return Object.entries(mapping).filter(([key]) => lower.includes(key)).map(([, value]) => value).join(", "); }

const MIN_COMPETITOR_RELEVANCE = 6;

function relevanceScore(primaryText: string, bodyText: string, description: string, searchEvidence = ""): number {
  const ignored = new Set([
    "онлайн", "сервис", "сервисы", "услуга", "услуги", "компания", "компании", "проект", "продукт", "работа",
    "клиент", "клиенты", "решение", "решения", "российский", "создание", "создании", "помогает", "предлагает",
    "бизнес", "юридический", "юридических", "предприниматель", "предпринимателей", "малого", "среднего",
  ]);
  const words = searchWords(description).filter((word) => !ignored.has(word));
  const meaningfulStems = words.map(wordStem);
  const stems = [...new Set(meaningfulStems)];
  const stemCounts = meaningfulStems.reduce((counts, stem) => counts.set(stem, (counts.get(stem) || 0) + 1), new Map<string, number>());
  const segmentStem = /^(предпри|юридич|бизнес|корпора|малого|среднег|частных|клиент|детей|родител|студент|специал|пациен|покупат|потреби|российс)/;
  const categoryStems = stems.filter((stem) => !segmentStem.test(stem))
    .sort((a, b) => (stemCounts.get(b) || 0) - (stemCounts.get(a) || 0))
    .slice(0, 4);
  const primary = primaryText.toLowerCase();
  const body = bodyText.toLowerCase().slice(0, 3000);
  const evidence = searchEvidence.toLowerCase();
  const informationalMarkers = [
    "энциклопед", "википед", "каталог", "рейтинг", "обзор", "блог", "журнал", "новост", "форум", "урок",
    "справочник", "часы работы", "адреса отделений", "адреса банкомат", "маркетплейс", "центральный банк", "регулятор",
    "финансовый портал", "кредитный брокер", "агрегатор", "исследовательская компания",
    "исследования рынка", "отраслевая аналитика", "аналитический портал", "информационный портал", "рейтинг банков",
    "сравнение банков", "выбрать банк", "все банки россии",
  ];
  const descriptionLower = description.toLowerCase();
  const introductoryText = `${primary} ${body.slice(0, 800)}`;
  const retailOrManufacturing = /интернет-?магазин|книжн.{0,18}магазин|издательств|купить.{0,35}книг|производител.{0,35}оборудован|оборудован.{0,35}производител/iu;
  const mediaOrPublication = /(?:^|\s)сми(?:\s|$)|новост|журнал|статьи компании|дискуссионн.{0,45}пространств|информационн.{0,45}пространств/iu;
  const businessOnly = /для (?:средн|крупн|мал).{0,18}компани|для бизнеса|бизнес-процесс|сотрудничеств.{0,25}исполнител|\bb2b\b/iu;
  if (retailOrManufacturing.test(primary) && !retailOrManufacturing.test(descriptionLower)) return 0;
  if (mediaOrPublication.test(primary) && !mediaOrPublication.test(descriptionLower)) return 0;
  if (businessOnly.test(primary) && !businessOnly.test(descriptionLower)) return 0;
  if (informationalMarkers.some((marker) => primary.includes(marker) && !descriptionLower.includes(marker))) return 0;
  const strongInformationalMarkers = [
    "исследовательская компания", "исследования рынка", "отраслевая аналитика", "аналитический портал",
    "информационный портал", "рейтинг банков", "сравнение банков", "выбрать банк", "все банки россии",
  ];
  if (strongInformationalMarkers.some((marker) => introductoryText.includes(marker) && !descriptionLower.includes(marker))) return 0;
  if (categoryStems.length > 0 && !categoryStems.some((stem) => `${primary} ${evidence}`.includes(stem))) return 0;
  const industryRules = [
    { signal: /(?:^|\s)банк(?:\s|$)|банковск/iu, terms: /банк|банковск|bank/iu },
  ];
  const matchingIndustry = industryRules.find((rule) => rule.signal.test(descriptionLower));
  const bankAdjacent = /электронн.{0,24}(?:торг|площад)|торгов.{0,24}площад|закупк|тендер|бухгалтер|отч[её]тност|оператор электрон/iu;
  if (matchingIndustry && bankAdjacent.test(primary) && !bankAdjacent.test(descriptionLower)) return 0;
  if (matchingIndustry && !matchingIndustry.terms.test(primary)) return 0;
  const candidateText = `${primary} ${body} ${evidence}`;
  const segmentRules = [
    { signal: /предприним|юридическ.{0,12}лиц|малого.{0,15}бизнес|среднего.{0,15}бизнес|\bb2b\b|корпоративн/, terms: /предприним|для бизнеса|бизнесу|юридическ|корпоративн|компани|организаци|\bb2b\b/ },
    { signal: /детск|для детей|родител/, terms: /детск|для детей|реб[её]н|подрост|родител/ },
    { signal: /физическ.{0,12}лиц|частн.{0,10}клиент|розничн/, terms: /физическ.{0,12}лиц|частн.{0,10}клиент|розничн/ },
  ];
  if (segmentRules.some((rule) => rule.signal.test(descriptionLower) && !rule.terms.test(candidateText))) return 0;
  const primaryMatches = stems.filter((stem) => `${primary} ${evidence}`.includes(stem)).length;
  const bodyMatches = stems.filter((stem) => body.includes(stem)).length;
  const primaryCategoryMatches = categoryStems.filter((stem) => primary.includes(stem)).length;
  const categoryMatches = categoryStems.filter((stem) => candidateText.includes(stem)).length;
  if (categoryStems.length >= 2 && primaryCategoryMatches === 0) return 0;
  if (categoryStems.length >= 2 && categoryMatches < 2) return 0;
  return primaryMatches * 3 + bodyMatches + (matchingIndustry ? 3 : 0);
}

function price(text: string): string {
  const match = text.match(/(?:от\s*)?\d[\d\s]{2,12}\s?(?:₽|руб(?:лей)?)/i);
  return match ? match[0].replace(/\s+/g, " ") : "Цена на сайте не указана.";
}

function registrableDomain(domain: string): string {
  const parts = normalizeDomain(domain).split(".");
  return parts.length > 1 ? parts.slice(-2).join(".") : domain;
}

function contactChannels(html: string, text: string): string {
  const channels = ["Сайт"];
  if (/tel:/i.test(html) || /\+?\d[\d\s()-]{8,}/.test(text)) channels.push("телефон");
  if (/mailto:/i.test(html) || /[\w.+-]+@[\w.-]+\.[a-z]{2,}/i.test(text)) channels.push("email");
  if (/whatsapp/i.test(html)) channels.push("WhatsApp");
  if (/telegram|t\.me/i.test(html)) channels.push("Telegram");
  if (/vk\.com|vkontakte/i.test(html)) channels.push("VK");
  if (/форма|заявк|обратн.*звон/i.test(text)) channels.push("форма заявки");
  return [...new Set(channels)].join(", ");
}

async function legalLookup(domain: string): Promise<{ okved: string; turnover: string; source: string }> {
  const source = `https://checko.ru/search?query=${encodeURIComponent(domain)}`;
  try {
    const text = pageText(await fetchText(source, 7000));
    const okved = text.match(/ОКВЭД[^\d]{0,28}(\d{2}\.\d{1,2}(?:\.\d{1,2})?)/i)?.[1];
    const turnover = text.match(/выручк[а-я]*[^\d]{0,28}([\d\s,.]+(?:млн|млрд)?\s*(?:₽|руб(?:лей)?))/i)?.[1];
    return { okved: okved || "Не подтверждено: требуется проверка юрданных.", turnover: turnover || "Не подтверждено: выручка не найдена в открытой выдаче.", source };
  } catch {
    return { okved: "Не подтверждено: требуется проверка юрданных.", turnover: "Не подтверждено: выручка не найдена в открытой выдаче.", source: "" };
  }
}

async function analyzeDomain(domain: string, input: AnalysisInput, isClient: boolean, skipLegal = false, relevanceContext = input.description, searchEvidence = "", fastFetch = false): Promise<{ row: AnalysisRow; sources: string[]; relevance: number }> {
  const url = `https://${domain}/`;
  let html = "";
  let text = "";
  let title = domain;
  let siteName = "";
  let errorNote = "";
  try {
    html = await fetchText(url, fastFetch ? 7000 : 15000);
    text = pageText(html);
    siteName = siteNameFromHtml(html);
    title = titleFromHtml(html) || domain;
  } catch (directError) {
    try {
      html = await fetchText(`https://r.jina.ai/https://${domain}/`, fastFetch ? 4500 : 8000);
      text = pageText(html);
      title = html.match(/^Title:\s*(.+)$/mi)?.[1]?.trim() || domain;
    } catch {
      errorNote = ` Страница не открылась автоматически: ${directError instanceof Error ? directError.message : "ошибка сети"}.`;
    }
  }
  const metaDescription = metaDescriptionFromHtml(html) || readerDescription(html) || firstUsefulSentence(searchEvidence);
  const inputProduct = firstUsefulSentence(input.description, "Описание продукта не указано.");
  const siteProduct = firstUsefulSentence(metaDescription, title);
  const product = isClient ? inputProduct : siteProduct;
  const assortment = listFound(text, {
    "консультац": "консультации", "подписк": "подписка", "отчет": "отчеты", "курс": "курсы", "вебинар": "вебинары",
    "тест": "тесты", "дневник": "дневник", "чат": "чат", "приложен": "приложение", "психолог": "работа с психологом",
    "карниз": "карнизы", "наличник": "наличники", "колонн": "колонны", "пилястр": "пилястры", "балюстр": "балюстрады",
    "доставк": "доставка", "монтаж": "монтаж", "проектирован": "проектирование",
  }) || `Основное предложение: ${siteProduct}`;
  const usp = listFound(text, {
    "бесплатн": "бесплатный доступ или материалы", "пробн": "пробный период", "24/7": "доступ 24/7",
    "персональн": "персонализация", "индивидуальн": "индивидуальный подход", "конфиденц": "конфиденциальность",
    "доказательн": "доказательный подход", "лиценз": "лицензии", "сертификат": "сертификаты",
    "собственн": "собственная разработка или производство", "под ключ": "решение под ключ", "гарант": "гарантия",
  }) || "Явное УТП автоматически не выделено.";
  const geography = listFound(text, { "моск": "Москва", "санкт-петербург": "Санкт-Петербург", "ленинград": "Ленинградская область", "нижн.*новгород": "Нижний Новгород", "по россии": "работа по РФ", "по всей россии": "работа по РФ", "онлайн": "онлайн / без географических ограничений" }) || input.region;
  const isDigitalService = findAny(`${input.description} ${text}`, ["онлайн", "сервис", "платформ", "приложен", "подписк", "консультац"]);
  const production = isDigitalService ? "Не применимо: цифровой сервис или услуга" : findAny(text, ["собственное производство", "производим", "изготавливаем", "производство"]) ? "Да" : "Не подтверждено на доступной странице";
  const custom = findAny(text, ["индивидуальн", "персональн", "по проекту", "подбор", "нестандарт", "под заказ", "эскиз"]) ? "Да" : "Не указано";
  const cases = findAny(text, ["портфолио", "наши объекты", "реализованные объекты", "кейсы", "истории клиентов", "отзывы", "проекты"]) ? "Да, найдены кейсы, отзывы или упоминания результатов" : "Не найдено на доступной странице";
  const currentPrice = price(text);
  const channels = contactChannels(html, text);
  const strengths = [usp.startsWith("Явное") ? "" : `выделены преимущества: ${usp}`, cases.startsWith("Да") ? "есть подтверждение результатами или отзывами" : "", channels.split(",").length > 2 ? "несколько каналов связи" : ""].filter(Boolean).join("; ") || "Сильные стороны требуют дополнительной экспертной оценки.";
  const weaknesses = [currentPrice.startsWith("Цена на") ? "нет прозрачной цены" : "", cases.startsWith("Да") ? "" : "не найдены подробные кейсы или отзывы", errorNote ? "ограниченный автоматический доступ к сайту" : ""].filter(Boolean).join("; ");
  const legal = skipLegal ? { okved: "", turnover: "", source: "" } : await legalLookup(domain);
  const titleName = title.split(/[|–—-]/)[0].trim();
  const titleIsGeneric = titleName === domain || titleName.length > 60 || /^(главная|официальный сайт|психологи онлайн|поиск|приём|каталог|интернет)$/i.test(titleName);
  const siteNameIsGeneric = siteName.length > 18 && /психолог|консультац|онлайн/i.test(siteName);
  const displayName = ((siteName && !siteNameIsGeneric ? siteName : "") || (titleIsGeneric ? brandNameFromDomain(domain) : titleName) || brandNameFromDomain(domain)).slice(0, 100);
  return {
    row: {
      "Название": isClient ? `${displayName} (клиент)` : displayName,
      "Сайт": domain,
      "Тип продукта": product,
      "Ассортимент": assortment,
      "УТП": usp,
      "Ценовой сегмент": currentPrice,
      "География": geography,
      "Производство": production,
      "Индивидуальные решения": custom,
      "Каналы": channels,
      "Кейсы": cases,
      "Сильные стороны": strengths,
      "Слабые стороны": weaknesses || "Не удалось автоматически выделить.",
      "Особенности": isClient ? `Клиент / эталон для сравнения. ${inputProduct}` : `${siteProduct}.${errorNote}`,
      "ОКВЭД": legal.okved,
      "Оборотка": legal.turnover,
    },
    sources: [url, legal.source].filter(Boolean),
    relevance: relevanceScore(`${title} ${metaDescription}`, text, relevanceContext, searchEvidence),
  };
}

export async function analyzeProject(input: AnalysisInput): Promise<AnalysisResult> {
  const startedAt = Date.now();
  let normalizedUrl = input.projectUrl.trim();
  if (!/^https?:\/\//i.test(normalizedUrl)) normalizedUrl = `https://${normalizedUrl}`;
  const clientDomain = normalizeDomain(normalizedUrl);
  if (!clientDomain || !clientDomain.includes(".")) throw new Error("Укажите корректную ссылку на сайт компании.");
  const projectContext = await projectSearchContext(input, clientDomain);
  const queries = makeQueries(input, clientDomain, projectContext.text, projectContext.brandStems);
  const basePhrase = compactSearchPhrase(projectContext.text, projectContext.brandStems);
  const relevanceContext = input.description.trim() || projectContext.text;
  const sources: string[] = [normalizedUrl, ...regulationSourceLinks(basePhrase, input.region)];
  const clientDomainLabel = clientDomain.split(".")[0].replace(/[^a-zа-яё0-9]/giu, "");
  const isBankProject = /(?:^|\s)банк(?:\s|$)|банковск/iu.test(input.description);

  const counts = new Map<string, number>();
  const evidenceByDomain = new Map<string, string>();
  const mapLeads = new Set<string>();
  const searchTasks = queries.flatMap((query) => [0, 1, 2].map((page) => ({ query, page })));
  const [searchResults, industryRegistryCandidates] = await Promise.all([
    mapWithConcurrency(searchTasks, 2, ({ query, page }) => searchWeb(query, page)),
    isBankProject ? bankRegistryCandidates() : Promise.resolve([]),
  ]);
  const verifiedIndustryDomains = new Set(industryRegistryCandidates.map((candidate) => registrableDomain(candidate.domain)));
  const verifiedIndustryNames = new Map(industryRegistryCandidates.map((candidate) => [registrableDomain(candidate.domain), candidate.name]));
  if (industryRegistryCandidates.length > 0) sources.push(BANK_REGISTRY_SOURCE);
  for (const candidate of industryRegistryCandidates) {
    if (candidate.domain === clientDomain || candidate.domain.endsWith(`.${clientDomain}`)) continue;
    counts.set(candidate.domain, Math.max(4, counts.get(candidate.domain) || 0));
    evidenceByDomain.set(candidate.domain, `${candidate.name}. Банк, действующая кредитная организация. Официальный сайт по данным Банка России.`);
  }
  for (const settled of searchResults) {
    if (settled.status === "fulfilled") {
      const result = settled.value;
      sources.push(result.source);
      result.mapLeads.forEach((lead) => mapLeads.add(lead));
      for (const domain of result.domains) {
        const candidateLabel = domain.split(".")[0].replace(/[^a-zа-яё0-9]/giu, "");
        const repeatsClientBrand = clientDomainLabel.length >= 4 && candidateLabel.includes(clientDomainLabel);
        if (domain !== clientDomain && !domain.endsWith(`.${clientDomain}`) && !repeatsClientBrand) {
          counts.set(domain, (counts.get(domain) || 0) + 1);
          const evidence = result.evidence[domain];
          if (evidence) evidenceByDomain.set(domain, `${evidenceByDomain.get(domain) || ""} ${evidence}`.trim());
        }
      }
    }
  }
  if (counts.size === 0) {
    const rescueQueries = [...new Set([queries[0], queries[1], `${basePhrase} конкуренты аналоги ${input.region}`])].filter(Boolean);
    for (const query of rescueQueries) {
      try {
        const result = await searchWebRescue(query);
        sources.push(result.source);
        result.mapLeads.forEach((lead) => mapLeads.add(lead));
        for (const domain of result.domains) {
          if (domain === clientDomain || domain.endsWith(`.${clientDomain}`)) continue;
          counts.set(domain, (counts.get(domain) || 0) + 1);
          const evidence = result.evidence[domain];
          if (evidence) evidenceByDomain.set(domain, `${evidenceByDomain.get(domain) || ""} ${evidence}`.trim());
        }
        if (counts.size > 0) break;
      } catch { /* Try the next broad rescue query before returning an error. */ }
    }
  }
  if (mapLeads.size > 0) {
    const leadSearches = await mapWithConcurrency([...mapLeads], 2, (lead) => searchWeb(`${lead} ${basePhrase} официальный сайт ${input.region}`, 0));
    for (const settled of leadSearches) {
      if (settled.status !== "fulfilled") continue;
      sources.push(settled.value.source);
      for (const domain of settled.value.domains) {
        if (domain === clientDomain || domain.endsWith(`.${clientDomain}`)) continue;
        counts.set(domain, (counts.get(domain) || 0) + 1);
        const evidence = settled.value.evidence[domain];
        if (evidence) evidenceByDomain.set(domain, `${evidenceByDomain.get(domain) || ""} ${evidence}`.trim());
      }
    }
  }
  const seenDomains = new Set<string>();
  const candidates = [...counts.entries()].sort((a, b) => b[1] - a[1]).filter(([domain]) => {
    if (domain.endsWith(".blog") && !/блог|медиа|журнал|издани/i.test(input.description)) return false;
    const base = registrableDomain(domain);
    if (industryRegistryCandidates.length > 0 && !verifiedIndustryDomains.has(base)) return false;
    if (seenDomains.has(base)) return false;
    seenDomains.add(base);
    return true;
  });
  if (candidates.length === 0) throw new Error("Не удалось получить актуальную выдачу. Повторите запуск позже или проверьте доступность поисковых источников.");
  const relevantCandidates = candidates.filter(([domain]) => {
    const evidence = evidenceByDomain.get(domain) || "";
    return verifiedIndustryDomains.has(registrableDomain(domain)) || !evidence || relevanceScore(evidence, evidence, relevanceContext, evidence) >= MIN_COMPETITOR_RELEVANCE;
  });
  if (relevantCandidates.length === 0) throw new Error("Поисковая выдача получена, но прямые конкуренты не подтверждены по описаниям результатов.");
  const clientPromise = analyzeDomain(clientDomain, input, true);
  const checkedCandidates = (await mapWithConcurrency(relevantCandidates, isBankProject ? 32 : 16, async ([domain, mentions]) => {
    const registryDomain = registrableDomain(domain);
    const verified = verifiedIndustryDomains.has(registryDomain);
    const analyzed = await analyzeDomain(domain, input, false, true, relevanceContext, evidenceByDomain.get(domain) || "", verified);
    if (verified) {
      analyzed.relevance = Math.max(analyzed.relevance, MIN_COMPETITOR_RELEVANCE);
      analyzed.row["Название"] = verifiedIndustryNames.get(registryDomain) || analyzed.row["Название"];
    }
    return { domain, mentions, ...analyzed };
  }))
    .flatMap((settled) => settled.status === "fulfilled" ? [settled.value] : []);
  const client = await clientPromise;
  let competitors = checkedCandidates
    .filter((candidate) => candidate.relevance >= MIN_COMPETITOR_RELEVANCE)
    .sort((a, b) => b.relevance - a.relevance || b.mentions - a.mentions);
  if (competitors.length === 0) throw new Error("Поисковая выдача получена, но прямые конкуренты не подтверждены по содержанию их сайтов.");

  const knownBases = new Set(candidates.map(([domain]) => registrableDomain(domain)));
  for (let round = 0; round < 2 && industryRegistryCandidates.length === 0 && Date.now() - startedAt < 80000; round += 1) {
    const expansionBase = basePhrase;
    if (!expansionBase) break;
    const expansionQueries = [
      `${expansionBase} ${input.region}`,
      `${expansionBase} компании сервисы услуги ${input.region}`,
      `${expansionBase} конкуренты аналоги список ${input.region}`,
      `${expansionBase} платформы центры производители ${input.region}`,
    ];
    const expansionTasks = expansionQueries.flatMap((query) => [0, 1, 2].map((page) => ({ query, page })));
    const expansionSearches = await mapWithConcurrency(expansionTasks, 2, ({ query, page }) => searchWeb(query, page));
    const newlyFound = new Map<string, number>();
    for (const settled of expansionSearches) {
      if (settled.status !== "fulfilled") continue;
      sources.push(settled.value.source);
      for (const domain of settled.value.domains) {
        const base = registrableDomain(domain);
        if (knownBases.has(base) || domain === clientDomain || domain.endsWith(`.${clientDomain}`)) continue;
        if (domain.endsWith(".blog") && !/блог|медиа|журнал|издани/i.test(input.description)) continue;
        knownBases.add(base);
        newlyFound.set(domain, (newlyFound.get(domain) || 0) + 1);
        const evidence = settled.value.evidence[domain];
        if (evidence) evidenceByDomain.set(domain, `${evidenceByDomain.get(domain) || ""} ${evidence}`.trim());
      }
    }
    if (newlyFound.size === 0) break;
    const relevantNewEntries = [...newlyFound.entries()].filter(([domain]) => {
      const evidence = evidenceByDomain.get(domain) || "";
      return !evidence || relevanceScore(evidence, evidence, relevanceContext, evidence) >= MIN_COMPETITOR_RELEVANCE;
    });
    const expandedCandidates = (await mapWithConcurrency(relevantNewEntries, 16, async ([domain, mentions]) => ({ domain, mentions, ...(await analyzeDomain(domain, input, false, true, relevanceContext, evidenceByDomain.get(domain) || "")) })))
      .flatMap((settled) => settled.status === "fulfilled" && settled.value.relevance >= MIN_COMPETITOR_RELEVANCE ? [settled.value] : []);
    if (expandedCandidates.length === 0) break;
    competitors = [...competitors, ...expandedCandidates]
      .sort((a, b) => b.relevance - a.relevance || b.mentions - a.mentions);
  }

  await mapWithConcurrency(competitors, 8, async (competitor) => {
    const registryDomain = registrableDomain(competitor.domain);
    if (verifiedIndustryDomains.has(registryDomain)) {
      competitor.row["ОКВЭД"] = "Юрстатус подтверждён реестром Банка России; код ОКВЭД требует отдельной проверки.";
      competitor.row["Оборотка"] = "Не подтверждено: выручка не опубликована в реестре Банка России.";
      competitor.sources.push(BANK_REGISTRY_SOURCE);
      return;
    }
    const legal = await legalLookup(competitor.domain);
    competitor.row["ОКВЭД"] = legal.okved;
    competitor.row["Оборотка"] = legal.turnover;
    if (legal.source) competitor.sources.push(legal.source);
  });
  const rows = [client.row, ...competitors.map((result) => result.row)].map(capitalizeSentences);
  for (const result of [client, ...competitors]) sources.push(...result.sources);
  return { rows, sources: [...new Set(sources)], queries, generatedAt: new Date().toISOString() };
}
