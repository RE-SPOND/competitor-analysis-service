export const COLUMNS = [
  "Название", "Сайт", "Тип продукта", "Ассортимент", "УТП", "Ценовой сегмент", "География", "Производство",
  "Индивидуальные решения", "Каналы", "Кейсы", "Сильные стороны", "Слабые стороны", "Особенности", "ОКВЭД", "Оборотка",
] as const;

export type AnalysisInput = { projectUrl: string; description: string; region: string };
export type AnalysisRow = Record<(typeof COLUMNS)[number], string>;
export type AnalysisResult = { rows: AnalysisRow[]; sources: string[]; queries: string[]; generatedAt: string };

const USER_AGENT = "Mozilla/5.0 (compatible; CFD-Competitor-Analysis/1.0)";
const blockedDomains = new Set(["yandex.ru", "ya.ru", "google.com", "youtube.com", "vk.com", "2gis.ru", "checko.ru", "rusprofile.ru"]);

function isTechnicalDomain(domain: string): boolean {
  return blockedDomains.has(domain)
    || domain.endsWith(".yandex.ru")
    || domain.endsWith(".yandex.net")
    || domain.includes(".cdn.")
    || domain.includes("captcha")
    || domain.includes("yastatic")
    || domain.includes("clck.")
    || domain.includes("yabs.");
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

async function fetchText(url: string): Promise<string> {
  const response = await fetch(url, { headers: { "User-Agent": USER_AGENT, "Accept-Language": "ru-RU,ru;q=0.9" }, signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.text();
}

function domainsFromHtml(html: string): string[] {
  const matches = html.matchAll(/https?:\/\/([^"'\\\s<>/?#]+)/gi);
  const result: string[] = [];
  for (const match of matches) {
    const domain = normalizeDomain(match[1]);
    if (!domain || isTechnicalDomain(domain) || domain.includes("search")) continue;
    if (!result.includes(domain)) result.push(domain);
  }
  return result;
}

function makeQueries(input: AnalysisInput): string[] {
  const region = input.region.trim();
  const base = input.description.trim();
  const standard = [
    `${base} ${region}`,
    `купить ${base} ${region}`,
    `производитель ${base}`,
    `фасадный декор из минеральной ваты ${region}`,
    `декоративные фасадные изделия из минеральной ваты`,
    `архитектурный декор из минваты ${region}`,
    `негорючий фасадный декор ${region}`,
    `конкуренты ${base}`,
  ];
  return [...new Set(standard.map((query) => query.replace(/\s+/g, " ").trim()))].slice(0, 8);
}

async function searchYandex(query: string): Promise<{ domains: string[]; source: string }> {
  const source = `https://yandex.ru/search/?text=${encodeURIComponent(query)}`;
  const html = await fetchText(source);
  return { domains: domainsFromHtml(html).slice(0, 10), source };
}

function firstSentence(text: string): string {
  const part = text.split(/(?<=[.!?])\s+/).find((item) => item.length > 35);
  return (part || text).slice(0, 240).trim();
}

function findAny(text: string, words: string[]): boolean { const lower = text.toLowerCase(); return words.some((word) => lower.includes(word)); }
function listFound(text: string, mapping: Record<string, string>): string { const lower = text.toLowerCase(); return Object.entries(mapping).filter(([key]) => lower.includes(key)).map(([, value]) => value).join(", "); }

function price(text: string): string {
  const match = text.match(/(?:от\s*)?\d[\d\s]{2,12}\s?(?:₽|руб(?:лей)?)/i);
  return match ? match[0].replace(/\s+/g, " ") : "Цена на сайте не указана.";
}

function contactChannels(html: string, text: string): string {
  const channels = ["Сайт"];
  if (/tel:/i.test(html) || /\+?\d[\d\s()\-]{8,}/.test(text)) channels.push("телефон");
  if (/mailto:/i.test(html) || /[\w.+-]+@[\w.-]+\.[a-z]{2,}/i.test(text)) channels.push("email");
  if (/whatsapp/i.test(html)) channels.push("WhatsApp");
  if (/telegram|t\.me/i.test(html)) channels.push("Telegram");
  if (/vk\.com|vkontakte/i.test(html)) channels.push("VK");
  if (/форма|заявк|обратн.*звон/i.test(text)) channels.push("форма заявки");
  return [...new Set(channels)].join(", ");
}

async function legalLookup(domain: string): Promise<{ okved: string; turnover: string; source: string }> {
  const query = `${domain} ИНН ОКВЭД выручка`;
  const source = `https://yandex.ru/search/?text=${encodeURIComponent(query)}`;
  try {
    const text = pageText(await fetchText(source));
    const okved = text.match(/ОКВЭД[^\d]{0,28}(\d{2}\.\d{1,2}(?:\.\d{1,2})?)/i)?.[1];
    const turnover = text.match(/выручк[а-я]*[^\d]{0,28}([\d\s,.]+(?:млн|млрд)?\s*(?:₽|руб(?:лей)?))/i)?.[1];
    return { okved: okved || "Не подтверждено: требуется проверка юрданных.", turnover: turnover || "Не подтверждено: выручка не найдена в открытой выдаче.", source };
  } catch {
    return { okved: "Не подтверждено: требуется проверка юрданных.", turnover: "Не подтверждено: выручка не найдена в открытой выдаче.", source };
  }
}

async function analyzeDomain(domain: string, input: AnalysisInput, isClient: boolean): Promise<{ row: AnalysisRow; sources: string[] }> {
  const url = `https://${domain}/`;
  let html = "";
  let text = "";
  let title = domain;
  let errorNote = "";
  try { html = await fetchText(url); text = pageText(html); title = titleFromHtml(html) || domain; } catch (error) { errorNote = ` Страница не открылась автоматически: ${error instanceof Error ? error.message : "ошибка сети"}.`; }
  const lower = text.toLowerCase();
  const product = listFound(text, { "минеральн": "декор из минеральной ваты", "фасадн": "фасадный декор", "архитектур": "архитектурные элементы", "утепл": "утепление", "искусственн": "искусственный камень", "бетон": "архитектурный бетон", "пенополистирол": "декор из пенополистирола" }) || "Фасадный декор и архитектурные элементы (по описанию сайта).";
  const assortment = listFound(text, { "карниз": "карнизы", "наличник": "наличники", "колонн": "колонны", "пилястр": "пилястры", "балюстр": "балюстрады", "руст": "русты", "капител": "капители", "барельеф": "барельефы", "молдинг": "молдинги", "подокон": "подоконники" }) || "Ассортимент требует дополнительного просмотра каталога.";
  const usp = listFound(text, { "негорюч": "негорючесть", "класс к0": "класс К0", "собственн.*производ": "собственное производство", "под ключ": "решение под ключ", "чпу": "ЧПУ / точная обработка", "доставк": "доставка", "сертификат": "сертификаты" }) || "Явное УТП автоматически не выделено.";
  const geography = listFound(text, { "моск": "Москва", "санкт-петербург": "Санкт-Петербург", "ленинград": "Ленинградская область", "нижн.*новгород": "Нижний Новгород", "по россии": "работа по РФ", "по всей россии": "работа по РФ" }) || input.region;
  const production = findAny(text, ["собственное производство", "производим", "изготавливаем", "производство"]) ? "Да" : "Не подтверждено на главной странице";
  const custom = findAny(text, ["индивидуальн", "по проекту", "нестандарт", "под заказ", "эскиз"]) ? "Да" : "Не указано";
  const cases = findAny(text, ["портфолио", "наши объекты", "реализованные объекты", "кейсы", "проекты"]) ? "Да, найден раздел или упоминание объектов" : "Не найдено на доступной странице";
  const differentiators = usp;
  const strengths = [production === "Да" ? "есть признаки собственного производства" : "информация о производстве ограничена", cases.startsWith("Да") ? "есть раздел с объектами" : "кейсы не подтверждены", custom === "Да" ? "есть индивидуальные решения" : "кастомизация не подтверждена"].join("; ");
  const weaknesses = [price(text).startsWith("Цена на") ? "нет прозрачной цены" : "цена встречается на сайте", cases.startsWith("Да") ? "" : "слабая доказательная база кейсов", errorNote ? "ограниченный доступ к странице" : ""].filter(Boolean).join("; ");
  const legal = await legalLookup(domain);
  const displayName = title.split(/[|–—-]/)[0].trim().slice(0, 100) || domain;
  return {
    row: {
      "Название": isClient ? `${displayName} (клиент)` : displayName,
      "Сайт": domain,
      "Тип продукта": product,
      "Ассортимент": assortment,
      "УТП": differentiators,
      "Ценовой сегмент": price(text),
      "География": geography,
      "Производство": production,
      "Индивидуальные решения": custom,
      "Каналы": contactChannels(html, text),
      "Кейсы": cases,
      "Сильные стороны": strengths,
      "Слабые стороны": weaknesses || "Не удалось автоматически выделить.",
      "Особенности": isClient ? "Клиент / эталон для сравнения." : `Собрано по доступной странице сайта.${errorNote}`,
      "ОКВЭД": legal.okved,
      "Оборотка": legal.turnover,
    },
    sources: [url, legal.source],
  };
}

export async function analyzeProject(input: AnalysisInput): Promise<AnalysisResult> {
  let normalizedUrl = input.projectUrl.trim();
  if (!/^https?:\/\//i.test(normalizedUrl)) normalizedUrl = `https://${normalizedUrl}`;
  const clientDomain = normalizeDomain(normalizedUrl);
  if (!clientDomain || !clientDomain.includes(".")) throw new Error("Укажите корректную ссылку на сайт компании.");
  const queries = makeQueries(input);
  const sources: string[] = [normalizedUrl];
  const counts = new Map<string, number>();
  for (const query of queries) {
    try {
      const result = await searchYandex(query);
      sources.push(result.source);
      for (const domain of result.domains) { if (domain !== clientDomain && !domain.endsWith(`.${clientDomain}`)) counts.set(domain, (counts.get(domain) || 0) + 1); }
    } catch { /* A blocked search query does not invalidate successful queries. */ }
  }
  const competitors = [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([domain]) => domain).slice(0, 5);
  if (competitors.length === 0) throw new Error("Не удалось получить актуальную выдачу. Повторите запуск позже или проверьте доступность поисковых источников.");
  const client = await analyzeDomain(clientDomain, input, true);
  const competitorResults = await Promise.all(competitors.map((domain) => analyzeDomain(domain, input, false)));
  const rows = [client.row, ...competitorResults.map((result) => result.row)];
  for (const result of [client, ...competitorResults]) sources.push(...result.sources);
  return { rows, sources: [...new Set(sources)], queries, generatedAt: new Date().toISOString() };
}
