export const COLUMNS = [
  "Название", "Сайт", "Тип продукта", "Ассортимент", "Услуги", "УТП", "Ценовой сегмент", "География", "Производство",
  "Индивидуальные решения", "Каналы", "Кейсы", "Сильные стороны", "Слабые стороны", "Особенности", "ОКВЭД", "Оборотка",
] as const;

export type AnalysisInput = { title: string; projectUrl: string; description: string; region: string };
export type AnalysisRow = Record<string, string>;
export type MarketLeader = { name: string; site: string; score: number; reasons: string[] };
export type MarketItem = { name: string; competitors: number; coverage: number };
export type ProposedUsp = { statement: string; rationale: string };
export type ServiceCatalogItem = MarketItem & {
  competitorsList: string[];
};
export type MarketSummary = {
  serviceCatalogVersion: number;
  leaders: MarketLeader[];
  services: MarketItem[];
  serviceCatalog: ServiceCatalogItem[];
  coverage: MarketItem[];
  price: { transparent: number; total: number; note: string };
  gaps: string[];
  recommendations: string[];
  risks: string[];
  proposedUsps: ProposedUsp[];
  methodology: string;
};
export type AnalysisResult = { columns: string[]; rows: AnalysisRow[]; summary: MarketSummary; sources: string[]; queries: string[]; generatedAt: string; topicDescription?: string };

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

type ServiceDiscovery = { services: string[]; sources: string[] };

function cleanLinkLabel(value: string): string {
  return pageText(value).replace(/^[\s\-–—•\d.)]+/u, "").replace(/\s+/g, " ").trim();
}

function pageLinks(content: string, pageUrl: string): Array<{ url: string; label: string }> {
  const links: Array<{ url: string; label: string }> = [];
  const add = (href: string, rawLabel: string) => {
    const label = cleanLinkLabel(rawLabel);
    if (!href || !label) return;
    try { links.push({ url: new URL(href.replace(/&amp;/g, "&"), pageUrl).toString(), label }); } catch { /* Ignore malformed links. */ }
  };
  for (const match of content.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/giu)) add(match[1], match[2]);
  for (const match of content.matchAll(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/giu)) add(match[2], match[1]);
  return links;
}

function sameSite(candidateUrl: string, domain: string): boolean {
  try {
    const candidate = normalizeDomain(new URL(candidateUrl).hostname);
    const base = registrableDomain(domain);
    return candidate === domain || registrableDomain(candidate) === base;
  } catch { return false; }
}

function servicePageCandidates(content: string, pageUrl: string, domain: string): string[] {
  const candidates = pageLinks(content, pageUrl)
    .filter((link) => sameSite(link.url, domain) && !isNonServiceContentUrl(link.url) && (/^(?:услуги|наши услуги)$/iu.test(link.label) || /\/(?:uslugi|services?|service)(?:\/|$)/iu.test(new URL(link.url).pathname) || serviceAction.test(link.label)))
    .sort((a, b) => {
      const score = (link: { url: string; label: string }) => (/^услуги$/iu.test(link.label) ? -100 : 0) + new URL(link.url).pathname.split("/").filter(Boolean).length;
      return score(a) - score(b);
    })
    .map((link) => link.url.split("#")[0]);
  return [...new Set(candidates)].slice(0, 80);
}

const serviceAction = /разработк|проектирован|установк|монтаж|демонтаж|тест|испытан|обследован|организац|регулирован|согласован|сопровожден|обслуживан|ремонт|диагностик|настройк|внедрен|изготовлен|(?:^|\s)производство(?:\s|$)|поставк|доставк|аренд|прокат|обучен|консультац|аудит|оценк|расч[её]т|нанесен|разметк|строительств|реконструкц|утилизац|эвакуац|перевозк|сертификац|экспертиз/iu;
const genericServiceLabel = /^(?:услуги|услуги и цены|наши услуги|все услуги|каталог услуг|главная|о компании|контакты|цены|прайс|проекты|портфолио|новости|блог|вакансии|отзывы|наши преимущества|почему мы|подробнее|узнать больше|заказать|онлайн заявка|оставить заявку|получить консультацию|обратный звонок|политика конфиденциальности|пользовательское соглашение|карта сайта|реквизиты|документы|лицензии|сертификаты|наши клиенты|наши заказчики|наша команда|мы в сми)$/iu;

