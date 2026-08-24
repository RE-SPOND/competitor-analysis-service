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
  "youtube.com", "vk.com", "ok.ru", "dzen.ru", "rutube.ru", "t.me",
  "2gis.ru", "checko.ru", "rusprofile.ru", "vc.ru", "t-j.ru", "wikipedia.org",
  "infoselection.ru", "habr.com", "dtf.ru", "medium.com", "reddit.com", "pikabu.ru", "mail.ru", "psymag.info",
  "rbc.ru", "rb.ru", "forbes.ru", "ria.ru", "smi2.ru", "sostav.ru", "cossa.ru", "adindex.ru",
  "irecommend.ru", "otzovik.com", "tobiz.net",
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

function mapLeadName(title: string): string {
  return title.replace(/\s+(?:в|на)\s+(?:2ГИС|Яндекс Картах?).*$/iu, "")
    .replace(/\s*[|–—-]\s*(?:2ГИС|Яндекс Карты?).*$/iu, "")
    .split(",")[0].trim().slice(0, 80);
}

async function searchWeb(query: string, page = 0): Promise<SearchResponse> {
  const providerPage = page;
  const offset = providerPage * 30;
  const bingFirst = providerPage * 10 + 1;
  const encoded = encodeURIComponent(query);
  const searxInstances = ["https://search.mdosch.de/", "https://etsi.me/"];
  const rotatedSearx = [...searxInstances.slice(page % searxInstances.length), ...searxInstances.slice(0, page % searxInstances.length)];
  for (const baseUrl of rotatedSearx) {
    const source = `${baseUrl}search?q=${encoded}&format=json&language=ru&pageno=${page + 1}`;
    try {
      const payload = JSON.parse(await fetchText(source, 6000)) as { results?: Array<{ url?: string; title?: string; content?: string }> };
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
      if (domains.length > 0 || mapLeads.length > 0) return { domains, source, html: JSON.stringify(payload), evidence, mapLeads };
    } catch { /* Continue with another metasearch instance or a direct provider. */ }
  }
  const providerSources = [
    [`https://html.duckduckgo.com/html/?q=${encoded}&s=${offset}`, `https://lite.duckduckgo.com/lite/?q=${encoded}&s=${offset}`],
    [`https://r.jina.ai/http://www.bing.com/search?q=${encoded}&count=10&first=${bingFirst}`, `https://www.bing.com/search?q=${encoded}&count=10&first=${bingFirst}`],
    [`https://r.jina.ai/http://search.brave.com/search?q=${encoded}&source=web&offset=${providerPage}`, `https://search.brave.com/search?q=${encoded}&source=web&offset=${providerPage}`],
    [`https://www.google.com/search?q=${encoded}&start=${offset}`, `https://r.jina.ai/http://www.google.com/search?q=${encoded}&start=${offset}`],
    [`https://yandex.ru/search/?text=${encoded}&p=${providerPage}`, `https://r.jina.ai/http://yandex.ru/search/?text=${encoded}&p=${providerPage}`],
  ];
  const preferredProvider = page % providerSources.length;
  const sources = providerSources[preferredProvider];
  let lastError: unknown;
  for (const source of sources) {
    try {
      const html = await fetchText(source, 6000);
      const domains = domainsFromSearchHtml(html);
      if (domains.length > 0) return { domains, source, html, evidence: {}, mapLeads: [] };
      lastError = new Error("Поисковая выдача не содержит сайтов.");
    } catch (error) { lastError = error; }
  }
  throw lastError instanceof Error ? lastError : new Error("Открытые поисковые источники недоступны.");
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

function relevanceScore(primaryText: string, bodyText: string, description: string): number {
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
  const informationalMarkers = [
    "энциклопед", "википед", "каталог", "рейтинг", "обзор", "блог", "журнал", "новост", "форум", "урок",
    "справочник", "часы работы", "адреса отделений", "адреса банкомат", "маркетплейс", "центральный банк", "регулятор",
    "финансовый портал", "кредитный брокер", "агрегатор", "исследовательская компания",
    "исследования рынка", "отраслевая аналитика", "аналитический портал", "информационный портал", "рейтинг банков",
    "сравнение банков", "выбрать банк", "все банки россии",
  ];
  const descriptionLower = description.toLowerCase();
  const introductoryText = `${primary} ${body.slice(0, 800)}`;
  if (informationalMarkers.some((marker) => primary.includes(marker) && !descriptionLower.includes(marker))) return 0;
  const strongInformationalMarkers = [
    "исследовательская компания", "исследования рынка", "отраслевая аналитика", "аналитический портал",
    "информационный портал", "рейтинг банков", "сравнение банков", "выбрать банк", "все банки россии",
  ];
  if (strongInformationalMarkers.some((marker) => introductoryText.includes(marker) && !descriptionLower.includes(marker))) return 0;
  if (categoryStems.length > 0 && !categoryStems.some((stem) => primary.includes(stem))) return 0;
  const candidateText = `${primary} ${body}`;
  const segmentRules = [
    { signal: /предприним|юридическ.{0,12}лиц|малого.{0,15}бизнес|среднего.{0,15}бизнес|\bb2b\b|корпоративн/, terms: /предприним|для бизнеса|бизнесу|юридическ|корпоративн|компани|организаци|\bb2b\b/ },
    { signal: /детск|для детей|родител/, terms: /детск|для детей|реб[её]н|подрост|родител/ },
    { signal: /физическ.{0,12}лиц|частн.{0,10}клиент|розничн/, terms: /физическ.{0,12}лиц|частн.{0,10}клиент|розничн/ },
  ];
  if (segmentRules.some((rule) => rule.signal.test(descriptionLower) && !rule.terms.test(candidateText))) return 0;
  const primaryMatches = stems.filter((stem) => primary.includes(stem)).length;
  const bodyMatches = stems.filter((stem) => body.includes(stem)).length;
  return Math.max(3, primaryMatches * 3 + bodyMatches);
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
  const query = `${domain} ИНН ОКВЭД выручка`;
  try {
    const result = await searchWeb(query);
    const text = pageText(result.html);
    const okved = text.match(/ОКВЭД[^\d]{0,28}(\d{2}\.\d{1,2}(?:\.\d{1,2})?)/i)?.[1];
    const turnover = text.match(/выручк[а-я]*[^\d]{0,28}([\d\s,.]+(?:млн|млрд)?\s*(?:₽|руб(?:лей)?))/i)?.[1];
    return { okved: okved || "Не подтверждено: требуется проверка юрданных.", turnover: turnover || "Не подтверждено: выручка не найдена в открытой выдаче.", source: result.source };
  } catch {
    return { okved: "Не подтверждено: требуется проверка юрданных.", turnover: "Не подтверждено: выручка не найдена в открытой выдаче.", source: "" };
  }
}

async function analyzeDomain(domain: string, input: AnalysisInput, isClient: boolean, skipLegal = false, relevanceContext = input.description, searchEvidence = ""): Promise<{ row: AnalysisRow; sources: string[]; relevance: number }> {
  const url = `https://${domain}/`;
  let html = "";
  let text = "";
  let title = domain;
  let siteName = "";
  let errorNote = "";
  try {
    html = await fetchText(url);
    text = pageText(html);
    siteName = siteNameFromHtml(html);
    title = titleFromHtml(html) || domain;
  } catch (directError) {
    try {
      html = await fetchText(`https://r.jina.ai/https://${domain}/`, 8000);
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
    relevance: relevanceScore(`${title} ${metaDescription} ${searchEvidence}`, `${text} ${searchEvidence}`, relevanceContext),
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
  const sources: string[] = [normalizedUrl, ...regulationSourceLinks(basePhrase, input.region)];
  const clientDomainLabel = clientDomain.split(".")[0].replace(/[^a-zа-яё0-9]/giu, "");

  const counts = new Map<string, number>();
  const evidenceByDomain = new Map<string, string>();
  const mapLeads = new Set<string>();
  const searchTasks = queries.flatMap((query) => [0, 1, 2].map((page) => ({ query, page })));
  const searchResults = await mapWithConcurrency(searchTasks, 2, ({ query, page }) => searchWeb(query, page));
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
    if (seenDomains.has(base)) return false;
    seenDomains.add(base);
    return true;
  });
  if (candidates.length === 0) throw new Error("Не удалось получить актуальную выдачу. Повторите запуск позже или проверьте доступность поисковых источников.");
  const clientPromise = analyzeDomain(clientDomain, input, true);
  const checkedCandidates = (await mapWithConcurrency(candidates, 16, async ([domain, mentions]) => ({ domain, mentions, ...(await analyzeDomain(domain, input, false, true, projectContext.text, evidenceByDomain.get(domain) || "")) })))
    .flatMap((settled) => settled.status === "fulfilled" ? [settled.value] : []);
  const client = await clientPromise;
  let competitors = checkedCandidates
    .filter((candidate) => candidate.relevance >= 3)
    .sort((a, b) => b.relevance - a.relevance || b.mentions - a.mentions);
  if (competitors.length === 0) throw new Error("Поисковая выдача получена, но прямые конкуренты не подтверждены по содержанию их сайтов.");

  const knownBases = new Set(candidates.map(([domain]) => registrableDomain(domain)));
  for (let round = 0; round < 2 && Date.now() - startedAt < 80000; round += 1) {
    const expansionContext = competitors.map((candidate) => candidate.row["Тип продукта"]).join(" ");
    const expansionBase = compactSearchPhrase(expansionContext);
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
    const expandedCandidates = (await mapWithConcurrency([...newlyFound.entries()], 16, async ([domain, mentions]) => ({ domain, mentions, ...(await analyzeDomain(domain, input, false, true, projectContext.text, evidenceByDomain.get(domain) || "")) })))
      .flatMap((settled) => settled.status === "fulfilled" && settled.value.relevance >= 3 ? [settled.value] : []);
    if (expandedCandidates.length === 0) break;
    competitors = [...competitors, ...expandedCandidates]
      .sort((a, b) => b.relevance - a.relevance || b.mentions - a.mentions);
  }

  await mapWithConcurrency(competitors, 10, async (competitor) => {
    const legal = await legalLookup(competitor.domain);
    competitor.row["ОКВЭД"] = legal.okved;
    competitor.row["Оборотка"] = legal.turnover;
    if (legal.source) competitor.sources.push(legal.source);
  });
  const rows = [client.row, ...competitors.map((result) => result.row)].map(capitalizeSentences);
  for (const result of [client, ...competitors]) sources.push(...result.sources);
  return { rows, sources: [...new Set(sources)], queries, generatedAt: new Date().toISOString() };
}
