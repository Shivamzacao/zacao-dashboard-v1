import fs from "node:fs/promises";
import path from "node:path";
import ExcelJS from "exceljs";

const fixture = path.join(
  process.cwd(),
  "tests/fixtures/manual-workbook/ZACAO_Dashboard_V1_Input_Workbook.xlsx",
);

const headers = [
  "order_id",
  "customer_id",
  "order_date",
  "first_order_date",
  "gross_product_sales_usd",
  "discounts_usd",
  "refunds_returns_usd",
  "cancellations_usd",
  "net_product_revenue_usd",
  "order_status",
  "acquisition_channel",
  "currency",
  "is_test",
  "data_as_of",
  "source_status",
  "created_at",
  "updated_at",
  "updated_by",
  "source_reference",
  "notes",
];

const definitions = [
  ["order_id", "text", "yes", "Unique order identifier. One row per order."],
  ["customer_id", "text", "no", "Stable customer identifier; guest rows are excluded from LTV."],
  ["order_date", "date", "yes", "Order reporting date in America/New_York."],
  ["first_order_date", "date", "yes", "First qualifying purchase date for the customer."],
  [
    "gross_product_sales_usd",
    "usd",
    "yes",
    "Product revenue before deductions; excludes shipping, taxes, duties, tips, and gift cards.",
  ],
  ["discounts_usd", "usd", "yes", "Non-negative product discounts."],
  ["refunds_returns_usd", "usd", "yes", "Non-negative product refunds and returns."],
  ["cancellations_usd", "usd", "yes", "Non-negative cancelled product value."],
  [
    "net_product_revenue_usd",
    "usd",
    "yes",
    "Gross product sales minus discounts, refunds/returns, and cancellations.",
  ],
  ["order_status", "text", "yes", "paid, partially_refunded, refunded, or cancelled."],
  ["acquisition_channel", "text", "yes", "Source channel mapped through Channel_Mapping."],
  ["currency", "text", "yes", "V1 supports USD only."],
  ["is_test", "text", "yes", "yes/no. Test orders are excluded."],
  ["data_as_of", "date", "yes", "History completeness date."],
  ["source_status", "text", "no", "Runtime eligibility; production rows are included."],
  ["created_at", "timestamp", "no", "Audit creation timestamp."],
  ["updated_at", "timestamp", "no", "Audit update timestamp."],
  ["updated_by", "text", "no", "Audit actor."],
  ["source_reference", "text", "no", "Source reference or DUMMY_TEST_DATA tag."],
  ["notes", "text", "no", "Free-form audit note."],
];

function iso(date) {
  return date.toISOString().slice(0, 10);
}

function addDays(date, days) {
  const result = new Date(`${date}T00:00:00Z`);
  result.setUTCDate(result.getUTCDate() + days);
  return iso(result);
}

function dummyRows() {
  const rows = [];
  const dataAsOf = "2026-08-11";
  const createdAt = "2026-08-11 17:45:00";
  for (let index = 0; index < 12; index += 1) {
    const first = iso(new Date(Date.UTC(2025, 8 + index, 5)));
    for (let customer = 1; customer <= 3; customer += 1) {
      const customerId = `DUMMY-C${String(index + 1).padStart(2, "0")}-${customer}`;
      const channel = customer === 3 ? "Faire: Sell Wholesale" : "Online Store";
      const orders = [
        {
          age: 0,
          gross: 120 + index * 3 + customer,
          discount: customer === 2 ? 10 : 0,
          refund: 0,
          cancellation: 0,
          status: "paid",
        },
        {
          age: 20,
          gross: 75 + customer * 5,
          discount: 5,
          refund: 0,
          cancellation: 0,
          status: "paid",
        },
        {
          age: 50,
          gross: 95,
          discount: 0,
          refund: customer === 1 ? 15 : 0,
          cancellation: 0,
          status: customer === 1 ? "partially_refunded" : "paid",
        },
        {
          age: 100,
          gross: 60,
          discount: 0,
          refund: customer === 2 ? 60 : 0,
          cancellation: 0,
          status: customer === 2 ? "refunded" : "paid",
        },
        {
          age: 170,
          gross: 0,
          discount: 0,
          refund: 0,
          cancellation: customer === 3 ? 20 : 0,
          status: customer === 3 ? "cancelled" : "paid",
        },
      ];
      for (const [orderIndex, order] of orders.entries()) {
        const orderDate = addDays(first, order.age);
        if (orderDate > dataAsOf) continue;
        const net = order.gross - order.discount - order.refund - order.cancellation;
        rows.push([
          `DUMMY-O${String(index + 1).padStart(2, "0")}-${customer}-${orderIndex + 1}`,
          customerId,
          orderDate,
          first,
          order.gross,
          order.discount,
          order.refund,
          order.cancellation,
          net,
          order.status,
          channel,
          "USD",
          "no",
          dataAsOf,
          "production",
          createdAt,
          createdAt,
          "Codex",
          "DUMMY_TEST_DATA",
          "Synthetic order for Realized LTV validation; not production business activity.",
        ]);
      }
    }
  }
  return rows;
}

