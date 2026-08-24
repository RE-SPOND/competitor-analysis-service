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
  for (const match of html.matchAll(/<li[^>]+class=["'][^"']*b_algo[^"']*["'][\s\S]*?<a[^>]+href=["']([^"']+)["']/gi)) urls.push(match[1]);
  for (const match of html.matchAll(/<a[^>]+href=["'](https?:\/\/[^"']+)["']/gi)) urls.push(match[1].replace(/&amp;/g, "&"));
  return domainsFromUrls(urls);
}

function compactSearchPhrase(value: string): string {
  const stopWords = new Set([
    "который", "которая", "которые", "помогает", "предлагает", "ориентирован", "доступен", "доступны",
    "компания", "проект", "продукт", "сервис", "себя", "также", "разные", "форматы", "формат", "через",
    "среди", "после", "чтобы", "этого", "этот", "этой", "своих", "своей", "можно", "нужно", "личный",
  ]);
  const words = value.toLowerCase().match(/[a-zа-яё0-9-]{4,}/giu)?.filter((word) => !stopWords.has(word)) || [];
  const audienceWords = words.filter((word) => /предприним|юридичес|бизнес|корпоратив|малого|среднего|b2b|b2c|дет|родител/.test(word));
  return [...new Set([...words.slice(0, 4), ...audienceWords])].slice(0, 7).join(" ") || value.slice(0, 100);
}

function makeQueries(input: AnalysisInput, clientDomain: string): string[] {
  const region = input.region.trim();
  const base = compactSearchPhrase(input.description);
  const brand = brandNameFromDomain(clientDomain);
  const category = base.split(" ")[0] || brand;
  const isBusinessProduct = /предприним|юридическ.{0,12}лиц|малого.{0,15}бизнес|среднего.{0,15}бизнес|\bb2b\b|корпоративн/i.test(input.description);
  const standard = [
    `${base} ${region}`,
    `${base} сервисы и компании ${region}`,
    `${base} аналоги`,
    `${base} цены`,
    ...(isBusinessProduct ? [`${category} для бизнеса расчётный счёт РКО ИП ООО ${region}`, `${category} для малого и среднего бизнеса ${region}`] : [`${brand} конкуренты`, `${brand} аналоги`]),
  ];
  return [...new Set(standard.map((query) => query.replace(/\s+/g, " ").trim()))].slice(0, 6);
}

type SearchResponse = { domains: string[]; source: string; html: string };

async function searchWeb(query: string): Promise<SearchResponse> {
  const sources = [
    `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`,
    `https://lite.duckduckgo.com/lite/?q=${encodeURIComponent(query)}`,
    `https://r.jina.ai/http://search.brave.com/search?q=${encodeURIComponent(query)}&source=web`,
    `https://search.brave.com/search?q=${encodeURIComponent(query)}&source=web`,
    `https://r.jina.ai/http://www.bing.com/search?q=${encodeURIComponent(query)}&count=10`,
    `https://www.bing.com/search?q=${encodeURIComponent(query)}&count=10`,
  ];
  let lastError: unknown;
  for (const source of sources) {
    try {
      const html = await fetchText(source, 8000);
      const domains = domainsFromSearchHtml(html);
      if (domains.length > 0) return { domains: domains.slice(0, 15), source, html };
      lastError = new Error("Поисковая выдача не содержит сайтов.");
    } catch (error) { lastError = error; }
  }
  throw lastError instanceof Error ? lastError : new Error("Открытые поисковые источники недоступны.");
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
  const words = description.toLowerCase().match(/[a-zа-яё]{4,}/giu) || [];
  const meaningfulStems = words.filter((word) => !ignored.has(word)).map((word) => word.slice(0, 6));
  const stems = [...new Set(meaningfulStems)];
  const stemCounts = meaningfulStems.reduce((counts, stem) => counts.set(stem, (counts.get(stem) || 0) + 1), new Map<string, number>());
  const repeatedCategoryStems = [...stemCounts.entries()].filter(([, count]) => count > 1).map(([stem]) => stem);
  const primary = primaryText.toLowerCase();
  const body = bodyText.toLowerCase().slice(0, 3000);
  const informationalMarkers = [
    "энциклопед", "википед", "каталог", "рейтинг", "обзор", "блог", "журнал", "новост", "форум", "урок",
    "справочник", "часы работы", "адреса отделений", "адреса банкомат", "маркетплейс", "центральный банк", "регулятор",
    "подбор", "сравните", "сравнение", "финансовый портал", "кредитный брокер", "агрегатор",
  ];
  const descriptionLower = description.toLowerCase();
  if (informationalMarkers.some((marker) => primary.includes(marker) && !descriptionLower.includes(marker))) return 0;
  if (repeatedCategoryStems.length > 0 && !repeatedCategoryStems.some((stem) => primary.includes(stem))) return 0;
  const candidateText = `${primary} ${body}`;
  const segmentRules = [
    { signal: /предприним|юридическ.{0,12}лиц|малого.{0,15}бизнес|среднего.{0,15}бизнес|\bb2b\b|корпоративн/, terms: /предприним|для бизнеса|бизнесу|юридическ|\bрко\b|расч[её]тн.{0,10}сч[её]т|корпоративн|\bип\b/ },
    { signal: /детск|для детей|родител/, terms: /детск|для детей|реб[её]н|подрост|родител/ },
    { signal: /физическ.{0,12}лиц|частн.{0,10}клиент|розничн/, terms: /физическ.{0,12}лиц|частн.{0,10}клиент|розничн/ },
  ];
  if (segmentRules.some((rule) => rule.signal.test(descriptionLower) && !rule.terms.test(candidateText))) return 0;
  const primaryMatches = stems.filter((stem) => primary.includes(stem)).length;
  const bodyMatches = stems.filter((stem) => body.includes(stem)).length;
  if (repeatedCategoryStems.length === 0 && primaryMatches < 2 && bodyMatches < 4) return 0;
  return primaryMatches * 3 + bodyMatches;
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

async function analyzeDomain(domain: string, input: AnalysisInput, isClient: boolean, skipLegal = false): Promise<{ row: AnalysisRow; sources: string[]; relevance: number }> {
  const url = `https://${domain}/`;
  let html = "";
  let text = "";
  let title = domain;
  let siteName = "";
  let errorNote = "";
  try { html = await fetchText(url); text = pageText(html); siteName = siteNameFromHtml(html); title = titleFromHtml(html) || domain; } catch (error) { errorNote = ` Страница не открылась автоматически: ${error instanceof Error ? error.message : "ошибка сети"}.`; }
  const metaDescription = metaDescriptionFromHtml(html);
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
    relevance: relevanceScore(`${title} ${metaDescription}`, text, input.description),
  };
}

export async function analyzeProject(input: AnalysisInput): Promise<AnalysisResult> {
  let normalizedUrl = input.projectUrl.trim();
  if (!/^https?:\/\//i.test(normalizedUrl)) normalizedUrl = `https://${normalizedUrl}`;
  const clientDomain = normalizeDomain(normalizedUrl);
  if (!clientDomain || !clientDomain.includes(".")) throw new Error("Укажите корректную ссылку на сайт компании.");
  const queries = makeQueries(input, clientDomain);
  const sources: string[] = [normalizedUrl];
  const clientDomainLabel = clientDomain.split(".")[0].replace(/[^a-zа-яё0-9]/giu, "");

  const counts = new Map<string, number>();
  for (const query of queries) {
    try {
      const result = await searchWeb(query);
      sources.push(result.source);
      for (const domain of result.domains) {
        const candidateLabel = domain.split(".")[0].replace(/[^a-zа-яё0-9]/giu, "");
        const repeatsClientBrand = clientDomainLabel.length >= 4 && candidateLabel.includes(clientDomainLabel);
        if (domain !== clientDomain && !domain.endsWith(`.${clientDomain}`) && !repeatsClientBrand) counts.set(domain, (counts.get(domain) || 0) + 1);
      }
    } catch { /* A blocked search query does not invalidate successful queries. */ }
  }
  const seenDomains = new Set<string>();
  const candidates = [...counts.entries()].sort((a, b) => b[1] - a[1]).filter(([domain]) => {
    const base = registrableDomain(domain);
    if (seenDomains.has(base)) return false;
    seenDomains.add(base);
    return true;
  }).slice(0, 30);
  if (candidates.length === 0) throw new Error("Не удалось получить актуальную выдачу. Повторите запуск позже или проверьте доступность поисковых источников.");
  const [client, checkedCandidates] = await Promise.all([
    analyzeDomain(clientDomain, input, true),
    Promise.all(candidates.map(async ([domain, mentions]) => ({ domain, mentions, ...(await analyzeDomain(domain, input, false, true)) }))),
  ]);
  const competitors = checkedCandidates
    .filter((candidate) => candidate.relevance >= 3)
    .sort((a, b) => b.relevance - a.relevance || b.mentions - a.mentions)
    .slice(0, 5);
  if (competitors.length === 0) throw new Error("Поисковая выдача получена, но прямые конкуренты не подтверждены по содержанию их сайтов.");
  await Promise.all(competitors.map(async (competitor) => {
    const legal = await legalLookup(competitor.domain);
    competitor.row["ОКВЭД"] = legal.okved;
    competitor.row["Оборотка"] = legal.turnover;
    if (legal.source) competitor.sources.push(legal.source);
  }));
  const rows = [client.row, ...competitors.map((result) => result.row)].map(capitalizeSentences);
  for (const result of [client, ...competitors]) sources.push(...result.sources);
  return { rows, sources: [...new Set(sources)], queries, generatedAt: new Date().toISOString() };
}
