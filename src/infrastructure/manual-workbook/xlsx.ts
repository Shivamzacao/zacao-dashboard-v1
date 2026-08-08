import ExcelJS from "exceljs";

const XLSX_MAGIC_BYTES = [0x50, 0x4b, 0x03, 0x04] as const;

export function isXlsxFile(bytes: Uint8Array): boolean {
  return XLSX_MAGIC_BYTES.every((expected, index) => bytes[index] === expected);
}

function pad(value: number, width = 2): string {
  return String(value).padStart(width, "0");
}

/**
 * ExcelJS surfaces date cells as JS Date objects built from the workbook's
 * serial values in UTC. Render them back as the literal date/time the sheet
 * displays — never shifted through the host machine's timezone.
 */
function dateCellToText(value: Date): string {
  const date = `${value.getUTCFullYear()}-${pad(value.getUTCMonth() + 1)}-${pad(value.getUTCDate())}`;
  const hasTime =
    value.getUTCHours() !== 0 ||
    value.getUTCMinutes() !== 0 ||
    value.getUTCSeconds() !== 0 ||
    value.getUTCMilliseconds() !== 0;
  if (!hasTime) return date;
  return `${date} ${pad(value.getUTCHours())}:${pad(value.getUTCMinutes())}:${pad(value.getUTCSeconds())}`;
}

function cellValueToPlain(value: ExcelJS.CellValue): string | number | boolean | null {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return dateCellToText(value);
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return value;
  }
  if (typeof value === "object") {
    if ("richText" in value) {
      return value.richText.map((part) => part.text).join("");
    }
    if ("error" in value) return null;
    if ("result" in value) {
      const result = value.result;
      if (result === null || result === undefined) return null;
      if (result instanceof Date) return dateCellToText(result);
      if (typeof result === "object" && "error" in result) return null;
      return result;
    }
    if ("text" in value && typeof value.text === "string") return value.text;
    if ("hyperlink" in value) return String(value.hyperlink);
  }
  return String(value);
}

export interface ParsedWorkbook {
  readonly rowsBySheet: Readonly<Record<string, readonly (readonly unknown[])[]>>;
  readonly sheetNames: readonly string[];
}

/**
 * Parses an uploaded .xlsx into plain row arrays per sheet — the exact input
 * shape the validation parser consumes. Row one is the header row. ExcelJS
 * `row.values` is 1-indexed with a leading hole, so it is normalized here.
 */
export async function parseWorkbookRows(bytes: Uint8Array): Promise<ParsedWorkbook> {
  if (!isXlsxFile(bytes)) {
    throw new Error("The uploaded file is not a valid .xlsx workbook");
  }
  const workbook = new ExcelJS.Workbook();
  const workbookBytes = Buffer.from(bytes) as unknown as Parameters<typeof workbook.xlsx.load>[0];
  await workbook.xlsx.load(workbookBytes);

  const rowsBySheet: Record<string, (readonly unknown[])[]> = {};
  const sheetNames: string[] = [];
  workbook.eachSheet((worksheet) => {
    sheetNames.push(worksheet.name);
    const rows: (readonly unknown[])[] = [];
    let lastPopulatedRowNumber = 0;
    worksheet.eachRow({ includeEmpty: true }, (row, rowNumber) => {
      const rawValues = Array.isArray(row.values) ? row.values.slice(1) : [];
      // Array.from fills sparse holes (skipped cells) so they become explicit nulls.
      const values = Array.from(rawValues, (value) => cellValueToPlain(value as ExcelJS.CellValue));
      while (rows.length < rowNumber - 1) rows.push([]);
      rows.push(values);
      if (values.some((value) => value !== null && String(value).trim() !== "")) {
        lastPopulatedRowNumber = rowNumber;
      }
    });
    rowsBySheet[worksheet.name] = rows.slice(0, lastPopulatedRowNumber);
  });

  return { rowsBySheet, sheetNames };
}
