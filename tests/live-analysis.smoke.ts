import { analyzeProject } from "../lib/analysis";

const result = await analyzeProject({
  title: "Smoke test",
  projectUrl: "https://insightlogia.ru",
  description: "Сервис психологической самопомощи, подписка, онлайн-консультации и отчеты",
  region: "Москва",
});

console.log(JSON.stringify({
  rowCount: result.rows.length,
  names: result.rows.map((row) => row["Название"]),
  sites: result.rows.map((row) => row["Сайт"]),
  products: result.rows.map((row) => row["Тип продукта"]),
  production: result.rows.map((row) => row["Производство"]),
  sources: result.sources.length,
}, null, 2));
