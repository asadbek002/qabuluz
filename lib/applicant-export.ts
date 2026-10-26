import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import type { applications } from "@/db/schema";
import { universities } from "@/lib/universities";
import { adminFields, parseAdminData, schoolTypes } from "@/lib/admin-fields";
import {
  admissionKo, campusKo, countryKo, genderKo, languageScoreKo, phoneKo, programKo, semesterKo,
  toHangulName, toPassportLatin, trackKo, visaKo,
} from "@/lib/korean";

type Application = typeof applications.$inferSelect;

// Sheet order of templates/applicants-template.xlsx (the universities' applicant form):
// 학부, 학부(어학성적보유), 석사, 석사(어학성적보유), 편입, 편입(어학성적보유).
function sheetIndex(a: Application) {
  const group = a.admissionType === "Magistratura" ? 1 : a.admissionType === "1-kurs" ? 0 : 2;
  const hasScore = a.languageType !== "Mavjud emas";
  return group * 2 + (hasScore ? 1 : 0);
}

function xml(value: unknown) {
  return String(value ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "");
}

const dots = (isoDate: string) => isoDate.replaceAll("-", ".");

function kstDate(iso: string) {
  const d = new Date(new Date(iso).getTime() + 9 * 60 * 60 * 1000);
  return d.toISOString().slice(0, 10).replaceAll("-", ".");
}

/** One template row (columns A–Q) for an application. */
export function applicantRow(a: Application, index: number, includeUniversity: boolean): (string | number)[] {
  const university = universities.find((u) => u.id === a.universityId);
  const category = [admissionKo[a.admissionType] ?? a.admissionType, semesterKo[a.semester] ?? a.semester, `${campusKo[a.campus] ?? a.campus}캠퍼스`].join(" / ");
  const department = programKo[a.program] ?? a.program;
  return [
    index,
    trackKo[a.track] ?? a.track,
    category,
    toHangulName(a.lastName, a.firstName, a.middleName),
    toPassportLatin(a.lastName, a.firstName, a.middleName),
    `${dots(a.birthDate)} / ${genderKo[a.gender] ?? a.gender}`,
    a.arcNumber || "",
    visaKo[a.visaType] ?? a.visaType,
    a.passportNumber.toUpperCase(),
    countryKo[a.citizenship] ?? a.citizenship,
    a.previousSchool ?? "",
    a.graduationDate ? dots(a.graduationDate) : "",
    includeUniversity && university ? `${university.ko} ${department}` : department,
    phoneKo(a.phone),
    languageScoreKo(a.languageType, a.languageLevel),
    a.address ?? "",
    kstDate(a.createdAt),
  ];
}

/** Admin-filled values for the template-only columns R…AA. */
export function adminRow(a: Application): string[] {
  const data = parseAdminData(a.adminData);
  return adminFields.map((f) => {
    const v = data[f.key] ?? "";
    return f.type === "date" && v ? dots(v) : v;
  });
}

/** Excel column name for a 0-based index (0 -> A, 26 -> AA). */
function columnName(i: number): string {
  return (i >= 26 ? columnName(Math.floor(i / 26) - 1) : "") + String.fromCharCode(65 + (i % 26));
}

const baseColumns = 17; // A–Q

