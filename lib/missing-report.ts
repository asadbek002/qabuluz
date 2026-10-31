import { strToU8, zipSync } from "fflate";
import type { applications } from "@/db/schema";
import { completeness, statusLabels } from "@/lib/completeness";
import { universities } from "@/lib/universities";

type Application = typeof applications.$inferSelect;

function xml(value: unknown) {
  return String(value ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "");
}

const headers = ["№", "Ariza raqami", "F.I.Sh.", "Universitet", "Telefon", "To‘ldirilgan", "Holat", "Yetishmayotgan ma’lumotlar", "Soni"];
const widths = [5, 20, 34, 30, 16, 12, 16, 90, 7];

/**
 * Applications still in work whose Excel data is not complete, with the fields that are missing
 * (a to-do list for the staff). Done applications and fully filled ones are left out.
 */
export function buildMissingReport(list: Application[]) {
  const rows = list
    .filter((a) => !a.doneAt)
    .map((a) => ({ a, c: completeness(a) }))
    .filter(({ c }) => c.status !== "full")
    .sort((x, y) => x.c.percent - y.c.percent);

  const cell = (col: number, row: number, value: string | number, style = 0) => {
    const ref = `${String.fromCharCode(65 + col)}${row}`;
    const s = style ? ` s="${style}"` : "";
    return typeof value === "number"
      ? `<c r="${ref}"${s}><v>${value}</v></c>`
      : `<c r="${ref}"${s} t="inlineStr"><is><t xml:space="preserve">${xml(value)}</t></is></c>`;
  };
  const sheetRows = [
    `<row r="1">${headers.map((h, i) => cell(i, 1, h, 1)).join("")}</row>`,
    ...rows.map(({ a, c }, n) => {
      const r = n + 2;
      const u = universities.find((x) => x.id === a.universityId);
      const values: (string | number)[] = [
        n + 1, a.applicationNo, `${a.lastName} ${a.firstName} ${a.middleName}`, u ? `${u.ko} — ${u.uz}` : a.universityId,
        a.phone, `${c.percent}%`, statusLabels[c.status], c.missing.join(", "), c.missing.length,
      ];
      return `<row r="${r}">${values.map((v, i) => cell(i, r, v, i === 7 ? 2 : 0)).join("")}</row>`;
    }),
  ];

  const sheet = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><cols>${widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join("")}</cols><sheetData>${sheetRows.join("")}</sheetData>${rows.length ? `<autoFilter ref="A1:I${rows.length + 1}"/>` : ""}</worksheet>`;
  const styles = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFFFF2CC"/></patternFill></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf/></cellStyleXfs><cellXfs count="3"><xf/><xf fontId="1" fillId="2" applyFont="1" applyFill="1"/><xf applyAlignment="1"><alignment wrapText="1" vertical="top"/></xf></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`;

  return zipSync({
    "[Content_Types].xml": strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`),
    "_rels/.rels": strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`),
    "xl/workbook.xml": strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Chala to‘ldirilgan" sheetId="1" r:id="rId1"/></sheets>${rows.length ? `<definedNames><definedName name="_xlnm._FilterDatabase" localSheetId="0" hidden="1">'Chala to‘ldirilgan'!$A$1:$I$${rows.length + 1}</definedName></definedNames>` : ""}</workbook>`),
    "xl/_rels/workbook.xml.rels": strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`),
    "xl/worksheets/sheet1.xml": strToU8(sheet),
    "xl/styles.xml": strToU8(styles),
  }, { level: 6 });
}
