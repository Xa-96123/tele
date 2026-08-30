import * as XLSX from "xlsx";
import {
  EDITION_COLUMNS,
  SUMMARY_COLUMNS,
  TITLE_COLUMNS,
  editionValues,
  flattenEdition,
  flattenSummary,
  flattenTitle,
  titleValues,
  type CellValue,
} from "@/lib/export";
import type { TitleRecord } from "@/lib/types";

function sheetFromRows(
  headers: string[],
  rows: CellValue[][],
  widths: number[],
): XLSX.WorkSheet {
  const sheet = XLSX.utils.aoa_to_sheet([headers, ...rows]);
  sheet["!cols"] = widths.map((wch) => ({ wch }));
  return sheet;
}

export function catalogToWorkbook(titles: TitleRecord[]): XLSX.WorkBook {
  const workbook = XLSX.utils.book_new();
  const titleRows = titles.map((title) => titleValues(flattenTitle(title)));
  const editionRows = titles.flatMap((title) =>
    title.editions.map((edition) =>
      editionValues(flattenEdition(title, edition)),
    ),
  );

  XLSX.utils.book_append_sheet(
    workbook,
    sheetFromRows(
      TITLE_COLUMNS.map((column) => column.label),
      titleRows,
      [
        22, 22, 8, 8, 16, 14, 22, 8, 8, 40, 28, 8, 10, 12, 16, 12, 12, 16, 48,
        18, 16, 36, 22, 22, 48,
      ],
    ),
    "影片汇总",
  );
  XLSX.utils.book_append_sheet(
    workbook,
    sheetFromRows(
      EDITION_COLUMNS.map((column) => column.label),
      editionRows,
      [
        22, 22, 8, 8, 8, 8, 18, 16, 10, 36, 22, 16, 12, 12, 8, 12, 16, 48, 28,
        48,
      ],
    ),
    "版本明细",
  );
  return workbook;
}

export function catalogToXlsxArrayBuffer(titles: TitleRecord[]): ArrayBuffer {
  const workbook = catalogToWorkbook(titles);
  return XLSX.write(workbook, {
    bookType: "xlsx",
    type: "array",
  }) as ArrayBuffer;
}

export function catalogToSummaryWorkbook(titles: TitleRecord[]): XLSX.WorkBook {
  const workbook = XLSX.utils.book_new();
  const rows = titles.map((title) => {
    const row = flattenSummary(title);
    return SUMMARY_COLUMNS.map((column) => row[column.key]);
  });
  XLSX.utils.book_append_sheet(
    workbook,
    sheetFromRows(
      SUMMARY_COLUMNS.map((column) => column.label),
      rows,
      [28, 72],
    ),
    "影片汇总",
  );
  return workbook;
}

function downloadWorkbook(workbook: XLSX.WorkBook, filename: string) {
  const buffer = XLSX.write(workbook, {
    bookType: "xlsx",
    type: "array",
  }) as ArrayBuffer;
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function downloadCatalogExcel(
  titles: TitleRecord[],
  filename = "yingqu-catalog.xlsx",
) {
  downloadWorkbook(catalogToWorkbook(titles), filename);
}

export function downloadSummaryExcel(
  titles: TitleRecord[],
  filename = "yingqu-catalog.xlsx",
) {
  downloadWorkbook(catalogToSummaryWorkbook(titles), filename);
}
