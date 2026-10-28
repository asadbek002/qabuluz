import { readFile } from "node:fs/promises";
import path from "node:path";
import { asc } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { applications } from "@/db/schema";
import { isAdmin } from "@/lib/admin-auth";
import { buildApplicantWorkbook } from "@/lib/applicant-export";
import { universities } from "@/lib/universities";
import { completeness } from "@/lib/completeness";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const templatePath = path.resolve(process.env.TEMPLATE_DIR || "./templates", "applicants-template.xlsx");

export async function GET(request: Request) {
  if (!await isAdmin()) return NextResponse.json({ error: "Ruxsat yo‘q." }, { status: 401 });

  const search = new URL(request.url).searchParams;
  const universityFilter = search.get("university") || "";
  const query = (search.get("q") || "").trim().toLowerCase();
  // Rows ticked in the admin list; none ticked exports the whole filtered list.
  const ids = new Set(search.getAll("id"));
  const statusFilter = search.get("status") || "";
  // "template" adds the admin-filled columns (보호자연락처 … 성적 유효기간); "university" is the plain form.
  const forTemplate = search.get("format") === "template";
  const all = await getDb().select().from(applications).orderBy(asc(applications.createdAt));
  const filtered = all.filter((application) => {
    const university = universities.find((item) => item.id === application.universityId);
    const searchable = [
      application.firstName, application.lastName, application.middleName,
      application.phone, application.applicationNo, university?.ko, university?.uz,
    ].join(" ").toLowerCase();
    return (!universityFilter || application.universityId === universityFilter) && (!query || searchable.includes(query)) && (!ids.size || ids.has(application.id)) && (!statusFilter || completeness(application).status === statusFilter);
  });

  const workbook = buildApplicantWorkbook(new Uint8Array(await readFile(templatePath)), filtered, universityFilter || undefined, forTemplate);
  const date = new Date().toISOString().slice(0, 10);
  const university = universities.find((u) => u.id === universityFilter);
  // ASCII-only name: browsers may ignore a non-Latin filename* and save the file as "download".
  const name = `applicants-${forTemplate ? "template-" : ""}${university ? university.id + "-" : ""}${date}.xlsx`;
  return new Response(workbook, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${name}"`,
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
