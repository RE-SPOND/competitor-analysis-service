"use client";

import { FormEvent, useEffect, useState } from "react";

type AnalysisRow = Record<string, string>;
type MarketItem = { name: string; competitors: number; coverage: number };
type MarketSummary = {
  leaders: Array<{ name: string; site: string; score: number; reasons: string[] }>;
  services: MarketItem[];
  coverage: MarketItem[];
  price: { transparent: number; total: number; note: string };
  gaps: string[];
  recommendations: string[];
  risks: string[];
  methodology: string;
};
type SavedAnalysis = { id: string; projectUrl: string; region: string; createdAt: string; rows: AnalysisRow[]; columns: string[]; sources: string[]; summary: MarketSummary };

const baseColumns = [
  "Название", "Сайт", "Тип продукта", "Ассортимент", "УТП", "Ценовой сегмент", "География", "Производство",
  "Индивидуальные решения", "Каналы", "Кейсы", "Сильные стороны", "Слабые стороны", "Особенности", "ОКВЭД", "Оборотка",
];
const historyStorageKey = "competitor-analysis-history-v1";

export default function Home() {
  const [authenticated, setAuthenticated] = useState(false);
  const [login, setLogin] = useState({ username: "admin", password: "admin" });
  const [form, setForm] = useState({ projectUrl: "", description: "", region: "Россия" });
  const [history, setHistory] = useState<SavedAnalysis[]>([]);
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
      if (Array.isArray(saved)) local = saved;
    } catch { /* Ignore malformed browser storage. */ }
    try {
      const response = await fetch("/api/history", { cache: "no-store" });
      const data = await response.json();
      if (!response.ok || !Array.isArray(data.items)) throw new Error("History unavailable");
      const cloud = data.items as SavedAnalysis[];
      const combined = [...cloud, ...local.filter((saved) => !cloud.some((item) => item.id === saved.id))]
        .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
        .slice(0, 30);
      window.localStorage.setItem(historyStorageKey, JSON.stringify(combined));
      setHistory(combined);
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
      setColumns(nextColumns);
      setSources(data.sources ?? []);
      setSummary(data.summary ?? null);
      if (data.summary && nextRows.length > 0) {
        const saved: SavedAnalysis = { id: String(data.id || crypto.randomUUID()), projectUrl: form.projectUrl, region: form.region, createdAt: new Date().toISOString(), rows: nextRows, columns: nextColumns, sources: data.sources ?? [], summary: data.summary };
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
    setStatus(`Открыт сохранённый анализ от ${new Date(saved.createdAt).toLocaleString("ru-RU")}.`);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  if (!authenticated) {
    return <main className="auth-shell"><section className="auth-card"><h1>Конкурентный анализ</h1><p>Тестовый доступ к сервису автоматизации полного регламента.</p><form onSubmit={handleLogin}><label>Логин<input value={login.username} onChange={(e) => setLogin({ ...login, username: e.target.value })} /></label><label>Пароль<input type="password" value={login.password} onChange={(e) => setLogin({ ...login, password: e.target.value })} /></label>{error && <div className="error">{error}</div>}<button className="primary" type="submit">Войти</button></form><small>Тестовый доступ: admin / admin</small></section></main>;
  }

  return <main className="page-shell">
    <header className="topbar"><div><h1>Автоматизированный конкурентный анализ</h1></div><span className="live-pill"><i /> LIVE DATA</span></header>
    <section className="workspace-grid"><div className="panel form-panel"><div className="section-kicker">Новый запуск</div><h2>Введите данные проекта</h2><p className="muted">Для запуска достаточно описания. Если добавить сайт и уточнить регион, сервис использует их как дополнительные источники и сохранит анализ в истории.</p><form onSubmit={handleAnalyze}><label>Ссылка на сайт компании <span className="field-hint">(необязательно)</span><input type="url" placeholder="https://example.ru" value={form.projectUrl} onChange={(e) => setForm({ ...form, projectUrl: e.target.value })} /></label><label>Описание компании и продукта<textarea required placeholder="Опишите продукт, целевую аудиторию, цены, формат продажи и ключевые особенности..." value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /><span className="field-hint">Это единственное обязательное поле. Чем подробнее описание, тем точнее подбор конкурентов и сравнение.</span></label><label>Регион анализа <span className="field-hint">(необязательно)</span><input placeholder="Например, город/страна" value={form.region} onChange={(e) => setForm({ ...form, region: e.target.value })} /><span className="field-hint">Если оставить поле пустым, анализ будет выполнен по России.</span></label>{error && <div className="error">{error}</div>}{status && <div className="status">{status}</div>}<button className="primary" disabled={running} type="submit">{running ? "Собираем всех доступных конкурентов..." : "Запустить анализ"}</button></form></div><div className="panel guide-panel"><div className="section-kicker">Регламент</div><h2>Что делает сервис</h2><ol><li><b>Формирует запросы</b><span>Базовые, коммерческие, локальные, списочные и кейсовые формулировки.</span></li><li><b>Ищет без лимита по количеству</b><span>Просматривает несколько страниц выдачи и объединяет все уникальные домены.</span></li><li><b>Проверяет компании</b><span>Отсеивает дубли и нерелевантные страницы, собирает ассортимент, УТП, цены, каналы и кейсы.</span></li><li><b>Готовит Excel</b><span>Все подтверждённые компании на финальном листе «Анализ».</span></li></ol></div></section>
    {rows.length > 0 && <section className="panel results-panel"><div className="results-head"><div><div className="section-kicker">Результат запуска</div><h2>Сравнительная таблица</h2><p className="muted">Проверено компаний: {rows.length}. Таблица и выводы сохранены в постоянной истории.</p></div><button className="primary" onClick={() => void downloadData(rows, columns, summary)}>Скачать Excel</button></div><div className="table-wrap"><table><thead><tr>{columns.map((column) => <th key={column}>{column}</th>)}</tr></thead><tbody>{rows.map((row, index) => <tr key={`${row["Сайт"]}-${index}`} className={index === 0 ? "baseline" : ""}>{columns.map((column) => <td key={column}>{row[column] || "—"}</td>)}</tr>)}</tbody></table></div>{sources.length > 0 && <details><summary>Источники текущего запуска</summary><ul>{sources.map((source) => <li key={source}><a href={source} target="_blank" rel="noreferrer">{source}</a></li>)}</ul></details>}</section>}
    {summary && <section className="panel summary-panel"><div className="section-kicker">Выводы по рынку</div><h2>Лидеры, покрытие и возможности</h2><p className="muted">{summary.methodology}</p><div className="summary-grid"><div><h3>Лидеры</h3>{summary.leaders.map((leader) => <div className="summary-row" key={leader.site}><b>{leader.name}</b><span>{leader.score} баллов · {leader.reasons.join(", ") || "подтверждённые факты"}</span></div>)}</div><div><h3>Услуги и опции</h3>{summary.services.map((item) => <div className="summary-row" key={item.name}><b>{item.name}</b><span>{item.competitors} из {summary.price.total} · {item.coverage}%</span></div>)}</div><div><h3>Пробелы рынка</h3><ul>{summary.gaps.map((item) => <li key={item}>{item}</li>)}</ul><h3>Рекомендации</h3><ul>{summary.recommendations.map((item) => <li key={item}>{item}</li>)}</ul></div><div><h3>Цены и риски</h3><p>{summary.price.note}</p><ul>{summary.risks.map((item) => <li key={item}>{item}</li>)}</ul></div></div></section>}
    <section className="panel history-panel"><div className="results-head"><div><div className="section-kicker">История</div><h2>Сохранённые анализы</h2></div><span className="count-badge">{history.length}</span></div>{history.length === 0 ? <p className="muted">Запусков пока нет.</p> : <div className="history-list">{history.map((item) => <div className="history-row" key={item.id}><div><b>{item.projectUrl || "Анализ по описанию"}</b><span>{item.region || "Россия"} · {new Date(item.createdAt).toLocaleString("ru-RU")} · компаний: {item.rows.length}</span></div><div className="history-actions"><button className="ghost" onClick={() => openSaved(item)}>Открыть</button><button className="ghost" onClick={() => void downloadData(item.rows, item.columns, item.summary)}>Excel</button></div></div>)}</div>}</section>
  </main>;
}