function cloneCellStyle(source, target) {
  target.style = structuredClone(source.style);
  target.numFmt = source.numFmt;
  target.alignment = structuredClone(source.alignment);
}

export async function updateRealizedLtvWorkbook(output = fixture) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(fixture);
  if (workbook.getWorksheet("Sales_Actuals"))
    workbook.removeWorksheet(workbook.getWorksheet("Sales_Actuals").id);
  const template = workbook.getWorksheet("Growth_Pipeline");
  const sheet = workbook.addWorksheet("Sales_Actuals", {
    views: [{ state: "frozen", ySplit: 1 }],
  });
  sheet.columns = headers.map((header, index) => ({
    header,
    key: header,
    width: index < 4 ? 18 : index < 14 ? 22 : 20,
  }));
  const rows = dummyRows();
  sheet.addRows(rows);
  if (template) {
    for (let column = 1; column <= headers.length; column += 1) {
      cloneCellStyle(
        template.getCell(1, Math.min(column, template.columnCount)),
        sheet.getCell(1, column),
      );
    }
  }
  sheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
  sheet.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0B3D32" } };
  sheet.autoFilter = { from: "A1", to: "T1" };
  for (const column of [3, 4, 14]) sheet.getColumn(column).numFmt = "yyyy-mm-dd";
  for (const column of [5, 6, 7, 8, 9])
    sheet.getColumn(column).numFmt = "$#,##0.00;[Red]-$#,##0.00";
  sheet.dataValidations.add("J2:J1000", {
    type: "list",
    allowBlank: false,
    formulae: ['"paid,partially_refunded,refunded,cancelled"'],
  });
  sheet.dataValidations.add("L2:L1000", { type: "list", allowBlank: false, formulae: ['"USD"'] });
  sheet.dataValidations.add("M2:M1000", {
    type: "list",
    allowBlank: false,
    formulae: ['"yes,no"'],
  });
  sheet.dataValidations.add("O2:O1000", {
    type: "list",
    allowBlank: true,
    formulae: ['"production,draft,example,invalid"'],
  });
  sheet.addTable({
    name: "sales_actuals",
    ref: "A1",
    headerRow: true,
    style: { theme: "TableStyleMedium2", showRowStripes: true },
    columns: headers.map((name) => ({ name })),
    rows,
  });

  const dictionary = workbook.getWorksheet("Data_Dictionary");
  if (!dictionary) throw new Error("Data_Dictionary is missing");
  const existing = [];
  dictionary.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber === 1 || String(row.getCell(1).value ?? "") !== "Sales_Actuals")
      existing.push(row.values.slice(1));
  });
  const salesDefinitions = definitions.map(([column, kind, required, description]) => [
    "Sales_Actuals",
    "sales_actuals",
    column,
    kind,
    required,
    description,
    "order_id",
  ]);
  const channelEnd = existing.findLastIndex((row) => String(row[0] ?? "") === "Channel_Mapping");
  existing.splice(channelEnd + 1, 0, ...salesDefinitions);
  dictionary.spliceRows(1, dictionary.rowCount, ...existing);

  const lists = workbook.getWorksheet("Lists");
  if (!lists) throw new Error("Lists is missing");
  const appendList = (name, values) => {
    let column = 1;
    while (lists.getCell(1, column).value) column += 1;
    lists.getCell(1, column).value = name;
    values.forEach((value, index) => {
      lists.getCell(index + 2, column).value = value;
    });
  };
  const listHeaders = new Set(lists.getRow(1).values.slice(1).map(String));
  if (!listHeaders.has("currency")) appendList("currency", ["USD"]);
  if (!listHeaders.has("order_status"))
    appendList("order_status", ["paid", "partially_refunded", "refunded", "cancelled"]);

  await fs.mkdir(path.dirname(output), { recursive: true });
  await workbook.xlsx.writeFile(output);
  return { output, rows: rows.length };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const output = process.argv[2] ?? fixture;
  const result = await updateRealizedLtvWorkbook(output);
  console.log(JSON.stringify(result));
}
