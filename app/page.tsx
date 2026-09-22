"use client";

import { FormEvent, useEffect, useState } from "react";

type AnalysisRow = Record<string, string>;
type MarketItem = { name: string; competitors: number; coverage: number };
type ProposedUsp = { statement: string; rationale: string };
type ServiceCatalogItem = MarketItem & { competitorsList: string[] };
type MarketSummary = {
  serviceCatalogVersion?: number;
  leaders: Array<{ name: string; site: string; score: number; reasons: string[] }>;
  services: MarketItem[];
  serviceCatalog?: ServiceCatalogItem[];
  coverage: MarketItem[];
  price: { transparent: number; total: number; note: string };
  gaps: string[];
  recommendations: string[];
  risks: string[];
  proposedUsps?: ProposedUsp[];
  methodology: string;
};
type SavedAnalysis = { id: string; title: string; projectUrl: string; description?: string; region: string; createdAt: string; rows: AnalysisRow[]; columns: string[]; sources: string[]; summary: MarketSummary };

const baseColumns = [
  "Название", "Сайт", "Тип продукта", "Ассортимент", "Услуги", "УТП", "Ценовой сегмент", "География", "Производство",
  "Индивидуальные решения", "Каналы", "Кейсы", "Сильные стороны", "Слабые стороны", "Особенности", "ОКВЭД", "Оборотка",
];
const historyStorageKey = "competitor-analysis-history-v1";

function savedAnalysisTopic(item: SavedAnalysis): string {
  if (item.description?.trim()) return item.description.trim();
  const client = item.rows.find((row) => (row["Название"] || "").includes("(клиент)"));
  const clientContext = [client?.["Тип продукта"], client?.["Ассортимент"]]
    .filter((value) => value && !/^(?:название \/ предмет деятельности проекта|не найдено|не указано)/iu.test(value));
  const competitorContext = item.rows
    .filter((row) => !(row["Название"] || "").includes("(клиент)"))
    .slice(0, 16)
    .flatMap((row) => [row["Тип продукта"], row["Ассортимент"]])
    .filter(Boolean);
  const context = clientContext.length ? clientContext : [item.title, ...competitorContext];
  return [...new Set(context)].join(". ").slice(0, 5000);
}

