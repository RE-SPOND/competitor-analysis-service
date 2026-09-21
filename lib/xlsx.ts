import { COLUMNS, type AnalysisRow, type MarketSummary } from "./analysis";

const encoder = new TextEncoder();

function escapeXml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

function columnName(index: number): string {
  let value = "";
  let current = index + 1;
  while (current > 0) { const remainder = (current - 1) % 26; value = String.fromCharCode(65 + remainder) + value; current = Math.floor((current - 1) / 26); }
  return value;
}

function inlineCell(ref: string, value: string, style = 2): string {
  const text = escapeXml(value || "—").replace(/\r?\n/g, "&#10;");
  return `<c r="${ref}" t="inlineStr" s="${style}"><is><t xml:space="preserve">${text}</t></is></c>`;
}

function sheetXml(rows: AnalysisRow[], columns: string[]): string {
  const headers = columns.map((column, index) => inlineCell(`${columnName(index)}1`, column, 1)).join("");
  const body = rows.map((row, rowIndex) => `<row r="${rowIndex + 2}">${columns.map((column, columnIndex) => inlineCell(`${columnName(columnIndex)}${rowIndex + 2}`, row[column])).join("")}</row>`).join("");
  const widths = columns.map((_, index) => `<col min="${index + 1}" max="${index + 1}" width="24" customWidth="1"/>`).join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><cols>${widths}</cols><sheetData><row r="1">${headers}</row>${body}</sheetData><autoFilter ref="A1:${columnName(columns.length - 1)}${rows.length + 1}"/><freezePanes><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></freezePanes></worksheet>`;
}

function summaryRows(summary: MarketSummary): AnalysisRow[] {
  const rows: AnalysisRow[] = [];
  for (const leader of summary.leaders) rows.push({ "Раздел": "Лидеры", "Показатель": leader.name, "Значение": `${leader.score} баллов: ${leader.reasons.join(", ") || "подтверждённые факты"}` });
  for (const item of summary.proposedUsps || []) rows.push({ "Раздел": "Предложенные УТП", "Показатель": item.statement, "Значение": item.rationale });
  if (!summary.serviceCatalog?.length) {
    for (const item of summary.services) rows.push({ "Раздел": "Услуги и опции", "Показатель": item.name, "Значение": `${item.competitors} из ${summary.price.total} конкурентов (${item.coverage}%)` });
  }
  for (const item of summary.coverage) rows.push({ "Раздел": "Покрытие параметров", "Показатель": item.name, "Значение": `${item.competitors} из ${summary.price.total} конкурентов (${item.coverage}%)` });
  rows.push({ "Раздел": "Цены", "Показатель": "Прозрачность", "Значение": summary.price.note });
  for (const item of summary.gaps) rows.push({ "Раздел": "Пробелы рынка", "Показатель": "Возможность", "Значение": item });
  for (const item of summary.recommendations) rows.push({ "Раздел": "Рекомендации", "Показатель": "Действие", "Значение": item });
  for (const item of summary.risks) rows.push({ "Раздел": "Ограничения", "Показатель": "Риск", "Значение": item });
  rows.push({ "Раздел": "Методика", "Показатель": "Как рассчитано", "Значение": summary.methodology });
  return rows;
}

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) { crc ^= byte; for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0); }
  return (crc ^ 0xffffffff) >>> 0;
}

function u16(value: number): Uint8Array { const result = new Uint8Array(2); new DataView(result.buffer).setUint16(0, value, true); return result; }
function u32(value: number): Uint8Array { const result = new Uint8Array(4); new DataView(result.buffer).setUint32(0, value, true); return result; }
function concat(parts: Uint8Array[]): Uint8Array { const length = parts.reduce((sum, part) => sum + part.length, 0); const result = new Uint8Array(length); let offset = 0; for (const part of parts) { result.set(part, offset); offset += part.length; } return result; }

function zip(files: Array<[string, string]>): Uint8Array {
  const local: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  for (const [name, content] of files) {
    const nameBytes = encoder.encode(name); const data = encoder.encode(content); const checksum = crc32(data);
    const localHeader = concat([u32(0x04034b50), u16(20), u16(0), u16(0), u16(0), u16(0), u32(checksum), u32(data.length), u32(data.length), u16(nameBytes.length), u16(0), nameBytes, data]);
    local.push(localHeader);
    central.push(concat([u32(0x02014b50), u16(20), u16(20), u16(0), u16(0), u16(0), u16(0), u32(checksum), u32(data.length), u32(data.length), u16(nameBytes.length), u16(0), u16(0), u16(0), u16(0), u32(0), u32(offset), nameBytes]));
    offset += localHeader.length;
  }
  const localBytes = concat(local); const centralBytes = concat(central);
  return concat([localBytes, centralBytes, u32(0x06054b50), u16(0), u16(0), u16(files.length), u16(files.length), u32(centralBytes.length), u32(localBytes.length), u16(0)]);
}

export function buildXlsx(rows: AnalysisRow[], columns: string[] = [...COLUMNS], summary?: MarketSummary): Uint8Array {
  const hasSummary = Boolean(summary);
  const hasServices = Boolean(summary?.serviceCatalog?.length);
  const summaryColumns = ["Раздел", "Показатель", "Значение"];
  const serviceRows = (summary?.serviceCatalog || []).map((item) => ({ "Услуга": item.name }));
  const files: Array<[string, string]> = [
    ["[Content_Types].xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>${hasSummary ? '<Override PartName="/xl/worksheets/sheet2.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>' : ""}${hasServices ? '<Override PartName="/xl/worksheets/sheet3.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>' : ""}<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`],
    ["_rels/.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`],
    ["xl/workbook.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Анализ" sheetId="1" r:id="rId1"/>${hasSummary ? '<sheet name="Выводы" sheetId="2" r:id="rId2"/>' : ""}${hasServices ? '<sheet name="Услуги" sheetId="3" r:id="rId3"/>' : ""}</sheets></workbook>`],
    ["xl/_rels/workbook.xml.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>${hasSummary ? '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/>' : ""}${hasServices ? '<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet3.xml"/>' : ""}<Relationship Id="rId${hasServices ? 4 : hasSummary ? 3 : 2}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`],
    ["xl/styles.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Arial"/></font><font><b/><color rgb="FFFFFFFF"/><sz val="11"/><name val="Arial"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF0C4638"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="3"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf><xf numFmtId="0" fontId="1" fillId="2" borderId="0" applyAlignment="1"><alignment horizontal="left" vertical="center" wrapText="1"/></xf><xf numFmtId="0" fontId="0" fillId="0" borderId="0" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf></cellXfs></styleSheet>`],
    ["xl/worksheets/sheet1.xml", sheetXml(rows, columns)],
    ...(summary ? [["xl/worksheets/sheet2.xml", sheetXml(summaryRows(summary), summaryColumns)] as [string, string]] : []),
    ...(hasServices ? [["xl/worksheets/sheet3.xml", sheetXml(serviceRows, ["Услуга"])] as [string, string]] : []),
  ];
  return zip(files);
}