function validServiceLabel(value: string): boolean {
  const label = cleanLinkLabel(value).replace(/[.!:]+$/u, "");
  const words = label.split(/\s+/u);
  return label.length >= 7 && label.length <= 150 && words.length <= 20 && !genericServiceLabel.test(label)
    && !/^(?:телефон|email|telegram|whatsapp|vk|пример\s|калькулятор\s|продукция собственного производства)/iu.test(label)
    && !/(?:выставк|новост|реализовал[аи]?\s+проект|представляет|портфолио|кейс|\b20\d{2}\s*(?:г|год)|(?:^|\s)в\s+(?:москве|санкт-петербурге|самаре|казани|сочи|екатеринбурге|новосибирске)(?:\s|$))/iu.test(label)
    && !/(?:&#\d+;?|оплата|условия доставки|наше производство|по доступным ценам|от производителя|без залога|продажа)/iu.test(label)
    && !/\$\{|(?:^|\s)работаем\s|[.!?].+[.!?]/u.test(label);
}

function looksLikeServiceOffering(value: string): boolean {
  const label = cleanLinkLabel(value).replace(/[.!:]+$/u, "");
  if (!validServiceLabel(label)) return false;
  if (/(?:купить|каталог|модель|серия|в наличии|цена от|\b\d+(?:[.,xх×]\d+)+\s*(?:м|мм|см)?\b)/iu.test(label)) return false;
  if (/^(?:модульн[а-яё]*\s+)?(?:бытовк|блок-контейнер|контейнер|хозблок|гараж|ангар|штаб|штабы|павильон|киоск|склад|здани|дом(?:\s|$))/iu.test(label)) return false;
  if (/^(?:как|возможн|какой|какая|какие|сколько|почему)\b|\?$/iu.test(label)) return false;
  if (/\sв\s+(?:г\.?\s*)?[А-ЯЁ][а-яё-]{2,}$/u.test(label)) return false;
  return serviceAction.test(label)
    || /(?:технические\s+)?средства?\s+(?:дорожного\s+)?(?:движения|регулирования)/iu.test(label)
    || /(?:service|installation|delivery|maintenance|repair|consulting|design|testing)/iu.test(label);
}

function isNonServiceContentUrl(value: string): boolean {
  try { return /\/(?:blog|news|novosti|articles?|stati|cases?|keisy|portfolio|projects?|proekty|press)(?:\/|$)/iu.test(new URL(value).pathname); }
  catch { return true; }
}

export function extractServicesFromPage(content: string, pageUrl: string, domain: string): string[] {
  void pageUrl;
  void domain;
  const htmlHeading = content.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/iu)?.[1];
  const markdown = content.split("Markdown Content:")[1] || content;
  const markdownHeading = markdown.match(/^#\s+(.+)$/mu)?.[1];
  const heading = cleanLinkLabel(htmlHeading || markdownHeading || "").replace(/[.!:]+$/u, "");
  return validServiceLabel(heading) && !genericServiceLabel.test(heading) ? [heading] : [];
}

async function fetchServicePage(url: string): Promise<string> {
  try { return await fetchText(url, 5000); }
  catch { return fetchText(`https://r.jina.ai/${url}`, 6500); }
}

async function discoverDomainServices(domain: string, knownPages: string[] = []): Promise<ServiceDiscovery> {
  let candidates = knownPages.filter((url) => sameSite(url, domain)).slice(0, 80);
  if (candidates.length === 0) {
    const homepage = `https://${domain}/`;
    try { candidates = servicePageCandidates(await fetchServicePage(homepage), homepage, domain); } catch { /* Try conventional service paths below. */ }
  }
  if (candidates.length === 0) candidates = [`https://${domain}/uslugi/`, `https://${domain}/services/`];
  const services: string[] = [];
  const sources: string[] = [];
  const pending = [...new Set(candidates.map((url) => url.split("#")[0]))];
  const visited = new Set<string>();
  const maxServicePages = 80;
  while (pending.length > 0 && visited.size < maxServicePages) {
    const batch = pending.splice(0, Math.min(6, maxServicePages - visited.size)).filter((url) => !visited.has(url));
    batch.forEach((url) => visited.add(url));
    const fetched = await mapWithConcurrency(batch, 6, async (url) => ({ url, content: await fetchServicePage(url) }));
    for (const item of fetched) {
      if (item.status !== "fulfilled") continue;
      const { url, content } = item.value;
      const extracted = extractServicesFromPage(content, url, domain);
      if (extracted.length > 0) {
        sources.push(url);
        for (const service of extracted) if (!services.some((existing) => serviceKey(existing) === serviceKey(service))) services.push(service);
      }
      for (const candidate of servicePageCandidates(content, url, domain)) {
        if (!visited.has(candidate) && !pending.includes(candidate)) pending.push(candidate);
      }
    }
  }
  return { services, sources };
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

async function projectSearchContext(input: AnalysisInput, clientDomain = ""): Promise<{ text: string; brandStems: Set<string> }> {
  let html = "";
  if (clientDomain) {
    try {
      html = await fetchText(`https://${clientDomain}/`, 8000);
    } catch {
      try { html = await fetchText(`https://r.jina.ai/https://${clientDomain}/`, 8000); } catch { /* The user's description remains the fallback. */ }
    }
  }
  const title = titleFromHtml(html);
  const siteName = siteNameFromHtml(html);
  const siteContext = [title, metaDescriptionFromHtml(html), readerDescription(html)].filter(Boolean).join(" ");
  const identityFragments = [
    clientDomain ? brandNameFromDomain(clientDomain) : "",
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
  const brand = clientDomain ? brandNameFromDomain(clientDomain) : "";
  const audience = audiencePhrase(context);
  const isPhysicalProduct = /производ|издел|материал|оборудован|товар|магазин|доставк|монтаж|купить/i.test(context);
  const standard = [
    `${base} ${region}`,
    `${base} компании ${region}`,
    `${base} цены стоимость ${region}`,
    brand ? `${brand} конкуренты аналоги` : `${categoryBase} конкуренты аналоги ${region}`,
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
type GrokRefinement = {
  columns?: string[];
  rows?: Array<{
    site?: string;
    product?: string;
    usp?: string;
    strengths?: string;
    weaknesses?: string;
    features?: string;
    fields?: Record<string, string>;
  }>;
};

const YANDEX_SEARCH_ENDPOINT = "https://searchapi.api.cloud.yandex.net/v2/web/search";
let yandexSearchCredentialsCache: YandexSearchCredentials | null | undefined;

async function yandexSearchCredentials(): Promise<YandexSearchCredentials | null> {
  if (yandexSearchCredentialsCache !== undefined) return yandexSearchCredentialsCache;
  const apiKey = String(process.env.YANDEX_SEARCH_API_KEY || "").trim();
  const folderId = String(process.env.YANDEX_SEARCH_FOLDER_ID || "").trim();
  yandexSearchCredentialsCache = apiKey && folderId ? { apiKey, folderId } : null;
  return yandexSearchCredentialsCache;
}

function fallbackDynamicColumns(description: string): string[] {
  const lower = description.toLowerCase();
  const columns: Array<[RegExp, string[]]> = [
    [/размер|габарит|площад|2×2|3×3|3×4|4×6/u, ["Размеры", "Полезная площадь"]],
    [/утепл|тёпл|терморежим|обогрев|вентиляц|климат/u, ["Климатическая версия", "Утепление и терморежим"]],
    [/сборк|конструктор|diy|своими силами|инструкци/u, ["Самостоятельная сборка", "Время и сложность сборки"]],
    [/стеллаж|ящик|полк|крюч|органайзер|хранен/u, ["Системы хранения"]],
    [/фундамент|сва|блок|щеб/u, ["Фундамент и установка"]],
    [/доставк|логистик|срок изготовлен/u, ["Срок изготовления и доставки"]],
    [/гаранти|корроз|влаг|гниен|срок службы/u, ["Гарантия и долговечность"]],
    [/маркетплейс|ozon|wildberries|авито|дилер|канал продаж/u, ["Каналы продаж"]],
  ];
  return columns.flatMap(([pattern, names]) => pattern.test(lower) ? names : []).slice(0, 8);
}

async function refineWithGrok(input: AnalysisInput, rows: AnalysisRow[]): Promise<{ columns: string[]; rows: AnalysisRow[] }> {
  const fallbackColumns = fallbackDynamicColumns(input.description);
  const apiKey = String(process.env.XAI_API_KEY || "").trim();
  if (!apiKey || rows.length === 0) return { columns: fallbackColumns, rows };
  const candidates = rows.slice(0, 20).map((row) => ({
    site: row["Сайт"], product: row["Тип продукта"], assortment: row["Ассортимент"], usp: row["УТП"],
    price: row["Ценовой сегмент"], geography: row["География"], channels: row["Каналы"], cases: row["Кейсы"],
    strengths: row["Сильные стороны"], weaknesses: row["Слабые стороны"], features: row["Особенности"],
  }));
  const prompt = [
    "Ты аналитик конкурентного рынка. Проверь карточки компаний по уже собранным фактам.",
    `Контекст исследования: ${input.description.slice(0, 2000)}. Регион: ${input.region}.`,
    "Сформируй до 8 дополнительных названий столбцов именно под параметры, явно запрошенные в описании проекта. Не повторяй базовые столбцы (название, сайт, УТП, цена, география, производство, каналы, кейсы).",
    "Верни только JSON формата {\"columns\":[\"...\"],\"rows\":[{\"site\":\"...\",\"product\":\"...\",\"usp\":\"...\",\"strengths\":\"...\",\"weaknesses\":\"...\",\"features\":\"...\",\"fields\":{\"Название столбца\":\"значение или Не найдено\"}}]}",
    "Включай строку лишь если уточнение основано на фактах в карточке. Не придумывай цены, размеры, характеристики, клиентов, выручку, сертификаты или функциональность. Пиши кратко по-русски; если факта нет — «Не найдено».",
    JSON.stringify(candidates),
  ].join("\n");
  try {
    const response = await fetch("https://api.x.ai/v1/chat/completions", {
      method: "POST",
      headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: "grok-4.6", temperature: 0.2, messages: [{ role: "user", content: prompt }] }),
      signal: AbortSignal.timeout(30000),
    });
    if (!response.ok) return { columns: fallbackColumns, rows };
    const payload = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
    const content = payload.choices?.[0]?.message?.content?.trim();
    const json = content?.match(/\{[\s\S]*\}/)?.[0];
    const refinement = json ? JSON.parse(json) as GrokRefinement : null;
    const columns = [...new Set((refinement?.columns || fallbackColumns)
      .map((column) => String(column).trim())
      .filter((column) => column.length >= 3 && column.length <= 60 && !COLUMNS.includes(column as typeof COLUMNS[number])))]
      .slice(0, 8);
    const bySite = new Map((refinement?.rows || []).filter((item) => item.site).map((item) => [item.site!, item]));
    return { columns, rows: rows.map((row) => {
      const item = bySite.get(row["Сайт"]);
      return item ? {
        ...row,
        "Тип продукта": item.product || row["Тип продукта"], "УТП": item.usp || row["УТП"],
        "Сильные стороны": item.strengths || row["Сильные стороны"], "Слабые стороны": item.weaknesses || row["Слабые стороны"],
        "Особенности": item.features || row["Особенности"],
        ...Object.fromEntries(columns.map((column) => [column, item.fields?.[column] || "Не найдено"])),
      } : row;
    }) };
  } catch { return { columns: fallbackColumns, rows }; }
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

async function analyzeDomain(domain: string, input: AnalysisInput, isClient: boolean, skipLegal = false, relevanceContext = input.description, searchEvidence = "", fastFetch = false): Promise<{ row: AnalysisRow; sources: string[]; relevance: number; servicePages: string[] }> {
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
  const servicePages = servicePageCandidates(html, url, domain);
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
      "Услуги": "Не найдено: раздел услуг ещё не исследован.",
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
    servicePages,
  };
}

function descriptionOnlyClient(input: AnalysisInput): { row: AnalysisRow; sources: string[]; relevance: number; servicePages: string[] } {
  const description = input.description.trim();
  const product = firstUsefulSentence(description, "Описание продукта не указано.");
  const assortment = listFound(description, {
    "консультац": "консультации", "подписк": "подписка", "отчет": "отчеты", "курс": "курсы", "вебинар": "вебинары",
    "тест": "тесты", "дневник": "дневник", "чат": "чат", "приложен": "приложение", "психолог": "работа с психологом",
    "доставк": "доставка", "монтаж": "монтаж", "проектирован": "проектирование", "производ": "производство",
    "кредит": "кредитование", "вклад": "вклады", "банк": "банковские услуги", "страхован": "страхование",
  }) || "Определяется по описанию проекта.";
  const describedPrice = price(description);
  const isDigitalService = findAny(description, ["онлайн", "сервис", "платформ", "приложен", "подписк", "консультац"]);
  const custom = findAny(description, ["индивидуальн", "персональн", "по проекту", "подбор", "нестандарт", "под заказ", "эскиз"]);
  return {
    row: {
      "Название": "Исследуемый проект (клиент)",
      "Сайт": "Сайт не указан",
      "Тип продукта": product,
      "Ассортимент": assortment,
      "Услуги": "Не применимо: сайт клиента не указан.",
      "УТП": "Определяется по описанию проекта.",
      "Ценовой сегмент": describedPrice.startsWith("Цена на") ? "Цена в описании не указана." : describedPrice,
      "География": input.region,
      "Производство": isDigitalService ? "Не применимо: цифровой сервис или услуга" : "Не подтверждено: сайт не указан",
      "Индивидуальные решения": custom ? "Да" : "Не указано",
      "Каналы": "Не указано",
      "Кейсы": "Не подтверждено: сайт не указан",
      "Сильные стороны": "Требуется сравнение с найденными конкурентами.",
      "Слабые стороны": "Недостаточно данных без сайта.",
      "Особенности": `Клиент / эталон для сравнения. ${product}`,
      "ОКВЭД": "Не подтверждено: сайт и юрданные не указаны.",
      "Оборотка": "Не подтверждено: сайт и юрданные не указаны.",
    },
    sources: [],
    relevance: 0,
    servicePages: [],
  };
}

function isClientDomain(domain: string, clientDomain: string): boolean {
  return Boolean(clientDomain) && (domain === clientDomain || domain.endsWith(`.${clientDomain}`));
}

function hasFact(value: string | undefined): boolean {
  const normalized = (value || "").trim().toLowerCase();
  return Boolean(normalized) && !/^(не найдено|не указано|не подтверждено|—|цена на сайте не указана)/u.test(normalized);
}

function cleanServiceCandidate(value: string): string {
  return value
    .replace(/^[\s\-–—•\d.)]+/u, "")
    .replace(/^(?:предлагаем|услуги|сервисы|ассортимент|включает|доступны|есть)\s*:?\s*/iu, "")
    .replace(/[.!:]+$/u, "")
    .replace(/\s+/g, " ")
    .trim();
}

function serviceKey(value: string): string {
  return value.toLowerCase().replace(/[«»"']/g, "").replace(/\s+/g, " ").trim();
}

type CompetitorServices = { site: string; context: string; services: string[] };

function servicesFromRow(row: AnalysisRow): string[] {
  const value = (row["Услуги"] || "").trim();
  if (!hasFact(value)) return [];
  return value.split(/\r?\n/u).map(cleanServiceCandidate).filter((item) => item && validServiceLabel(item));
}

const genericServiceStems = new Set([
  "аренд", "доставк", "изготов", "консуль", "монтаж", "настройк", "обслужи", "организ", "перевоз",
  "поставк", "проекти", "произво", "разработ", "расчет", "ремонт", "строите", "тест", "установк",
]);

function meaningfulStems(value: string): string[] {
  return searchWords(value).map(wordStem).filter((stem) => stem.length >= 5 && !genericServiceStems.has(stem));
}

function fallbackServiceRelevance(name: string, description: string, competitorContext = ""): boolean {
  const descriptionStems = new Set(meaningfulStems(description));
  const nameStems = meaningfulStems(name);
  if (nameStems.length > 0) return nameStems.some((stem) => descriptionStems.has(stem));
  return meaningfulStems(competitorContext).some((stem) => descriptionStems.has(stem));
}

function serviceContextFromRow(row: AnalysisRow): string {
  return [row["Название"], row["Тип продукта"], row["Ассортимент"], row["Особенности"]]
    .filter((value) => hasFact(value))
    .join(". ")
    .slice(0, 800);
}

async function filterServicesByTopic(description: string, competitors: CompetitorServices[]): Promise<Map<string, string[]>> {
  const candidates = competitors.flatMap((competitor) => competitor.services
    .filter((name) => looksLikeServiceOffering(name))
    .filter((name) => fallbackServiceRelevance(name, description, competitor.context))
    .map((name) => ({ id: "", site: competitor.site, context: competitor.context, name })));
  candidates.forEach((candidate, index) => { candidate.id = `s${index + 1}`; });
  if (!candidates.length) return new Map(competitors.map((item) => [item.site, []]));

  const allowed = new Set<string>();
  const apiKey = String(process.env.XAI_API_KEY || "").trim();
  let usedModelFilter = false;
  if (apiKey) {
    const chunks = Array.from({ length: Math.ceil(candidates.length / 120) }, (_, index) => candidates.slice(index * 120, (index + 1) * 120));
    const filtered = await mapWithConcurrency(chunks, 3, async (chunk) => {
      const response = await fetch("https://api.x.ai/v1/chat/completions", {
        method: "POST",
        headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "grok-4.6",
          temperature: 0,
          messages: [{ role: "user", content: [
            "Отфильтруй названия услуг конкурентов под тему исследования.",
            `Тема и описание проекта: ${description.slice(0, 3000)}`,
            "Каждая запись содержит ID, H1 страницы услуги, сайт и профиль конкретного конкурента. Оценивай H1 только в контексте этого конкурента.",
            "Оставь только коммерческие услуги, которые этот конкурент действительно может оказывать клиенту именно в рамках темы исследования.",
            "Строго удали товары и категории товаров, названия компаний, статьи, новости, выставки, кейсы, реализованные проекты, примеры объектов, города, преимущества, способы оплаты, вакансии, навигацию и нерелевантные направления.",
            "Общее слово действия не делает услугу релевантной: например, доставка еды не относится к модульным хозблокам, даже если в теме встречается слово «доставка».",
            "Если строка описывает конкретный проект, событие или публикацию, а не услугу как предложение клиенту, обязательно исключи её.",
            "Верни только ID подходящих записей, не переписывай названия и не добавляй новые услуги.",
            "Верни только JSON вида {\"ids\":[\"s1\",\"s2\"]}.",
            JSON.stringify(chunk.map(({ id, site, context, name }) => ({ id, h1: name, site, competitor: context }))),
          ].join("\n") }],
        }),
        signal: AbortSignal.timeout(30000),
      });
      if (!response.ok) throw new Error(`Grok HTTP ${response.status}`);
      const payload = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
      const json = payload.choices?.[0]?.message?.content?.match(/\{[\s\S]*\}/u)?.[0];
      const parsed = json ? JSON.parse(json) as { ids?: unknown[] } : {};
      return (parsed.ids || []).map((id) => String(id));
    });
    filtered.forEach((result, index) => {
      if (result.status !== "fulfilled") {
        for (const candidate of chunks[index]) allowed.add(candidate.id);
        return;
      }
      usedModelFilter = true;
      const validIds = new Set(chunks[index].map((candidate) => candidate.id));
      for (const id of result.value) if (validIds.has(id)) allowed.add(id);
    });
  }
  if (!usedModelFilter && !apiKey) for (const candidate of candidates) allowed.add(candidate.id);

  const result = new Map(competitors.map((competitor) => [competitor.site, [] as string[]]));
  for (const candidate of candidates) {
    if (!allowed.has(candidate.id)) continue;
    const services = result.get(candidate.site) || [];
    if (!services.some((name) => serviceKey(name) === serviceKey(candidate.name))) services.push(candidate.name);
    result.set(candidate.site, services);
  }
  return result;
}

function buildServiceCatalog(competitors: AnalysisRow[], total: number): ServiceCatalogItem[] {
  type Draft = { name: string; competitors: Set<string> };
  const drafts = new Map<string, Draft>();
  const ignored = /^(?:да|нет|не указано|не найдено.*|не подтверждено.*|не применимо.*|раздел услуг.*|услуги)$/iu;

  const add = (name: string, competitor: string) => {
    const cleaned = cleanServiceCandidate(name);
    if (cleaned.length < 3 || cleaned.length > 150 || ignored.test(cleaned) || /^https?:\/\//iu.test(cleaned)) return;
    if (/^(?:широкий|большой|полный) ассортимент$/iu.test(cleaned)) return;
    const normalizedName = cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
    const key = serviceKey(normalizedName);
    const existing = drafts.get(key) || { name: normalizedName, competitors: new Set<string>() };
    existing.competitors.add(competitor);
    drafts.set(key, existing);
  };

  for (const row of competitors) {
    const competitor = row["Название"] || row["Сайт"] || "Конкурент";
    const value = (row["Услуги"] || "").trim();
    if (!hasFact(value)) continue;
    const chunks = value.split(/\r?\n|[;•|]+/u).map(cleanServiceCandidate).filter(Boolean);
    for (const chunk of chunks) {
      if (chunk.length > 150 || /(?:не удалось|требуется|не применимо|раздел услуг)/iu.test(chunk)) continue;
      add(chunk, competitor);
    }
  }

  return [...drafts.values()].map((draft) => {
    const competitorNames = [...draft.competitors].sort((a, b) => a.localeCompare(b, "ru"));
    return {
      name: draft.name,
      competitors: competitorNames.length,
      coverage: Math.round(competitorNames.length / total * 100),
      competitorsList: competitorNames,
    };
  }).sort((a, b) => b.competitors - a.competitors || a.name.localeCompare(b.name, "ru"));
}

export function buildMarketSummary(rows: AnalysisRow[], columns: string[]): MarketSummary {
  const competitors = rows.filter((row) => !row["Название"].includes("(клиент)"));
  const total = competitors.length || 1;
  const serviceCatalog = buildServiceCatalog(competitors, total);
  const services = serviceCatalog.map(({ name, competitors: count, coverage: share }) => ({ name, competitors: count, coverage: share }));
  const coverage = columns.filter((column) => !COLUMNS.includes(column as typeof COLUMNS[number])).map((name) => {
    const count = competitors.filter((row) => hasFact(row[name])).length;
    return { name, competitors: count, coverage: Math.round(count / total * 100) };
  }).filter((item) => item.competitors > 0).sort((a, b) => b.coverage - a.coverage);
  const leaders = competitors.map((row) => {
    const reasons: string[] = [];
    let score = 0;
    if (hasFact(row["Ценовой сегмент"])) { score += 20; reasons.push("опубликована цена"); }
    if (row["Производство"] === "Да") { score += 20; reasons.push("подтверждено производство"); }
    if (row["Индивидуальные решения"] === "Да") { score += 15; reasons.push("есть индивидуальные решения"); }
    if (/^Да/u.test(row["Кейсы"] || "")) { score += 15; reasons.push("есть кейсы или отзывы"); }
    if ((row["Каналы"] || "").split(",").length >= 3) { score += 10; reasons.push("несколько каналов связи"); }
    for (const column of coverage.map((item) => item.name)) if (hasFact(row[column])) score += 4;
    return { name: row["Название"], site: row["Сайт"], score, reasons };
  }).sort((a, b) => b.score - a.score).slice(0, 5);
  const transparent = competitors.filter((row) => hasFact(row["Ценовой сегмент"])).length;
  const lowCoverage = [...coverage, ...services].filter((item) => item.coverage > 0 && item.coverage < 35).slice(0, 4);
  const gaps = lowCoverage.length
    ? lowCoverage.map((item) => `Низкое покрытие «${item.name}»: подтверждено у ${item.competitors} из ${total} конкурентов.`)
    : ["Явные пробелы требуют дополнительной проверки: доступные страницы конкурентов содержат схожий набор параметров."];
  const recommendations = [
    "Сделайте ключевые параметры и цену доступными на карточке товара — это повышает прозрачность предложения.",
    ...lowCoverage.slice(0, 2).map((item) => `Проверьте гипотезу дифференциации через «${item.name}»: предложение встречается редко.`),
  ];
  const risks = [
    "Данные основаны на открытых страницах и могут не включать закрытые прайс-листы или индивидуальные условия.",
    transparent < Math.ceil(total / 2) ? "У большинства конкурентов цена не опубликована: сравнение требует запросов поставщикам." : "Цены необходимо перепроверять перед коммерческими решениями: они могут быть сезонными.",
  ];
  return {
    serviceCatalogVersion: 9,
    leaders,
    services: services.sort((a, b) => b.coverage - a.coverage),
    serviceCatalog,
    coverage,
    price: { transparent, total, note: `Цена подтверждена у ${transparent} из ${total} конкурентов.` },
    gaps,
    recommendations,
    risks,
    proposedUsps: [],
    methodology: "Рейтинг лидеров строится по подтверждённым открытым фактам. Список услуг составляется по H1 отдельных страниц услуг конкурентов и фильтруется по описанию темы; товары, навигация, преимущества и нерелевантные направления исключаются. Это не оценка выручки или доли рынка.",
  };
}

function fallbackProposedUsps(description: string, summary: MarketSummary): ProposedUsp[] {
  const topic = firstUsefulSentence(description, "Предложение проекта").replace(/[.!]+$/u, "").slice(0, 90);
  const rareServices = summary.services.filter((item) => item.coverage > 0 && item.coverage < 35).slice(0, 3).map((item) => item.name);
  const servicePromise = rareServices.length
    ? `Комплексное решение: ${rareServices.join(", ")}`
    : `${topic} с понятным составом работ`;
  return [
    { statement: servicePromise, rationale: "Объединяет востребованные, но редко представленные у конкурентов направления в одном предложении." },
    { statement: "Прозрачный результат, сроки и стоимость до начала работ", rationale: `Цена опубликована только у ${summary.price.transparent} из ${summary.price.total} конкурентов — прозрачность может стать заметным отличием.` },
    { statement: "Один ответственный партнёр от задачи до подтверждённого результата", rationale: "УТП усиливает ценность полного цикла и снимает риск разрозненной работы с несколькими исполнителями." },
  ];
}

export async function buildMarketSummaryWithUsps(rows: AnalysisRow[], columns: string[], description: string): Promise<MarketSummary> {
  const summary = buildMarketSummary(rows, columns);
  const competitors = rows.filter((row) => !(row["Название"] || "").includes("(клиент)"));
  const fallback = fallbackProposedUsps(description, summary);
  const apiKey = String(process.env.XAI_API_KEY || "").trim();
  if (!apiKey || competitors.length === 0) return { ...summary, proposedUsps: fallback };
  const evidence = competitors.slice(0, 35).map((row) => ({
    company: row["Название"], usp: row["УТП"], services: row["Услуги"], price: row["Ценовой сегмент"],
    strengths: row["Сильные стороны"], weaknesses: row["Слабые стороны"], features: row["Особенности"],
  }));
  const prompt = [
    "Ты стратег по позиционированию. На основе конкурентного анализа предложи 5 сильных УТП для исследуемого проекта.",
    `Описание проекта: ${description.slice(0, 3000)}`,
    `Пробелы рынка: ${summary.gaps.join(" ")}`,
    `Релевантные услуги: ${summary.serviceCatalog.slice(0, 40).map((item) => item.name).join("; ")}`,
    "Каждое УТП должно быть конкретным, полезным клиенту и заметно отличаться от типовых обещаний конкурентов.",
    "Не придумывай факты, гарантии, сроки, цены, сертификаты или возможности проекта. Если формулировка требует внедрения условия, явно укажи это в обосновании как рекомендацию.",
    "Не используй пустые превосходные степени вроде «лучший», «номер один», «уникальный» без доказательства.",
    "Верни только JSON: {\"usps\":[{\"statement\":\"короткое УТП\",\"rationale\":\"почему оно сильнее конкурентов и что нужно обеспечить\"}]}",
    JSON.stringify(evidence),
  ].join("\n");
  try {
    const response = await fetch("https://api.x.ai/v1/chat/completions", {
      method: "POST",
      headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: "grok-4.6", temperature: 0.35, messages: [{ role: "user", content: prompt }] }),
      signal: AbortSignal.timeout(30000),
    });
    if (!response.ok) return { ...summary, proposedUsps: fallback };
    const payload = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
    const json = payload.choices?.[0]?.message?.content?.match(/\{[\s\S]*\}/u)?.[0];
    const parsed = json ? JSON.parse(json) as { usps?: Array<{ statement?: unknown; rationale?: unknown }> } : {};
    const seen = new Set<string>();
    const proposedUsps = (parsed.usps || []).flatMap((item) => {
      const statement = String(item.statement || "").replace(/\s+/g, " ").trim();
      const rationale = String(item.rationale || "").replace(/\s+/g, " ").trim();
      const key = statement.toLowerCase();
      if (statement.length < 10 || statement.length > 180 || rationale.length < 15 || rationale.length > 400 || seen.has(key)) return [];
      seen.add(key);
      return [{ statement, rationale }];
    }).slice(0, 5);
    return { ...summary, proposedUsps: proposedUsps.length >= 3 ? proposedUsps : fallback };
  } catch { return { ...summary, proposedUsps: fallback }; }
}

export async function analyzeProject(input: AnalysisInput): Promise<AnalysisResult> {
  const startedAt = Date.now();
  input = {
    title: input.title.trim(),
    projectUrl: input.projectUrl.trim(),
    description: input.description.trim(),
    region: input.region.trim() || "Россия",
  };
  if (!input.description) throw new Error("Заполните описание компании или продукта.");
  let normalizedUrl = input.projectUrl;
  let clientDomain = "";
  if (normalizedUrl) {
    if (!/^https?:\/\//i.test(normalizedUrl)) normalizedUrl = `https://${normalizedUrl}`;
    clientDomain = normalizeDomain(normalizedUrl);
    if (!clientDomain || !clientDomain.includes(".")) throw new Error("Укажите корректную ссылку на сайт компании или оставьте поле пустым.");
  }
  input.projectUrl = normalizedUrl;
  const projectContext = await projectSearchContext(input, clientDomain);
  const queries = makeQueries(input, clientDomain, projectContext.text, projectContext.brandStems);
  const basePhrase = compactSearchPhrase(projectContext.text, projectContext.brandStems);
  const relevanceContext = input.description.trim() || projectContext.text;
  const sources: string[] = [normalizedUrl, ...regulationSourceLinks(basePhrase, input.region)].filter(Boolean);
  const clientDomainLabel = clientDomain ? clientDomain.split(".")[0].replace(/[^a-zа-яё0-9]/giu, "") : "";
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
    if (isClientDomain(candidate.domain, clientDomain)) continue;
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
        if (!isClientDomain(domain, clientDomain) && !repeatsClientBrand) {
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
          if (isClientDomain(domain, clientDomain)) continue;
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
        if (isClientDomain(domain, clientDomain)) continue;
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
  const clientPromise = clientDomain
    ? analyzeDomain(clientDomain, input, true)
    : Promise.resolve(descriptionOnlyClient(input));
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
        if (knownBases.has(base) || isClientDomain(domain, clientDomain)) continue;
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
    const servicesTask = discoverDomainServices(competitor.domain, competitor.servicePages);
    if (verifiedIndustryDomains.has(registryDomain)) {
      competitor.row["ОКВЭД"] = "Юрстатус подтверждён реестром Банка России; код ОКВЭД требует отдельной проверки.";
      competitor.row["Оборотка"] = "Не подтверждено: выручка не опубликована в реестре Банка России.";
      competitor.sources.push(BANK_REGISTRY_SOURCE);
    } else {
      const legal = await legalLookup(competitor.domain);
      competitor.row["ОКВЭД"] = legal.okved;
      competitor.row["Оборотка"] = legal.turnover;
      if (legal.source) competitor.sources.push(legal.source);
    }
    const serviceDiscovery = await servicesTask;
    competitor.row["Услуги"] = serviceDiscovery.services.length ? serviceDiscovery.services.join("\n") : "Не найдено: на доступных страницах раздела «Услуги» список не подтверждён.";
    competitor.sources.push(...serviceDiscovery.sources);
  });
  const filteredServices = await filterServicesByTopic(input.description, competitors.map((competitor) => ({ site: competitor.domain, context: serviceContextFromRow(competitor.row), services: servicesFromRow(competitor.row) })));
  for (const competitor of competitors) {
    const services = filteredServices.get(competitor.domain) || [];
    competitor.row["Услуги"] = services.length ? services.join("\n") : "Не найдено: релевантные теме H1 страниц услуг не подтверждены.";
  }
  const refined = await refineWithGrok(input, [client.row, ...competitors.map((result) => result.row)]);
  for (const result of [client, ...competitors]) sources.push(...result.sources);
  const columns = [...COLUMNS, ...refined.columns];
  const normalizedRows = refined.rows.map(capitalizeSentences);
  const summary = await buildMarketSummaryWithUsps(normalizedRows, columns, input.description);
  return { columns, rows: normalizedRows, summary, sources: [...new Set(sources)], queries, generatedAt: new Date().toISOString(), topicDescription: input.description };
}

export function inferTopicDescription(result: AnalysisResult): string {
  const client = result.rows.find((row) => (row["Название"] || "").includes("(клиент)"));
  const clientContext = [client?.["Тип продукта"], client?.["Ассортимент"]]
    .filter((value) => value && !/^(?:название \/ предмет деятельности проекта|не найдено|не указано)/iu.test(value));
  const competitorContext = result.rows
    .filter((row) => !(row["Название"] || "").includes("(клиент)"))
    .slice(0, 16)
    .flatMap((row) => [row["Тип продукта"], row["Ассортимент"]])
    .filter(Boolean);
  const context = clientContext.length ? clientContext : competitorContext;
  return [...new Set(context)].join(". ").slice(0, 5000);
}

export async function refilterServicesInResult(result: AnalysisResult, description = ""): Promise<AnalysisResult> {
  const topicDescription = description.trim() || result.topicDescription?.trim() || inferTopicDescription(result);
  const filteredServices = await filterServicesByTopic(topicDescription, result.rows
    .filter((row) => !(row["Название"] || "").includes("(клиент)"))
    .map((row) => ({ site: row["Сайт"], context: serviceContextFromRow(row), services: servicesFromRow(row) })));
  const thematicRows = result.rows.map((row) => {
    if ((row["Название"] || "").includes("(клиент)")) return row;
    const services = filteredServices.get(row["Сайт"]) || [];
    return { ...row, "Услуги": services.length ? services.join("\n") : "Не найдено: релевантные теме H1 страниц услуг не подтверждены." };
  });
  const columns = [...COLUMNS, ...result.columns.filter((column) => !COLUMNS.includes(column as typeof COLUMNS[number]))];
  return { ...result, rows: thematicRows, columns, summary: await buildMarketSummaryWithUsps(thematicRows, columns, topicDescription), topicDescription };
}

export async function refreshServicesInResult(result: AnalysisResult, description = ""): Promise<AnalysisResult> {
  const additionalSources: string[] = [];
  const topicDescription = description.trim() || result.topicDescription?.trim() || inferTopicDescription(result);
  const refreshed = await mapWithConcurrency(result.rows, 8, async (row) => {
    if ((row["Название"] || "").includes("(клиент)")) return { ...row, "Услуги": row["Услуги"] || "Не применимо: строка исследуемого проекта." };
    const domain = normalizeDomain(row["Сайт"] || "");
    if (!domain || !domain.includes(".")) return { ...row, "Услуги": "Не найдено: корректный сайт конкурента не указан." };
    const discovery = await discoverDomainServices(domain);
    additionalSources.push(...discovery.sources);
    return {
      ...row,
      "Услуги": discovery.services.length ? discovery.services.join("\n") : "Не найдено: на доступных страницах раздела «Услуги» список не подтверждён.",
    };
  });
  const rows = refreshed.map((item, index) => item.status === "fulfilled"
    ? item.value
    : { ...result.rows[index], "Услуги": "Не найдено: раздел услуг не удалось открыть автоматически." });
  const filteredServices = await filterServicesByTopic(topicDescription, rows
    .filter((row) => !(row["Название"] || "").includes("(клиент)"))
    .map((row) => ({ site: row["Сайт"], context: serviceContextFromRow(row), services: servicesFromRow(row) })));
  const thematicRows = rows.map((row) => {
    if ((row["Название"] || "").includes("(клиент)")) return row;
    const services = filteredServices.get(row["Сайт"]) || [];
    return { ...row, "Услуги": services.length ? services.join("\n") : "Не найдено: релевантные теме H1 страниц услуг не подтверждены." };
  });
  const columns = [...COLUMNS, ...result.columns.filter((column) => !COLUMNS.includes(column as typeof COLUMNS[number]))];
  const summary = await buildMarketSummaryWithUsps(thematicRows, columns, topicDescription);
  return {
    ...result,
    columns,
    rows: thematicRows,
    summary,
    sources: [...new Set([...result.sources, ...additionalSources])],
    topicDescription,
  };
}
