export type CsvCell = string | number | boolean | null;
export type CsvRow = Readonly<Record<string, CsvCell>>;

const dangerousSpreadsheetPrefix = /^[=+\-@]/;

export function neutralizeCsvCell(value: CsvCell): string {
  if (value === null) return "";
  const text = String(value);
  return typeof value === "string" && dangerousSpreadsheetPrefix.test(text) ? `'${text}` : text;
}

function quote(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
}

export function serializeCsv(columns: readonly string[], rows: readonly CsvRow[]): string {
  const lines = [columns.map(quote).join(",")];
  for (const row of rows) {
    lines.push(columns.map((column) => quote(neutralizeCsvCell(row[column] ?? null))).join(","));
  }
  return `${lines.join("\r\n")}\r\n`;
}

export function safeCsvFilename(dataset: string, startDate: string, endDate: string): string {
  const safeDataset = dataset
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-|-$/g, "");
  return `zacao-${safeDataset}-${startDate}-to-${endDate}.csv`;
}
