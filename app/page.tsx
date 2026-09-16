"use client";

import { FormEvent, useEffect, useState } from "react";

type AnalysisRow = Record<string, string>;
type HistoryItem = { id: number; project_url: string; region: string; created_at: string; competitor_count: number };

const baseColumns = [
  "Название", "Сайт", "Тип продукта", "Ассортимент", "УТП", "Ценовой сегмент", "География", "Производство",
  "Индивидуальные решения", "Каналы", "Кейсы", "Сильные стороны", "Слабые стороны", "Особенности", "ОКВЭД", "Оборотка",
];

export default function Home() {
  const [authenticated, setAuthenticated] = useState(false);
  const [login, setLogin] = useState({ username: "admin", password: "admin" });
  const [form, setForm] = useState({ projectUrl: "", description: "", region: "Россия" });
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [columns, setColumns] = useState<string[]>(baseColumns);
  const [rows, setRows] = useState<AnalysisRow[]>([]);
  const [sources, setSources] = useState<string[]>([]);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [running, setRunning] = useState(false);

  async function loadHistory() {
    const response = await fetch("/api/history");
    if (response.ok) setHistory((await response.json()).items ?? []);
  }

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const response = await fetch("/api/session");
      const data = await response.json();
      if (cancelled) return;
      setAuthenticated(Boolean(data.authenticated));
      if (data.authenticated) {
        const historyResponse = await fetch("/api/history");
        if (!cancelled && historyResponse.ok) setHistory((await historyResponse.json()).items ?? []);
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
    loadHistory();
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
      setRows(data.rows ?? []);
      setColumns(Array.isArray(data.columns) && data.columns.length > 0 ? data.columns : baseColumns);
      setSources(data.sources ?? []);
      setStatus(`Готово: найдено и проверено ${data.rows?.length ?? 0} компаний. Excel можно скачать ниже.`);
      loadHistory();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Не удалось выполнить анализ.");
      setStatus("");
    } finally { setRunning(false); }
  }

  async function downloadCurrent() {
    setError("");
    try {
      const response = await fetch("/api/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows, columns }),
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

  function download(id: number) { window.open(`/api/analyses/${id}/download`, "_blank"); }

  if (!authenticated) {
    return <main className="auth-shell"><section className="auth-card"><h1>Конкурентный анализ</h1><p>Тестовый доступ к сервису автоматизации полного регламента.</p><form onSubmit={handleLogin}><label>Логин<input value={login.username} onChange={(e) => setLogin({ ...login, username: e.target.value })} /></label><label>Пароль<input type="password" value={login.password} onChange={(e) => setLogin({ ...login, password: e.target.value })} /></label>{error && <div className="error">{error}</div>}<button className="primary" type="submit">Войти</button></form><small>Тестовый доступ: admin / admin</small></section></main>;
  }

  return <main className="page-shell">
    <header className="topbar"><div><h1>Автоматизированный конкурентный анализ</h1></div><span className="live-pill"><i /> LIVE DATA</span></header>
    <section className="workspace-grid"><div className="panel form-panel"><div className="section-kicker">Новый запуск</div><h2>Введите данные проекта</h2><p className="muted">Для запуска достаточно описания. Если добавить сайт и уточнить регион, сервис использует их как дополнительные источники и сохранит анализ в истории.</p><form onSubmit={handleAnalyze}><label>Ссылка на сайт компании <span className="field-hint">(необязательно)</span><input type="url" placeholder="https://example.ru" value={form.projectUrl} onChange={(e) => setForm({ ...form, projectUrl: e.target.value })} /></label><label>Описание компании и продукта<textarea required placeholder="Опишите продукт, целевую аудиторию, цены, формат продажи и ключевые особенности..." value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /><span className="field-hint">Это единственное обязательное поле. Чем подробнее описание, тем точнее подбор конкурентов и сравнение.</span></label><label>Регион анализа <span className="field-hint">(необязательно)</span><input placeholder="Например, город/страна" value={form.region} onChange={(e) => setForm({ ...form, region: e.target.value })} /><span className="field-hint">Если оставить поле пустым, анализ будет выполнен по России.</span></label>{error && <div className="error">{error}</div>}{status && <div className="status">{status}</div>}<button className="primary" disabled={running} type="submit">{running ? "Собираем всех доступных конкурентов..." : "Запустить анализ"}</button></form></div><div className="panel guide-panel"><div className="section-kicker">Регламент</div><h2>Что делает сервис</h2><ol><li><b>Формирует запросы</b><span>Базовые, коммерческие, локальные, списочные и кейсовые формулировки.</span></li><li><b>Ищет без лимита по количеству</b><span>Просматривает несколько страниц выдачи и объединяет все уникальные домены.</span></li><li><b>Проверяет компании</b><span>Отсеивает дубли и нерелевантные страницы, собирает ассортимент, УТП, цены, каналы и кейсы.</span></li><li><b>Готовит Excel</b><span>Все подтверждённые компании на финальном листе «Анализ».</span></li></ol></div></section>
    {rows.length > 0 && <section className="panel results-panel"><div className="results-head"><div><div className="section-kicker">Результат запуска</div><h2>Сравнительная таблица</h2><p className="muted">Проверено компаний: {rows.length}. Источники и дата запуска сохранены в истории.</p></div><button className="primary" onClick={downloadCurrent}>Скачать Excel</button></div><div className="table-wrap"><table><thead><tr>{columns.map((column) => <th key={column}>{column}</th>)}</tr></thead><tbody>{rows.map((row, index) => <tr key={`${row["Сайт"]}-${index}`} className={index === 0 ? "baseline" : ""}>{columns.map((column) => <td key={column}>{row[column] || "—"}</td>)}</tr>)}</tbody></table></div>{sources.length > 0 && <details><summary>Источники текущего запуска</summary><ul>{sources.map((source) => <li key={source}><a href={source} target="_blank" rel="noreferrer">{source}</a></li>)}</ul></details>}</section>}
    <section className="panel history-panel"><div className="results-head"><div><div className="section-kicker">История</div><h2>Предыдущие анализы</h2></div><span className="count-badge">{history.length}</span></div>{history.length === 0 ? <p className="muted">Запусков пока нет.</p> : <div className="history-list">{history.map((item) => <div className="history-row" key={item.id}><div><b>{item.project_url || "Анализ по описанию"}</b><span>{item.region || "Россия"} · {new Date(item.created_at).toLocaleString("ru-RU")} · компаний: {item.competitor_count}</span></div><button className="ghost" onClick={() => download(item.id)}>Скачать Excel</button></div>)}</div>}</section>
    <footer>Тестовая версия · доступ `admin/admin` · актуальные данные собираются при каждом запуске</footer>
  </main>;
}