function fillSheet(sheetXml: string, title: string, rows: (string | number)[][], extraHeaders: string[] = []) {
  const columns = Array.from({ length: baseColumns + extraHeaders.length }, (_, i) => columnName(i));
  const lastColumn = columns.at(-1)!;
  // Reuse the template's own styles from its first data row (row 3).
  const row3 = /<row r="3"[^>]*>[\s\S]*?<\/row>/.exec(sheetXml)?.[0] ?? "";
  const rowAttrs = (/<row r="3"([^>]*)>/.exec(row3)?.[1] ?? "").replace(/\s*r="\d+"/, "");
  const styles: Record<string, string> = {};
  for (const m of row3.matchAll(/<c r="([A-Z]+)3"(?: s="(\d+)")?/g)) if (m[2]) styles[m[1]] = m[2];
  styles.Q ??= styles.P ?? "";
  const headerStyle = /<c r="Q2"(?: s="(\d+)")?/.exec(sheetXml)?.[1] ?? "";
  for (const col of columns.slice(baseColumns)) styles[col] = styles.Q;

  const text = (ref: string, s: string, v: string) => `<c r="${ref}"${s ? ` s="${s}"` : ""} t="inlineStr"><is><t xml:space="preserve">${xml(v)}</t></is></c>`;
  const buildRow = (r: number, values: (string | number)[] | null) => {
    const cells = columns.map((col, i) => {
      const s = styles[col] ? ` s="${styles[col]}"` : "";
      const v = values?.[i];
      if (v === undefined || v === "") return `<c r="${col}${r}"${s}/>`;
      if (typeof v === "number") return `<c r="${col}${r}"${s}><v>${v}</v></c>`;
      return text(`${col}${r}`, styles[col] ?? "", v);
    }).join("");
    return `<row r="${r}"${rowAttrs}>${cells}</row>`;
  };

  let out = sheetXml.replace(/<c r="A1"( s="\d+")?[^>]*?(?:\/>|>[\s\S]*?<\/c>)/,
    (_m, s = "") => `<c r="A1"${s} t="inlineStr"><is><t xml:space="preserve">${xml(title)}</t></is></c>`);

  // Always rewrite row 3 so the template's example values ("1", "한국어") never leak into an export.
  const count = Math.max(rows.length, 1);
  for (let i = 0; i < count; i++) {
    const r = 3 + i;
    const replacement = buildRow(r, rows[i] ?? null);
    const pattern = new RegExp(`<row r="${r}"[^>]*?(?:/>|>[\\s\\S]*?</row>)`);
    out = pattern.test(out) ? out.replace(pattern, replacement) : out.replace("</sheetData>", `${replacement}</sheetData>`);
  }
  if (extraHeaders.length) {
    // Header cells in the template's header style, wider columns and a dropdown for 학교 구분.
    const headers = extraHeaders.map((h, i) => text(`${columns[baseColumns + i]}2`, headerStyle, h)).join("");
    out = out.replace(/(<row r="2"[^>]*>[\s\S]*?)(<\/row>)/, (_m, body, end) => body + headers + end);
    out = out.replace(/<col min="18" max="\d+"[^>]*\/>/, "")
      .replace("</cols>", `<col min="18" max="${columns.length}" width="30" customWidth="1"/></cols>`);
    const schoolCol = columns[baseColumns + adminFields.findIndex((f) => f.key === "schoolType")];
    const validation = `<dataValidations count="1"><dataValidation type="list" allowBlank="1" showErrorMessage="1" sqref="${schoolCol}3:${schoolCol}1000"><formula1>"${schoolTypes.join(",")}"</formula1></dataValidation></dataValidations>`;
    out = out.replace("<pageMargins", `${validation}<pageMargins`);
    // Row "spans" are only a hint; drop them so the wider rows stay consistent.
    out = out.replace(/(<row r="\d+") spans="[\d:]+"/g, "$1");
    out = out.replace(/<dimension ref="A1:[A-Z]+\d+"\/>/, `<dimension ref="A1:${lastColumn}${Math.max(rows.length + 2, 1000)}"/>`);
  } else if (rows.length + 2 > 1000) {
    out = out.replace(/<dimension ref="A1:Q\d+"\/>/, `<dimension ref="A1:Q${rows.length + 2}"/>`);
  }
  return out;
}

/** Fill the applicant template workbook; `withAdminColumns` adds the admin-filled columns R…AA ("Shablon uchun"). */
export function buildApplicantWorkbook(template: Uint8Array, list: Application[], universityId?: string, withAdminColumns = false) {
  const files = unzipSync(template);
  const workbook = strFromU8(files["xl/workbook.xml"]);
  const rels = strFromU8(files["xl/_rels/workbook.xml.rels"]);
  const sheetPaths = [...workbook.matchAll(/<sheet [^>]*r:id="(rId\d+)"/g)].map(([, id]) => {
    const target = new RegExp(`Id="${id}"[^>]*Target="([^"]+)"|Target="([^"]+)"[^>]*Id="${id}"`).exec(rels);
    const path = (target?.[1] ?? target?.[2] ?? "").replace(/^\/?xl\//, "");
    return `xl/${path}`;
  });

  const university = universities.find((u) => u.id === universityId);
  const title = university
    ? `${university.ko} 입학신청자(Applicants for Admission to ${university.en})`
    : "입학신청자(Applicants for Admission) — 전체 대학교";

  const grouped: Application[][] = sheetPaths.map(() => []);
  for (const a of list) grouped[Math.min(sheetIndex(a), sheetPaths.length - 1)].push(a);

  sheetPaths.forEach((path, i) => {
    if (!files[path]) return;
    const rows = grouped[i].map((a, n) => [...applicantRow(a, n + 1, !university), ...(withAdminColumns ? adminRow(a) : [])]);
    const extraHeaders = withAdminColumns ? adminFields.map((f) => f.header) : [];
    files[path] = strToU8(fillSheet(strFromU8(files[path]), title, rows, extraHeaders));
  });
  return zipSync(files, { level: 6 });
}
