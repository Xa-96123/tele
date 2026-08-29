import assert from "node:assert/strict";
import test from "node:test";
import * as XLSX from "xlsx";
import { buildDemoCatalog } from "./demo-data.ts";
import {
  catalogToCsv,
  catalogToWorkbook,
  catalogToXlsxArrayBuffer,
  flattenTitle,
  TITLE_COLUMNS,
} from "./export.ts";

test("flattenTitle includes identity and source links", () => {
  const { titles } = buildDemoCatalog();
  const dune = titles.find((title) => title.title.includes("沙丘"));
  assert.ok(dune);
  const row = flattenTitle(dune);
  assert.equal(row.title, dune.title);
  assert.equal(row.year, 2024);
  assert.equal(row.type, "电影");
  assert.match(String(row.links), /夸克/);
  assert.match(String(row.channels), /演示/);
  assert.ok(Number(row.editionCount) >= 1);
});

test("catalogToCsv uses BOM and every title column", () => {
  const { titles } = buildDemoCatalog();
  const csv = catalogToCsv(titles);
  assert.ok(csv.startsWith("\uFEFF"));
  const header = csv.slice(1).split("\n")[0];
  for (const column of TITLE_COLUMNS) {
    assert.ok(header.includes(column.label), `missing ${column.label}`);
  }
  assert.ok(csv.includes("沙丘"));
  for (const title of titles) {
    assert.ok(csv.includes(title.title), `csv missing ${title.title}`);
  }
});

test("excel workbook has title and edition sheets", () => {
  const { titles } = buildDemoCatalog();
  const workbook = catalogToWorkbook(titles);
  assert.deepEqual(workbook.SheetNames, ["影片汇总", "版本明细"]);

  const titleSheet = XLSX.utils.sheet_to_json<string[]>(
    workbook.Sheets["影片汇总"]!,
    { header: 1 },
  );
  const editionSheet = XLSX.utils.sheet_to_json<string[]>(
    workbook.Sheets["版本明细"]!,
    { header: 1 },
  );

  assert.equal(titleSheet[0]?.[0], "片名");
  assert.equal(titleSheet.length, titles.length + 1);
  const editionCount = titles.reduce(
    (sum, title) => sum + title.editions.length,
    0,
  );
  assert.equal(editionSheet.length, editionCount + 1);

  const names = titleSheet.slice(1).map((row) => String(row[0]));
  for (const title of titles) {
    assert.ok(names.includes(title.title), `missing ${title.title}`);
  }

  const buffer = catalogToXlsxArrayBuffer(titles);
  assert.ok(buffer.byteLength > 1000);
  const roundtrip = XLSX.read(buffer, { type: "array" });
  assert.deepEqual(roundtrip.SheetNames, ["影片汇总", "版本明细"]);
});