export default function Home() {
  const [authenticated, setAuthenticated] = useState(false);
  const [login, setLogin] = useState({ username: "admin", password: "admin" });
  const [form, setForm] = useState({ projectUrl: "", description: "", region: "Россия", title: "" });
  const [history, setHistory] = useState<SavedAnalysis[]>([]);
  const [historyQuery, setHistoryQuery] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftTitle, setDraftTitle] = useState("");
  const [tableExpanded, setTableExpanded] = useState(false);
  const [servicesExpanded, setServicesExpanded] = useState(false);
  const [currentAnalysisTitle, setCurrentAnalysisTitle] = useState("");
  const [columns, setColumns] = useState<string[]>(baseColumns);
  const [rows, setRows] = useState<AnalysisRow[]>([]);
  const [sources, setSources] = useState<string[]>([]);
  const [summary, setSummary] = useState<MarketSummary | null>(null);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [running, setRunning] = useState(false);

  async function loadHistory() {
    let local: SavedAnalysis[] = [];
    try {
      const saved = JSON.parse(window.localStorage.getItem(historyStorageKey) || "[]");
      if (Array.isArray(saved)) local = saved.map((item) => ({ ...item, title: item.title || item.projectUrl || "Анализ по описанию" }));
    } catch { /* Ignore malformed browser storage. */ }
    try {
      const response = await fetch("/api/history", { cache: "no-store" });
      const data = await response.json();
      if (!response.ok || !Array.isArray(data.items)) throw new Error("History unavailable");
      const cloud = (data.items as SavedAnalysis[]).map((item) => ({ ...item, title: item.title || item.projectUrl || "Анализ по описанию" }));
      const combined = [...cloud, ...local.filter((saved) => !cloud.some((item) => item.id === saved.id))]
        .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
        .slice(0, 30);
      const enriched: SavedAnalysis[] = [];
      for (const item of combined) {
        if ((item.summary?.serviceCatalogVersion || 0) >= 10 && item.summary?.proposedUsps?.length) {
          enriched.push({ ...item, description: savedAnalysisTopic(item) });
          continue;
        }
        try {
          const description = savedAnalysisTopic(item);
          const response = await fetch("/api/summary", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ rows: item.rows, columns: item.columns, sources: item.sources, summary: item.summary, description }) });
          const data = await response.json();
          enriched.push(response.ok && data.result
            ? { ...item, description, rows: data.result.rows, columns: data.result.columns, sources: data.result.sources, summary: data.result.summary as MarketSummary }
            : { ...item, description });
        } catch { enriched.push({ ...item, description: savedAnalysisTopic(item) }); }
      }
      window.localStorage.setItem(historyStorageKey, JSON.stringify(enriched));
      await fetch("/api/history", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ items: enriched }) }).catch(() => undefined);
      setHistory(enriched);
    } catch {
      setHistory(local);
    }
  }

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const response = await fetch("/api/session");
      const data = await response.json();
      if (cancelled) return;
      setAuthenticated(Boolean(data.authenticated));
      if (data.authenticated) {
        if (!cancelled) void loadHistory();
      }
    }
    void load();
    return () => { cancelled = true; };
  }, []);

  async function handleLogin(event: FormEvent) {
    event.preventDefault();
    setError("");
    const response = await fetch("/api/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(login) });
    if (!response.ok) { setError("Неверный логин или пароль."); return; }
    setAuthenticated(true);
    void loadHistory();
  }

  async function handleAnalyze(event: FormEvent) {
    event.preventDefault();
    setError("");
    setStatus("Ищем конкурентов и собираем актуальные данные из интернета...");
    setRunning(true);
    setRows([]);
    try {
      const response = await fetch("/api/analyze", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Не удалось выполнить анализ.");
      const nextRows = data.rows ?? [];
      const nextColumns = Array.isArray(data.columns) && data.columns.length > 0 ? data.columns : baseColumns;
      setRows(nextRows);
      setTableExpanded(false);
      setServicesExpanded(false);
      setCurrentAnalysisTitle(form.title);
      setColumns(nextColumns);
      setSources(data.sources ?? []);
      setSummary(data.summary ?? null);
      if (data.summary) {
        const saved: SavedAnalysis = { id: String(data.id || crypto.randomUUID()), title: form.title, projectUrl: form.projectUrl, description: form.description, region: form.region, createdAt: new Date().toISOString(), rows: nextRows, columns: nextColumns, sources: data.sources ?? [], summary: data.summary };
        setHistory((current) => {
          const next = [saved, ...current].slice(0, 30);
          window.localStorage.setItem(historyStorageKey, JSON.stringify(next));
          return next;
        });
      }
      setStatus(`Готово: найдено и проверено ${data.rows?.length ?? 0} компаний. Excel можно скачать ниже.`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Не удалось выполнить анализ.");
      setStatus("");
    } finally { setRunning(false); }
  }

  async function downloadData(exportRows: AnalysisRow[], exportColumns: string[], exportSummary: MarketSummary | null) {
    setError("");
    try {
      const response = await fetch("/api/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows: exportRows, columns: exportColumns, summary: exportSummary }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || "Не удалось подготовить Excel-файл.");
      }
      const fileUrl = URL.createObjectURL(await response.blob());
      const link = document.createElement("a");
      link.href = fileUrl;
      link.download = "competitor-analysis.xlsx";
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(fileUrl);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Не удалось скачать Excel-файл.");
    }
  }

  function openSaved(saved: SavedAnalysis) {
    setRows(saved.rows); setColumns(saved.columns); setSources(saved.sources); setSummary(saved.summary);
    setTableExpanded(false);
    setServicesExpanded(false);
    setCurrentAnalysisTitle(saved.title);
    setStatus(`Открыт анализ «${saved.title}» от ${new Date(saved.createdAt).toLocaleString("ru-RU")}.`);
    document.getElementById("results")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  const filteredHistory = history.filter((item) => `${item.title} ${item.projectUrl} ${item.region}`.toLowerCase().includes(historyQuery.toLowerCase().trim()));
  const visibleRows = tableExpanded ? rows : rows.slice(0, 5);
  const visibleServices = summary?.serviceCatalog
    ? (servicesExpanded ? summary.serviceCatalog : summary.serviceCatalog.slice(0, 5))
    : [];

  async function saveTitle(item: SavedAnalysis) {
    const title = draftTitle.trim();
    if (!title) return;
    const updateLocal = () => setHistory((current) => {
      const next = current.map((entry) => entry.id === item.id ? { ...entry, title } : entry);
      window.localStorage.setItem(historyStorageKey, JSON.stringify(next));
      return next;
    });
    try {
      const response = await fetch(`/api/analyses/${item.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title }) });
      if (!response.ok && response.status !== 404) throw new Error("Не удалось сохранить название.");
      updateLocal();
      setEditingId(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Не удалось сохранить название.");
    }
  }

  if (!authenticated) {
    return <main className="auth-shell"><section className="auth-card"><h1>Конкурентный анализ</h1><p>Тестовый доступ к сервису автоматизации полного регламента.</p><form onSubmit={handleLogin}><label>Логин<input value={login.username} onChange={(e) => setLogin({ ...login, username: e.target.value })} /></label><label>Пароль<input type="password" value={login.password} onChange={(e) => setLogin({ ...login, password: e.target.value })} /></label>{error && <div className="error">{error}</div>}<button className="primary" type="submit">Войти</button></form><small>Тестовый доступ: admin / admin</small></section></main>;
  }

  return <main className="app-shell clean-shell">
    <header className="app-header"><a className="app-brand" href="#new"><span>CA</span><b>Конкурентный анализ</b></a><nav><a href="#new">Новый анализ</a><a href="#history">История <em>{history.length}</em></a></nav><div className="cloud-status"><i /> Данные сохраняются</div></header>
    <div className="page-shell"><header className="topbar"><div><h1>Анализ конкурентов</h1><p>Опишите продукт — сервис найдёт игроков рынка, сравнит их и сформирует выводы.</p></div></header>
    <section id="new" className="workspace-grid single-column"><div className="panel form-panel"><div className="section-kicker">Новый анализ</div><h2>Создайте исследование</h2><p className="muted">Название появится в архиве — так вы быстро найдёте нужный запуск позже.</p><form onSubmit={handleAnalyze}><label>Название анализа<input required maxLength={90} placeholder="Например, Модульные сараи — Москва, сентябрь" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></label><div className="form-two-columns"><label>Регион<input maxLength={100} placeholder="Например, Москва" value={form.region} onChange={(e) => setForm({ ...form, region: e.target.value })} /></label><label>Ссылка на сайт компании <span className="field-hint">необязательно</span><input type="url" placeholder="https://example.ru" value={form.projectUrl} onChange={(e) => setForm({ ...form, projectUrl: e.target.value })} /></label></div><label>Описание продукта<textarea required maxLength={5000} placeholder="Что вы предлагаете, кому, в каком формате продаёте, цены и ключевые особенности…" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /><span className="field-hint">Можно начать только с описания. Сайт добавит контекст к поиску.</span></label>{error && <div className="error" role="alert">{error}</div>}{status && <div className="status" role="status">{status}</div>}<button className="primary" disabled={running} type="submit">{running ? "Собираем конкурентов…" : "Запустить анализ"}</button></form></div></section>
    {rows.length > 0 && <section id="results" className="panel results-panel"><div className="results-head"><div><div className="section-kicker">Открытый анализ</div><h2>{currentAnalysisTitle || "Сравнительная таблица"}</h2><p className="muted">Показано {visibleRows.length} из {rows.length} компаний. Полный список и выводы сохранены в архиве.</p></div><button className="primary" onClick={() => void downloadData(rows, columns, summary)}>Скачать Excel</button></div><p className="scroll-hint">Прокрутите таблицу по горизонтали. Полный текст ячейки доступен при наведении.</p><div className="table-wrap"><table><thead><tr>{columns.map((column) => <th key={column}>{column}</th>)}</tr></thead><tbody>{visibleRows.map((row, index) => <tr key={`${row["Сайт"]}-${index}`} className={index === 0 ? "baseline" : ""}>{columns.map((column) => { const value = row[column] || "—"; return <td key={column}><span className="table-cell-content" title={value}>{value}</span></td>; })}</tr>)}</tbody></table></div>{rows.length > 5 && <button className="show-table" onClick={() => setTableExpanded((value) => !value)} aria-expanded={tableExpanded}>{tableExpanded ? "Свернуть до 5 компаний" : `Показать ещё ${rows.length - 5} компаний`}</button>}{sources.length > 0 && <details><summary>Источники текущего запуска</summary><ul>{sources.map((source) => <li key={source}><a href={source} target="_blank" rel="noreferrer">{source}</a></li>)}</ul></details>}</section>}
    {summary && <section className="panel summary-panel"><div className="section-kicker">Выводы по рынку</div><h2>Лидеры, покрытие и возможности</h2><p className="muted">{summary.methodology}</p><div className="summary-grid"><div><h3>Лидеры</h3>{summary.leaders.map((leader) => <div className="summary-row" key={leader.site}><b>{leader.name}</b><span>{leader.score} баллов · {leader.reasons.join(", ") || "подтверждённые факты"}</span></div>)}</div><div><h3>Пробелы рынка</h3><ul>{summary.gaps.map((item) => <li key={item}>{item}</li>)}</ul><h3>Рекомендации</h3><ul>{summary.recommendations.map((item) => <li key={item}>{item}</li>)}</ul></div><div><h3>Цены и риски</h3><p>{summary.price.note}</p><ul>{summary.risks.map((item) => <li key={item}>{item}</li>)}</ul></div></div>{summary.proposedUsps && summary.proposedUsps.length > 0 && <div className="proposed-usps"><div className="service-catalog-head"><div><h3>Предложенные УТП</h3><p>Варианты позиционирования на основе пробелов рынка, слабых мест и типовых обещаний конкурентов.</p></div><span>{summary.proposedUsps.length} вариантов</span></div><div className="usp-list">{summary.proposedUsps.map((item, index) => <article className="usp-card" key={`${index}-${item.statement}`}><span>{index + 1}</span><div><b>{item.statement}</b><p>{item.rationale}</p></div></article>)}</div></div>}{summary.serviceCatalog && <div className="service-catalog"><div className="service-catalog-head"><div><h3>Список услуг по теме</h3><p>H1 отдельных страниц услуг конкурентов, отфильтрованные по описанию проекта. Без товаров, кластеров и придуманных URL.</p></div><span>{summary.serviceCatalog.length} услуг</span></div>{summary.serviceCatalog.length ? <><div className="service-catalog-list">{visibleServices.map((item, index) => <div className="service-catalog-item" key={item.name}><span>{index + 1}</span><b>{item.name}</b></div>)}</div>{summary.serviceCatalog.length > 5 && <button className="show-table service-catalog-toggle" onClick={() => setServicesExpanded((value) => !value)} aria-expanded={servicesExpanded}>{servicesExpanded ? "Свернуть до 5 услуг" : `Показать ещё ${summary.serviceCatalog.length - 5} услуг`}</button>}</> : <p className="muted">На доступных страницах конкурентов релевантные теме услуги не подтверждены.</p>}</div>}</section>}
    <section id="history" className="panel history-panel"><div className="results-head"><div><div className="section-kicker">Архив</div><h2>Сохранённые анализы</h2></div><input className="history-search" aria-label="Поиск по архиву" placeholder="Найти анализ…" value={historyQuery} onChange={(event) => setHistoryQuery(event.target.value)} /></div>{filteredHistory.length === 0 ? <p className="muted">{history.length ? "Ничего не найдено." : "Запусков пока нет — создайте первый анализ выше."}</p> : <div className="history-list">{filteredHistory.map((item) => <article className="history-row" key={item.id}><div className="history-icon">{item.title.slice(0, 1).toUpperCase()}</div><div className="history-title">{editingId === item.id ? <div className="rename-form"><input aria-label="Новое название анализа" value={draftTitle} onChange={(event) => setDraftTitle(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") void saveTitle(item); if (event.key === "Escape") setEditingId(null); }} /><button className="ghost" onClick={() => void saveTitle(item)}>Сохранить</button><button className="text-button" onClick={() => setEditingId(null)}>Отмена</button></div> : <><b>{item.title}</b><button className="rename-button" onClick={() => { setEditingId(item.id); setDraftTitle(item.title); }}>Переименовать</button></>}<span>{item.region || "Россия"} · {new Date(item.createdAt).toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric" })} · {item.rows.length} компаний</span>{item.projectUrl && <small>{item.projectUrl}</small>}</div><div className="history-actions"><button className="ghost" onClick={() => openSaved(item)}>Открыть</button><button className="icon-button" aria-label={`Скачать Excel: ${item.title}`} title="Скачать Excel" onClick={() => void downloadData(item.rows, item.columns, item.summary)}>↓</button></div></article>)}</div>}</section>
    </div></main>;
}
