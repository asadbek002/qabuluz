import { desc } from "drizzle-orm";
import { zipSync, strToU8 } from "fflate";
import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { applications } from "@/db/schema";
import { isAdmin } from "@/lib/admin-auth";
import { universities } from "@/lib/universities";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const columns = [
  ["Ariza raqami", "applicationNo"],
  ["Yuborilgan sana", "createdAt"],
  ["Familiya", "lastName"],
  ["Ism", "firstName"],
  ["Otasining ismi", "middleName"],
  ["Tug‘ilgan sana", "birthDate"],
  ["Jinsi", "gender"],
  ["Fuqaroligi", "citizenship"],
  ["Telefon raqami", "phone"],
  ["Telegram", "telegram"],
  ["Elektron pochta", "email"],
  ["Manzil", "address"],
  ["Viza turi", "visaType"],
  ["Ta’lim muassasasi", "previousSchool"],
  ["Qabul turi", "admissionType"],
  ["Til sertifikati", "languageType"],
  ["Darajasi yoki bali", "languageLevel"],
  ["Pasport raqami", "passportNumber"],
  ["Koreya ID karta raqami", "arcNumber"],
  ["Universitet", "university"],
  ["Kampus", "campus"],
  ["Yo‘nalish", "program"],
  ["Ta’lim tili", "track"],
  ["Qabul semestri", "semester"],
  ["Yuklangan hujjatlar", "documents"],
] as const;

function xmlEscape(value: unknown) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "");
}

function columnName(index: number) {
  let result = "";
  while (index > 0) {
    const remainder = (index - 1) % 26;
    result = String.fromCharCode(65 + remainder) + result;
    index = Math.floor((index - 1) / 26);
  }
  return result;
}

export async function GET(request: Request) {
  if (!await isAdmin()) return NextResponse.json({ error: "Ruxsat yo‘q." }, { status: 401 });

  const search = new URL(request.url).searchParams;
  const universityFilter = search.get("university") || "";
  const query = (search.get("q") || "").trim().toLowerCase();
  const all = await getDb().select().from(applications).orderBy(desc(applications.createdAt));
  const filtered = all.filter((application) => {
    const university = universities.find((item) => item.id === application.universityId);
    const searchable = [
      application.firstName, application.lastName, application.middleName,
      application.phone, application.applicationNo, university?.ko, university?.uz,
    ].join(" ").toLowerCase();
    return (!universityFilter || application.universityId === universityFilter) && (!query || searchable.includes(query));
  });

  const values = [
    columns.map(([label]) => label),
    ...filtered.map((application) => {
      let documentNames = "";
      try {
        const docs = JSON.parse(application.documents || "{}") as Record<string, { name?: string }>;
        documentNames = Object.values(docs).map((document) => document.name || "").filter(Boolean).join(", ");
      } catch {}
      const university = universities.find((item) => item.id === application.universityId);
      return columns.map(([, key]) => {
        if (key === "university") return (university?.ko || application.universityId) + " — " + (university?.uz || "");
        if (key === "documents") return documentNames;
        return application[key as keyof typeof application] ?? "";
      });
    }),
  ];

  const rows = values.map((row, rowIndex) => {
    const cells = row.map((value, columnIndex) => {
      const address = columnName(columnIndex + 1) + (rowIndex + 1);
      return "<c r=\"" + address + "\" t=\"inlineStr\"><is><t xml:space=\"preserve\">" + xmlEscape(value) + "</t></is></c>";
    }).join("");
    return "<row r=\"" + (rowIndex + 1) + "\">" + cells + "</row>";
  }).join("");
  const sheet = "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?>" +
    "<worksheet xmlns=\"http://schemas.openxmlformats.org/spreadsheetml/2006/main\"><sheetData>" + rows + "</sheetData></worksheet>";
  const workbook = "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?>" +
    "<workbook xmlns=\"http://schemas.openxmlformats.org/spreadsheetml/2006/main\" xmlns:r=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships\"><sheets><sheet name=\"Talabalar\" sheetId=\"1\" r:id=\"rId1\"/></sheets></workbook>";
  const workbookRels = "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?>" +
    "<Relationships xmlns=\"http://schemas.openxmlformats.org/package/2006/relationships\"><Relationship Id=\"rId1\" Type=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet\" Target=\"worksheets/sheet1.xml\"/></Relationships>";
  const rootRels = "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?>" +
    "<Relationships xmlns=\"http://schemas.openxmlformats.org/package/2006/relationships\"><Relationship Id=\"rId1\" Type=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument\" Target=\"xl/workbook.xml\"/></Relationships>";
  const contentTypes = "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?>" +
    "<Types xmlns=\"http://schemas.openxmlformats.org/package/2006/content-types\"><Default Extension=\"rels\" ContentType=\"application/vnd.openxmlformats-package.relationships+xml\"/><Default Extension=\"xml\" ContentType=\"application/xml\"/><Override PartName=\"/xl/workbook.xml\" ContentType=\"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml\"/><Override PartName=\"/xl/worksheets/sheet1.xml\" ContentType=\"application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml\"/></Types>";

  const workbookFile = zipSync({
    "[Content_Types].xml": strToU8(contentTypes),
    "_rels/.rels": strToU8(rootRels),
    "xl/workbook.xml": strToU8(workbook),
    "xl/_rels/workbook.xml.rels": strToU8(workbookRels),
    "xl/worksheets/sheet1.xml": strToU8(sheet),
  });
  const date = new Date().toISOString().slice(0, 10);
  return new Response(workbookFile, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": "attachment; filename=\"talabalar-" + date + ".xlsx\"",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
